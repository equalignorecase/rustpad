use crate::{
    errors::{AppError, Result},
    models::Document,
};
use same_file::Handle;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs::{self, File},
    io::{Read, Write},
    path::{Path, PathBuf},
};

pub const MAX_BYTES: u64 = 10 * 1024 * 1024;

#[derive(Default)]
pub struct Files {
    records: HashMap<String, Document>,
    next_id: u64,
}

fn fingerprint(bytes: &[u8]) -> String {
    format!("{:x}", Sha256::digest(bytes))
}

fn read_bytes(path: &Path) -> Result<Vec<u8>> {
    let file = File::open(path)?;
    let metadata = file.metadata()?;
    let identity = fs::symlink_metadata(path)?;
    if identity.file_type().is_symlink()
        || Handle::from_file(file.try_clone()?)? != Handle::from_path(path)?
        || fs::canonicalize(path)? != path
    {
        return Err(AppError::new(
            "path",
            "The file or its parent folder was replaced. Open it again using the native picker.",
        ));
    }
    if !metadata.is_file() {
        return Err(AppError::new("not_file", "Choose a regular text file."));
    }
    if metadata.len() > MAX_BYTES {
        return Err(AppError::new(
            "too_large",
            "Files larger than 10 MiB are not supported. The file was not changed.",
        ));
    }
    let mut bytes = Vec::with_capacity(metadata.len() as usize);
    file.take(MAX_BYTES + 1).read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(AppError::new(
            "too_large",
            "The file grew beyond the 10 MiB limit.",
        ));
    }
    Ok(bytes)
}

fn decode(bytes: &[u8]) -> Result<(String, bool)> {
    let bom = bytes.starts_with(&[0xef, 0xbb, 0xbf]);
    let body = if bom { &bytes[3..] } else { bytes };
    let content = std::str::from_utf8(body).map_err(|_| AppError::new("encoding", "This file is not valid UTF-8. Convert a copy to UTF-8 in another tool, then open the copy. No bytes were changed."))?;
    if content
        .chars()
        .any(|c| c == '\0' || (c.is_control() && !matches!(c, '\n' | '\r' | '\t' | '\u{c}')))
    {
        return Err(AppError::new(
            "binary",
            "This looks like binary content. RustPad opens UTF-8 text only; the file was not changed.",
        ));
    }
    Ok((content.to_owned(), bom))
}

pub fn normalized(text: &str) -> String {
    text.replace("\r\n", "\n").replace('\r', "\n")
}

fn line_ending(text: &str) -> String {
    let crlf = text.matches("\r\n").count();
    let lf = text.matches('\n').count() - crlf;
    let cr = text.matches('\r').count() - crlf;
    match (crlf > 0, lf > 0, cr > 0) {
        (true, false, false) => "CRLF",
        (false, false, true) => "CR",
        (false, _, false) => "LF",
        _ => "Mixed",
    }
    .into()
}

fn materialize(content: &str, ending: &str, original: &str) -> Result<String> {
    let normalized = normalized(content);
    match ending {
        "LF" => Ok(normalized),
        "CRLF" => Ok(normalized.replace('\n', "\r\n")),
        "Preserve" => {
            if normalized == self::normalized(original) {
                return Ok(original.to_owned());
            }
            let endings: Vec<&str> = original
                .split_inclusive(['\n', '\r'])
                .filter_map(|s| {
                    if s.ends_with('\r') {
                        Some("\r")
                    } else if s.ends_with('\n') {
                        Some("\n")
                    } else {
                        None
                    }
                })
                .collect();
            // shortcut: edited mixed-ending files use their dominant separator; upgrade to per-line mapping if lossless mixed edits are needed.
            let separator = match line_ending(original).as_str() {
                "CRLF" => "\r\n",
                "CR" => "\r",
                "Mixed" if original.matches("\r\n").count() * 2 >= endings.len() => "\r\n",
                _ => "\n",
            };
            Ok(normalized.replace('\n', separator))
        }
        _ => Err(AppError::new(
            "validation",
            "Choose Preserve, LF or CRLF line endings.",
        )),
    }
}

