import { EditorSelection } from "@codemirror/state";
import { native, type Native } from "../tauri";
import { sessions, type EditorSession } from "../editor/session";
import { useWorkspace, validateSettings } from "../../stores/workspace";
import { report, useFeedback } from "../../stores/feedback";
import type { DocumentInfo, Encoding, Ending, OpenBatch } from "../../types";

function detectLineEnding(text: string): DocumentInfo["lineEnding"] {
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.match(/\n/g) ?? []).length - crlf;
  const cr = (text.match(/\r/g) ?? []).length - crlf;
  if (crlf > 0 && lf === 0 && cr === 0) return "CRLF";
  if (cr > 0 && crlf === 0 && lf === 0) return "CR";
  if (crlf === 0 && cr === 0) return "LF";
  return "Mixed";
}

function decodeDroppedBytes(bytes: Uint8Array): {
  content: string;
  bom: boolean;
  encoding: Encoding;
} {
  if (
    bytes.length >= 3 &&
    bytes[0] === 0xef &&
    bytes[1] === 0xbb &&
    bytes[2] === 0xbf
  ) {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(
      bytes.subarray(3),
    );
    return { content, bom: true, encoding: "UTF-8 BOM" };
  }
  try {
    const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    if (content.includes("\0")) throw new Error("binary");
    return { content, bom: false, encoding: "UTF-8" };
  } catch (err) {
    if (err instanceof Error && err.message === "binary") {
      throw {
        code: "binary",
        message:
          "This looks like binary content. RustPad opens text files only; the file was not changed.",
      };
    }
  }
  if (
    bytes.length >= 4 &&
    bytes.length % 2 === 0 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xfe
  ) {
    const content = new TextDecoder("utf-16le", { fatal: true }).decode(
      bytes.subarray(2),
    );
    if (content.includes("\0"))
      throw {
        code: "binary",
        message:
          "This looks like binary content. RustPad opens text files only; the file was not changed.",
      };
    return { content, bom: true, encoding: "UTF-16 LE" };
  }
  if (
    bytes.length >= 4 &&
    bytes.length % 2 === 0 &&
    bytes[0] === 0xfe &&
    bytes[1] === 0xff
  ) {
    const content = new TextDecoder("utf-16be", { fatal: true }).decode(
      bytes.subarray(2),
    );
    if (content.includes("\0"))
      throw {
        code: "binary",
        message:
          "This looks like binary content. RustPad opens text files only; the file was not changed.",
      };
    return { content, bom: true, encoding: "UTF-16 BE" };
  }
  if (bytes.includes(0)) {
    throw {
      code: "binary",
      message:
        "This looks like binary content. RustPad opens text files only; the file was not changed.",
    };
  }
  try {
    const content = new TextDecoder("windows-874", { fatal: true }).decode(
      bytes,
    );
    return { content, bom: false, encoding: "Windows-874" };
  } catch {
    throw {
      code: "encoding",
      message:
        "This file is not a supported text encoding (UTF-8, UTF-16, or Windows-874). No bytes were changed.",
    };
  }
}

