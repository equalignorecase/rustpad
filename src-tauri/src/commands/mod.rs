use crate::{
    errors::{AppError, Result},
    models::{Config, Document, SessionTab},
    services::{
        backups::{self, BackupEntry},
        config,
        files::{Files, destination, existing_fingerprint},
        updater,
    },
};
use serde::{Deserialize, Serialize};
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{
        Mutex, MutexGuard,
        atomic::{AtomicBool, Ordering},
    },
};
use tauri::{AppHandle, State};
use tauri_plugin_dialog::DialogExt;

pub struct Backend {
    pub files: Mutex<Files>,
    pub config: Mutex<Config>,
    pub config_path: PathBuf,
    pub pending: Mutex<Vec<PathBuf>>,
    pub last_drop: Mutex<Option<(Vec<PathBuf>, std::time::Instant)>>,
    pub allow_exit: AtomicBool,
    folder: Mutex<Option<Folder>>,
}
struct Folder {
    root: PathBuf,
    entries: HashMap<String, PathBuf>,
    next: usize,
}
fn lock<T>(value: &Mutex<T>) -> Result<MutexGuard<'_, T>> {
    value.lock().map_err(|_| {
        AppError::new(
            "internal",
            "The operation could not complete. Your document remains in the editor.",
        )
    })
}

fn authorize_folder(backend: &Backend, path: &std::path::Path) -> Result<Entry> {
    let root = std::fs::canonicalize(path)?;
    if !root.is_dir() {
        return Err(AppError::new("path", "Choose a local folder."));
    }
    let name = root
        .file_name()
        .unwrap_or_default()
        .to_string_lossy()
        .into_owned();
    let mut entries = HashMap::new();
    entries.insert("folder-0".into(), root.clone());
    *lock(&backend.folder)? = Some(Folder {
        root,
        entries,
        next: 1,
    });
    Ok(Entry {
        id: "folder-0".into(),
        name,
        directory: true,
    })
}

