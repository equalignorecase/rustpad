use crate::errors::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::Write,
    path::{Path, PathBuf},
};
use tempfile::NamedTempFile;

pub const MAX_BACKUP_BYTES: usize = 10 * 1024 * 1024;
const MAX_ENTRIES: usize = 50;
const MANIFEST_NAME: &str = "manifest.json";

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BackupEntry {
    pub key: String,
    pub name: String,
    pub path: Option<String>,
    #[serde(default)]
    pub fingerprint: String,
    pub line_ending: String,
    pub bom: bool,
    pub encoding: String,
    #[serde(default)]
    pub cursor: usize,
    #[serde(default)]
    pub scroll: f64,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(default, rename_all = "camelCase")]
struct BackupManifest {
    version: u8,
    entries: Vec<BackupEntry>,
}

fn sanitize_key(raw: &str) -> Result<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty()
        || trimmed.len() > 128
        || !trimmed
            .bytes()
            .all(|b| b.is_ascii_alphanumeric() || matches!(b, b'-' | b'_'))
    {
        return Err(AppError::new("backup", "Invalid backup identifier."));
    }
    Ok(trimmed.to_string())
}

fn content_path(dir: &Path, key: &str) -> PathBuf {
    dir.join(format!("{key}.txt"))
}

fn manifest_path(dir: &Path) -> PathBuf {
    dir.join(MANIFEST_NAME)
}

fn write_atomic(dir: &Path, target: &Path, bytes: &[u8]) -> Result<()> {
    fs::create_dir_all(dir)?;
    let mut temp = NamedTempFile::new_in(dir)?;
    temp.write_all(bytes)?;
    temp.as_file().sync_all()?;
    temp.persist(target)
        .map_err(|err| AppError::new("backup", format!("Could not save backup: {}", err.error)))?;
    Ok(())
}

fn load_manifest(dir: &Path) -> BackupManifest {
    let path = manifest_path(dir);
    let Ok(bytes) = fs::read(&path) else {
        return BackupManifest {
            version: 1,
            entries: Vec::new(),
        };
    };
    if bytes.len() > 512 * 1024 {
        return BackupManifest {
            version: 1,
            entries: Vec::new(),
        };
    }
    serde_json::from_slice(&bytes).unwrap_or(BackupManifest {
        version: 1,
        entries: Vec::new(),
    })
}

fn save_manifest(dir: &Path, manifest: &BackupManifest) -> Result<()> {
    if manifest.entries.is_empty() {
        let _ = fs::remove_file(manifest_path(dir));
        return Ok(());
    }
    let bytes = serde_json::to_vec_pretty(manifest)
        .map_err(|_| AppError::new("backup", "Could not encode backup manifest."))?;
    write_atomic(dir, &manifest_path(dir), &bytes)
}

pub fn save_entry(dir: &Path, mut entry: BackupEntry, content: &str) -> Result<()> {
    if content.len() > MAX_BACKUP_BYTES {
        return Err(AppError::new(
            "too_large",
            "Draft exceeds the 10 MiB crash-recovery backup limit.",
        ));
    }
    entry.key = sanitize_key(&entry.key)?;
    if !entry.scroll.is_finite() {
        entry.scroll = 0.0;
    } else {
        entry.scroll = entry.scroll.max(0.0);
    }
    entry.cursor = entry.cursor.min(MAX_BACKUP_BYTES);

    write_atomic(dir, &content_path(dir, &entry.key), content.as_bytes())?;

    let mut manifest = load_manifest(dir);
    manifest.version = 1;
    let mut stale_keys = Vec::new();
    manifest.entries.retain(|existing| {
        if existing.key == entry.key {
            return false;
        }
        if entry.path.is_some() && existing.path == entry.path {
            stale_keys.push(existing.key.clone());
            return false;
        }
        true
    });
    for stale in stale_keys {
        let _ = fs::remove_file(content_path(dir, &stale));
    }
    manifest.entries.push(entry);
    if manifest.entries.len() > MAX_ENTRIES {
        let overflow = manifest.entries.len() - MAX_ENTRIES;
        for dropped in manifest.entries.drain(0..overflow) {
            let _ = fs::remove_file(content_path(dir, &dropped.key));
        }
    }
    save_manifest(dir, &manifest)
}

