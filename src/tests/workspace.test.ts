import { beforeEach, describe, expect, it } from "vitest";
import { useWorkspace, validateSettings } from "../stores/workspace";
import { shortcut } from "../services/documents/shortcuts";
import { EditorSession } from "../services/editor/session";
import type { DocumentInfo } from "../types";

const doc: DocumentInfo = {
  id: "one",
  name: "ไทย.rs",
  path: "/tmp/ไทย.rs",
  content: "สวัสดี👩🏽‍💻\r\nnext\n",
  fingerprint: "disk-one",
  lineEnding: "Mixed",
  bom: true,
};
beforeEach(() =>
  useWorkspace.setState({ documents: {}, order: [], active: null }),
);
describe("document metadata", () => {
  it("deduplicates open files and selects adjacent tab after close", () => {
    const store = useWorkspace.getState();
    store.add(doc);
    store.add(doc);
    store.add({ ...doc, id: "two", name: "next.txt" });
    expect(useWorkspace.getState().order).toEqual(["one", "two"]);
    useWorkspace.getState().remove("two");
    expect(useWorkspace.getState().active).toBe("one");
  });
  it("reorders tabs without changing active selection", () => {
    useWorkspace.getState().add(doc);
    useWorkspace.getState().add({ ...doc, id: "two" });
    useWorkspace.getState().reorder("two", "one");
    expect(useWorkspace.getState().order).toEqual(["two", "one"]);
    expect(useWorkspace.getState().active).toBe("two");
  });
  it("clamps invalid persisted settings and retains safe defaults", () => {
    const settings = validateSettings({
      fontSize: 900,
      tabSize: 0,
      autoSave: "yes",
      theme: "pink",
      fontFamily: "<bad>",
    });
    expect(settings.fontSize).toBe(28);
    expect(settings.tabSize).toBe(2);
    expect(settings.autoSave).toBe(false);
    expect(settings.theme).toBe("dark");
    expect(settings.restoreSession).toBe(true);
  });
});
describe("editor sessions", () => {
  it("tracks saved snapshots through edits and undo", () => {
    const sessions = new EditorSession();
    sessions.add(doc);
    const initial = sessions.get("one").state;
    sessions.update(
      "one",
      initial.update({ changes: { from: 0, to: 6, insert: "hello" } }).state,
    );
    expect(sessions.isDirty("one")).toBe(true);
    sessions.update("one", initial);
    expect(sessions.isDirty("one")).toBe(false);
    expect(sessions.snapshot("one").content).toBe("สวัสดี👩🏽‍💻\nnext\n");
  });
  it("does not mark edits made during save as clean", () => {
    const sessions = new EditorSession();
    sessions.add(doc);
    const state = sessions.get("one").state;
    const snapshot = sessions.snapshot("one");
    sessions.update(
      "one",
      state.update({ changes: { from: 0, insert: "new" } }).state,
    );
    sessions.saved("one", { ...doc, fingerprint: "saved-two" }, snapshot);
    expect(sessions.isDirty("one")).toBe(true);
    expect(sessions.get("one").info.fingerprint).toBe("saved-two");
  });
  it("preserves selection and history state across tab switches", () => {
    const sessions = new EditorSession();
    sessions.add(doc);
    sessions.add({ ...doc, id: "two" });
    sessions.update(
      "one",
      sessions.get("one").state.update({ selection: { anchor: 3 } }).state,
    );
    expect(sessions.get("one").state.selection.main.head).toBe(3);
    expect(sessions.get("two").state.selection.main.head).toBe(0);
  });
});
describe("keyboard dispatch", () => {
  it("handles save as separately from save and ignores composing input", () => {
    expect(shortcut({ key: "s", metaKey: true, shiftKey: true })).toBe(
      "saveAs",
    );
    expect(shortcut({ key: "s", metaKey: true })).toBe("save");
    expect(shortcut({ key: "n", metaKey: true, isComposing: true })).toBe(null);
    expect(shortcut({ key: "q", metaKey: true })).toBe("quit");
    expect(shortcut({ key: "s", ctrlKey: true, altKey: true })).toBe(null);
  });
});
