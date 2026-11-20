use crate::errors::{AppError, Result};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::cmp::Ordering;
use std::io::{Read, Write};
use std::time::Duration;

const LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/equalignorecase/rustpad/releases/latest";
const RELEASE_PAGE: &str = "https://github.com/equalignorecase/rustpad/releases";
const RELEASE_PREFIX: &str = "https://github.com/equalignorecase/rustpad/releases";
const ASSET_PREFIX: &str = "https://github.com/equalignorecase/rustpad/releases/download/";
const MAX_BODY: u64 = 512 * 1024;
const MAX_CHECKSUMS_BODY: u64 = 64 * 1024;
const MAX_INSTALLER_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    pub published_at: Option<String>,
    pub installer_url: Option<String>,
    pub checksums_url: Option<String>,
    pub can_auto_update: bool,
}

#[derive(Deserialize)]
struct ReleaseAsset {
    name: Option<String>,
    browser_download_url: Option<String>,
}

#[derive(Deserialize)]
struct ReleaseResponse {
    tag_name: Option<String>,
    html_url: Option<String>,
    published_at: Option<String>,
    assets: Option<Vec<ReleaseAsset>>,
}

/// Parses a release tag like `v1.2.3`, `1.2.3` or `v1.2.3-rc.1` into its
/// numeric core components and optional pre-release identifier.
fn parse_version(tag: &str) -> Option<(Vec<u64>, Option<String>)> {
    let trimmed = tag.trim();
    let without_prefix = trimmed.strip_prefix(['v', 'V']).unwrap_or(trimmed);
    let without_build = without_prefix.split('+').next()?.trim();
    let (core, pre) = match without_build.split_once('-') {
        Some((core, pre)) => (core, Some(pre.trim().to_string())),
        None => (without_build, None),
    };
    let numbers: Option<Vec<u64>> = core
        .split('.')
        .map(|part| part.parse::<u64>().ok())
        .collect();
    let numbers = numbers?;
    if numbers.is_empty() || numbers.len() > 4 {
        return None;
    }
    Some((numbers, pre.filter(|value| !value.is_empty())))
}

/// Compares two release tags. Returns `Some` only when both tags parse as
/// versions, so malformed tags never produce a false "update available".
pub fn compare_versions(left: &str, right: &str) -> Option<Ordering> {
    let (left_core, left_pre) = parse_version(left)?;
    let (right_core, right_pre) = parse_version(right)?;
    let len = left_core.len().max(right_core.len());
    for index in 0..len {
        let left_part = left_core.get(index).copied().unwrap_or(0);
        let right_part = right_core.get(index).copied().unwrap_or(0);
        match left_part.cmp(&right_part) {
            Ordering::Equal => {}
            other => return Some(other),
        }
    }
    match (&left_pre, &right_pre) {
        (None, None) => Some(Ordering::Equal),
        // A final release ranks higher than any of its pre-releases.
        (None, Some(_)) => Some(Ordering::Greater),
        (Some(_), None) => Some(Ordering::Less),
        (Some(left_pre), Some(right_pre)) => Some(left_pre.cmp(right_pre)),
    }
}

fn release_url(tag: &str, html_url: Option<String>) -> String {
    match html_url {
        Some(url) if validate_release_url(&url).is_ok() => url,
        _ => format!("{RELEASE_PAGE}/tag/{tag}"),
    }
}

/// Only links that point at this repository's release pages may be opened in
/// the external browser, so a spoofed response cannot launch arbitrary URLs.
pub fn validate_release_url(url: &str) -> Result<()> {
    let safe_chars = url
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | ':' | '.' | '-' | '_'));
    let suffix = url.get(RELEASE_PREFIX.len()..).unwrap_or("");
    if url.len() <= 300
        && url.starts_with(RELEASE_PREFIX)
        && (suffix.is_empty() || suffix.starts_with('/'))
        && !url.contains("..")
        && safe_chars
    {
        Ok(())
    } else {
        Err(AppError::new(
            "url",
            "Refusing to open an unexpected link. Visit the GitHub releases page instead.",
        ))
    }
}

