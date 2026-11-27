export type Encoding =
  | "UTF-8"
  | "UTF-8 BOM"
  | "UTF-16 LE"
  | "UTF-16 BE"
  | "Windows-874";
export interface DocumentInfo {
  id: string;
  name: string;
  path: string | null;
  content: string;
  fingerprint: string;
  lineEnding: "LF" | "CRLF" | "CR" | "Mixed";
  bom: boolean;
  encoding?: Encoding;
}
export type Ending = "Preserve" | "LF" | "CRLF";
export interface DocumentMeta extends Omit<DocumentInfo, "content"> {
  dirty: boolean;
  language: string;
  ending: Ending;
  encoding: Encoding;
  external: boolean;
}
export interface Settings {
  theme: "system" | "dark" | "light";
  languageUI?: "en" | "th";
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
  crashRecovery: boolean;
  autoSave: boolean;
  preferredEnding: "LF" | "CRLF";
}
export interface RecoveredBackup {
  backupKey: string;
  document: DocumentInfo;
  draftContent: string;
  draftLineEnding: DocumentInfo["lineEnding"];
  draftBom: boolean;
  draftEncoding: Encoding;
  cursor: number;
  scroll: number;
  diskChanged: boolean;
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
  folder?: Entry;
}
export interface UpdateInfo {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  releaseUrl: string;
  publishedAt: string | null;
  installerUrl?: string | null;
  checksumsUrl?: string | null;
  canAutoUpdate?: boolean;
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
