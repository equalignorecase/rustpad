import { shortcutLabel } from "../../services/documents/shortcuts";
import { useCursor, useWorkspace } from "../../stores/workspace";
import { documents } from "../../services/documents/controller";
import { languageLabel, languageModes } from "../../services/editor/languages";
import { useI18n } from "../../services/i18n";
import type { Encoding, Ending } from "../../types";
import { runEditorCommand } from "../editor/EditorPane";

export function StatusBar() {
  const cursor = useCursor();
  const active = useWorkspace((state) => state.active);
  const doc = useWorkspace((state) =>
    state.active ? state.documents[state.active] : undefined,
  );
  const patch = useWorkspace((state) => state.patch);
  const busy = useWorkspace((state) => state.busy);
  const langUI = useWorkspace((state) => state.settings.languageUI ?? "en");
  const t = useI18n(langUI);

  const length = cursor.selected > 0 ? cursor.selected : 0;
  const lineEnding = doc ? (doc.ending === "Preserve" ? doc.lineEnding : doc.ending) : "CRLF";
  const lineEndingText = lineEnding === "CRLF" ? "Windows (CR LF)" : lineEnding === "LF" ? "Unix (LF)" : "Mac (CR)";
  const encodingText = doc?.encoding ?? (doc?.bom ? "UTF-8-BOM" : "UTF-8");

  return (
    <footer className="npp-statusbar">
      {/* 1. Status / File state */}
      <div className="npp-status-box npp-status-main" title="Status">
        <span>
          {busy
            ? "Saving…"
            : doc?.external
              ? t.statusChangedOnDisk
              : doc?.dirty
                ? t.statusModified
                : doc?.path
                  ? t.statusReady
                  : t.statusNew}
        </span>
      </div>

      {/* 2. Length & Lines */}
      <div className="npp-status-box" title="Document Length and Lines">
        <span>{t.length} : {length}  {t.lines} : {cursor.lines}</span>
      </div>

      {/* 3. Ln, Col, Sel */}
      <button
        className="npp-status-box npp-status-interactive"
        onClick={() => runEditorCommand("goto")}
        title={`Go to line / column (${shortcutLabel("goto")})`}
      >
        <span>
          {t.ln} : {cursor.line}   {t.col} : {cursor.column}   {t.sel} : {cursor.selected}
        </span>
      </button>

      {/* 4. Windows Line Ending */}
      <div className="npp-status-box npp-status-select-wrapper" title="Line Ending (Double click to change)">
        <select
          aria-label="Line ending"
          value={doc?.ending ?? "Preserve"}
          onChange={(e) => {
            if (active) documents.format(active, e.target.value as Ending);
          }}
          className="npp-status-select"
        >
          <option value="Preserve">{lineEndingText}</option>
          <option value="CRLF">Windows (CR LF)</option>
          <option value="LF">Unix (LF)</option>
        </select>
      </div>

      {/* 5. Encoding */}
      <div className="npp-status-box npp-status-select-wrapper" title="Encoding">
        <select
          aria-label="Encoding"
          value={encodingText}
          onChange={(e) => {
            if (active) {
              documents.format(
                active,
                undefined,
                undefined,
                e.target.value as Encoding,
              );
            }
          }}
          className="npp-status-select"
        >
          <option value="UTF-8">UTF-8</option>
          <option value="UTF-8-BOM">UTF-8-BOM</option>
          <option value="UTF-16 LE">UCS-2 LE</option>
          <option value="UTF-16 BE">UCS-2 BE</option>
          <option value="Windows-874">Windows-874</option>
        </select>
      </div>

      {/* 6. Language mode */}
      <div className="npp-status-box npp-status-select-wrapper" title="Language Syntax">
        <select
          aria-label="Language mode"
          value={doc?.language ?? "Auto"}
          onChange={(e) => {
            if (active) patch(active, { language: e.target.value });
          }}
          className="npp-status-select"
        >
          {languageModes.map((language) => (
            <option key={language} value={language}>
              {language === "Auto"
                ? doc
                  ? languageLabel(doc.name, "Auto")
                  : "Normal text file"
                : language}
            </option>
          ))}
        </select>
      </div>

      {/* 7. INS Mode indicator */}
      <div className="npp-status-box npp-status-ins" title="Insert / Overwrite Mode">
        <span>INS</span>
      </div>
    </footer>
  );
}
