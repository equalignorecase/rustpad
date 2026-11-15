import { Check, Circle, WrapText } from "lucide-react";
import { useCursor, useWorkspace } from "../../stores/workspace";
import { documents } from "../../services/documents/controller";
import { languageLabel, languageModes } from "../../services/editor/languages";
import type { Ending } from "../../types";
import { runEditorCommand } from "../editor/EditorPane";
export function StatusBar() {
  const cursor = useCursor();
  const active = useWorkspace((state) => state.active);
  const doc = useWorkspace((state) =>
    state.active ? state.documents[state.active] : undefined,
  );
  const settings = useWorkspace((state) => state.settings);
  const setSettings = useWorkspace((state) => state.setSettings);
  const patch = useWorkspace((state) => state.patch);
  const busy = useWorkspace((state) => state.busy);
  return (
    <footer className="statusbar">
      <div className="status-left">
        {doc?.dirty ? (
          <Circle size={10} className="status-unsaved" fill="currentColor" />
        ) : (
          <Check size={12} />
        )}
        <span>
          {busy
            ? "Saving…"
            : doc?.external
              ? "Changed on disk"
              : doc?.dirty
                ? "Unsaved changes"
                : doc?.path
                  ? "Saved"
                  : "Ready"}
        </span>
        {doc && (
          <span className="line-count">
            {cursor.lines.toLocaleString()}{" "}
            {cursor.lines === 1 ? "line" : "lines"}
          </span>
        )}
      </div>
      {doc && active && (
        <div className="status-right">
          <button
            onClick={() => runEditorCommand("goto")}
            title="Go to line / column (⌘G)"
          >
            Ln {cursor.line}, Col {cursor.column}
            {cursor.selected > 0 ? ` · ${cursor.selected} selected` : ""}
          </button>
          <button
            title="Change indentation in Settings"
            onClick={() =>
              window.dispatchEvent(new CustomEvent("rustpad-settings"))
            }
          >
            {settings.indentWithTabs ? "Tabs" : "Spaces"}: {settings.tabSize}
          </button>
          <select
            aria-label="Line ending"
            title="Convert line endings on next save"
            value={doc.ending}
            onChange={(e) => documents.format(active, e.target.value as Ending)}
          >
            <option value="Preserve">{doc.lineEnding}</option>
            <option value="LF">Convert to LF</option>
            <option value="CRLF">Convert to CRLF</option>
          </select>
          <select
            aria-label="Encoding"
            value={doc.bom ? "bom" : "utf8"}
            onChange={(e) =>
              documents.format(active, undefined, e.target.value === "bom")
            }
          >
            <option value="utf8">UTF-8</option>
            <option value="bom">UTF-8 BOM</option>
          </select>
          <select
            aria-label="Language mode"
            value={doc.language}
            onChange={(e) => patch(active, { language: e.target.value })}
          >
            {languageModes.map((language) => (
              <option key={language} value={language}>
                {language === "Auto"
                  ? languageLabel(doc.name, "Auto")
                  : language}
              </option>
            ))}
          </select>
          <button
            aria-label="Toggle word wrap"
            title="Word wrap"
            aria-pressed={settings.wordWrap}
            className={`wrap-toggle ${settings.wordWrap ? "enabled" : ""}`}
            onClick={() => setSettings({ wordWrap: !settings.wordWrap })}
          >
            <WrapText size={14} />
          </button>
        </div>
      )}
    </footer>
  );
}
