// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { EditorView } from "@codemirror/view";
import { search, findNext, replaceAll } from "@codemirror/search";
import { undo } from "@codemirror/commands";
import { EditorSession } from "../services/editor/session";
import { applyQuery } from "../services/editor/search";
import type { DocumentInfo } from "../types";
let view: EditorView | null = null;
afterEach(() => {
  view?.destroy();
  view = null;
  document.body.innerHTML = "";
});
const doc: DocumentInfo = {
  id: "one",
  name: "text.txt",
  path: "/text.txt",
  content: "Rust rust rustic\nภาษาไทย👩🏽‍💻",
  fingerprint: "disk",
  lineEnding: "LF",
  bom: false,
};
it("searches and replaces whole words and restores clean state through undo", () => {
  const editor = new EditorSession();
  editor.add(doc, search());
  view = new EditorView({
    state: editor.get("one").state,
    parent: document.body,
    dispatchTransactions(transactions, current) {
      current.update(transactions);
      editor.update("one", current.state);
    },
  });
  applyQuery(view, {
    text: "rust",
    replace: "Go",
    caseSensitive: false,
    regexp: false,
    wholeWord: true,
  });
  expect(findNext(view)).toBe(true);
  expect(view.state.selection.main.from).toBe(0);
  replaceAll(view);
  expect(view.state.doc.toString()).toBe("Go Go rustic\nภาษาไทย👩🏽‍💻");
  expect(editor.isDirty("one")).toBe(true);
  undo(view);
  expect(view.state.doc.toString()).toBe("Rust rust rustic\nภาษาไทย👩🏽‍💻");
  expect(editor.isDirty("one")).toBe(false);
});
it("keeps independent undo histories across tab switches", () => {
  const editor = new EditorSession();
  editor.add(doc);
  editor.add({ ...doc, id: "two", content: "second" });
  let active = "one";
  view = new EditorView({
    state: editor.get(active).state,
    parent: document.body,
    dispatchTransactions(transactions, current) {
      current.update(transactions);
      editor.update(active, current.state);
    },
  });
  view.dispatch({ changes: { from: 0, insert: "first " } });
  active = "two";
  view.setState(editor.get(active).state);
  view.dispatch({ changes: { from: 0, insert: "other " } });
  active = "one";
  view.setState(editor.get(active).state);
  undo(view);
  expect(view.state.doc.toString()).toBe(doc.content);
  expect(editor.get("two").state.doc.toString()).toBe("other second");
});
