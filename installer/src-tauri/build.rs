use flate2::{Compression, write::GzEncoder};
use sha2::{Digest, Sha256};
use std::{
    env, fs,
    io::{self, Write},
    path::{Path, PathBuf},
};

fn resolve_payload_path(manifest_dir: &Path) -> Option<PathBuf> {
    if let Ok(explicit) = env::var("RUSTPAD_PAYLOAD_BIN")
        && !explicit.trim().is_empty()
    {
        return Some(PathBuf::from(explicit));
    }
    let default_win = manifest_dir.join("../../src-tauri/target/release/rustpad.exe");
    if default_win.is_file() {
        return Some(default_win);
    }
    None
}

fn write_payload_bundle(out_dir: &Path, payload_path: Option<&Path>) -> io::Result<()> {
    let gz_path = out_dir.join("rustpad_payload.gz");
    let meta_path = out_dir.join("payload_meta.rs");

    match payload_path {
        Some(path) => {
            println!("cargo:rerun-if-changed={}", path.display());
            let raw = fs::read(path).map_err(|err| {
                io::Error::new(
                    err.kind(),
                    format!("failed to read payload binary {}: {err}", path.display()),
                )
            })?;
            let uncompressed_len = raw.len() as u64;
            let digest = Sha256::digest(&raw);
            let sha_hex = format!("{digest:x}");

            let mut encoder = GzEncoder::new(Vec::new(), Compression::best());
            encoder.write_all(&raw)?;
            let compressed = encoder.finish()?;
            fs::write(&gz_path, compressed)?;

            let meta = format!(
                "pub const HAS_PAYLOAD: bool = true;\n\
                 pub const PAYLOAD_UNCOMPRESSED_BYTES: u64 = {uncompressed_len};\n\
                 pub const PAYLOAD_SHA256_HEX: &str = \"{sha_hex}\";\n"
            );
            fs::write(&meta_path, meta)?;
        }
        None => {
            let mut encoder = GzEncoder::new(Vec::new(), Compression::fast());
            encoder.write_all(&[])?;
            let compressed = encoder.finish()?;
            fs::write(&gz_path, compressed)?;

            let placeholder_bytes: u64 = 18 * 1024 * 1024;
            let meta = format!(
                "pub const HAS_PAYLOAD: bool = false;\n\
                 pub const PAYLOAD_UNCOMPRESSED_BYTES: u64 = {placeholder_bytes};\n\
                 pub const PAYLOAD_SHA256_HEX: &str = \"\";\n"
            );
            fs::write(&meta_path, meta)?;
        }
    }

    Ok(())
}

fn main() {
    println!("cargo:rerun-if-env-changed=RUSTPAD_PAYLOAD_BIN");
    println!("cargo:rerun-if-env-changed=RUSTPAD_REQUIRE_PAYLOAD");

    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let payload = resolve_payload_path(&manifest_dir);

    let require_payload = env::var("RUSTPAD_REQUIRE_PAYLOAD")
        .map(|val| val == "1" || val.eq_ignore_ascii_case("true"))
        .unwrap_or(false);

    if require_payload && payload.as_deref().is_none_or(|p| !p.is_file()) {
        panic!(
            "RUSTPAD_REQUIRE_PAYLOAD=1 is set, but RustPad binary was not found. \
             Build src-tauri first or set RUSTPAD_PAYLOAD_BIN."
        );
    }

    write_payload_bundle(&out_dir, payload.as_deref()).expect("failed to package payload");
    tauri_build::build();
}
