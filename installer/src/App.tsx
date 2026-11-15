import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronDown,
  FolderOpen,
  Loader2,
  Minus,
  RotateCcw,
  SlidersHorizontal,
  Trash2,
  X,
} from "lucide-react";
import rustpadIcon from "./assets/icon.svg";
import type { InstallOptions, InstallProgress, InstallerInit } from "./types";

type Phase = "loading" | "ready" | "working" | "done" | "error";

const FALLBACK_INIT: InstallerInit = {
  mode: "install",
  version: "0.1.0",
  defaultInstallDir: "C:\\Users\\User\\AppData\\Local\\RustPad",
  existingInstallDir: null,
  installedVersion: null,
  estimatedSizeMb: 18,
  platformSupported: true,
};

const INSTALL_STEPS: ReadonlyArray<{ id: InstallProgress["stage"]; label: string }> = [
  { id: "prepare", label: "Prepare install folder" },
  { id: "extract", label: "Extract RustPad executable" },
  { id: "shortcuts", label: "Create Start Menu & Desktop shortcuts" },
  { id: "registry", label: "Register Explorer & file associations" },
];

const UNINSTALL_STEPS: ReadonlyArray<{ id: InstallProgress["stage"]; label: string }> = [
  { id: "prepare", label: "Close running RustPad instances" },
  { id: "cleanup", label: "Remove shortcuts & program files" },
  { id: "registry", label: "Clean Windows registry & associations" },
];

function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