/// Queries the GitHub Releases API for the newest published release and
/// compares it against `current_version`. Blocking: call on a worker thread.
pub fn check_latest(current_version: &str) -> Result<UpdateInfo> {
    let config = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(10)))
        .http_status_as_error(false)
        .build();
    let agent: ureq::Agent = config.into();
    let mut response = agent
        .get(LATEST_RELEASE_API)
        .header("User-Agent", concat!("rustpad/", env!("CARGO_PKG_VERSION")))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .call()
        .map_err(|_| {
            AppError::new(
                "network",
                "Could not reach GitHub. Check your internet connection and try again.",
            )
        })?;
    match response.status().as_u16() {
        200 => {}
        403 => {
            return Err(AppError::new(
                "network",
                "GitHub rate limit reached. Try again in a while.",
            ));
        }
        404 => {
            return Err(AppError::new(
                "release",
                "No published releases were found on GitHub yet.",
            ));
        }
        status => {
            return Err(AppError::new(
                "network",
                format!("GitHub returned an unexpected response ({status}). Try again later."),
            ));
        }
    }
    let body = response
        .body_mut()
        .with_config()
        .limit(MAX_BODY)
        .read_to_string()
        .map_err(|_| {
            AppError::new(
                "network",
                "Could not read the response from GitHub. Try again later.",
            )
        })?;
    let release: ReleaseResponse = serde_json::from_str(&body).map_err(|_| {
        AppError::new(
            "release",
            "GitHub returned an unexpected response. Try again later.",
        )
    })?;
    let tag = release.tag_name.ok_or_else(|| {
        AppError::new(
            "release",
            "GitHub returned a release without a version tag.",
        )
    })?;
    let latest = tag.trim().trim_start_matches(['v', 'V']).to_string();
    if parse_version(&latest).is_none() {
        return Err(AppError::new(
            "release",
            "GitHub returned an unexpected release tag.",
        ));
    }
    let update_available = compare_versions(&latest, current_version) == Some(Ordering::Greater);
    let assets = release.assets.unwrap_or_default();
    let installer_url = assets.iter().find_map(|asset| {
        let name = asset.name.as_deref()?;
        let url = asset.browser_download_url.as_deref()?;
        (name.ends_with("_x64-setup.exe") && validate_asset_url(url).is_ok())
            .then(|| url.to_string())
    });
    let checksums_url = assets.iter().find_map(|asset| {
        let name = asset.name.as_deref()?;
        let url = asset.browser_download_url.as_deref()?;
        (name == "SHA256SUMS.txt" && validate_asset_url(url).is_ok()).then(|| url.to_string())
    });
    let can_auto_update =
        cfg!(target_os = "windows") && installer_url.is_some() && checksums_url.is_some();

    Ok(UpdateInfo {
        current_version: current_version.to_string(),
        latest_version: latest,
        update_available,
        release_url: release_url(&tag, release.html_url),
        published_at: release.published_at,
        installer_url,
        checksums_url,
        can_auto_update,
    })
}

pub fn validate_asset_url(url: &str) -> Result<()> {
    let safe_chars = url
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '/' | ':' | '.' | '-' | '_'));
    if url.len() <= 400
        && url.starts_with(ASSET_PREFIX)
        && !url.contains("..")
        && !url.contains('?')
        && !url.contains('#')
        && safe_chars
    {
        Ok(())
    } else {
        Err(AppError::new(
            "url",
            "Refusing to download from an unexpected URL.",
        ))
    }
}

pub fn parse_sha256sums(body: &str, filename: &str) -> Option<String> {
    for line in body.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let mut parts = trimmed.splitn(2, char::is_whitespace);
        let hash = parts.next()?.trim();
        let rest = parts.next()?.trim();
        let entry_name = rest.trim_start_matches('*').trim_start_matches("./");
        if entry_name == filename && hash.len() == 64 && hash.bytes().all(|b| b.is_ascii_hexdigit())
        {
            return Some(hash.to_ascii_lowercase());
        }
    }
    None
}

