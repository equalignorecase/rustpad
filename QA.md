# RustPad verification

Build host: macOS, Apple Silicon (`aarch64-apple-darwin`), Node 26.9.0, Rust 1.99.1. No Intel target was installed. Results below describe this workspace, not every supported Mac.

## Automated and build checks

| Check                                    | Result                                                                                  |
| ---------------------------------------- | --------------------------------------------------------------------------------------- |
| `pnpm test`                              | PASS: 25 frontend tests in 5 files                                                      |
| `pnpm check`                             | PASS: strict TypeScript                                                                 |
| `pnpm test:rust`                         | PASS: 14 filesystem/configuration tests on macOS                                        |
| `pnpm lint:rust`                         | PASS: Clippy with warnings denied                                                       |
| Rust formatting                          | PASS: cargo fmt --check                                                                 |
| `pnpm build`                             | PASS: production frontend; one expected 500 kB chunk warning for bundled editor/runtime |
| `pnpm tauri build --debug --bundles app` | PASS: native arm64 debug bundle, launched successfully                                  |
| `pnpm tauri build --bundles app`         | PASS: native arm64 release bundle; final artifact details below                         |

Frontend tests exercise actual CodeMirror editor states and DOM views for search, replace, independent undo histories and Unicode. Controller tests replace only the native OS boundary. Rust tests use temporary files with actual BOM bytes, mixed newlines, permission bits, deletion and external modifications.

Vite development server smoke test also passed: ready on `127.0.0.1:1420`, HTTP response verified. The earlier tool policy rejected shutdown input. After resuming work, an HTTP probe confirmed that server is no longer running. The packaged app does not use it.

## Native manual QA performed

- [x] Launched packaged debug `.app` without Vite or a runtime web server.
- [x] Native macOS traffic lights remain visible and usable.
- [x] Pasted Thai, a combined emoji sequence and source text into CodeMirror.
- [x] Native Save As selected a workspace folder and a Thai filename.
- [x] Read the saved file independently from disk and confirmed Unicode text.
- [x] Automatic Rust language selection after Save As.
- [x] Opened native find panel and entered a search query.
- [x] Modified a document, pressed ⌘W, observed Save / Don’t Save / Cancel.
- [x] Cancel retained the modified text and open tab.
- [x] Opened Settings using ⌘, and inspected dark and light appearances.

Native inspection found and fixed gutter alignment and an empty-query validation message. Their final source changes are included in the release build. Full repeated native visual QA after every hardening edit is not claimed.

## Still requires manual verification

- [ ] Real Thai IME composition and dead-key input; paste does not prove IME behavior.
- [ ] Extended Unicode selection, multi-cursor interaction and VoiceOver navigation.
- [ ] Native file drop and directory drop messaging.
- [ ] Finder Open With, including app-closed launch and app-already-running delivery.
- [ ] All native Quit/window-close branches, including disk failure during asynchronous Save As.
- [ ] Sleep/resume, network-volume behavior, permission/privacy prompts and disk-full recovery.
- [ ] Live external-change prompt/reload workflow. Automated controller and filesystem tests pass; native manual results are not asserted.
- [x] Session restore across release-app relaunch: saved Thai source file, active tab, cursor position and appearance restored. Created and closed a new clean tab afterward.
- [ ] Minimum window dimensions, largest system text, reduced motion and full keyboard-only operation.
- [ ] Startup time, native memory profile and latency at the 10 MiB boundary.
- [ ] Intel and universal builds and hardware QA; minimum macOS 13.3 runtime.
- [ ] Developer ID signing, notarization, Gatekeeper validation and DMG distribution.

No benchmark or cross-architecture performance claims are made.

## Delivered artifact

- `release/RustPad.app`: arm64 release, macOS 13.3 minimum, bundle ID `app.rustpad.editor`.
- `release/RustPad-macOS-arm64.zip`: approximately 2.4 MiB; checksum in `release/SHA256SUMS.txt`.
- Production build passed after final source formatting. Only the documented editor chunk-size warning remains.
- The delivered bundle was ad-hoc signed locally. `codesign --verify --deep --strict` passed on both the original app and the app extracted from the ZIP. No Developer ID certificate or notarization was used.
- Launched this delivered release app without a dev server and verified restored document text, selection and settings through native accessibility state.

## Windows port verification

The Windows port targets Windows 10/11 x64. This development host is still macOS; no Windows SDK, linker or Windows runtime is installed here. No successful Windows compilation, installer execution or Windows UI QA is claimed.

Changes implemented:

- Cross-platform file identity checks through the already locked `same-file` crate, replacing unconditional Unix metadata APIs.
- Same-directory temporary-file sync and replacement on every platform; directory sync only on Unix. Symlink/parent replacement, external changes, deleted files, readonly files and payload limits still reject unsafe saves.
- Portable Unicode/CRLF save/reopen, oversized-file and no-clobber tests. Unix permission/symlink tests are platform-gated. A Windows-only sharing-violation test checks that a locked destination preserves the original and can be saved after releasing the lock.
- Real Tauri configuration-parser tests load and validate both platform configurations. Windows retains native caption buttons; macOS retains overlay titlebar and traffic lights. Windows packaging selects NSIS, current-user installation, offline WebView2 installation and minimum WebView2 version 111.0.1661.0.
- Ctrl-based shortcut dispatch and labels, Ctrl+H, Ctrl+Tab/Ctrl+Shift+Tab, shifted bracket input and IME/AltGr exclusions. Native Alt+F4 uses the existing guarded close path.
- Windows Consolas/CRLF defaults; existing saved preferences are preserved. Windows/UNC recent-file labels and neutral device copy.
- Native launch-argument file authorization for Open With; a running-instance routing plugin was not added.
- `.github/workflows/windows.yml` runs frontend/Rust checks and builds an offline NSIS installer on a Windows runner. Actions are pinned to verified upstream commit SHAs; repository permissions are read-only. Installer artifacts and checksums expire after 14 days. The workflow does not publish GitHub Releases.

Checked locally:

- [x] Frontend tests: 25 passed, including five Windows-platform regression tests.
- [x] Rust tests: 14 passed on macOS, including both platform configuration-parser tests.
- [x] Strict TypeScript and Clippy with warnings denied.
- [x] Workflow YAML parsed, action references checked, and actionlint passed.
- [x] macOS release rebuild after the Windows port passed: arm64 `.app` produced. No new native Windows run is implied.
- [ ] Execute the Windows GitHub Actions workflow and verify successful MSVC compilation and NSIS packaging.
- [ ] Install/uninstall the generated installer on Windows 10 and 11, including a clean offline machine without WebView2.
- [ ] Windows native window controls, Ctrl shortcuts, Thai IME, AltGr, Unicode paths, drag/drop and Explorer Open With.
- [ ] Windows locked/readonly files, UNC/network volumes, junctions, external conflicts and disk-full behavior on real Windows filesystems.
- [ ] Authenticode signing and SmartScreen distribution behavior.

Files in the existing `release/` folder are the previously delivered macOS artifacts. They are not Windows installers. Windows artifacts must be produced by the new workflow or a native Windows build. See README for commands and prerequisites.
