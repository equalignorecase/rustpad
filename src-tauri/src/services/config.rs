use crate::{
    errors::{AppError, Result},
    models::Config,
    services::files::{atomic_write, destination, existing_fingerprint},
};
use std::{fs, path::Path};

pub fn load(path: &Path) -> Result<Config> {
    match fs::read(path) {
        Ok(bytes) if bytes.len() <= 512 * 1024 => serde_json::from_slice(&bytes).map_err(|_| {
            AppError::new(
                "config",
                "Settings could not be read. The original configuration was preserved.",
            )
        }),
        Ok(_) => Err(AppError::new("config", "Configuration exceeds 512 KiB.")),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(Config::default()),
        Err(error) => Err(error.into()),
    }
}

pub fn store(path: &Path, config: &Config) -> Result<()> {
    if path.exists() {
        load(path)?;
    }
    let bytes = serde_json::to_vec_pretty(config)
        .map_err(|_| AppError::new("config", "Settings could not be encoded."))?;
    if bytes.len() > 512 * 1024 {
        return Err(AppError::new("config", "Configuration exceeds 512 KiB."));
    }
    fs::create_dir_all(
        path.parent()
            .ok_or_else(|| AppError::new("config", "Configuration folder is unavailable."))?,
    )?;
    let path = destination(path)?;
    let expected = existing_fingerprint(&path)?;
    atomic_write(&path, &bytes, expected.as_deref())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::SessionTab;
    use tempfile::tempdir;

    #[test]
    fn persists_only_metadata_and_preserves_unicode_paths() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("config/settings.json");
        let config = Config {
            version: 1,
            settings: serde_json::json!({"fontSize": 15}),
            recent: vec!["/ภาษาไทย/🦀.rs".into()],
            tabs: vec![SessionTab {
                path: "/ภาษาไทย/🦀.rs".into(),
                cursor: 8,
                scroll: 42.0,
            }],
            active: None,
        };
        store(&path, &config).unwrap();
        let loaded = load(&path).unwrap();
        assert_eq!(loaded.tabs[0].path, "/ภาษาไทย/🦀.rs");
        assert_eq!(loaded.tabs[0].cursor, 8);
        assert_eq!(loaded.settings["fontSize"], 15);
        assert!(!std::fs::read_to_string(path).unwrap().contains("content"));
    }

    #[test]
    fn rejects_corrupt_configuration_without_removing_original() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("settings.json");
        std::fs::write(&path, "broken{").unwrap();
        assert_eq!(load(&path).unwrap_err().code, "config");
        assert_eq!(store(&path, &Config::default()).unwrap_err().code, "config");
        assert_eq!(std::fs::read_to_string(path).unwrap(), "broken{");
    }
}

#[cfg(test)]
mod platform_tests {
    use super::*;
    use tauri::utils::TitleBarStyle;
    use tauri::utils::{
        config::{Config as TauriConfig, WebviewInstallMode, parse::read_from},
        platform::Target,
    };

    #[test]
    fn windows_uses_native_controls_and_offline_nsis_installer() {
        let (raw, _) = read_from(Target::Windows, Path::new(env!("CARGO_MANIFEST_DIR"))).unwrap();
        let config: TauriConfig = serde_json::from_value(raw.clone()).unwrap();
        let window = &config.app.windows[0];
        assert!(window.decorations);
        assert!(matches!(window.title_bar_style, TitleBarStyle::Visible));
        assert!(!window.hidden_title);
        assert!(window.traffic_light_position.is_none());
        assert_eq!(window.width, 1180.0);
        assert_eq!(raw["bundle"]["targets"], serde_json::json!(["nsis"]));
        assert!(matches!(
            config.bundle.windows.webview_install_mode,
            WebviewInstallMode::OfflineInstaller { .. }
        ));
        assert_eq!(
            config.bundle.windows.minimum_webview2_version.as_deref(),
            Some("111.0.1661.0")
        );
    }

    #[test]
    fn macos_keeps_overlay_traffic_lights_and_app_bundle() {
        let (raw, _) = read_from(Target::MacOS, Path::new(env!("CARGO_MANIFEST_DIR"))).unwrap();
        let config: TauriConfig = serde_json::from_value(raw.clone()).unwrap();
        let window = &config.app.windows[0];
        assert!(matches!(window.title_bar_style, TitleBarStyle::Overlay));
        assert!(window.hidden_title);
        assert!(window.traffic_light_position.is_some());
        assert_eq!(window.width, 1180.0);
        assert_eq!(raw["bundle"]["targets"], serde_json::json!(["app"]));
    }
}