pub fn download_and_launch_installer(installer_url: &str, checksums_url: &str) -> Result<()> {
    validate_asset_url(installer_url)?;
    validate_asset_url(checksums_url)?;

    let asset_name = installer_url
        .rsplit('/')
        .next()
        .filter(|name| name.ends_with("_x64-setup.exe"))
        .ok_or_else(|| AppError::new("url", "Unexpected installer filename."))?;
    if !checksums_url.ends_with("/SHA256SUMS.txt") {
        return Err(AppError::new("url", "Unexpected checksums filename."));
    }

    let config = ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(120)))
        .http_status_as_error(true)
        .build();
    let agent: ureq::Agent = config.into();

    let mut sums_resp = agent
        .get(checksums_url)
        .header("User-Agent", concat!("rustpad/", env!("CARGO_PKG_VERSION")))
        .call()
        .map_err(|_| AppError::new("network", "Could not download release checksums."))?;
    let sums_body = sums_resp
        .body_mut()
        .with_config()
        .limit(MAX_CHECKSUMS_BODY)
        .read_to_string()
        .map_err(|_| AppError::new("network", "Could not read release checksums."))?;

    let expected_hash = parse_sha256sums(&sums_body, asset_name).ok_or_else(|| {
        AppError::new(
            "verify",
            "Installer checksum was missing from SHA256SUMS.txt.",
        )
    })?;

    let mut exe_resp = agent
        .get(installer_url)
        .header("User-Agent", concat!("rustpad/", env!("CARGO_PKG_VERSION")))
        .call()
        .map_err(|_| AppError::new("network", "Could not download the Windows installer."))?;

    let dest = std::env::temp_dir().join(format!("rustpad-update-{}.exe", std::process::id()));
    let _ = std::fs::remove_file(&dest);

    let write_res: Result<String> = (|| {
        let mut reader = exe_resp
            .body_mut()
            .as_reader()
            .take(MAX_INSTALLER_BYTES + 1);
        let mut file = std::fs::File::create(&dest)?;
        let mut hasher = Sha256::new();
        let mut buf = [0_u8; 64 * 1024];
        let mut total: u64 = 0;

        loop {
            let n = reader.read(&mut buf)?;
            if n == 0 {
                break;
            }
            total += n as u64;
            if total > MAX_INSTALLER_BYTES {
                return Err(AppError::new(
                    "network",
                    "Downloaded installer exceeds size limit.",
                ));
            }
            let chunk = &buf[..n];
            file.write_all(chunk)?;
            hasher.update(chunk);
        }
        file.flush()?;
        Ok(format!("{:x}", hasher.finalize()))
    })();

    let actual_hash = match write_res {
        Ok(hash) => hash,
        Err(err) => {
            let _ = std::fs::remove_file(&dest);
            return Err(err);
        }
    };

    if !actual_hash.eq_ignore_ascii_case(&expected_hash) {
        let _ = std::fs::remove_file(&dest);
        return Err(AppError::new(
            "verify",
            "Downloaded installer checksum verification failed.",
        ));
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new(&dest)
            .args(["--silent", "--launch"])
            .spawn()
            .map_err(|err| AppError::new("open", format!("Failed to start installer: {err}")))?;
        Ok(())
    }

    #[cfg(not(target_os = "windows"))]
    {
        let _ = std::fs::remove_file(&dest);
        Err(AppError::new(
            "platform",
            "In-app installer updates are only supported on Windows.",
        ))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_plain_and_prefixed_tags() {
        assert_eq!(parse_version("v0.2.0"), Some((vec![0, 2, 0], None)));
        assert_eq!(parse_version("1.2.3"), Some((vec![1, 2, 3], None)));
        assert_eq!(
            parse_version("v1.2.3-rc.1"),
            Some((vec![1, 2, 3], Some("rc.1".to_string())))
        );
        assert_eq!(parse_version("v1.2.3+build.5"), Some((vec![1, 2, 3], None)));
        assert_eq!(parse_version("not-a-version"), None);
        assert_eq!(parse_version(""), None);
        assert_eq!(parse_version("v1.x.0"), None);
    }

    #[test]
    fn compares_release_versions() {
        assert_eq!(compare_versions("v0.2.0", "0.1.0"), Some(Ordering::Greater));
        assert_eq!(compare_versions("v0.1.0", "0.1.0"), Some(Ordering::Equal));
        assert_eq!(compare_versions("0.9.9", "1.0.0"), Some(Ordering::Less));
        assert_eq!(
            compare_versions("v1.0.0", "1.0.0-rc.1"),
            Some(Ordering::Greater)
        );
        assert_eq!(compare_versions("v2.0", "1.9.9"), Some(Ordering::Greater));
        assert_eq!(compare_versions("junk", "1.0.0"), None);
    }

    #[test]
    fn rejects_untrusted_release_urls() {
        assert!(
            validate_release_url("https://github.com/equalignorecase/rustpad/releases/tag/v0.2.0")
                .is_ok()
        );
        assert!(
            validate_release_url("https://github.com/equalignorecase/rustpad/releases").is_ok()
        );
        assert!(validate_release_url("https://evil.example.com/").is_err());
        assert!(
            validate_release_url(
                "https://github.com/equalignorecase/rustpad/releases/../../settings"
            )
            .is_err()
        );
        assert!(
            validate_release_url(
                "https://github.com/equalignorecase/rustpad/releases/tag/v0.2.0&cmd=calc"
            )
            .is_err()
        );
        assert!(
            validate_release_url("http://github.com/equalignorecase/rustpad/releases").is_err()
        );
    }

    #[test]
    fn parses_sha256sums_and_validates_asset_urls() {
        let body = "5ae11038506ac134f4443d8434beecc765f5cb0debfb33f715c89bf8e9092681  RustPad_0.1.1_x64-setup.exe\r\n";
        assert_eq!(
            parse_sha256sums(body, "RustPad_0.1.1_x64-setup.exe").as_deref(),
            Some("5ae11038506ac134f4443d8434beecc765f5cb0debfb33f715c89bf8e9092681")
        );
        assert_eq!(parse_sha256sums(body, "other.exe"), None);
        assert!(validate_asset_url(
            "https://github.com/equalignorecase/rustpad/releases/download/v0.1.1/RustPad_0.1.1_x64-setup.exe"
        )
        .is_ok());
        assert!(validate_asset_url("https://evil.example.com/setup.exe").is_err());
    }
}