fn check_target(path: &Path, expected: Option<&str>) -> Result<()> {
    if fs::canonicalize(
        path.parent()
            .ok_or_else(|| AppError::new("path", "The destination has no parent folder."))?,
    )? != path.parent().unwrap()
    {
        return Err(AppError::new(
            "path",
            "The destination folder changed. Choose the file again.",
        ));
    }
    match fs::symlink_metadata(path) {
        Ok(metadata) => {
            if metadata.file_type().is_symlink() || !metadata.is_file() {
                return Err(AppError::new(
                    "path",
                    "The destination was replaced. Choose the file again.",
                ));
            }
            if metadata.permissions().readonly() {
                return Err(AppError::new(
                    "readonly",
                    "This file is read-only. Use Save As to keep your changes.",
                ));
            }
            let bytes = read_bytes(path)?;
            if expected != Some(fingerprint(&bytes).as_str()) {
                return Err(AppError::new(
                    "conflict",
                    "The file changed outside RustPad. Reload it, or use Save As for your local changes.",
                ));
            }
        }
        Err(error) if error.kind() == std::io::ErrorKind::NotFound && expected.is_none() => {}
        Err(error) => return Err(error.into()),
    }
    Ok(())
}

pub fn atomic_write(path: &Path, bytes: &[u8], expected: Option<&str>) -> Result<()> {
    check_target(path, expected)?;
    let parent = path
        .parent()
        .ok_or_else(|| AppError::new("path", "Invalid destination folder."))?;
    let mut temporary = tempfile::NamedTempFile::new_in(parent)?;
    if path.exists() {
        temporary
            .as_file()
            .set_permissions(fs::metadata(path)?.permissions())?;
    }
    temporary.write_all(bytes)?;
    temporary.as_file().sync_all()?;
    check_target(path, expected)?;
    if expected.is_none() {
        temporary
            .persist_noclobber(path)
            .map_err(|e| AppError::from(e.error))?;
    } else {
        temporary
            .persist(path)
            .map_err(|e| AppError::from(e.error))?;
    }
    // Windows cannot open and sync a directory using File::open; the temporary file is synced above.
    #[cfg(unix)]
    File::open(parent)?.sync_all()?;
    Ok(())
}

impl Files {
    pub fn new_document(&mut self) -> Document {
        self.next_id += 1;
        let doc = Document {
            id: format!("document-{}", self.next_id),
            name: format!("Untitled {}", self.next_id),
            path: None,
            content: String::new(),
            fingerprint: String::new(),
            line_ending: "LF".into(),
            bom: false,
        };
        self.records.insert(doc.id.clone(), doc.clone());
        doc
    }

    pub fn open(&mut self, path: &Path) -> Result<Document> {
        let path = fs::canonicalize(path)?;
        let bytes = read_bytes(&path)?;
        let (content, bom) = decode(&bytes)?;
        if let Some(doc) = self
            .records
            .values()
            .find(|d| d.path.as_deref() == path.to_str())
        {
            return Ok(doc.clone());
        }
        let mut doc = self.new_document();
        doc.path = Some(path.to_string_lossy().into_owned());
        doc.name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        doc.line_ending = line_ending(&content);
        doc.content = content;
        doc.bom = bom;
        doc.fingerprint = fingerprint(&bytes);
        self.records.insert(doc.id.clone(), doc.clone());
        Ok(doc)
    }

    pub fn get(&self, id: &str) -> Result<&Document> {
        self.records.get(id).ok_or_else(|| {
            AppError::new(
                "unauthorized",
                "This document is not authorized. Open it using the native file picker.",
            )
        })
    }

    pub fn read(&mut self, id: &str) -> Result<Document> {
        let mut doc = self.get(id)?.clone();
        if let Some(path) = &doc.path {
            let bytes = read_bytes(Path::new(path))?;
            let (content, bom) = decode(&bytes)?;
            doc.line_ending = line_ending(&content);
            doc.content = content;
            doc.bom = bom;
            doc.fingerprint = fingerprint(&bytes);
            self.records.insert(id.to_owned(), doc.clone());
        }
        Ok(doc)
    }

