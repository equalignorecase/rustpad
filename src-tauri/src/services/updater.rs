use crate::errors::{AppError, Result};
use serde::{Deserialize, Serialize};
use std::cmp::Ordering;
use std::time::Duration;

const LATEST_RELEASE_API: &str =
    "https://api.github.com/repos/equalignorecase/rustpad/releases/latest";
const RELEASE_PAGE: &str = "https://github.com/equalignorecase/rustpad/releases";
const RELEASE_PREFIX: &str = "https://github.com/equalignorecase/rustpad/releases";
const MAX_BODY: u64 = 512 * 1024;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateInfo {
    pub current_version: String,
    pub latest_version: String,
    pub update_available: bool,
    pub release_url: String,
    pub published_at: Option<String>,
}

#[derive(Deserialize)]
struct ReleaseResponse {
    tag_name: Option<String>,
    html_url: Option<String>,
    published_at: Option<String>,
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
    Ok(UpdateInfo {
        current_version: current_version.to_string(),
        latest_version: latest,
        update_available,
        release_url: release_url(&tag, release.html_url),
        published_at: release.published_at,
    })
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
}