pub fn remove_entry(dir: &Path, key: &str) -> Result<()> {
    let key = sanitize_key(key)?;
    let _ = fs::remove_file(content_path(dir, &key));
    let mut manifest = load_manifest(dir);
    let before = manifest.entries.len();
    manifest.entries.retain(|e| e.key != key);
    if manifest.entries.len() != before {
        save_manifest(dir, &manifest)?;
    }
    Ok(())
}

pub fn clear_all(dir: &Path) -> Result<()> {
    let manifest = load_manifest(dir);
    for entry in manifest.entries {
        if let Ok(key) = sanitize_key(&entry.key) {
            let _ = fs::remove_file(content_path(dir, &key));
        }
    }
    let _ = fs::remove_file(manifest_path(dir));
    Ok(())
}

pub fn load_all(dir: &Path) -> Vec<(BackupEntry, String)> {
    let manifest = load_manifest(dir);
    let mut recovered = Vec::new();
    for entry in manifest.entries.into_iter().take(MAX_ENTRIES) {
        let Ok(key) = sanitize_key(&entry.key) else {
            continue;
        };
        let path = content_path(dir, &key);
        let Ok(bytes) = fs::read(&path) else {
            continue;
        };
        if bytes.len() > MAX_BACKUP_BYTES {
            continue;
        }
        let Ok(content) = String::from_utf8(bytes) else {
            continue;
        };
        recovered.push((entry, content));
    }
    recovered
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    fn sample_entry(key: &str, path: Option<&str>) -> BackupEntry {
        BackupEntry {
            key: key.into(),
            name: "Untitled 1".into(),
            path: path.map(Into::into),
            fingerprint: "abc".into(),
            line_ending: "LF".into(),
            bom: false,
            encoding: "UTF-8".into(),
            cursor: 5,
            scroll: 12.0,
        }
    }

    #[test]
    fn saves_loads_updates_and_removes_backups_atomically() {
        let dir = tempdir().unwrap();
        let bdir = dir.path().join("backups");

        save_entry(&bdir, sample_entry("document-1", None), "สวัสดี draft").unwrap();
        save_entry(
            &bdir,
            sample_entry("document-2", Some("/tmp/a.txt")),
            "edited existing",
        )
        .unwrap();

        let loaded = load_all(&bdir);
        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].1, "สวัสดี draft");
        assert_eq!(loaded[1].0.path.as_deref(), Some("/tmp/a.txt"));

        // Updating same path replaces stale key cleanly
        save_entry(
            &bdir,
            sample_entry("document-9", Some("/tmp/a.txt")),
            "edited again",
        )
        .unwrap();
        let loaded = load_all(&bdir);
        assert_eq!(loaded.len(), 2);
        assert!(!content_path(&bdir, "document-2").exists());
        assert_eq!(loaded[1].0.key, "document-9");
        assert_eq!(loaded[1].1, "edited again");

        remove_entry(&bdir, "document-1").unwrap();
        assert_eq!(load_all(&bdir).len(), 1);

        clear_all(&bdir).unwrap();
        assert!(load_all(&bdir).is_empty());
        assert!(!manifest_path(&bdir).exists());
    }

    #[test]
    fn rejects_invalid_keys_and_handles_corrupt_manifest() {
        let dir = tempdir().unwrap();
        let bdir = dir.path().join("backups");
        assert!(save_entry(&bdir, sample_entry("../escape", None), "x").is_err());

        fs::create_dir_all(&bdir).unwrap();
        fs::write(manifest_path(&bdir), "{broken").unwrap();
        assert!(load_all(&bdir).is_empty());
    }
}
