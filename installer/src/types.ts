export type SetupMode = "install" | "uninstall";

export interface InstallerInit {
  mode: SetupMode;
  version: string;
  defaultInstallDir: string;
  existingInstallDir: string | null;
  installedVersion: string | null;
  estimatedSizeMb: number;
  platformSupported: boolean;
}

export interface InstallOptions {
  installDir: string;
  startMenuShortcut: boolean;
  desktopShortcut: boolean;
  contextMenu: boolean;
  fileAssociations: boolean;
}

export interface InstallProgress {
  stage: "prepare" | "extract" | "shortcuts" | "registry" | "cleanup" | "done";
  message: string;
  percent: number;
}
