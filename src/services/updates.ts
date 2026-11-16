import { native } from "./tauri";
import { report, useFeedback } from "../stores/feedback";
import type { UpdateInfo } from "../types";

/**
 * Checks GitHub for a newer RustPad release. Returns the release info, or
 * `null` when the check failed (an error toast is shown in that case).
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    return await native.checkUpdate();
  } catch (error) {
    report(error);
    return null;
  }
}
/** Opens the GitHub release page in the system browser. */
export async function openReleasePage(info: UpdateInfo) {
  try {
    await native.openReleasePage(info.releaseUrl);
  } catch (error) {
    report(error);
  }
}
/**
 * Interactive check used by toolbar entry points: toasts when up to date,
 * or asks before opening the release page when an update is available.
 */
export async function promptUpdateCheck() {
  const info = await checkForUpdates();
  if (!info) return;
  if (!info.updateAvailable) {
    useFeedback
      .getState()
      .notify(`RustPad is up to date (v${info.currentVersion}).`);
    return;
  }
  const answer = await useFeedback.getState().ask(
    "Update available",
    `RustPad v${info.latestVersion} is available. You have v${info.currentVersion}. Download it from GitHub?`,
    [
      {
        value: "download",
        label: `Download v${info.latestVersion}`,
        kind: "primary",
      },
      { value: "later", label: "Later" },
    ],
  );
  if (answer === "download") await openReleasePage(info);
}
