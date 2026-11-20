#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod payload;
mod webview2;
mod windows_install;

use serde::Serialize;
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use windows_install::{InstallOptions, SavedInstallOptions};

struct SetupModeState {
    uninstall: bool,
    busy: Mutex<bool>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct InstallerInit {
    mode: String,
    version: String,
    default_install_dir: String,
    existing_install_dir: Option<String>,
    installed_version: Option<String>,
    saved_options: SavedInstallOptions,
    estimated_size_mb: u64,
    platform_supported: bool,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct CliFlags {
    uninstall: bool,
    silent: bool,
    launch: bool,
    install_dir: Option<String>,
}

#[tauri::command]
fn get_installer_state(state: State<'_, SetupModeState>) -> InstallerInit {
    let default_dir = windows_install::default_install_dir();
    let existing = windows_install::existing_installation();
    let (existing_dir, installed_ver, saved_options) = match existing {
        Some(found) => (
            Some(found.install_dir.to_string_lossy().to_string()),
            found.version,
            found.options,
        ),
        None => (None, None, SavedInstallOptions::default()),
    };

    InstallerInit {
        mode: if state.uninstall {
            "uninstall".to_string()
        } else {
            "install".to_string()
        },
        version: windows_install::APP_VERSION.to_string(),
        default_install_dir: default_dir.to_string_lossy().to_string(),
        existing_install_dir: existing_dir,
        installed_version: installed_ver,
        saved_options,
        estimated_size_mb: payload::estimated_size_mb(),
        platform_supported: cfg!(windows),
    }
}

#[tauri::command]
async fn pick_install_dir(app: AppHandle, current_dir: String) -> Option<String> {
    let starting_dir = windows_install::validate_install_dir(&current_dir).ok();
    let picked = tokio_spawn_folder_picker(app, starting_dir).await?;
    Some(
        windows_install::normalize_picked_dir(&picked)
            .to_string_lossy()
            .to_string(),
    )
}

async fn tokio_spawn_folder_picker(
    app: AppHandle,
    starting_dir: Option<PathBuf>,
) -> Option<PathBuf> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut builder = app
            .dialog()
            .file()
            .set_title("Choose RustPad Install Folder");
        if let Some(dir) = starting_dir
            && dir.is_dir()
        {
            builder = builder.set_directory(dir);
        }
        builder
            .blocking_pick_folder()
            .and_then(|fp| fp.into_path().ok())
    })
    .await
    .ok()
    .flatten()
}

struct BusyGuard<'a>(&'a Mutex<bool>);

impl Drop for BusyGuard<'_> {
    fn drop(&mut self) {
        if let Ok(mut guard) = self.0.lock() {
            *guard = false;
        }
    }
}

fn acquire_busy<'a>(state: &'a SetupModeState) -> Result<BusyGuard<'a>, String> {
    let mut guard = state
        .busy
        .lock()
        .map_err(|_| "Internal installer lock error.".to_string())?;
    if *guard {
        return Err("An operation is already in progress.".to_string());
    }
    *guard = true;
    drop(guard);
    Ok(BusyGuard(&state.busy))
}

#[tauri::command]
async fn run_install(
    app: AppHandle,
    state: State<'_, SetupModeState>,
    options: InstallOptions,
) -> Result<(), String> {
    let _busy = acquire_busy(&state)?;
    tauri::async_runtime::spawn_blocking(move || {
        windows_install::perform_install(Some(&app), &options).map(|_| ())
    })
    .await
    .map_err(|err| format!("Installer task aborted: {err}"))?
}

#[tauri::command]
async fn run_uninstall(
    app: AppHandle,
    state: State<'_, SetupModeState>,
    install_dir: String,
) -> Result<(), String> {
    let _busy = acquire_busy(&state)?;
    let dir = windows_install::validate_install_dir(&install_dir)?;
    tauri::async_runtime::spawn_blocking(move || {
        windows_install::perform_uninstall(Some(&app), &dir)
    })
    .await
    .map_err(|err| format!("Uninstaller task aborted: {err}"))?
}

#[tauri::command]
fn launch_and_exit(app: AppHandle, install_dir: String) -> Result<(), String> {
    let dir = windows_install::validate_install_dir(&install_dir)?;
    windows_install::launch_installed_app(&dir)?;
    app.exit(0);
    Ok(())
}

#[tauri::command]
fn finish_uninstall(app: AppHandle, install_dir: String) -> Result<(), String> {
    let dir = windows_install::validate_install_dir(&install_dir)?;
    windows_install::spawn_self_cleanup(&dir);
    app.exit(0);
    Ok(())
}