impl Backend {
    pub fn new(path: PathBuf) -> Self {
        Self {
            files: Mutex::default(),
            config: Mutex::new(config::load(&path).unwrap_or_default()),
            config_path: path,
            pending: Mutex::default(),
            last_drop: Mutex::new(None),
            allow_exit: AtomicBool::new(false),
            folder: Mutex::new(None),
        }
    }
    pub fn backups_dir(&self) -> PathBuf {
        self.config_path
            .parent()
            .unwrap_or_else(|| std::path::Path::new("."))
            .join("backups")
    }
    fn remember(&self, doc: &Document) -> Result<()> {
        if let Some(path) = &doc.path {
            let mut config = lock(&self.config)?;
            config.recent.retain(|p| p != path);
            config.recent.insert(0, path.clone());
            config.recent.truncate(20);
        }
        Ok(())
    }
    pub fn queue(&self, paths: Vec<PathBuf>) {
        if let Ok(mut pending) = self.pending.lock() {
            for path in paths.into_iter().take(50) {
                if !pending.contains(&path) {
                    pending.push(path);
                }
            }
        }
    }
    pub fn queue_drop(&self, paths: Vec<PathBuf>) -> bool {
        if paths.is_empty() {
            return false;
        }
        let now = std::time::Instant::now();
        if let Ok(mut last) = self.last_drop.lock() {
            if let Some((prev_paths, prev_time)) = &*last
                && prev_paths == &paths
                && now.duration_since(*prev_time) < std::time::Duration::from_millis(200)
            {
                return false;
            }
            *last = Some((paths.clone(), now));
        }
        self.queue(paths);
        true
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct OpenBatch {
    documents: Vec<Document>,
    errors: Vec<AppError>,
    #[serde(skip_serializing_if = "Option::is_none")]
    folder: Option<Entry>,
}
fn open_paths(backend: &Backend, paths: Vec<PathBuf>) -> Result<OpenBatch> {
    let mut batch = OpenBatch {
        documents: vec![],
        errors: vec![],
        folder: None,
    };
    for path in paths.into_iter().take(50) {
        if path.is_dir() {
            match authorize_folder(backend, &path) {
                Ok(entry) => batch.folder = Some(entry),
                Err(error) => batch.errors.push(error),
            }
            continue;
        }
        let result = lock(&backend.files)?.open(&path);
        match result {
            Ok(doc) => {
                backend.remember(&doc)?;
                batch.documents.push(doc);
            }
            Err(error) => batch.errors.push(error),
        }
    }
    Ok(batch)
}

#[tauri::command]
pub async fn new_document(backend: State<'_, Backend>) -> Result<Document> {
    Ok(lock(&backend.files)?.new_document())
}
#[tauri::command]
pub async fn choose_documents(app: AppHandle, backend: State<'_, Backend>) -> Result<OpenBatch> {
    let paths = app
        .dialog()
        .file()
        .set_title("Open text files")
        .blocking_pick_files()
        .unwrap_or_default()
        .into_iter()
        .filter_map(|p| p.into_path().ok())
        .collect();
    open_paths(&backend, paths)
}
#[tauri::command]
pub async fn take_pending(backend: State<'_, Backend>) -> Result<OpenBatch> {
    let paths = std::mem::take(&mut *lock(&backend.pending)?);
    open_paths(&backend, paths)
}
#[tauri::command]
pub async fn read_document(id: String, backend: State<'_, Backend>) -> Result<Document> {
    lock(&backend.files)?.read(&id)
}
#[tauri::command]
pub async fn inspect_document(id: String, backend: State<'_, Backend>) -> Result<bool> {
    lock(&backend.files)?.inspect(&id)
}
#[tauri::command]
pub async fn save_document(
    id: String,
    content: String,
    ending: String,
    bom: bool,
    encoding: Option<String>,
    expected: String,
    backend: State<'_, Backend>,
) -> Result<Document> {
    let doc = lock(&backend.files)?.save_with_encoding(
        &id,
        &content,
        &ending,
        bom,
        encoding.as_deref(),
        &expected,
    )?;
    backend.remember(&doc)?;
    let _ = backups::remove_entry(&backend.backups_dir(), &id);
    Ok(doc)
}
#[tauri::command]
pub async fn save_as_document(
    id: String,
    content: String,
    ending: String,
    bom: bool,
    encoding: Option<String>,
    app: AppHandle,
    backend: State<'_, Backend>,
) -> Result<Option<Document>> {
    let name = lock(&backend.files)?.get(&id)?.name.clone();
    let selected = app
        .dialog()
        .file()
        .set_title("Save document as")
        .set_file_name(name)
        .blocking_save_file();
    let Some(selected) = selected else {
        return Ok(None);
    };
    let path = destination(
        &selected
            .into_path()
            .map_err(|_| AppError::new("path", "Choose a local file."))?,
    )?;
    let expected = existing_fingerprint(&path)?;
    let doc = lock(&backend.files)?.save_as_with_encoding(
        &id,
        &path,
        &content,
        &ending,
        bom,
        encoding.as_deref(),
        expected.as_deref(),
    )?;
    backend.remember(&doc)?;
    let _ = backups::remove_entry(&backend.backups_dir(), &id);
    Ok(Some(doc))
}
#[tauri::command]
pub async fn close_document(id: String, backend: State<'_, Backend>) -> Result<()> {
    lock(&backend.files)?.close(&id);
    let _ = backups::remove_entry(&backend.backups_dir(), &id);
    Ok(())
}
#[tauri::command]
pub async fn load_config(backend: State<'_, Backend>) -> Result<Config> {
    Ok(lock(&backend.config)?.clone())
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TabPosition {
    id: String,
    cursor: usize,
    scroll: f64,
}
#[tauri::command]
pub async fn persist_config(
    settings: serde_json::Value,
    tabs: Vec<TabPosition>,
    active: Option<String>,
    backend: State<'_, Backend>,
) -> Result<()> {
    if !settings.is_object() || settings.to_string().len() > 16_384 || tabs.len() > 100 {
        return Err(AppError::new("validation", "Invalid settings payload."));
    }
    let files = lock(&backend.files)?;
    let mut config = lock(&backend.config)?;
    config.settings = settings;
    config.version = 1;
    config.tabs = tabs
        .iter()
        .filter_map(|tab| {
            files.get(&tab.id).ok().and_then(|d| {
                d.path.as_ref().map(|path| SessionTab {
                    path: path.clone(),
                    cursor: tab.cursor.min(10 * 1024 * 1024),
                    scroll: if tab.scroll.is_finite() {
                        tab.scroll.max(0.0)
                    } else {
                        0.0
                    },
                })
            })
        })
        .collect();
    config.active = active.and_then(|id| files.get(&id).ok().and_then(|d| d.path.clone()));
    config::store(&backend.config_path, &config)
}
#[tauri::command]
pub async fn open_recent(index: usize, backend: State<'_, Backend>) -> Result<OpenBatch> {
    let path = lock(&backend.config)?
        .recent
        .get(index)
        .cloned()
        .ok_or_else(|| AppError::new("recent", "Recent file is no longer available."))?;
    open_paths(&backend, vec![PathBuf::from(path)])
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RecoveredBackup {
    backup_key: String,
    document: Document,
    draft_content: String,
    draft_line_ending: String,
    draft_bom: bool,
    draft_encoding: String,
    cursor: usize,
    scroll: f64,
    disk_changed: bool,
}

#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub async fn save_backup(
    id: String,
    name: String,
    content: String,
    line_ending: String,
    bom: bool,
    encoding: String,
    cursor: usize,
    scroll: f64,
    backend: State<'_, Backend>,
) -> Result<()> {
    let (path, fingerprint) = {
        let files = lock(&backend.files)?;
        match files.get(&id) {
            Ok(doc) => (doc.path.clone(), doc.fingerprint.clone()),
            Err(_) => (None, String::new()),
        }
    };
    let entry = BackupEntry {
        key: id,
        name,
        path,
        fingerprint,
        line_ending,
        bom,
        encoding,
        cursor,
        scroll,
    };
    backups::save_entry(&backend.backups_dir(), entry, &content)
}

#[tauri::command]
pub async fn remove_backup(id: String, backend: State<'_, Backend>) -> Result<()> {
    backups::remove_entry(&backend.backups_dir(), &id)
}

#[tauri::command]
pub async fn clear_backups(backend: State<'_, Backend>) -> Result<()> {
    backups::clear_all(&backend.backups_dir())
}

#[tauri::command]
pub async fn restore_backups(backend: State<'_, Backend>) -> Result<Vec<RecoveredBackup>> {
    let loaded = backups::load_all(&backend.backups_dir());
    let mut files = lock(&backend.files)?;
    let mut restored = Vec::with_capacity(loaded.len());
    for (entry, draft_content) in loaded {
        let (document, disk_changed) = match &entry.path {
            Some(path_str) => match files.open(&PathBuf::from(path_str)) {
                Ok(doc) => {
                    let changed =
                        !entry.fingerprint.is_empty() && doc.fingerprint != entry.fingerprint;
                    (doc, changed)
                }
                Err(_) => (
                    files.restore_untitled(
                        entry.name.clone(),
                        entry.line_ending.clone(),
                        entry.bom,
                        entry.encoding.clone(),
                    ),
                    false,
                ),
            },
            None => (
                files.restore_untitled(
                    entry.name.clone(),
                    entry.line_ending.clone(),
                    entry.bom,
                    entry.encoding.clone(),
                ),
                false,
            ),
        };
        restored.push(RecoveredBackup {
            backup_key: entry.key,
            document,
            draft_content,
            draft_line_ending: entry.line_ending,
            draft_bom: entry.bom,
            draft_encoding: entry.encoding,
            cursor: entry.cursor,
            scroll: entry.scroll,
            disk_changed,
        });
    }
    Ok(restored)
}

#[tauri::command]
pub async fn restore_session(backend: State<'_, Backend>) -> Result<OpenBatch> {
    let paths = lock(&backend.config)?
        .tabs
        .iter()
        .take(50)
        .map(|t| PathBuf::from(&t.path))
        .collect();
    open_paths(&backend, paths)
}
#[tauri::command]
pub async fn exit_app(app: AppHandle, backend: State<'_, Backend>) -> Result<()> {
    backend.allow_exit.store(true, Ordering::SeqCst);
    app.exit(0);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    id: String,
    name: String,
    directory: bool,
}
#[derive(Serialize)]
pub struct Listing {
    entries: Vec<Entry>,
    truncated: bool,
}
#[tauri::command]
pub async fn choose_folder(app: AppHandle, backend: State<'_, Backend>) -> Result<Option<Entry>> {
    let Some(path) = app.dialog().file().blocking_pick_folder() else {
        return Ok(None);
    };
    let local = path
        .into_path()
        .map_err(|_| AppError::new("path", "Choose a local folder."))?;
    Ok(Some(authorize_folder(&backend, &local)?))
}
#[tauri::command]
pub async fn list_folder(id: String, backend: State<'_, Backend>) -> Result<Listing> {
    let mut folder = lock(&backend.folder)?;
    let folder = folder
        .as_mut()
        .ok_or_else(|| AppError::new("unauthorized", "Open a folder first."))?;
    let path = folder
        .entries
        .get(&id)
        .ok_or_else(|| AppError::new("unauthorized", "Folder entry is not authorized."))?;
    let path = std::fs::canonicalize(path)?;
    if !path.starts_with(&folder.root) {
        return Err(AppError::new(
            "unauthorized",
            "Folder entry moved outside the authorized folder.",
        ));
    }
    let mut listing = Listing {
        entries: vec![],
        truncated: false,
    };
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        let kind = entry.file_type()?;
        if kind.is_symlink() || (!kind.is_file() && !kind.is_dir()) {
            continue;
        }
        if listing.entries.len() == 500 {
            listing.truncated = true;
            break;
        }
        let id = format!("folder-{}", folder.next);
        folder.next += 1;
        folder.entries.insert(id.clone(), entry.path());
        listing.entries.push(Entry {
            id,
            name: entry.file_name().to_string_lossy().into_owned(),
            directory: kind.is_dir(),
        });
    }
    listing.entries.sort_by(|a, b| {
        b.directory
            .cmp(&a.directory)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(listing)
}
#[tauri::command]
pub async fn open_entry(id: String, backend: State<'_, Backend>) -> Result<OpenBatch> {
    let path =
        {
            let folder = lock(&backend.folder)?;
            let folder = folder
                .as_ref()
                .ok_or_else(|| AppError::new("unauthorized", "Open a folder first."))?;
            let path =
                std::fs::canonicalize(folder.entries.get(&id).ok_or_else(|| {
                    AppError::new("unauthorized", "File entry is not authorized.")
                })?)?;
            if !path.starts_with(&folder.root) {
                return Err(AppError::new(
                    "unauthorized",
                    "File moved outside the authorized folder.",
                ));
            }
            path
        };
    open_paths(&backend, vec![path])
}

#[tauri::command]
pub async fn check_update() -> Result<updater::UpdateInfo> {
    tauri::async_runtime::spawn_blocking(|| updater::check_latest(env!("CARGO_PKG_VERSION")))
        .await
        .map_err(|_| AppError::new("internal", "The update check could not complete."))?
}
#[tauri::command]
pub async fn open_release_page(url: String) -> Result<()> {
    updater::validate_release_url(&url)?;
    open_in_browser(&url)
}
#[tauri::command]
pub async fn install_update(
    app: AppHandle,
    installer_url: String,
    checksums_url: String,
    backend: State<'_, Backend>,
) -> Result<()> {
    tauri::async_runtime::spawn_blocking(move || {
        updater::download_and_launch_installer(&installer_url, &checksums_url)
    })
    .await
    .map_err(|_| AppError::new("internal", "The update installer could not start."))??;
    backend.allow_exit.store(true, Ordering::SeqCst);
    app.exit(0);
    Ok(())
}

fn open_in_browser(url: &str) -> Result<()> {
    let mut command = browser_command(url);
    command
        .spawn()
        .map_err(|_| AppError::new("open", "Could not open your browser."))?;
    Ok(())
}
#[cfg(target_os = "windows")]
fn browser_command(url: &str) -> std::process::Command {
    // Direct spawn: no shell is involved, so no argument can be re-parsed.
    let mut command = std::process::Command::new("rundll32");
    command.args(["url.dll,FileProtocolHandler", url]);
    command
}
#[cfg(target_os = "macos")]
fn browser_command(url: &str) -> std::process::Command {
    let mut command = std::process::Command::new("open");
    command.arg(url);
    command
}
#[cfg(all(unix, not(target_os = "macos")))]
fn browser_command(url: &str) -> std::process::Command {
    let mut command = std::process::Command::new("xdg-open");
    command.arg(url);
    command
}
