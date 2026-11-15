import { useWorkspace, fonts } from "../../stores/workspace";
import { Modal } from "../ui/dialog";
import type { Settings } from "../../types";
export function SettingsDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const settings = useWorkspace((state) => state.settings);
  const setSettings = useWorkspace((state) => state.setSettings);
  const toggles: [keyof Settings, string, string][] = [
    ["wordWrap", "Word wrap", "Keep long lines within the editor"],
    ["lineNumbers", "Line numbers", "Show the gutter beside your text"],
    [
      "indentWithTabs",
      "Indent with tabs",
      "Use tab characters instead of spaces",
    ],
    [
      "autoIndent",
      "Automatic indentation",
      "Match indentation when starting a new line",
    ],
    [
      "bracketMatching",
      "Bracket matching",
      "Highlight pairs and close brackets automatically",
    ],
    ["showRecent", "Recent files", "Show recently opened files in the sidebar"],
    [
      "restoreSession",
      "Restore session",
      "Reopen saved files and cursor positions; unsaved text stays in this session only",
    ],
    [
      "autoSave",
      "Auto save",
      "Save existing files after 1.5 seconds idle. Conflicts stop saving. Untitled files require Save As.",
    ],
  ];
  return (
    <Modal
      title="Settings"
      description="A quieter editor, configured your way. Saved on this Mac."
      open={open}
      onClose={onClose}
      className="settings-dialog"
    >
      <div className="settings-grid">
        <label>
          Appearance
          <select
            value={settings.theme}
            onChange={(e) =>
              setSettings({ theme: e.target.value as Settings["theme"] })
            }
          >
            <option value="system">System</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label>
          Editor font
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
          Font size
          <input
            type="number"
            min={10}
            max={28}
            value={settings.fontSize}
            onChange={(e) => setSettings({ fontSize: Number(e.target.value) })}
          />
        </label>
        <label>
          Indent size
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
          New file line endings
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
      <div className="dialog-actions">
        <button className="button primary" onClick={onClose}>
          Done
        </button>
      </div>
    </Modal>
  );
}
