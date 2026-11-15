export interface DocumentInfo {
  id: string;
  name: string;
  path: string | null;
  content: string;
  fingerprint: string;
  lineEnding: "LF" | "CRLF" | "CR" | "Mixed";
  bom: boolean;
}
export type Ending = "Preserve" | "LF" | "CRLF";
export interface DocumentMeta extends Omit<DocumentInfo, "content"> {
  dirty: boolean;
  language: string;
  ending: Ending;
  external: boolean;
}
export interface Settings {
  theme: "system" | "dark" | "light";
  fontFamily: string;
  fontSize: number;
  tabSize: number;
  indentWithTabs: boolean;
  wordWrap: boolean;
  lineNumbers: boolean;
  autoIndent: boolean;
  bracketMatching: boolean;
  showRecent: boolean;
  restoreSession: boolean;
  autoSave: boolean;
  preferredEnding: "LF" | "CRLF";
}
export interface Config {
  version: number;
  settings: unknown;
  recent: string[];
  tabs: { path: string; cursor: number; scroll: number }[];
  active: string | null;
}
export interface AppError {
  code: string;
  message: string;
}
export interface OpenBatch {
  documents: DocumentInfo[];
  errors: AppError[];
}
export interface Entry {
  id: string;
  name: string;
  directory: boolean;
}
export type Command =
  | "new"
  | "open"
  | "save"
  | "saveAs"
  | "close"
  | "quit"
  | "find"
  | "replace"
  | "goto"
  | "palette"
  | "settings"
  | "sidebar"
  | "wrap"
  | "folder"
  | "nextTab"
  | "previousTab";