export default function App() {
  const [init, setInit] = useState<InstallerInit | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [customizing, setCustomizing] = useState(false);
  const [options, setOptions] = useState<InstallOptions>({
    installDir: "",
    startMenuShortcut: true,
    desktopShortcut: true,
    contextMenu: true,
    fileAssociations: true,
  });
  const [progress, setProgress] = useState<InstallProgress>({
    stage: "prepare",
    message: "Preparing...",
    percent: 0,
  });
  const [completedStages, setCompletedStages] = useState<Set<string>>(new Set());
  const [errorMessage, setErrorMessage] = useState<string>("");

  useEffect(() => {
    let active = true;
    async function load() {
      if (!isTauriRuntime()) {
        if (!active) return;
        setInit(FALLBACK_INIT);
        setOptions((prev) => ({ ...prev, installDir: FALLBACK_INIT.defaultInstallDir }));
        setPhase("ready");
        return;
      }

      try {
        const state = await invoke<InstallerInit>("get_installer_state");
        if (!active) return;
        setInit(state);
        setOptions((prev) => ({
          ...prev,
          installDir: state.existingInstallDir ?? state.defaultInstallDir,
        }));
        setPhase("ready");
      } catch (err) {
        if (!active) return;
        setErrorMessage(String(err));
        setPhase("error");
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    listen<InstallProgress>("install-progress", (event) => {
      const next = event.payload;
      setProgress(next);
      setCompletedStages((prev) => {
        const updated = new Set(prev);
        if (next.stage === "extract") updated.add("prepare");
        if (next.stage === "shortcuts") {
          updated.add("prepare");
          updated.add("extract");
        }
        if (next.stage === "registry") {
          updated.add("prepare");
          updated.add("extract");
          updated.add("shortcuts");
          updated.add("cleanup");
        }
        if (next.stage === "cleanup") updated.add("prepare");
        if (next.stage === "done") {
          for (const step of [...INSTALL_STEPS, ...UNINSTALL_STEPS]) {
            updated.add(step.id);
          }
        }
        return updated;
      });
    }).then((fn) => {
      if (cancelled) {
        fn();
      } else {
        unlisten = fn;
      }
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  const isUninstall = init?.mode === "uninstall";
  const steps = useMemo(
    () => (isUninstall ? UNINSTALL_STEPS : INSTALL_STEPS),
    [isUninstall],
  );

  async function handleMinimize() {
    if (!isTauriRuntime()) return;
    await getCurrentWindow().minimize();
  }

  async function handleClose() {
    if (phase === "working") return;
    if (!isTauriRuntime()) return;
    if (isUninstall && phase === "done") {
      await handleFinishUninstall();
      return;
    }
    await getCurrentWindow().close();
  }

  async function handleBrowseDir() {
    if (!isTauriRuntime()) return;
    const picked = await invoke<string | null>("pick_install_dir", {
      currentDir: options.installDir,
    });
    if (picked) {
      setOptions((prev) => ({ ...prev, installDir: picked }));
    }
  }

  async function handleInstall() {
    setCompletedStages(new Set());
    setErrorMessage("");
    setProgress({ stage: "prepare", message: "Preparing install folder...", percent: 8 });
    setPhase("working");
    try {
      await invoke("run_install", { options });
      setPhase("done");
    } catch (err) {
      setErrorMessage(String(err));
      setPhase("error");
    }
  }

  async function handleUninstall() {
    if (!init) return;
    setCompletedStages(new Set());
    setErrorMessage("");
    setProgress({ stage: "prepare", message: "Closing RustPad if open...", percent: 10 });
    setPhase("working");
    try {
      await invoke("run_uninstall", {
        installDir: init.existingInstallDir ?? options.installDir,
      });
      setPhase("done");
    } catch (err) {
      setErrorMessage(String(err));
      setPhase("error");
    }
  }

  async function handleLaunch() {
    if (!isTauriRuntime()) return;
    await invoke("launch_and_exit", { installDir: options.installDir });
  }

  async function handleFinishUninstall() {
    if (!isTauriRuntime()) return;
    await invoke("finish_uninstall", {
      installDir: init?.existingInstallDir ?? options.installDir,
    });
  }

  function toggleOption(
    key: "startMenuShortcut" | "desktopShortcut" | "contextMenu" | "fileAssociations",
  ) {
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--canvas)] text-[var(--text)]">
      {/* Custom Frameless Titlebar */}
      <header
        data-tauri-drag-region
        className="flex h-10 shrink-0 items-center justify-between border-b border-[var(--border)] bg-[var(--surface)] px-3.5"
      >
        <div
          data-tauri-drag-region
          className="flex items-center gap-2 text-xs font-medium text-[var(--muted)]"
        >
          <img src={rustpadIcon} alt="" className="h-4 w-4 rounded-sm" draggable={false} />
          <span>{isUninstall ? "RustPad Uninstaller" : "RustPad Setup"}</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            aria-label="Minimize"
            onClick={handleMinimize}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]"
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            aria-label="Close"
            disabled={phase === "working"}
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--muted)] transition-colors hover:bg-[#3a2628] hover:text-[var(--danger)]"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex flex-1 flex-col justify-between overflow-y-auto px-6 py-5">
        {phase === "loading" || !init ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-[var(--accent)]" />
          </div>
        ) : (
          <>
            {/* Hero Section */}
            <section className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--panel)] shadow-sm">
                <img src={rustpadIcon} alt="RustPad" className="h-10 w-10" draggable={false} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="m-0 text-lg font-semibold tracking-tight text-[var(--text)]">
                    {isUninstall ? "Uninstall RustPad" : "RustPad"}
                  </h1>
                  <span className="rounded-full border border-[var(--border)] bg-[var(--panel)] px-2 py-0.5 text-[11px] font-medium text-[var(--muted)]">
                    v{init.version} · x64
                  </span>
                  {!isUninstall && init.installedVersion && (
                    <span className="rounded-full bg-[#2a3830] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                      Updating v{init.installedVersion}
                    </span>
                  )}
                </div>
                <p className="mt-1 mb-0 text-xs text-[var(--muted)]">
                  {isUninstall
                    ? "Remove RustPad, shortcuts, and Windows integration from your account."
                    : "Fast, native dark-mode text & code editor built with Rust."}
                </p>
              </div>
            </section>

            {/* Body by Mode & Phase */}
            {phase === "ready" && !isUninstall && (
              <section className="animate-enter my-3 flex flex-col gap-3">
                {/* Summary Strip */}
                <div className="rounded-xl border border-[var(--border)] bg-[var(--panel)] p-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--subtle)]">
                        Install destination
                      </div>
                      <div
                        className="mt-0.5 truncate font-mono text-xs text-[var(--text)] select-text"
                        title={options.installDir}
                      >
                        {options.installDir}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setCustomizing((v) => !v)}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] transition-colors hover:bg-[var(--hover)]"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5 text-[var(--accent)]" />
                      <span>Customize</span>
                      <ChevronDown
                        className={`h-3.5 w-3.5 text-[var(--muted)] transition-transform duration-200 ${
                          customizing ? "rotate-180" : ""
                        }`}
                      />
                    </button>
                  </div>

                  {!customizing && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-[var(--border)] pt-2.5 text-[11px] text-[var(--muted)]">
                      <span>~{init.estimatedSizeMb} MB space</span>
                      <span>·</span>
                      <span>Current user (no UAC)</span>
                      <span>·</span>
                      <span>Shortcuts &amp; Explorer menu</span>
                    </div>
                  )}

                  {customizing && (
                    <div className="animate-enter mt-3 flex flex-col gap-3 border-t border-[var(--border)] pt-3">
                      <div>
                        <label
                          htmlFor="install-dir-input"
                          className="mb-1 block text-[11px] font-medium text-[var(--muted)]"
                        >
                          Folder path
                        </label>
                        <div className="flex gap-2">
                          <input
                            id="install-dir-input"
                            type="text"
                            value={options.installDir}
                            onChange={(e) =>
                              setOptions((prev) => ({ ...prev, installDir: e.target.value }))
                            }
                            className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-xs text-[var(--text)] outline-none focus:border-[var(--accent)]"
                          />
                          <button
                            type="button"
                            onClick={handleBrowseDir}
                            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text)] hover:bg-[var(--hover)]"
                          >
                            <FolderOpen className="h-3.5 w-3.5 text-[var(--muted)]" />
                            <span>Browse</span>
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <OptionCheck
                          checked={options.startMenuShortcut}
                          label="Start Menu shortcut"
                          onClick={() => toggleOption("startMenuShortcut")}
                        />
                        <OptionCheck
                          checked={options.desktopShortcut}
                          label="Desktop shortcut"
                          onClick={() => toggleOption("desktopShortcut")}
                        />
                        <OptionCheck
                          checked={options.contextMenu}
                          label="Open with RustPad menu"
                          onClick={() => toggleOption("contextMenu")}
                        />
                        <OptionCheck
                          checked={options.fileAssociations}
                          label="Associate 18 file types"
                          onClick={() => toggleOption("fileAssociations")}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </section>
            )}

            {phase === "ready" && isUninstall && (
              <section className="animate-enter my-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
                <div className="text-[11px] font-medium uppercase tracking-wider text-[var(--subtle)]">
                  Installation directory
                </div>
                <div className="mt-1 truncate font-mono text-xs text-[var(--text)] select-text">
                  {init.existingInstallDir ?? options.installDir}
                </div>
                <ul className="mt-3 mb-0 flex flex-col gap-1.5 pl-4 text-xs text-[var(--muted)]">
                  <li>Remove RustPad application files</li>
                  <li>Delete Start Menu &amp; Desktop shortcuts</li>
                  <li>Remove Explorer context menu &amp; file associations</li>
                </ul>
              </section>
            )}

            {phase === "working" && (
              <section className="animate-enter my-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
                <div className="flex items-center justify-between text-xs font-medium">
                  <span className="text-[var(--text)]">{progress.message}</span>
                  <span className="font-mono text-[var(--accent)]">{progress.percent}%</span>
                </div>

                <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-[var(--surface)]">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      isUninstall ? "bg-[var(--danger)]" : "bg-[var(--accent)]"
                    }`}
                    style={{ width: `${Math.max(4, Math.min(100, progress.percent))}%` }}
                  />
                </div>

                <div className="mt-4 flex flex-col gap-2">
                  {steps.map((step) => {
                    const isDone = completedStages.has(step.id);
                    const isCurrent = progress.stage === step.id && !isDone;
                    return (
                      <div key={step.id} className="flex items-center gap-2.5 text-xs">
                        {isDone ? (
                          <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#2a3830] text-[var(--accent)]">
                            <Check className="h-3 w-3" />
                          </span>
                        ) : isCurrent ? (
                          <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                        ) : (
                          <span className="h-4 w-4 rounded-full border border-[var(--border)] bg-[var(--surface)]" />
                        )}
                        <span
                          className={
                            isDone || isCurrent ? "text-[var(--text)]" : "text-[var(--subtle)]"
                          }
                        >
                          {step.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {phase === "done" && (
              <section className="animate-enter my-4 rounded-xl border border-[var(--border)] bg-[var(--panel)] p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#2a3830] text-[var(--accent)]">
                    <Check className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="m-0 text-sm font-semibold text-[var(--text)]">
                      {isUninstall ? "RustPad has been removed" : "RustPad is ready"}
                    </h2>
                    <p className="mt-1 mb-0 text-xs text-[var(--muted)]">
                      {isUninstall
                        ? "Shortcuts, registry keys, and application files were cleaned up."
                        : "Installed and registered for your Windows account."}
                    </p>
                    {!isUninstall && (
                      <div className="mt-2 truncate rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--muted)] select-text">
                        {options.installDir}
                      </div>
                    )}
                  </div>
                </div>
              </section>
            )}

            {phase === "error" && (
              <section className="animate-enter my-4 rounded-xl border border-[#5c3638] bg-[#2a1f21] p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--danger)]" />
                  <div className="min-w-0 flex-1">
                    <h2 className="m-0 text-sm font-semibold text-[var(--danger)]">
                      {isUninstall ? "Uninstall failed" : "Installation failed"}
                    </h2>
                    <p className="mt-1 mb-0 break-words text-xs text-[var(--text)] select-text">
                      {errorMessage}
                    </p>
                  </div>
                </div>
              </section>
            )}

            {/* Footer Action Row */}
            <footer className="flex items-center justify-between gap-3 pt-1">
              {phase === "ready" && !isUninstall && (
                <>
                  <span className="text-[11px] text-[var(--subtle)]">
                    Per-user install · MIT License
                  </span>
                  <button
                    type="button"
                    disabled={!options.installDir.trim()}
                    onClick={handleInstall}
                    className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-xs font-semibold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)]"
                  >
                    <span>{init.installedVersion ? "Update RustPad" : "Install RustPad"}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}

              {phase === "ready" && isUninstall && (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-xs font-medium text-[var(--text)] hover:bg-[var(--hover)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleUninstall}
                    className="flex items-center gap-2 rounded-lg bg-[var(--danger)] px-5 py-2.5 text-xs font-semibold text-[var(--danger-text)] transition-colors hover:bg-[var(--danger-hover)]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Uninstall RustPad</span>
                  </button>
                </>
              )}

              {phase === "working" && (
                <div className="flex w-full items-center justify-between text-[11px] text-[var(--subtle)]">
                  <span>Please keep this window open...</span>
                  <span>{isUninstall ? "Removing..." : "Installing..."}</span>
                </div>
              )}

              {phase === "done" && !isUninstall && (
                <>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-xs font-medium text-[var(--text)] hover:bg-[var(--hover)]"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={handleLaunch}
                    className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-xs font-semibold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)]"
                  >
                    <span>Launch RustPad</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}

              {phase === "done" && isUninstall && (
                <div className="flex w-full justify-end">
                  <button
                    type="button"
                    onClick={handleFinishUninstall}
                    className="rounded-lg bg-[var(--accent)] px-5 py-2.5 text-xs font-semibold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)]"
                  >
                    Finish
                  </button>
                </div>
              )}

              {phase === "error" && (
                <>
                  <button
                    type="button"
                    onClick={() => setPhase("ready")}
                    className="rounded-lg border border-[var(--border)] bg-[var(--panel)] px-4 py-2 text-xs font-medium text-[var(--text)] hover:bg-[var(--hover)]"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={isUninstall ? handleUninstall : handleInstall}
                    className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-5 py-2.5 text-xs font-semibold text-[var(--accent-text)] transition-colors hover:bg-[var(--accent-hover)]"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span>Try Again</span>
                  </button>
                </>
              )}
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

interface OptionCheckProps {
  checked: boolean;
  label: string;
  onClick: () => void;
}

function OptionCheck({ checked, label, onClick }: OptionCheckProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition-colors ${
        checked
          ? "border-[#4b6054] bg-[#222b26] text-[var(--text)]"
          : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] hover:bg-[var(--hover)]"
      }`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
          checked
            ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-text)]"
            : "border-[var(--border)] bg-[var(--panel)]"
        }`}
      >
        {checked && <Check className="h-3 w-3 stroke-[2.5]" />}
      </span>
      <span className="truncate">{label}</span>
    </button>
  );
}