    pub fn inspect(&self, id: &str) -> Result<bool> {
        let doc = self.get(id)?;
        match &doc.path {
            Some(path) => Ok(fingerprint(&read_bytes(Path::new(path))?) != doc.fingerprint),
            None => Ok(false),
        }
    }

    pub fn save(
        &mut self,
        id: &str,
        content: &str,
        ending: &str,
        bom: bool,
        expected: &str,
    ) -> Result<Document> {
        let doc = self.get(id)?.clone();
        if doc.fingerprint != expected {
            return Err(AppError::new(
                "conflict",
                "A newer save completed. Try saving again.",
            ));
        }
        let path = doc
            .path
            .as_ref()
            .ok_or_else(|| AppError::new("save_as", "Choose a destination with Save As."))?;
        check_target(Path::new(path), Some(expected))?;
        self.save_as(id, Path::new(path), content, ending, bom, Some(expected))
    }

    pub fn save_as(
        &mut self,
        id: &str,
        path: &Path,
        content: &str,
        ending: &str,
        bom: bool,
        expected: Option<&str>,
    ) -> Result<Document> {
        let path = destination(path)?;
        let path = path.as_path();
        let mut doc = self.get(id)?.clone();
        if content.len() as u64 > MAX_BYTES {
            return Err(AppError::new(
                "too_large",
                "Documents are limited to 10 MiB.",
            ));
        }
        if self
            .records
            .values()
            .any(|d| d.id != id && d.path.as_deref() == path.to_str())
        {
            return Err(AppError::new(
                "already_open",
                "That destination is open in another tab. Close it before replacing it.",
            ));
        }
        let content = materialize(content, ending, &doc.content)?;
        let encoded = if bom {
            format!("\u{feff}{content}").into_bytes()
        } else {
            content.as_bytes().to_vec()
        };
        if encoded.len() as u64 > MAX_BYTES {
            return Err(AppError::new(
                "too_large",
                "Encoded document exceeds 10 MiB.",
            ));
        }
        atomic_write(path, &encoded, expected)?;
        doc.path = Some(path.to_string_lossy().into_owned());
        doc.name = path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned();
        doc.fingerprint = fingerprint(&encoded);
        doc.line_ending = line_ending(&content);
        doc.content = content;
        doc.bom = bom;
        self.records.insert(id.to_owned(), doc.clone());
        Ok(doc)
    }

    pub fn close(&mut self, id: &str) {
        self.records.remove(id);
    }
}

pub fn destination(path: &Path) -> Result<PathBuf> {
    let parent = fs::canonicalize(
        path.parent()
            .ok_or_else(|| AppError::new("path", "Invalid destination."))?,
    )?;
    Ok(parent.join(
        path.file_name()
            .ok_or_else(|| AppError::new("path", "Choose a filename."))?,
    ))
}