fn parse_cli_flags(args: &[String]) -> CliFlags {
    let mut uninstall = false;
    let mut silent = false;
    let mut launch = false;
    let mut install_dir = None;

    let mut iter = args.iter().skip(1);
    while let Some(arg) = iter.next() {
        if arg.eq_ignore_ascii_case("--uninstall") || arg.eq_ignore_ascii_case("/uninstall") {
            uninstall = true;
        } else if arg.eq_ignore_ascii_case("--quiet")
            || arg.eq_ignore_ascii_case("--silent")
            || arg.eq_ignore_ascii_case("/S")
        {
            silent = true;
        } else if arg.eq_ignore_ascii_case("--launch") {
            launch = true;
        } else if let Some(val) = arg
            .strip_prefix("--dir=")
            .or_else(|| arg.strip_prefix("/D="))
        {
            if !val.trim().is_empty() {
                install_dir = Some(val.trim().trim_matches('"').to_string());
            }
        } else if arg.eq_ignore_ascii_case("--dir")
            && let Some(next) = iter.next()
            && !next.trim().is_empty()
        {
            install_dir = Some(next.trim().trim_matches('"').to_string());
        }
    }

    CliFlags {
        uninstall,
        silent,
        launch,
        install_dir,
    }
}

fn run_silent_install(flags: &CliFlags) -> Result<(), String> {
    webview2::ensure_webview2_runtime()?;
    let existing = windows_install::existing_installation();
    let (target_dir, saved) = match existing {
        Some(found) => (found.install_dir, found.options),
        None => (
            windows_install::default_install_dir(),
            SavedInstallOptions::default(),
        ),
    };
    let resolved_dir = flags
        .install_dir
        .clone()
        .unwrap_or_else(|| target_dir.to_string_lossy().to_string());

    let options = InstallOptions {
        install_dir: resolved_dir,
        start_menu_shortcut: saved.start_menu_shortcut,
        desktop_shortcut: saved.desktop_shortcut,
        context_menu: saved.context_menu,
        file_associations: saved.file_associations,
    };

    let installed_dir = windows_install::perform_install(None, &options)?;
    if flags.launch {
        windows_install::launch_installed_app(&installed_dir)?;
    }
    Ok(())
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let flags = parse_cli_flags(&args);

    if flags.silent {
        if flags.uninstall {
            let dir = windows_install::existing_installation()
                .map(|found| found.install_dir)
                .unwrap_or_else(windows_install::default_install_dir);
            if windows_install::perform_uninstall(None, &dir).is_ok() {
                windows_install::spawn_self_cleanup(&dir);
                return;
            }
            std::process::exit(1);
        }

        if let Err(err) = run_silent_install(&flags) {
            eprintln!("{err}");
            std::process::exit(1);
        }
        return;
    }

    if let Err(err) = webview2::ensure_webview2_runtime() {
        eprintln!("{err}");
        std::process::exit(1);
    }

    let uninstall = flags.uninstall;
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .manage(SetupModeState {
            uninstall,
            busy: Mutex::new(false),
        })
        .setup(move |app| {
            if uninstall && let Some(win) = app.get_webview_window("main") {
                let _ = win.set_title("Uninstall RustPad");
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_installer_state,
            pick_install_dir,
            run_install,
            run_uninstall,
            launch_and_exit,
            finish_uninstall,
        ])
        .run(tauri::generate_context!())
        .expect("error while running RustPad Setup");
}

#[cfg(test)]
mod tests {
    use super::{CliFlags, parse_cli_flags};

    #[test]
    fn cli_flags_detect_uninstall_silent_launch_and_dir() {
        assert_eq!(
            parse_cli_flags(&["setup.exe".into()]),
            CliFlags {
                uninstall: false,
                silent: false,
                launch: false,
                install_dir: None,
            }
        );
        assert_eq!(
            parse_cli_flags(&[
                "uninstall.exe".into(),
                "--UNINSTALL".into(),
                "--quiet".into()
            ]),
            CliFlags {
                uninstall: true,
                silent: true,
                launch: false,
                install_dir: None,
            }
        );
        assert_eq!(
            parse_cli_flags(&[
                "setup.exe".into(),
                "/S".into(),
                "--launch".into(),
                r#"--dir="C:\Apps\RustPad""#.into(),
            ]),
            CliFlags {
                uninstall: false,
                silent: true,
                launch: true,
                install_dir: Some(r"C:\Apps\RustPad".to_string()),
            }
        );
        assert_eq!(
            parse_cli_flags(&[
                "setup.exe".into(),
                "--silent".into(),
                "--dir".into(),
                r"D:\Tools\RustPad".into(),
            ]),
            CliFlags {
                uninstall: false,
                silent: true,
                launch: false,
                install_dir: Some(r"D:\Tools\RustPad".to_string()),
            }
        );
    }
}
