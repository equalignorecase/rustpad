mod commands;
mod errors;
mod models;
mod services;

use commands::Backend;
use std::sync::atomic::Ordering;
use tauri::{Emitter, Manager};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let config_path = app.path().app_config_dir()?.join("settings.json");
            app.manage(Backend::new(config_path));
            let menu = tauri::menu::Menu::default(app.handle())?;
            app.set_menu(menu)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event
                && !window.state::<Backend>().allow_exit.load(Ordering::SeqCst)
            {
                api.prevent_close();
                let _ = window.emit("request-close", ());
            }
        })
        .on_webview_event(|webview, event| {
            if let tauri::WebviewEvent::DragDrop(tauri::DragDropEvent::Drop { paths, .. }) = event {
                webview.state::<Backend>().queue(paths.clone());
                let _ = webview.emit("files-available", ());
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::new_document,
            commands::choose_documents,
            commands::read_document,
            commands::save_document,
            commands::save_as_document,
            commands::inspect_document,
            commands::close_document,
            commands::take_pending,
            commands::load_config,
            commands::persist_config,
            commands::open_recent,
            commands::restore_session,
            commands::exit_app,
            commands::choose_folder,
            commands::list_folder,
            commands::open_entry,
        ])
        .build(tauri::generate_context!())
        .expect("RustPad could not start");
    app.run(|app, event| match event {
        tauri::RunEvent::ExitRequested { api, .. } => {
            if !app.state::<Backend>().allow_exit.load(Ordering::SeqCst) {
                api.prevent_exit();
                let _ = app.emit("request-close", ());
            }
        }
        #[cfg(target_os = "macos")]
        tauri::RunEvent::Opened { urls } => {
            app.state::<Backend>().queue(
                urls.into_iter()
                    .filter_map(|url| url.to_file_path().ok())
                    .collect(),
            );
            let _ = app.emit("files-available", ());
        }
        _ => {}
    });
}