pub fn existing_fingerprint(path: &Path) -> Result<Option<String>> {
    match read_bytes(path) {
        Ok(bytes) => Ok(Some(fingerprint(&bytes))),
        Err(error) if error.code == "deleted" => Ok(None),
        Err(error) => Err(error),
    }
}
pub fn launch_paths(args: impl IntoIterator<Item = std::ffi::OsString>) -> Vec<PathBuf> {
    args.into_iter()
        .map(PathBuf::from)
        .filter(|path| path.is_file())
        .take(50)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use tempfile::tempdir;

    #[test]
    fn preserves_utf8_bom_mixed_newlines_and_unicode() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("ภาษาไทย🦀.txt");
        let bytes = "\u{feff}สวัสดี👩🏽‍💻\r\nsecond\nthird\r\n".as_bytes();
        fs::write(&path, bytes).unwrap();
        let mut service = Files::default();
        let doc = service.open(&path).unwrap();
        assert!(doc.bom);
        assert_eq!(doc.line_ending, "Mixed");
        service
            .save(&doc.id, &doc.content, "Preserve", true, &doc.fingerprint)
            .unwrap();
        assert_eq!(fs::read(path).unwrap(), bytes);
    }

    #[test]
    fn rejects_invalid_utf8_binary_and_unauthorized_handles() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("file");
        let mut service = Files::default();
        fs::write(&path, [0xff, 0xfe]).unwrap();
        assert_eq!(service.open(&path).unwrap_err().code, "encoding");
        fs::write(&path, b"text\0binary").unwrap();
        assert_eq!(service.open(&path).unwrap_err().code, "binary");
        assert_eq!(
            service.read("/etc/passwd").unwrap_err().code,
            "unauthorized"
        );
    }

    #[test]
    fn refuses_changed_deleted_and_readonly_files_without_data_loss() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("file");
        fs::write(&path, "original").unwrap();
        let mut service = Files::default();
        let doc = service.open(&path).unwrap();
        fs::write(&path, "external").unwrap();
        assert_eq!(
            service
                .save(&doc.id, "local", "Preserve", false, &doc.fingerprint)
                .unwrap_err()
                .code,
            "conflict"
        );
        assert_eq!(fs::read_to_string(&path).unwrap(), "external");
        fs::remove_file(&path).unwrap();
        assert_eq!(
            service
                .save(&doc.id, "local", "Preserve", false, &doc.fingerprint)
                .unwrap_err()
                .code,
            "deleted"
        );
        assert!(!path.exists());
        fs::write(&path, "original").unwrap();
        let mut permissions = fs::metadata(&path).unwrap().permissions();
        permissions.set_readonly(true);
        fs::set_permissions(&path, permissions).unwrap();
        assert_eq!(
            service
                .save(&doc.id, "local", "Preserve", false, &doc.fingerprint)
                .unwrap_err()
                .code,
            "readonly"
        );
        #[cfg(windows)]
        {
            let mut permissions = fs::metadata(&path).unwrap().permissions();
            permissions.set_readonly(false);
            fs::set_permissions(&path, permissions).unwrap();
        }
    }

    #[cfg(unix)]
    #[test]
    fn rejects_symlink_replacement_on_reload_and_inspect() {
        use std::os::unix::fs::symlink;
        let dir = tempdir().unwrap();
        let path = dir.path().join("allowed.txt");
        let outside = dir.path().join("other.txt");
        fs::write(&path, "authorized").unwrap();
        fs::write(&outside, "not authorized").unwrap();
        let mut service = Files::default();
        let doc = service.open(&path).unwrap();
        fs::remove_file(&path).unwrap();
        symlink(&outside, &path).unwrap();
        assert_eq!(service.read(&doc.id).unwrap_err().code, "path");
        assert_eq!(service.inspect(&doc.id).unwrap_err().code, "path");
        assert_eq!(fs::read_to_string(outside).unwrap(), "not authorized");
    }

    #[cfg(windows)]
    #[test]
    fn sharing_violation_keeps_original_file_and_local_changes_available() {
        use std::os::windows::fs::OpenOptionsExt;
        let dir = tempdir().unwrap();
        let path = dir.path().join("locked.txt");
        fs::write(&path, "original").unwrap();
        let mut service = Files::default();
        let doc = service.open(&path).unwrap();
        let held = fs::OpenOptions::new()
            .read(true)
            .share_mode(0)
            .open(&path)
            .unwrap();
        assert!(
            service
                .save(&doc.id, "local", "LF", false, &doc.fingerprint)
                .is_err()
        );
        drop(held);
        assert_eq!(fs::read_to_string(&path).unwrap(), "original");
        service
            .save(&doc.id, "local", "LF", false, &doc.fingerprint)
            .unwrap();
        assert_eq!(fs::read_to_string(path).unwrap(), "local");
    }

    #[test]
    fn saves_and_reopens_unicode_files_across_platforms() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("ภาษาไทย 🦀.txt");
        let mut service = Files::default();
        let doc = service.new_document();
        let first = service
            .save_as(&doc.id, &path, "first\nline", "CRLF", false, None)
            .unwrap();
        let saved = service
            .save(
                &doc.id,
                "edited\nสวัสดี👩🏽‍💻",
                "Preserve",
                false,
                &first.fingerprint,
            )
            .unwrap();
        assert_eq!(fs::read(&path).unwrap(), "edited\r\nสวัสดี👩🏽‍💻".as_bytes());
        assert_eq!(service.read(&saved.id).unwrap().content, "edited\r\nสวัสดี👩🏽‍💻");
        service.close(&doc.id);
        fs::File::create(&path)
            .unwrap()
            .set_len(MAX_BYTES + 1)
            .unwrap();
        assert_eq!(service.open(&path).unwrap_err().code, "too_large");
    }

    #[cfg(unix)]
    #[test]
    fn rejects_replaced_parent_without_writing_outside_authorized_folder() {
        use std::os::unix::fs::symlink;
        let dir = tempdir().unwrap();
        let parent = dir.path().join("authorized");
        let moved = dir.path().join("moved");
        let outside = dir.path().join("outside");
        fs::create_dir(&parent).unwrap();
        fs::create_dir(&outside).unwrap();
        fs::write(parent.join("file.txt"), "original").unwrap();
        fs::write(outside.join("file.txt"), "original").unwrap();
        let mut service = Files::default();
        let doc = service.open(&parent.join("file.txt")).unwrap();
        fs::rename(&parent, &moved).unwrap();
        symlink(&outside, &parent).unwrap();
        assert_eq!(
            service
                .save(&doc.id, "local", "Preserve", false, &doc.fingerprint)
                .unwrap_err()
                .code,
            "path"
        );
        assert_eq!(
            fs::read_to_string(outside.join("file.txt")).unwrap(),
            "original"
        );
    }

    #[test]
    fn accepts_only_existing_regular_files_from_native_launch_arguments() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("ชื่อไฟล์.txt");
        fs::write(&path, "text").unwrap();
        let args = vec![
            path.clone().into_os_string(),
            dir.path().as_os_str().into(),
            "--help".into(),
        ];
        assert_eq!(launch_paths(args), vec![path]);
    }

    #[test]
    fn refuses_save_as_over_existing_unconfirmed_file() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("existing.txt");
        fs::write(&path, "keep original").unwrap();
        let mut service = Files::default();
        let doc = service.new_document();
        assert_eq!(
            service
                .save_as(&doc.id, &path, "replacement", "LF", false, None)
                .unwrap_err()
                .code,
            "conflict"
        );
        assert_eq!(fs::read_to_string(path).unwrap(), "keep original");
    }

    #[test]
    fn save_as_roundtrip_and_explicit_line_conversion() {
        let dir = tempdir().unwrap();
        let path = dir.path().join("new.txt");
        let mut service = Files::default();
        let doc = service.new_document();
        let saved = service
            .save_as(&doc.id, &path, "one\ntwo👋", "CRLF", true, None)
            .unwrap();
        assert_eq!(fs::read(&path).unwrap(), "\u{feff}one\r\ntwo👋".as_bytes());
        assert_eq!(service.read(&saved.id).unwrap().content, "one\r\ntwo👋");
        assert_eq!(
            saved.path,
            Some(
                fs::canonicalize(path)
                    .unwrap()
                    .to_string_lossy()
                    .into_owned()
            )
        );
    }

    #[cfg(unix)]
    #[test]
    fn save_preserves_permissions_and_detects_size_limit() {
        use std::os::unix::fs::PermissionsExt;
        let dir = tempdir().unwrap();
        let path = dir.path().join("file");
        fs::write(&path, "hello").unwrap();
        fs::set_permissions(&path, fs::Permissions::from_mode(0o640)).unwrap();
        let mut service = Files::default();
        let doc = service.open(&path).unwrap();
        let saved = service
            .save(&doc.id, "ภาษาไทย", "LF", false, &doc.fingerprint)
            .unwrap();
        assert_eq!(saved.content, "ภาษาไทย");
        assert_eq!(
            fs::metadata(&path).unwrap().permissions().mode() & 0o777,
            0o640
        );
        let f = fs::File::create(&path).unwrap();
        f.set_len(MAX_BYTES + 1).unwrap();
        assert_eq!(service.open(&path).unwrap_err().code, "too_large");
    }
}
