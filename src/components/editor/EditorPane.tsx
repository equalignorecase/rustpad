import { shortcutLabel } from "../../services/documents/shortcuts";
import { useEffect, useRef, useState } from "react";
import {
  EditorView,
  keymap,
  lineNumbers,
  highlightActiveLine,
  highlightActiveLineGutter,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  placeholder,
} from "@codemirror/view";
import { EditorState, type Extension } from "@codemirror/state";
import {
  defaultKeymap,
  historyKeymap,
  indentWithTab,
  insertNewline,
  insertNewlineAndIndent,
} from "@codemirror/commands";
import {
  bracketMatching,
  indentOnInput,
  indentUnit,
  foldGutter,
  foldKeymap,
  syntaxHighlighting,
  defaultHighlightStyle,
} from "@codemirror/language";
import { closeBrackets, closeBracketsKeymap } from "@codemirror/autocomplete";
import {
  search,
  highlightSelectionMatches,
  gotoLine,
} from "@codemirror/search";
import { oneDark } from "@codemirror/theme-one-dark";
import { FileCode2 } from "lucide-react";
import { sessions } from "../../services/editor/session";
import { languageFor } from "../../services/editor/languages";
import { useWorkspace, useCursor } from "../../stores/workspace";
import { FindReplacePanel } from "./FindReplacePanel";
import { report } from "../../stores/feedback";
import type { Command } from "../../types";
let activeView: EditorView | null = null;
export function runEditorCommand(command: Command) {
  if (command === "goto" && activeView) {
    activeView.focus();
    gotoLine(activeView);
  }
}
export function EditorPane({
  findMode,
  closeFind,
  run,
}: {
  findMode: "find" | "replace" | null;
  closeFind: () => void;
  run: (command: Command) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [view, setView] = useState<EditorView | null>(null);
  const active = useWorkspace((state) => state.active);
  const settings = useWorkspace((state) => state.settings);
  const name = useWorkspace((state) =>
    state.active ? state.documents[state.active]?.name : undefined,
  );
  const language = useWorkspace((state) =>
    state.active ? state.documents[state.active]?.language : undefined,
  );
  const fingerprint = useWorkspace((state) =>
    state.active ? state.documents[state.active]?.fingerprint : undefined,
  );
  const mode = useWorkspace((state) => state.settings.theme);
  const closing = useWorkspace((state) => state.closing);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const dark = mode === "dark" || (mode === "system" && systemDark);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (!host.current || !active) return;
    let cancelled = false;
    const id = active;
    const session = sessions.get(id);
    function cursor(state: EditorState) {
      const { head, from, to } = state.selection.main;
      const line = state.doc.lineAt(head);
      useCursor.getState().set({
        line: line.number,
        column: Array.from(line.text.slice(0, head - line.from)).length + 1,
        selected: state.sliceDoc(from, to).length
          ? Array.from(state.sliceDoc(from, to)).length
          : 0,
        lines: state.doc.lines,
      });
    }
    const editor =
      viewRef.current ??
      new EditorView({ parent: host.current, state: session.state });
    viewRef.current = editor;
    activeView = editor;
    setView(editor);
    if (editor.state !== session.state) editor.setState(session.state);
    editor.scrollDOM.scrollTop = session.scroll;
    cursor(editor.state);
    const listener = EditorView.updateListener.of((update) => {
      sessions.update(id, update.state);
      if (update.selectionSet || update.docChanged) cursor(update.state);
    });
    const extensions: Extension[] = [
      EditorView.editable.of(!closing),
      EditorState.readOnly.of(closing),
      listener,
      placeholder(`Start typing, or open a file with ${shortcutLabel("open")}`),
      drawSelection(),
      dropCursor(),
      rectangularSelection(),
      crosshairCursor(),
      keymap.of([
        {
          key: "Enter",
          run: settings.autoIndent ? insertNewlineAndIndent : insertNewline,
        },
        ...closeBracketsKeymap,
        ...defaultKeymap,
        ...historyKeymap,
        ...foldKeymap,
        indentWithTab,
      ]),
      EditorState.tabSize.of(settings.tabSize),
      indentUnit.of(
        settings.indentWithTabs ? "\t" : " ".repeat(settings.tabSize),
      ),
      search({ top: true }),
      highlightSelectionMatches(),
      highlightActiveLine(),
      highlightActiveLineGutter(),
      EditorView.contentAttributes.of({
        "aria-label": `Editor: ${name ?? "document"}`,
        spellcheck: "false",
        autocapitalize: "off",
        autocorrect: "off",
      }),
      EditorView.theme(
        {
          "&": {
            height: "100%",
            backgroundColor: "var(--editor)",
            color: "var(--text)",
            fontSize: `${settings.fontSize}px`,
          },
          ".cm-scroller": {
            fontFamily: `${JSON.stringify(settings.fontFamily)}, ui-monospace, monospace`,
            lineHeight: "1.65",
          },
          ".cm-content": { padding: "16px 0", caretColor: "var(--accent)" },
          ".cm-line": { padding: "0 22px 0 10px" },
          ".cm-gutters": {
            backgroundColor: "var(--editor)",
            color: "var(--gutter)",
            border: "none",
            padding: "0 10px 0 12px",
          },
          ".cm-activeLineGutter, .cm-activeLine": {
            backgroundColor: "var(--active-line)",
          },
          ".cm-cursor": { borderLeftColor: "var(--accent)" },
          "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
            { backgroundColor: "var(--selection)" },
          ".cm-panels": {
            backgroundColor: "var(--panel)",
            color: "var(--text)",
            borderColor: "var(--border)",
          },
        },
        { dark },
      ),
    ];
    if (dark) extensions.push(oneDark);
    else extensions.push(syntaxHighlighting(defaultHighlightStyle));
    if (settings.lineNumbers) extensions.push(lineNumbers(), foldGutter());
    if (settings.wordWrap) extensions.push(EditorView.lineWrapping);
    if (settings.autoIndent) extensions.push(indentOnInput());
    if (settings.bracketMatching)
      extensions.push(bracketMatching(), closeBrackets());
    editor.dispatch({ effects: session.configuration.reconfigure(extensions) });
    const languageDescription = languageFor(name ?? "", language ?? "Auto");
    if (languageDescription)
      languageDescription
        .load()
        .then((support) => {
          if (!cancelled && sessions.get(id).state === editor.state)
            editor.dispatch({
              effects: session.configuration.reconfigure([
                ...extensions,
                support,
              ]),
            });
        })
        .catch(report);
    const rememberScroll = () => {
      session.scroll = editor.scrollDOM.scrollTop;
    };
    editor.scrollDOM.addEventListener("scroll", rememberScroll, {
      passive: true,
    });
    if (!findMode) editor.focus();
    return () => {
      cancelled = true;
      session.scroll = editor.scrollDOM.scrollTop;
      editor.scrollDOM.removeEventListener("scroll", rememberScroll);
    };
  }, [active, settings, name, language, fingerprint, dark, closing]);
  useEffect(
    () => () => {
      activeView = null;
      viewRef.current?.destroy();
      viewRef.current = null;
    },
    [],
  );
  return (
    <main className="editor-pane" aria-label="Document editor">
      {findMode && active && (
        <FindReplacePanel
          view={view}
          replace={findMode === "replace"}
          onClose={closeFind}
        />
      )}
      <div
        className="editor-host"
        ref={host}
        style={{ display: active ? undefined : "none" }}
      />
      {!active && (
        <div className="empty-editor">
          <FileCode2 size={45} strokeWidth={1} />
          <h1>Space to think.</h1>
          <p>A little text. A new idea. Your next project.</p>
          <div>
            <button className="button primary" onClick={() => run("new")}>
              New document <kbd>{shortcutLabel("new")}</kbd>
            </button>
            <button className="button" onClick={() => run("open")}>
              Open a file <kbd>{shortcutLabel("open")}</kbd>
            </button>
          </div>
          <small>Local files. Nothing leaves this device.</small>
        </div>
      )}
    </main>
  );
}
