import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { useWorkspace, fonts } from "../../stores/workspace";
import { Modal } from "../ui/dialog";
import { checkForUpdates, openReleasePage } from "../../services/updates";
import { useI18n } from "../../services/i18n";
import type { Settings, UpdateInfo } from "../../types";

export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const settings = useWorkspace((state) => state.settings);
  const setSettings = useWorkspace((state) => state.setSettings);
  const t = useI18n(settings.languageUI ?? "en");
  const [checking, setChecking] = useState(false);
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  useEffect(() => {
    let disposed = false;
    getVersion()
      .then((value) => !disposed && setVersion(value))
      .catch(() => !disposed && setVersion(null));
    return () => {
      disposed = true;
    };
  }, []);
  const check = async () => {
    if (checking) return;
    setChecking(true);
    const info = await checkForUpdates();
    if (info) setUpdate(info);
    setChecking(false);
  };
  const toggles: [keyof Settings, string, string][] = [
    ["wordWrap", t.wordWrap, "Keep long lines within the editor"],
    ["lineNumbers", t.lineNumbers, "Show the gutter beside your text"],
    [
      "indentWithTabs",
      t.indentWithTabs,
      "Use tab characters instead of spaces",
    ],
    [
      "autoIndent",
      t.autoIndent,
      "Match indentation when starting a new line",
    ],
    [
      "bracketMatching",
      t.bracketMatching,
      "Highlight pairs and close brackets automatically",
    ],
    ["showRecent", "Recent files", "Show recently opened files in the sidebar"],
    [
      "restoreSession",
      t.restoreSession,
      "Reopen saved files and cursor positions; unsaved text stays in this session only",
    ],
    [
      "autoSave",
      t.autoSave,
      "Save existing files after 1.5 seconds idle. Conflicts stop saving. Untitled files require Save As.",
    ],
  ];
  return (
    <Modal
      title={t.settingsTitle}
      description="A quieter editor, configured your way. Saved on this device."
      open={open}
      onClose={onClose}
      className="settings-dialog"
    >
      <div className="settings-grid">
        <label>
          {t.uiLanguage}
          <select
            value={settings.languageUI ?? "en"}
            onChange={(e) =>
              setSettings({ languageUI: e.target.value as "en" | "th" })
            }
          >
            <option value="en">English</option>
            <option value="th">ภาษาไทย (Thai)</option>
          </select>
        </label>
        <label>
          {t.appearance}
          <select
            value={settings.theme}
            onChange={(e) =>
              setSettings({ theme: e.target.value as Settings["theme"] })
            }
          >
            <option value="system">{t.themeSystem}</option>
            <option value="dark">{t.themeDark}</option>
            <option value="light">{t.themeLight}</option>
          </select>
        </label>
        <label>
          {t.font}
          <select
            value={settings.fontFamily}
            onChange={(e) => setSettings({ fontFamily: e.target.value })}
          >
            {fonts.map((font) => (
              <option key={font}>{font}</option>
            ))}
          </select>
        </label>
        <label>
          {t.fontSize}
          <input
            type="number"
            min={10}
            max={28}
            value={settings.fontSize}
            onChange={(e) => setSettings({ fontSize: Number(e.target.value) })}
          />
        </label>
        <label>
          {t.tabSize}
          <select
            value={settings.tabSize}
            onChange={(e) => setSettings({ tabSize: Number(e.target.value) })}
          >
            {[2, 3, 4, 8].map((size) => (
              <option key={size} value={size}>
                {size} columns
              </option>
            ))}
          </select>
        </label>
        <label>
          {t.lineEndings}
          <select
            value={settings.preferredEnding}
            onChange={(e) =>
              setSettings({
                preferredEnding: e.target.value as Settings["preferredEnding"],
              })
            }
          >
            <option value="LF">LF (macOS / Unix)</option>
            <option value="CRLF">CRLF (Windows)</option>
          </select>
        </label>
      </div>
      <div className="settings-toggles">
        {toggles.map(([key, label, description]) => (
          <label className="toggle-row" key={key}>
            <span>
              <strong>{label}</strong>
              <small>{description}</small>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={Boolean(settings[key])}
              onChange={(e) => setSettings({ [key]: e.target.checked })}
            />
          </label>
        ))}
      </div>
      <div className="settings-about">
        <div className="settings-about-text">
          <strong>RustPad{version ? ` v${version}` : ""}</strong>
          {update ? (
            update.updateAvailable ? (
              <small className="update-available">
                Version {update.latestVersion} is available
                {formatPublishedAt(update.publishedAt)}.
              </small>
            ) : (
              <small>You're up to date.</small>
            )
          ) : (
            <small>Check GitHub for a newer release.</small>
          )}
        </div>
        <div className="settings-about-actions">
          <button
            className="button small"
            onClick={() => void check()}
            disabled={checking}
          >
            {checking ? "Checking…" : "Check for updates"}
          </button>
          {update?.updateAvailable && (
            <button
              className="button small primary"
              onClick={() => void openReleasePage(update)}
            >
              Download v{update.latestVersion}
            </button>
          )}
        </div>
      </div>
      <div className="dialog-actions">
        <button className="button primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
function formatPublishedAt(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : ` (published ${date.toLocaleDateString()})`;
}
