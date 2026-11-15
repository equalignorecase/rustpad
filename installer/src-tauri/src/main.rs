#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod payload;
mod webview2;
mod windows_install;

use serde::Serialize;
use std::{path::PathBuf, sync::Mutex};
use tauri::{AppHandle, Manager, State};
use tauri_plugin_dialog::DialogExt;
use windows_install::InstallOptions;

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
    estimated_size_mb: u64,
    platform_supported: bool,
}

#[tauri::command]
fn get_installer_state(state: State<'_, SetupModeState>) -> InstallerInit {
    let default_dir = windows_install::default_install_dir();
    let existing = windows_install::existing_installation();
    let (existing_dir, installed_ver) = match existing {
        Some((dir, ver)) => (Some(dir.to_string_lossy().to_string()), ver),
        None => (None, None),
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

fn parse_cli_flags(args: &[String]) -> (bool, bool) {
    let uninstall = args.iter().any(|a| a.eq_ignore_ascii_case("--uninstall"));
    let quiet = args.iter().any(|a| a.eq_ignore_ascii_case("--quiet"));
    (uninstall, quiet)
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let (uninstall, quiet) = parse_cli_flags(&args);

    if uninstall && quiet {
        let dir = windows_install::existing_installation()
            .map(|(d, _)| d)
            .unwrap_or_else(windows_install::default_install_dir);
        if windows_install::perform_uninstall(None, &dir).is_ok() {
            windows_install::spawn_self_cleanup(&dir);
            return;
        }
        std::process::exit(1);
    }

    if let Err(err) = webview2::ensure_webview2_runtime() {
        eprintln!("{err}");
        std::process::exit(1);
    }

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
    use super::parse_cli_flags;

    #[test]
    fn cli_flags_detect_uninstall_and_quiet() {
        assert_eq!(parse_cli_flags(&["setup.exe".into()]), (false, false));
        assert_eq!(
            parse_cli_flags(&["uninstall.exe".into(), "--uninstall".into()]),
            (true, false)
        );
        assert_eq!(
            parse_cli_flags(&[
                "uninstall.exe".into(),
                "--UNINSTALL".into(),
                "--quiet".into()
            ]),
            (true, true)
        );
    }
}
