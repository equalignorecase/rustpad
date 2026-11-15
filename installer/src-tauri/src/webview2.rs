#![cfg_attr(not(windows), allow(dead_code))]

pub const MIN_WEBVIEW2_VERSION: &str = "111.0.1661.0";

pub fn parse_dotted_version(raw: &str) -> Option<[u64; 4]> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut parts = [0_u64; 4];
    let mut count = 0usize;

    for segment in trimmed.split('.') {
        if count >= 4 {
            return None;
        }
        let val = segment.parse::<u64>().ok()?;
        parts[count] = val;
        count += 1;
    }

    if count == 0 {
        return None;
    }

    Some(parts)
}

pub fn is_version_at_least(installed: &str, minimum: &str) -> bool {
    let Some(inst) = parse_dotted_version(installed) else {
        return false;
    };
    let Some(min) = parse_dotted_version(minimum) else {
        return false;
    };
    if inst == [0, 0, 0, 0] {
        return false;
    }
    inst >= min
}

#[cfg(windows)]
pub fn ensure_webview2_runtime() -> Result<(), String> {
    if detect_installed_webview2()
        .is_some_and(|ver| is_version_at_least(&ver, MIN_WEBVIEW2_VERSION))
    {
        return Ok(());
    }

    download_and_install_webview2()?;

    if detect_installed_webview2()
        .is_some_and(|ver| is_version_at_least(&ver, MIN_WEBVIEW2_VERSION))
    {
        return Ok(());
    }

    let msg = "Microsoft Edge WebView2 Runtime could not be installed automatically.\n\n\
               Please check your internet connection or download WebView2 Runtime from Microsoft, then re-run RustPad Setup.";
    show_error_dialog("RustPad Setup", msg);
    Err(msg.to_string())
}

#[cfg(not(windows))]
pub fn ensure_webview2_runtime() -> Result<(), String> {
    Ok(())
}

#[cfg(windows)]
fn detect_installed_webview2() -> Option<String> {
    use winreg::{
        RegKey,
        enums::{HKEY_CURRENT_USER, HKEY_LOCAL_MACHINE},
    };

    const SUBKEY_WOW64: &str =
        r"SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    const SUBKEY_NATIVE: &str =
        r"SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";
    const SUBKEY_USER: &str =
        r"Software\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}";

    let roots = [
        (HKEY_LOCAL_MACHINE, SUBKEY_WOW64),
        (HKEY_LOCAL_MACHINE, SUBKEY_NATIVE),
        (HKEY_CURRENT_USER, SUBKEY_USER),
    ];

    for (hive, subkey) in roots {
        if let Ok(key) = RegKey::predef(hive).open_subkey(subkey)
            && let Ok(pv) = key.get_value::<String, _>("pv")
            && !pv.trim().is_empty()
            && pv.trim() != "0.0.0.0"
        {
            return Some(pv);
        }
    }

    None
}

#[cfg(windows)]
fn download_and_install_webview2() -> Result<(), String> {
    use std::{fs, os::windows::process::CommandExt, process::Command};

    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    const BOOTSTRAPPER_URL: &str = "https://go.microsoft.com/fwlink/p/?LinkId=2124703";

    let bootstrapper_path = std::env::temp_dir().join("rustpad-webview2-bootstrapper.exe");
    let _ = fs::remove_file(&bootstrapper_path);

    let curl_ok = Command::new("curl.exe")
        .args([
            "-fsSL",
            "-L",
            "--retry",
            "2",
            "-o",
            &bootstrapper_path.to_string_lossy(),
            BOOTSTRAPPER_URL,
        ])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .is_ok_and(|s| s.success() && bootstrapper_path.is_file());

    if !curl_ok {
        let ps_cmd = format!(
            "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; \
             Invoke-WebRequest -UseBasicParsing -Uri '{BOOTSTRAPPER_URL}' -OutFile '{}'",
            bootstrapper_path.to_string_lossy().replace('\'', "''")
        );
        let ps_ok = Command::new("powershell.exe")
            .args([
                "-NoProfile",
                "-ExecutionPolicy",
                "Bypass",
                "-Command",
                &ps_cmd,
            ])
            .creation_flags(CREATE_NO_WINDOW)
            .status()
            .is_ok_and(|s| s.success() && bootstrapper_path.is_file());

        if !ps_ok {
            let msg = "Failed to download Microsoft Edge WebView2 Runtime.\n\
                       Please ensure you have internet access and run RustPad Setup again.";
            show_error_dialog("RustPad Setup", msg);
            return Err(msg.to_string());
        }
    }

    let install_status = Command::new(&bootstrapper_path).arg("/install").status();
    let _ = fs::remove_file(&bootstrapper_path);

    match install_status {
        Ok(status) if status.success() => Ok(()),
        Ok(status) => Err(format!(
            "WebView2 bootstrapper exited with status {status}."
        )),
        Err(err) => Err(format!("Failed to launch WebView2 bootstrapper: {err}")),
    }
}

#[cfg(windows)]
fn show_error_dialog(title: &str, message: &str) {
    use windows::{
        Win32::UI::WindowsAndMessaging::{MB_ICONERROR, MB_OK, MessageBoxW},
        core::PCWSTR,
    };

    let title_w: Vec<u16> = title.encode_utf16().chain(std::iter::once(0)).collect();
    let msg_w: Vec<u16> = message.encode_utf16().chain(std::iter::once(0)).collect();
    unsafe {
        MessageBoxW(
            None,
            PCWSTR(msg_w.as_ptr()),
            PCWSTR(title_w.as_ptr()),
            MB_OK | MB_ICONERROR,
        );
    }
}

#[cfg(test)]
mod tests {
    use super::{MIN_WEBVIEW2_VERSION, is_version_at_least, parse_dotted_version};

    #[test]
    fn dotted_version_parsing_and_comparison() {
        assert_eq!(
            parse_dotted_version("111.0.1661.0"),
            Some([111, 0, 1661, 0])
        );
        assert_eq!(parse_dotted_version("130.0"), Some([130, 0, 0, 0]));
        assert_eq!(parse_dotted_version(""), None);
        assert_eq!(parse_dotted_version("invalid"), None);

        assert!(!is_version_at_least("0.0.0.0", MIN_WEBVIEW2_VERSION));
        assert!(!is_version_at_least("110.9.9999.9", MIN_WEBVIEW2_VERSION));
        assert!(is_version_at_least("111.0.1661.0", MIN_WEBVIEW2_VERSION));
        assert!(is_version_at_least("131.0.2903.86", MIN_WEBVIEW2_VERSION));
    }
}
