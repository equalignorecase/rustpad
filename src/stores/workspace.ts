import { create } from "zustand";
import { isMac } from "../utils/platform";
import type { DocumentInfo, DocumentMeta, Entry, Settings } from "../types";

export function settingsForPlatform(mac: boolean): Settings {
  return {
    theme: "dark",
    languageUI: "en",
    fontFamily: mac ? "Menlo" : "Consolas",
    fontSize: 13,
    tabSize: 4,
    indentWithTabs: false,
    wordWrap: false,
    lineNumbers: true,
    autoIndent: true,
    bracketMatching: true,
    showRecent: true,
    restoreSession: true,
    crashRecovery: true,
    autoSave: false,
    preferredEnding: mac ? "LF" : "CRLF",
  };
}
export const defaultSettings = settingsForPlatform(isMac);
export const fonts = [
  "Consolas",
  "Menlo",
  "SFMono-Regular",
  "Monaco",
  "Courier New",
  "monospace",
];
export function validateSettings(input: unknown): Settings {
  const settings = { ...defaultSettings };
  if (!input || typeof input !== "object") return settings;
  const value = input as Record<string, unknown>;
  for (const key of Object.keys(defaultSettings) as (keyof Settings)[]) {
    if (
      typeof defaultSettings[key] === "boolean" &&
      typeof value[key] === "boolean"
    ) {
      Object.assign(settings, { [key]: value[key] });
    }
  }
  if (["system", "dark", "light"].includes(String(value.theme)))
    settings.theme = value.theme as Settings["theme"];
  if (["en", "th"].includes(String(value.languageUI)))
    settings.languageUI = value.languageUI as Settings["languageUI"];
  if (fonts.includes(String(value.fontFamily)))
    settings.fontFamily = String(value.fontFamily);
  if (typeof value.fontSize === "number" && Number.isFinite(value.fontSize))
    settings.fontSize = Math.min(28, Math.max(10, Math.round(value.fontSize)));
  if (typeof value.tabSize === "number" && Number.isFinite(value.tabSize))
    settings.tabSize = Math.min(8, Math.max(2, Math.round(value.tabSize)));
  if (value.preferredEnding === "CRLF" || value.preferredEnding === "LF")
    settings.preferredEnding = value.preferredEnding;
  return settings;
}

interface Workspace {
  documents: Record<string, DocumentMeta>;
  order: string[];
  active: string | null;
  settings: Settings;
  sidebar: boolean;
  folder: Entry | null;
  recent: string[];
  ready: boolean;
  busy: number;
  closing: boolean;
  add: (doc: DocumentInfo) => void;
  patch: (id: string, change: Partial<DocumentMeta>) => void;
  activate: (id: string) => void;
  remove: (id: string) => void;
  reorder: (id: string, before: string) => void;
  setSettings: (settings: Partial<Settings>) => void;
}
export const useWorkspace = create<Workspace>((set) => ({
  documents: {},
  order: [],
  active: null,
  settings: defaultSettings,
  sidebar: true,
  folder: null,
  recent: [],
  ready: false,
  busy: 0,
  closing: false,
  add: ({ content: _content, ...doc }) =>
    set((state) =>
      state.documents[doc.id]
        ? { active: doc.id }
        : {
            documents: {
              ...state.documents,
              [doc.id]: {
                ...doc,
                encoding: doc.encoding ?? (doc.bom ? "UTF-8 BOM" : "UTF-8"),
                dirty: false,
                language: "Auto",
                ending: "Preserve",
                external: false,
              },
            },
            order: [...state.order, doc.id],
            active: doc.id,
          },
    ),
  patch: (id, change) =>
    set((state) =>
      state.documents[id]
        ? {
            documents: {
              ...state.documents,
              [id]: { ...state.documents[id], ...change },
            },
          }
        : state,
    ),
  activate: (id) =>
    set((state) => (state.documents[id] ? { active: id } : state)),
  remove: (id) =>
    set((state) => {
      const index = state.order.indexOf(id);
      const order = state.order.filter((tab) => tab !== id);
      const documents = { ...state.documents };
      delete documents[id];
      return {
        order,
        documents,
        active:
          state.active === id
            ? (order[Math.min(index, order.length - 1)] ?? null)
            : state.active,
      };
    }),
  reorder: (id, before) =>
    set((state) => {
      if (id === before || !state.documents[id] || !state.documents[before])
        return state;
      const index = state.order.indexOf(before);
      const order = state.order.filter((tab) => tab !== id);
      order.splice(index, 0, id);
      return { order };
    }),
  setSettings: (settings) =>
    set((state) => ({
      settings: validateSettings({ ...state.settings, ...settings }),
    })),
}));

export const useCursor = create<{
  line: number;
  column: number;
  selected: number;
  lines: number;
  set: (value: {
    line: number;
    column: number;
    selected: number;
    lines: number;
  }) => void;
}>((set) => ({ line: 1, column: 1, selected: 0, lines: 1, set }));
