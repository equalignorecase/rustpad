import { beforeEach, expect, it, vi } from "vitest";
import { DocumentController } from "../services/documents/controller";
import { EditorSession } from "../services/editor/session";
import { useWorkspace, defaultSettings } from "../stores/workspace";
import { useFeedback } from "../stores/feedback";
import type { Native } from "../services/tauri";
import type { DocumentInfo } from "../types";
const info: DocumentInfo = {
  id: "one",
  name: "new.txt",
  path: null,
  content: "",
  fingerprint: "",
  lineEnding: "LF",
  bom: false,
};
function setup(overrides: Partial<Native> = {}) {
  const api = {
    close: vi.fn(async () => {}),
    saveAs: vi.fn(async () => null),
    config: async () => ({
      version: 1,
      settings: {},
      tabs: [],
      recent: [],
      active: null,
    }),
    persist: async () => {},
    exit: vi.fn(async () => {}),
    ...overrides,
  } as Native;
  const editor = new EditorSession();
  const controller = new DocumentController(api, editor);
  controller.add({ ...info });
  const state = editor.get("one").state;
  editor.update(
    "one",
    state.update({ changes: { from: 0, insert: "unsaved ภาษาไทย👋" } }).state,
  );
  return { api, editor, controller };
}
beforeEach(() => {
  useWorkspace.setState({
    documents: {},
    order: [],
    active: null,
    settings: defaultSettings,
    closing: false,
  });
  useFeedback.setState({ question: null, notifications: [] });
});
it("cancelled Save As keeps dirty tab open", async () => {
  const { controller, editor } = setup();
  const closing = controller.close("one");
  await vi.waitFor(() =>
    expect(useFeedback.getState().question).not.toBeNull(),
  );
  useFeedback.getState().answer("save");
  await closing;
  expect(useWorkspace.getState().order).toEqual(["one"]);
  expect(editor.isDirty("one")).toBe(true);
  expect(editor.snapshot("one").content).toBe("unsaved ภาษาไทย👋");
});
it("cancelled quit retains all tabs and never exits", async () => {
  const { controller, api } = setup();
  controller.add({ ...info, id: "two" });
  const closing = controller.quit();
  await vi.waitFor(() =>
    expect(useFeedback.getState().question).not.toBeNull(),
  );
  useFeedback.getState().answer("cancel");
  await closing;
  expect(useWorkspace.getState().order).toEqual(["one", "two"]);
  expect(api.exit).not.toHaveBeenCalled();
});
it("save errors retain local text and dirty state", async () => {
  const { controller, editor } = setup({
    saveAs: async () => {
      throw { code: "permission", message: "Permission denied" };
    },
  });
  expect(await controller.save("one")).toBe(false);
  expect(editor.isDirty("one")).toBe(true);
  expect(useFeedback.getState().notifications[0].message).toBe(
    "Permission denied",
  );
});
it("session restore clamps saved cursor and restores active tab", async () => {
  const editor = new EditorSession();
  const api = {
    config: async () => ({
      version: 1,
      settings: { restoreSession: true },
      recent: [],
      tabs: [{ path: "/one", cursor: 900, scroll: 42 }],
      active: "/one",
    }),
    restore: async () => ({
      documents: [
        { ...info, content: "text", path: "/one" },
        { ...info, id: "two", path: "/two" },
      ],
      errors: [],
    }),
    pending: async () => ({ documents: [], errors: [] }),
  } as unknown as Native;
  await new DocumentController(api, editor).initialize();
  expect(useWorkspace.getState().active).toBe("one");
  expect(editor.get("one").state.selection.main.head).toBe(4);
  expect(editor.get("one").scroll).toBe(42);
});
it("autosaves existing files after idle and stops after save errors", async () => {
  vi.useFakeTimers();
  const save = vi.fn(async () => {
    throw { code: "conflict", message: "Changed on disk" };
  });
  const { editor } = setup({ save });
  editor.get("one").info.path = "/one";
  useWorkspace.getState().patch("one", { path: "/one" });
  useWorkspace.getState().setSettings({ autoSave: true });
  editor.update(
    "one",
    editor.get("one").state.update({ changes: { from: 0, insert: "more" } })
      .state,
  );
  await vi.advanceTimersByTimeAsync(1499);
  expect(save).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(1);
  expect(save).toHaveBeenCalledTimes(1);
  editor.update(
    "one",
    editor.get("one").state.update({ changes: { from: 0, insert: "again" } })
      .state,
  );
  await vi.advanceTimersByTimeAsync(2000);
  expect(save).toHaveBeenCalledTimes(1);
  expect(editor.isDirty("one")).toBe(true);
  vi.useRealTimers();
});
it("blocks closing state until prompt resolves", async () => {
  const { controller } = setup();
  const closing = controller.close("one");
  await vi.waitFor(() =>
    expect(useFeedback.getState().question).not.toBeNull(),
  );
  expect(useWorkspace.getState().closing).toBe(true);
  useFeedback.getState().answer("cancel");
  await closing;
  expect(useWorkspace.getState().closing).toBe(false);
});
it("keeps local text after an external change until reload is chosen", async () => {
  const read = vi.fn(async () => ({
    ...info,
    path: "/one",
    content: "external",
    fingerprint: "new-disk",
  }));
  const { controller, editor } = setup({ read, inspect: async () => true });
  editor.get("one").info.path = "/one";
  useWorkspace.getState().patch("one", { path: "/one" });
  const checking = controller.checkExternal();
  await vi.waitFor(() =>
    expect(useFeedback.getState().question?.title).toBe("File changed on disk"),
  );
  expect(read).not.toHaveBeenCalled();
  expect(editor.snapshot("one").content).toBe("unsaved ภาษาไทย👋");
  useFeedback.getState().answer("keep");
  await checking;
  expect(editor.snapshot("one").content).toBe("unsaved ภาษาไทย👋");
  expect(useWorkspace.getState().documents.one.external).toBe(true);
  await controller.checkExternal();
  expect(useFeedback.getState().question).toBeNull();
});
it("allows quit after an explicit decision when preferences cannot be written", async () => {
  const { controller, editor, api } = setup({
    persist: async () => {
      throw { code: "permission", message: "Preferences folder is read-only" };
    },
  });
  const snapshot = editor.snapshot("one");
  editor.saved("one", { ...info, content: snapshot.content }, snapshot);
  const quitting = controller.quit();
  await vi.waitFor(() =>
    expect(useFeedback.getState().question?.title).toBe(
      "Preferences could not be saved",
    ),
  );
  expect(api.exit).not.toHaveBeenCalled();
  useFeedback.getState().answer("quit");
  await quitting;
  expect(api.exit).toHaveBeenCalledTimes(1);
});

it("keeps the line ending chosen for an untitled document when defaults change", async () => {
  const saveAs = vi.fn(async (_id: string, content: string) => ({
    ...info,
    content,
    path: "/one",
    lineEnding: "CRLF" as const,
    fingerprint: "saved",
  }));
  const { controller, editor } = setup({ saveAs });
  editor.get("one").info.lineEnding = "CRLF";
  useWorkspace.getState().setSettings({ preferredEnding: "LF" });
  expect(await controller.save("one")).toBe(true);
  expect(saveAs).toHaveBeenCalledWith(
    "one",
    "unsaved ภาษาไทย👋",
    "CRLF",
    false,
  );
});
