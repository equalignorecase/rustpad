#![cfg_attr(not(windows), allow(dead_code))]

use flate2::read::GzDecoder;
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{self, Read, Write},
    path::Path,
};

include!(concat!(env!("OUT_DIR"), "/payload_meta.rs"));

static PAYLOAD_GZ: &[u8] = include_bytes!(concat!(env!("OUT_DIR"), "/rustpad_payload.gz"));

pub fn estimated_size_mb() -> u64 {
    let mb = PAYLOAD_UNCOMPRESSED_BYTES.div_ceil(1024 * 1024);
    mb.max(1)
}

pub fn estimated_size_kb() -> u32 {
    let kb = PAYLOAD_UNCOMPRESSED_BYTES.div_ceil(1024);
    u32::try_from(kb).unwrap_or(u32::MAX)
}

pub fn write_payload_to_path(dest: &Path) -> Result<(), String> {
    if !HAS_PAYLOAD {
        return Err("Embedded RustPad binary payload is missing from this build.".to_string());
    }

    if let Some(parent) = dest.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("Failed to create directory {}: {err}", parent.display()))?;
    }

    let tmp_path = dest.with_extension("exe.tmp");
    extract_gzip_verified(PAYLOAD_GZ, &tmp_path, Some(PAYLOAD_SHA256_HEX)).inspect_err(|_| {
        let _ = fs::remove_file(&tmp_path);
    })?;

    if dest.exists() {
        fs::remove_file(dest).map_err(|err| {
            let _ = fs::remove_file(&tmp_path);
            format!(
                "Cannot replace existing {}: {err}. Make sure RustPad is closed.",
                dest.display()
            )
        })?;
    }

    fs::rename(&tmp_path, dest).map_err(|err| {
        let _ = fs::remove_file(&tmp_path);
        format!("Failed to finalize {}: {err}", dest.display())
    })
}

fn extract_gzip_verified(
    compressed: &[u8],
    dest: &Path,
    expected_sha256_hex: Option<&str>,
) -> Result<(), String> {
    let mut decoder = GzDecoder::new(compressed);
    let mut file =
        File::create(dest).map_err(|err| format!("Failed to create {}: {err}", dest.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = [0_u8; 64 * 1024];

    loop {
        let read = decoder
            .read(&mut buf)
            .map_err(|err| format!("Failed to decompress payload: {err}"))?;
        if read == 0 {
            break;
        }
        let chunk = &buf[..read];
        file.write_all(chunk)
            .map_err(|err| format!("Failed to write {}: {err}", dest.display()))?;
        hasher.update(chunk);
    }

    file.flush()
        .and_then(|()| file.sync_all())
        .map_err(|err| format!("Failed to flush {}: {err}", dest.display()))?;

    if let Some(expected) = expected_sha256_hex
        && !expected.is_empty()
    {
        let actual = format!("{:x}", hasher.finalize());
        if !actual.eq_ignore_ascii_case(expected) {
            return Err("Payload checksum verification failed.".to_string());
        }
    }

    let _ = io::Result::Ok(());
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::extract_gzip_verified;
    use flate2::{Compression, write::GzEncoder};
    use sha2::{Digest, Sha256};
    use std::{fs, io::Write};

    #[test]
    fn extract_gzip_verified_writes_and_checks_sha256() {
        let sample = b"MZ-rustpad-test-payload";
        let digest = format!("{:x}", Sha256::digest(sample));

        let mut enc = GzEncoder::new(Vec::new(), Compression::default());
        enc.write_all(sample).unwrap();
        let compressed = enc.finish().unwrap();

        let dir = std::env::temp_dir().join("rustpad_installer_payload_test");
        fs::create_dir_all(&dir).unwrap();
        let out = dir.join("rustpad.bin");

        extract_gzip_verified(&compressed, &out, Some(&digest)).unwrap();
        assert_eq!(fs::read(&out).unwrap(), sample);

        let mismatch = extract_gzip_verified(&compressed, &out, Some("0000"));
        assert!(mismatch.is_err());

        let _ = fs::remove_dir_all(&dir);
    }
}
