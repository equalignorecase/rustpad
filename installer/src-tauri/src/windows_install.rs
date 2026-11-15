#![cfg_attr(not(windows), allow(dead_code))]

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Emitter};

pub const APP_NAME: &str = "RustPad";
pub const APP_PUBLISHER: &str = "RustPad";
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");
pub const REPO_URL: &str = "https://github.com/equalignorecase/rustpad";

pub const FILE_ASSOCIATIONS: &[&str] = &[
    "txt", "rs", "js", "ts", "tsx", "jsx", "json", "html", "css", "md", "py", "php", "sql", "toml",
    "yaml", "yml", "log", "csv",
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallOptions {
    pub install_dir: String,
    pub start_menu_shortcut: bool,
    pub desktop_shortcut: bool,
    pub context_menu: bool,
    pub file_associations: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallProgress {
    pub stage: String,
    pub message: String,
    pub percent: u8,
}

pub fn normalize_picked_dir(picked: &Path) -> PathBuf {
    let is_rustpad_leaf = picked
        .file_name()
        .and_then(|name| name.to_str())
        .is_some_and(|name| name.eq_ignore_ascii_case("rustpad"));

    if is_rustpad_leaf {
        picked.to_path_buf()
    } else {
        picked.join("RustPad")
    }
}

pub fn validate_install_dir(raw: &str) -> Result<PathBuf, String> {
    let trimmed = raw.trim().trim_matches('"');
    if trimmed.is_empty() {
        return Err("Install folder path cannot be empty.".to_string());
    }
    Ok(PathBuf::from(trimmed))
}

pub fn default_install_dir() -> PathBuf {
    #[cfg(windows)]
    {
        if let Some(local_app_data) = std::env::var_os("LOCALAPPDATA") {
            return PathBuf::from(local_app_data).join("RustPad");
        }
        if let Some(profile) = std::env::var_os("USERPROFILE") {
            return PathBuf::from(profile)
                .join("AppData")
                .join("Local")
                .join("RustPad");
        }
    }
    PathBuf::from(r"C:\Users\User\AppData\Local\RustPad")
}

#[cfg(windows)]
pub fn existing_installation() -> Option<(PathBuf, Option<String>)> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok(key) = hkcu.open_subkey(r"Software\RustPad")
        && let Ok(dir) = key.get_value::<String, _>("InstallDir")
        && !dir.trim().is_empty()
    {
        let ver = key.get_value::<String, _>("Version").ok();
        return Some((PathBuf::from(dir), ver));
    }

    if let Ok(key) =
        hkcu.open_subkey(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\RustPad")
        && let Ok(dir) = key.get_value::<String, _>("InstallLocation")
        && !dir.trim().is_empty()
    {
        let ver = key.get_value::<String, _>("DisplayVersion").ok();
        return Some((PathBuf::from(dir), ver));
    }

    None
}

#[cfg(not(windows))]
pub fn existing_installation() -> Option<(PathBuf, Option<String>)> {
    None
}

fn emit_progress(app: Option<&AppHandle>, stage: &str, message: &str, percent: u8) {
    if let Some(app_handle) = app {
        let _ = app_handle.emit(
            "install-progress",
            InstallProgress {
                stage: stage.to_string(),
                message: message.to_string(),
                percent,
            },
        );
    }
}

#[cfg(windows)]
pub fn perform_install(
    app: Option<&AppHandle>,
    options: &InstallOptions,
) -> Result<PathBuf, String> {
    use crate::payload;
    use std::fs;

    let install_dir = validate_install_dir(&options.install_dir)?;

    emit_progress(app, "prepare", "Preparing install directory...", 12);
    stop_running_rustpad();
    fs::create_dir_all(&install_dir).map_err(|err| {
        format!(
            "Failed to create install folder {}: {err}",
            install_dir.display()
        )
    })?;

    emit_progress(app, "extract", "Extracting RustPad...", 42);
    let exe_path = install_dir.join("rustpad.exe");
    payload::write_payload_to_path(&exe_path)?;

    let uninstall_exe = install_dir.join("uninstall.exe");
    if let Ok(current_exe) = std::env::current_exe()
        && !paths_equal_ci(&current_exe, &uninstall_exe)
    {
        fs::copy(&current_exe, &uninstall_exe).map_err(|err| {
            format!(
                "Failed to write uninstaller {}: {err}",
                uninstall_exe.display()
            )
        })?;
    }

    emit_progress(app, "shortcuts", "Updating Windows shortcuts...", 72);
    sync_shortcuts(&exe_path, &install_dir, options)?;

    emit_progress(app, "registry", "Configuring Windows integration...", 90);
    write_windows_registry(&install_dir, &exe_path, &uninstall_exe, options)?;
    notify_shell_assoc_changed();

    emit_progress(app, "done", "Installation complete.", 100);
    Ok(install_dir)
}

#[cfg(not(windows))]
pub fn perform_install(
    _app: Option<&AppHandle>,
    options: &InstallOptions,
) -> Result<PathBuf, String> {
    let _ = validate_install_dir(&options.install_dir)?;
    Err("Windows installer only supports installing on Windows.".to_string())
}

#[cfg(windows)]
pub fn perform_uninstall(app: Option<&AppHandle>, install_dir: &Path) -> Result<(), String> {
    use std::fs;

    emit_progress(app, "prepare", "Closing running RustPad instances...", 15);
    stop_running_rustpad();

    emit_progress(
        app,
        "cleanup",
        "Removing shortcuts and application files...",
        52,
    );
    remove_shortcuts();

    let exe_path = install_dir.join("rustpad.exe");
    if exe_path.exists() {
        fs::remove_file(&exe_path).map_err(|err| {
            format!(
                "Cannot remove {}: {err}. Make sure RustPad is closed.",
                exe_path.display()
            )
        })?;
    }

    emit_progress(app, "registry", "Cleaning Windows registry entries...", 86);
    remove_windows_registry();
    notify_shell_assoc_changed();

    emit_progress(app, "done", "RustPad has been removed.", 100);
    Ok(())
}

#[cfg(not(windows))]
pub fn perform_uninstall(_app: Option<&AppHandle>, _install_dir: &Path) -> Result<(), String> {
    Err("Windows uninstaller only supports Windows.".to_string())
}

#[cfg(windows)]
pub fn launch_installed_app(install_dir: &Path) -> Result<(), String> {
    use std::process::Command;

    let exe_path = install_dir.join("rustpad.exe");
    if !exe_path.is_file() {
        return Err(format!("Cannot find {}", exe_path.display()));
    }
    Command::new(&exe_path)
        .current_dir(install_dir)
        .spawn()
        .map_err(|err| format!("Failed to launch RustPad: {err}"))?;
    Ok(())
}

#[cfg(not(windows))]
pub fn launch_installed_app(_install_dir: &Path) -> Result<(), String> {
    Err("Cannot launch Windows executable on this OS.".to_string())
}

#[cfg(windows)]
pub fn spawn_self_cleanup(install_dir: &Path) {
    use std::{os::windows::process::CommandExt, process::Command};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let uninstall_exe = install_dir.join("uninstall.exe");
    let current_exe = std::env::current_exe().ok();

    let target_exe = current_exe
        .as_deref()
        .filter(|cur| paths_equal_ci(cur, &uninstall_exe))
        .unwrap_or(&uninstall_exe);

    let exe_str = target_exe.to_string_lossy();
    let dir_str = install_dir.to_string_lossy();
    let script =
        format!("ping 127.0.0.1 -n 3 > nul & del /F /Q \"{exe_str}\" & rmdir \"{dir_str}\"");

    let _ = Command::new("cmd.exe")
        .args(["/C", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .spawn();
}

#[cfg(not(windows))]
pub fn spawn_self_cleanup(_install_dir: &Path) {}

#[cfg(windows)]
fn paths_equal_ci(a: &Path, b: &Path) -> bool {
    a.to_string_lossy()
        .eq_ignore_ascii_case(&b.to_string_lossy())
}

#[cfg(windows)]
fn stop_running_rustpad() {
    use std::{os::windows::process::CommandExt, process::Command, thread, time::Duration};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;

    let _ = Command::new("taskkill.exe")
        .args(["/IM", "rustpad.exe"])
        .creation_flags(CREATE_NO_WINDOW)
        .status();

    for _ in 0..8 {
        let running = Command::new("tasklist.exe")
            .args(["/FI", "IMAGENAME eq rustpad.exe", "/NH"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
            .ok()
            .is_some_and(|out| {
                String::from_utf8_lossy(&out.stdout)
                    .to_ascii_lowercase()
                    .contains("rustpad.exe")
            });
        if !running {
            break;
        }
        thread::sleep(Duration::from_millis(200));
    }
}

#[cfg(windows)]
fn known_folder_path(folder_id: &windows::core::GUID) -> Option<PathBuf> {
    use windows::{
        Win32::System::Com::CoTaskMemFree,
        Win32::UI::Shell::{KNOWN_FOLDER_FLAG, SHGetKnownFolderPath},
    };

    unsafe {
        let raw = SHGetKnownFolderPath(folder_id, KNOWN_FOLDER_FLAG(0), None).ok()?;
        let str_val = raw.to_string().ok();
        CoTaskMemFree(Some(raw.as_ptr() as *const _));
        str_val.map(PathBuf::from)
    }
}

#[cfg(windows)]
fn desktop_shortcut_path() -> Option<PathBuf> {
    use windows::Win32::UI::Shell::FOLDERID_Desktop;

    known_folder_path(&FOLDERID_Desktop)
        .or_else(|| std::env::var_os("USERPROFILE").map(|p| PathBuf::from(p).join("Desktop")))
        .map(|d| d.join("RustPad.lnk"))
}

#[cfg(windows)]
fn start_menu_shortcut_path() -> Option<PathBuf> {
    use windows::Win32::UI::Shell::FOLDERID_Programs;

    known_folder_path(&FOLDERID_Programs)
        .or_else(|| {
            std::env::var_os("APPDATA").map(|p| {
                PathBuf::from(p)
                    .join("Microsoft")
                    .join("Windows")
                    .join("Start Menu")
                    .join("Programs")
            })
        })
        .map(|d| d.join("RustPad.lnk"))
}

#[cfg(windows)]
fn sync_shortcuts(
    exe_path: &Path,
    install_dir: &Path,
    options: &InstallOptions,
) -> Result<(), String> {
    use std::fs;

    if let Some(start_menu_lnk) = start_menu_shortcut_path() {
        if options.start_menu_shortcut {
            if let Some(parent) = start_menu_lnk.parent() {
                fs::create_dir_all(parent).map_err(|err| {
                    format!(
                        "Failed to prepare Start Menu folder {}: {err}",
                        parent.display()
                    )
                })?;
            }
            create_shell_shortcut(
                &start_menu_lnk,
                exe_path,
                install_dir,
                "RustPad Text & Code Editor",
            )?;
        } else if start_menu_lnk.exists() {
            let _ = fs::remove_file(start_menu_lnk);
        }
    }

    if let Some(desktop_lnk) = desktop_shortcut_path() {
        if options.desktop_shortcut {
            if let Some(parent) = desktop_lnk.parent() {
                fs::create_dir_all(parent).map_err(|err| {
                    format!(
                        "Failed to prepare Desktop folder {}: {err}",
                        parent.display()
                    )
                })?;
            }
            create_shell_shortcut(
                &desktop_lnk,
                exe_path,
                install_dir,
                "RustPad Text & Code Editor",
            )?;
        } else if desktop_lnk.exists() {
            let _ = fs::remove_file(desktop_lnk);
        }
    }

    Ok(())
}

#[cfg(windows)]
fn remove_shortcuts() {
    use std::fs;

    if let Some(start_menu_lnk) = start_menu_shortcut_path()
        && start_menu_lnk.exists()
    {
        let _ = fs::remove_file(start_menu_lnk);
    }
    if let Some(desktop_lnk) = desktop_shortcut_path()
        && desktop_lnk.exists()
    {
        let _ = fs::remove_file(desktop_lnk);
    }
}

#[cfg(windows)]
struct ComApartmentGuard;

#[cfg(windows)]
impl Drop for ComApartmentGuard {
    fn drop(&mut self) {
        unsafe {
            windows::Win32::System::Com::CoUninitialize();
        }
    }
}

#[cfg(windows)]
fn to_wide_null(val: &str) -> Vec<u16> {
    val.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(windows)]
fn create_shell_shortcut(
    lnk_path: &Path,
    target: &Path,
    working_dir: &Path,
    description: &str,
) -> Result<(), String> {
    use windows::{
        Win32::System::Com::{
            CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, CoCreateInstance, CoInitializeEx,
            IPersistFile,
        },
        Win32::UI::Shell::{IShellLinkW, ShellLink},
        core::{Interface, PCWSTR},
    };

    unsafe {
        let hr = CoInitializeEx(None, COINIT_APARTMENTTHREADED);
        let _guard = if hr.is_ok() {
            Some(ComApartmentGuard)
        } else if hr == windows::Win32::Foundation::RPC_E_CHANGED_MODE {
            None
        } else {
            return Err(format!("CoInitializeEx failed: {hr:?}"));
        };

        let shell_link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
            .map_err(|err| format!("Failed to create ShellLink COM instance: {err}"))?;

        let target_w = to_wide_null(&target.to_string_lossy());
        let dir_w = to_wide_null(&working_dir.to_string_lossy());
        let desc_w = to_wide_null(description);
        let lnk_w = to_wide_null(&lnk_path.to_string_lossy());

        shell_link
            .SetPath(PCWSTR(target_w.as_ptr()))
            .map_err(|err| format!("IShellLinkW::SetPath failed: {err}"))?;
        shell_link
            .SetWorkingDirectory(PCWSTR(dir_w.as_ptr()))
            .map_err(|err| format!("IShellLinkW::SetWorkingDirectory failed: {err}"))?;
        shell_link
            .SetDescription(PCWSTR(desc_w.as_ptr()))
            .map_err(|err| format!("IShellLinkW::SetDescription failed: {err}"))?;
        shell_link
            .SetIconLocation(PCWSTR(target_w.as_ptr()), 0)
            .map_err(|err| format!("IShellLinkW::SetIconLocation failed: {err}"))?;

        let persist: IPersistFile = shell_link
            .cast()
            .map_err(|err| format!("Failed to query IPersistFile: {err}"))?;
        persist
            .Save(PCWSTR(lnk_w.as_ptr()), true)
            .map_err(|err| format!("Failed to save shortcut {}: {err}", lnk_path.display()))?;
    }

    Ok(())
}

#[cfg(windows)]
fn write_windows_registry(
    install_dir: &Path,
    exe_path: &Path,
    uninstall_exe: &Path,
    options: &InstallOptions,
) -> Result<(), String> {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let exe_str = exe_path.to_string_lossy().to_string();
    let dir_str = install_dir.to_string_lossy().to_string();
    let uninst_str = uninstall_exe.to_string_lossy().to_string();

    let (app_key, _) = hkcu
        .create_subkey(r"Software\RustPad")
        .map_err(|err| format!("Registry write failed (Software\\RustPad): {err}"))?;
    app_key.set_value("InstallDir", &dir_str).ok();
    app_key.set_value("Version", &APP_VERSION).ok();
    app_key
        .set_value("DesktopShortcut", &u32::from(options.desktop_shortcut))
        .ok();
    app_key
        .set_value("StartMenuShortcut", &u32::from(options.start_menu_shortcut))
        .ok();
    app_key
        .set_value("ContextMenu", &u32::from(options.context_menu))
        .ok();
    app_key
        .set_value("FileAssociations", &u32::from(options.file_associations))
        .ok();

    let (uninst_key, _) = hkcu
        .create_subkey(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\RustPad")
        .map_err(|err| format!("Registry write failed (Uninstall): {err}"))?;
    uninst_key.set_value("DisplayName", &APP_NAME).ok();
    uninst_key.set_value("DisplayVersion", &APP_VERSION).ok();
    uninst_key.set_value("Publisher", &APP_PUBLISHER).ok();
    uninst_key
        .set_value("DisplayIcon", &format!("{exe_str},0"))
        .ok();
    uninst_key
        .set_value("UninstallString", &format!("\"{uninst_str}\" --uninstall"))
        .ok();
    uninst_key
        .set_value(
            "QuietUninstallString",
            &format!("\"{uninst_str}\" --uninstall --quiet"),
        )
        .ok();
    uninst_key.set_value("InstallLocation", &dir_str).ok();
    uninst_key.set_value("URLInfoAbout", &REPO_URL).ok();
    uninst_key
        .set_value("EstimatedSize", &crate::payload::estimated_size_kb())
        .ok();
    uninst_key.set_value("NoModify", &1_u32).ok();
    uninst_key.set_value("NoRepair", &1_u32).ok();

    if let Ok((app_paths, _)) =
        hkcu.create_subkey(r"Software\Microsoft\Windows\CurrentVersion\App Paths\rustpad.exe")
    {
        app_paths.set_value("", &exe_str).ok();
        app_paths.set_value("Path", &dir_str).ok();
    }

    if options.context_menu {
        if let Ok((ctx_key, _)) = hkcu.create_subkey(r"Software\Classes\*\shell\RustPad") {
            ctx_key.set_value("", &"Open with RustPad").ok();
            ctx_key.set_value("Icon", &format!("\"{exe_str}\",0")).ok();
            if let Ok((cmd_key, _)) = ctx_key.create_subkey("command") {
                cmd_key.set_value("", &format!("\"{exe_str}\" \"%1\"")).ok();
            }
        }
    } else {
        let _ = hkcu.delete_subkey_all(r"Software\Classes\*\shell\RustPad");
    }

    if options.file_associations {
        if let Ok((progid, _)) = hkcu.create_subkey(r"Software\Classes\RustPad.Document") {
            progid.set_value("", &"RustPad Document").ok();
            if let Ok((icon_key, _)) = progid.create_subkey("DefaultIcon") {
                icon_key.set_value("", &format!("\"{exe_str}\",0")).ok();
            }
            if let Ok((cmd_key, _)) = progid.create_subkey(r"shell\open\command") {
                cmd_key.set_value("", &format!("\"{exe_str}\" \"%1\"")).ok();
            }
        }

        if let Ok((apps_key, _)) = hkcu.create_subkey(r"Software\Classes\Applications\rustpad.exe")
        {
            apps_key.set_value("FriendlyAppName", &APP_NAME).ok();
            if let Ok((cmd_key, _)) = apps_key.create_subkey(r"shell\open\command") {
                cmd_key.set_value("", &format!("\"{exe_str}\" \"%1\"")).ok();
            }
            if let Ok((supported, _)) = apps_key.create_subkey("SupportedTypes") {
                for ext in FILE_ASSOCIATIONS {
                    supported.set_value(format!(".{ext}"), &"").ok();
                }
            }
        }

        for ext in FILE_ASSOCIATIONS {
            if let Ok((open_with, _)) =
                hkcu.create_subkey(format!(r"Software\Classes\.{ext}\OpenWithProgids"))
            {
                open_with.set_value("RustPad.Document", &"").ok();
            }
        }
    } else {
        clear_file_associations(&hkcu);
    }

    Ok(())
}

#[cfg(windows)]
fn clear_file_associations(hkcu: &winreg::RegKey) {
    let _ = hkcu.delete_subkey_all(r"Software\Classes\RustPad.Document");
    let _ = hkcu.delete_subkey_all(r"Software\Classes\Applications\rustpad.exe");
    for ext in FILE_ASSOCIATIONS {
        if let Ok(open_with) = hkcu.open_subkey_with_flags(
            format!(r"Software\Classes\.{ext}\OpenWithProgids"),
            winreg::enums::KEY_SET_VALUE,
        ) {
            let _ = open_with.delete_value("RustPad.Document");
        }
    }
}

#[cfg(windows)]
fn remove_windows_registry() {
    use winreg::{RegKey, enums::HKEY_CURRENT_USER};

    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    let _ = hkcu.delete_subkey_all(r"Software\Classes\*\shell\RustPad");
    clear_file_associations(&hkcu);
    let _ =
        hkcu.delete_subkey_all(r"Software\Microsoft\Windows\CurrentVersion\App Paths\rustpad.exe");
    let _ = hkcu.delete_subkey_all(r"Software\Microsoft\Windows\CurrentVersion\Uninstall\RustPad");
    let _ = hkcu.delete_subkey_all(r"Software\RustPad");
}

#[cfg(windows)]
fn notify_shell_assoc_changed() {
    use windows::Win32::UI::Shell::{SHCNE_ASSOCCHANGED, SHCNF_IDLIST, SHChangeNotify};

    unsafe {
        SHChangeNotify(SHCNE_ASSOCCHANGED, SHCNF_IDLIST, None, None);
    }
}

#[cfg(test)]
mod tests {
    use super::{FILE_ASSOCIATIONS, normalize_picked_dir, validate_install_dir};
    use std::path::Path;

    #[test]
    fn normalize_picked_dir_appends_rustpad_unless_already_rustpad() {
        assert_eq!(
            normalize_picked_dir(Path::new("/tmp/Apps")),
            Path::new("/tmp/Apps/RustPad")
        );
        assert_eq!(
            normalize_picked_dir(Path::new("/tmp/Apps/RustPad")),
            Path::new("/tmp/Apps/RustPad")
        );
        assert_eq!(
            normalize_picked_dir(Path::new("/tmp/Apps/rustpad")),
            Path::new("/tmp/Apps/rustpad")
        );
    }

    #[test]
    fn validate_install_dir_rejects_empty_and_trims_quotes() {
        assert!(validate_install_dir("   ").is_err());
        assert_eq!(
            validate_install_dir("  \"/opt/RustPad\"  ").unwrap(),
            Path::new("/opt/RustPad")
        );
    }

    #[test]
    fn file_associations_match_all_18_app_extensions() {
        assert_eq!(FILE_ASSOCIATIONS.len(), 18);
        assert!(FILE_ASSOCIATIONS.contains(&"txt"));
        assert!(FILE_ASSOCIATIONS.contains(&"rs"));
        assert!(FILE_ASSOCIATIONS.contains(&"tsx"));
    }
}