export class DocumentController {
  private saving = new Map<string, Promise<boolean>>();
  private closing = false;
  private checking = false;
  private pollSuppressed = new Set<string>();
  private initialized = false;
  private autoSaveTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private autoSaveBlocked = new Set<string>();
  constructor(
    private api: Native = native,
    private editor: EditorSession = sessions,
  ) {
    editor.onEdit = (id) => {
      clearTimeout(this.autoSaveTimers.get(id));
      const state = useWorkspace.getState();
      if (
        !state.settings.autoSave ||
        !editor.get(id).info.path ||
        editor.get(id).info.lineEnding === "Mixed" ||
        this.autoSaveBlocked.has(id) ||
        state.documents[id]?.external ||
        this.closing
      )
        return;
      this.autoSaveTimers.set(
        id,
        setTimeout(() => {
          this.autoSaveTimers.delete(id);
          if (
            useWorkspace.getState().settings.autoSave &&
            useWorkspace.getState().documents[id] &&
            editor.isDirty(id) &&
            !this.closing
          )
            void this.save(id);
        }, 1500),
      );
    };
    editor.onChange = (id) => {
      const store = useWorkspace.getState();
      if (
        store.documents[id] &&
        store.documents[id].dirty !== editor.isDirty(id)
      )
        store.patch(id, { dirty: editor.isDirty(id) });
    };
  }
  add(doc: DocumentInfo) {
    this.editor.add(doc);
    useWorkspace.getState().add(doc);
  }
  private replaceEmptyUntitledIfSoleTab(incoming: DocumentInfo[]) {
    const state = useWorkspace.getState();
    if (state.order.length !== 1) return;
    const soleId = state.order[0];
    const meta = state.documents[soleId];
    if (!meta || meta.path || meta.dirty || this.saving.has(soleId)) return;
    if (!incoming.some((doc) => doc.id !== soleId)) return;
    try {
      const session = this.editor.get(soleId);
      if (this.editor.isDirty(soleId) || session.state.doc.length > 0) return;
    } catch {
      return;
    }
    clearTimeout(this.autoSaveTimers.get(soleId));
    this.autoSaveTimers.delete(soleId);
    this.editor.remove(soleId);
    useWorkspace.getState().remove(soleId);
    void this.api.close?.(soleId)?.catch(() => {});
  }
  batch(batch: OpenBatch) {
    if (batch.folder) {
      useWorkspace.setState({ folder: batch.folder, sidebar: true });
    }
    if (batch.documents.length > 0) {
      this.replaceEmptyUntitledIfSoleTab(batch.documents);
    }
    batch.documents.forEach((doc) => this.add(doc));
    batch.errors.forEach(report);
  }
  async dropFiles(files: FileList | File[]) {
    const list = Array.from(files).slice(0, 50);
    if (!list.length) return;
    const opened: DocumentInfo[] = [];
    const errors: { code: string; message: string }[] = [];
    for (const file of list) {
      if (file.size > 10 * 1024 * 1024) {
        errors.push({
          code: "too_large",
          message:
            "Files larger than 10 MiB are not supported. The file was not changed.",
        });
        continue;
      }
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const { content, bom, encoding } = decodeDroppedBytes(bytes);
        const path =
          "path" in file && typeof file.path === "string" && file.path
            ? file.path
            : null;
        const existingId = useWorkspace
          .getState()
          .order.find((id) => {
            const d = useWorkspace.getState().documents[id];
            return path ? d?.path === path : d?.name === file.name && !d?.path;
          });
        if (existingId) {
          useWorkspace.getState().activate(existingId);
          continue;
        }
        opened.push({
          id: `dropped-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          path,
          content,
          fingerprint: "",
          lineEnding: detectLineEnding(content),
          bom,
          encoding,
        });
      } catch (err) {
        errors.push(
          err && typeof err === "object" && "message" in err
            ? (err as { code: string; message: string })
            : { code: "io", message: `Could not read ${file.name}.` },
        );
      }
    }
    this.batch({ documents: opened, errors });
  }
  async initialize() {
    if (this.initialized) return;
    this.initialized = true;
    try {
      const config = await this.api.config();
      const settings = validateSettings(config.settings);
      useWorkspace.setState({ settings, recent: config.recent });
      if (settings.restoreSession) {
        const restored = await this.api.restore();
        this.batch(restored);
        for (const doc of restored.documents) {
          const position = config.tabs.find((tab) => tab.path === doc.path);
          if (position) {
            const session = this.editor.get(doc.id);
            session.state = session.state.update({
              selection: EditorSelection.cursor(
                Math.min(position.cursor, session.state.doc.length),
              ),
            }).state;
            session.scroll = position.scroll;
          }
          if (doc.path === config.active)
            useWorkspace.getState().activate(doc.id);
        }
        const selected = restored.documents.find(
          (doc) => doc.path === config.active,
        );
        if (selected) useWorkspace.getState().activate(selected.id);
      }
      await this.pending();
      if (!useWorkspace.getState().order.length) await this.newDocument();
    } catch (error) {
      report(error);
    } finally {
      useWorkspace.setState({ ready: true });
    }
  }
  async pending() {
    this.batch(await this.api.pending());
    await this.refreshRecent();
  }
  async newDocument() {
    const doc = await this.api.newDocument();
    this.add(doc);
    const ending = useWorkspace.getState().settings.preferredEnding;
    if (ending !== "LF") {
      const session = this.editor.get(doc.id);
      session.info.lineEnding = ending;
      useWorkspace.getState().patch(doc.id, { lineEnding: ending });
    }
  }
  async open() {
    this.batch(await this.api.open());
    await this.refreshRecent();
  }
  async recent(index: number) {
    this.batch(await this.api.recent(index));
    await this.refreshRecent();
  }
  async openEntry(id: string) {
    this.batch(await this.api.openEntry(id));
    await this.refreshRecent();
  }
  async refreshRecent() {
    const config = await this.api.config();
    useWorkspace.setState({ recent: config.recent });
  }
  save(id = useWorkspace.getState().active, saveAs = false): Promise<boolean> {
    if (!id) return Promise.resolve(false);
    const pending = this.saving.get(id);
    if (pending)
      return pending.then((ok) =>
        ok && this.editor.isDirty(id) ? this.save(id, saveAs) : ok,
      );
    const task = this.performSave(id, saveAs);
    this.saving.set(id, task);
    return task.finally(() => {
      if (this.saving.get(id) === task) this.saving.delete(id);
    });
  }
  private async performSave(id: string, saveAs: boolean) {
    const session = this.editor.get(id);
    const snapshot = this.editor.snapshot(id);
    if (!session.info.path && snapshot.ending === "Preserve")
      snapshot.ending = session.info.lineEnding === "CRLF" ? "CRLF" : "LF";
    useWorkspace.setState((state) => ({ busy: state.busy + 1 }));
    try {
      if (
        session.info.lineEnding === "Mixed" &&
        session.info.path &&
        snapshot.ending === "Preserve" &&
        !snapshot.text.eq(session.saved)
      ) {
        const answer = await useFeedback
          .getState()
          .ask(
            "Mixed line endings",
            "Saving edits will normalize this file’s mixed line endings. Choose a format, or cancel to keep the original bytes.",
            [
              { value: "cancel", label: "Cancel" },
              { value: "LF", label: "Use LF" },
              { value: "CRLF", label: "Use CRLF", kind: "primary" },
            ],
          );
        if (answer === "cancel") return false;
        snapshot.ending = answer as Ending;
      }
      const customEncoding =
        snapshot.encoding !== "UTF-8" && snapshot.encoding !== "UTF-8 BOM"
          ? [snapshot.encoding]
          : [];
      const doc =
        saveAs || !session.info.path
          ? await this.api.saveAs(
              id,
              snapshot.content,
              snapshot.ending,
              snapshot.bom,
              ...customEncoding,
            )
          : await this.api.save(
              id,
              snapshot.content,
              snapshot.ending,
              snapshot.bom,
              session.info.fingerprint,
              ...customEncoding,
            );
      if (!doc) return false;
      this.editor.saved(id, doc, snapshot);
      useWorkspace.getState().patch(id, {
        name: doc.name,
        path: doc.path,
        fingerprint: doc.fingerprint,
        lineEnding: doc.lineEnding,
        bom: session.bom,
        encoding: session.encoding,
        ending: session.ending,
        dirty: this.editor.isDirty(id),
        external: false,
      });
      this.pollSuppressed.delete(id);
      this.autoSaveBlocked.delete(id);
      await this.refreshRecent();
      useFeedback.getState().notify(`${doc.name} saved`);
      return true;
    } catch (error) {
      this.autoSaveBlocked.add(id);
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["conflict", "deleted"].includes(String(error.code))
      )
        useWorkspace.getState().patch(id, { external: true });
      report(error);
      return false;
    } finally {
      useWorkspace.setState((state) => ({ busy: state.busy - 1 }));
    }
  }
  private async confirmClose(id: string) {
    if (this.saving.has(id)) await this.saving.get(id);
    if (!this.editor.isDirty(id)) return true;
    useWorkspace.getState().activate(id);
    const answer = await useFeedback
      .getState()
      .ask(
        `Save changes to “${this.editor.get(id).info.name}”?`,
        "Your changes will be lost if you close without saving.",
        [
          { value: "discard", label: "Don’t Save", kind: "danger" },
          { value: "cancel", label: "Cancel" },
          { value: "save", label: "Save", kind: "primary" },
        ],
      );
    if (answer === "discard") return true;
    if (answer === "cancel") return false;
    return (await this.save(id)) && !this.editor.isDirty(id);
  }
  async close(id = useWorkspace.getState().active) {
    if (!id || this.closing || useFeedback.getState().question) return;
    this.closing = true;
    useWorkspace.setState({ closing: true });
    try {
      if (!(await this.confirmClose(id))) return;
      clearTimeout(this.autoSaveTimers.get(id));
      this.autoSaveTimers.delete(id);
      await this.api.close(id);
      this.editor.remove(id);
      useWorkspace.getState().remove(id);
    } finally {
      this.closing = false;
      useWorkspace.setState({ closing: false });
    }
  }
  async quit() {
    if (this.closing || useFeedback.getState().question) return;
    this.closing = true;
    useWorkspace.setState({ closing: true });
    try {
      for (const id of [...useWorkspace.getState().order])
        if (!(await this.confirmClose(id))) return;
      try {
        await this.persist();
      } catch (error) {
        report(error);
        const answer = await useFeedback
          .getState()
          .ask(
            "Preferences could not be saved",
            "Your document decisions are complete. Quit without saving window preferences and session metadata?",
            [
              { value: "cancel", label: "Cancel" },
              { value: "quit", label: "Quit Anyway", kind: "primary" },
            ],
          );
        if (answer !== "quit") return;
      }
      await this.api.exit();
    } catch (error) {
      report(error);
    } finally {
      this.closing = false;
      useWorkspace.setState({ closing: false });
    }
  }
  async persist() {
    const state = useWorkspace.getState();
    const tabs = state.settings.restoreSession
      ? state.order.map((id) => ({
          id,
          cursor: this.editor.get(id).state.selection.main.head,
          scroll: this.editor.get(id).scroll,
        }))
      : [];
    await this.api.persist(state.settings, tabs, state.active);
  }
  format(id: string, ending?: Ending, bom?: boolean, encoding?: Encoding) {
    const session = this.editor.get(id);
    if (ending) session.ending = ending;
    if (encoding) {
      session.encoding = encoding;
      session.bom =
        encoding === "UTF-8 BOM" ||
        encoding === "UTF-16 LE" ||
        encoding === "UTF-16 BE";
    } else if (bom !== undefined) {
      session.bom = bom;
      session.encoding = bom ? "UTF-8 BOM" : "UTF-8";
    }
    this.editor.onChange(id);
    useWorkspace.getState().patch(id, {
      ending: session.ending,
      bom: session.bom,
      encoding: session.encoding,
    });
  }
  async reload(id: string) {
    const info = await this.api.read(id);
    const session = this.editor.get(id);
    const head = Math.min(
      session.state.selection.main.head,
      info.content.replace(/\r\n?/g, "\n").length,
    );
    this.editor.remove(id);
    this.editor.add(info);
    const fresh = this.editor.get(id);
    fresh.state = fresh.state.update({ selection: { anchor: head } }).state;
    const { content: _content, ...metadata } = info;
    useWorkspace.getState().patch(id, {
      ...metadata,
      encoding: info.encoding ?? (info.bom ? "UTF-8 BOM" : "UTF-8"),
      dirty: false,
      ending: "Preserve",
      external: false,
    });
    this.autoSaveBlocked.delete(id);
    this.pollSuppressed.delete(id);
  }
  async checkExternal() {
    if (this.checking || this.closing || useFeedback.getState().question)
      return;
    this.checking = true;
    try {
      for (const id of useWorkspace.getState().order) {
        if (
          !this.editor.get(id).info.path ||
          this.saving.has(id) ||
          this.pollSuppressed.has(id)
        )
          continue;
        let changed = false;
        try {
          changed = await this.api.inspect(id);
        } catch (error) {
          this.pollSuppressed.add(id);
          useWorkspace.getState().patch(id, { external: true });
          report(error);
          continue;
        }
        if (!changed) continue;
        useWorkspace.getState().patch(id, { external: true });
        useWorkspace.getState().activate(id);
        const answer = await useFeedback
          .getState()
          .ask(
            "File changed on disk",
            `“${this.editor.get(id).info.name}” changed outside RustPad. Reload replaces your editor contents. Keep Local blocks overwriting that changed file; use Save As.`,
            [
              { value: "keep", label: "Keep Local Changes" },
              { value: "reload", label: "Reload from Disk", kind: "primary" },
            ],
          );
        if (answer === "reload") await this.reload(id);
        else this.pollSuppressed.add(id);
      }
    } catch (error) {
      report(error);
    } finally {
      this.checking = false;
    }
  }
}
export const documents = new DocumentController();
