import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type {
  Config,
  DocumentInfo,
  Encoding,
  Entry,
  OpenBatch,
  Settings,
  UpdateInfo,
} from "../../types";

function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri())
    return Promise.reject({
      code: "desktop",
      message:
        "Open RustPad desktop app to use native files. Run pnpm tauri dev.",
    });
  return invoke<T>(command, args);
}
export const native = {
  newDocument: () => call<DocumentInfo>("new_document"),
  open: () => call<OpenBatch>("choose_documents"),
  pending: () => call<OpenBatch>("take_pending"),
  read: (id: string) => call<DocumentInfo>("read_document", { id }),
  inspect: (id: string) => call<boolean>("inspect_document", { id }),
  save: (
    id: string,
    content: string,
    ending: string,
    bom: boolean,
    expected: string,
    encoding?: Encoding,
  ) =>
    call<DocumentInfo>("save_document", {
      id,
      content,
      ending,
      bom,
      encoding,
      expected,
    }),
  saveAs: (
    id: string,
    content: string,
    ending: string,
    bom: boolean,
    encoding?: Encoding,
  ) =>
    call<DocumentInfo | null>("save_as_document", {
      id,
      content,
      ending,
      bom,
      encoding,
    }),
  close: (id: string) => call<void>("close_document", { id }),
  config: () => call<Config>("load_config"),
  persist: (
    settings: Settings,
    tabs: { id: string; cursor: number; scroll: number }[],
    active: string | null,
  ) => call<void>("persist_config", { settings, tabs, active }),
  recent: (index: number) => call<OpenBatch>("open_recent", { index }),
  restore: () => call<OpenBatch>("restore_session"),
  exit: () => call<void>("exit_app"),
  chooseFolder: () => call<Entry | null>("choose_folder"),
  checkUpdate: () => call<UpdateInfo>("check_update"),
  openReleasePage: (url: string) => call<void>("open_release_page", { url }),
  listFolder: (id: string) =>
    call<{ entries: Entry[]; truncated: boolean }>("list_folder", { id }),
  openEntry: (id: string) => call<OpenBatch>("open_entry", { id }),
};
export type Native = typeof native;
export async function onNativeEvent(event: string, handler: () => void) {
  return isTauri() ? listen(event, handler) : () => {};
}
