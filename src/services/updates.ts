import { native } from "./tauri";
import { report, useFeedback } from "../stores/feedback";
import { useWorkspace } from "../stores/workspace";
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
 * Downloads, SHA-256 verifies, and silently launches the Windows setup binary
 * before closing the running editor so the update applies in place.
 */
export async function installUpdate(info: UpdateInfo): Promise<boolean> {
  if (!info.installerUrl || !info.checksumsUrl) {
    await openReleasePage(info);
    return false;
  }

  const hasDirty = Object.values(useWorkspace.getState().documents).some(
    (doc) => doc.dirty,
  );
  if (hasDirty) {
    const confirm = await useFeedback
      .getState()
      .ask(
        "Unsaved changes",
        "You have unsaved changes. Updating will restart RustPad without saving open drafts. Continue anyway?",
        [
          { value: "continue", label: "Restart & Update", kind: "danger" },
          { value: "cancel", label: "Cancel" },
        ],
      );
    if (confirm !== "continue") return false;
  }

  try {
    useFeedback
      .getState()
      .notify(`Downloading RustPad v${info.latestVersion}...`);
    await native.installUpdate(info.installerUrl, info.checksumsUrl);
    return true;
  } catch (error) {
    report(error);
    return false;
  }
}

/**
 * Interactive check used by toolbar entry points: toasts when up to date,
 * or offers in-app update on Windows / browser release page fallback.
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

  if (info.canAutoUpdate && info.installerUrl && info.checksumsUrl) {
    const answer = await useFeedback.getState().ask(
      "Update available",
      `RustPad v${info.latestVersion} is available. You have v${info.currentVersion}. Download and install now?`,
      [
        {
          value: "install",
          label: `Update to v${info.latestVersion}`,
          kind: "primary",
        },
        { value: "download", label: "Release page" },
        { value: "later", label: "Later" },
      ],
    );
    if (answer === "install") await installUpdate(info);
    else if (answer === "download") await openReleasePage(info);
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
