import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@tauri-apps/api/core";
import { Titlebar } from "./components/layout/Titlebar";
import { TabBar } from "./components/tabs/TabBar";
import { Sidebar } from "./components/sidebar/Sidebar";
import { EditorPane, runEditorCommand } from "./components/editor/EditorPane";
import { StatusBar } from "./components/statusbar/StatusBar";
import { SettingsDialog } from "./components/dialogs/SettingsDialog";
import { CommandPalette } from "./components/dialogs/CommandPalette";
import { UnsavedChangesDialog } from "./components/dialogs/UnsavedChangesDialog";
import { ToastSystem } from "./components/dialogs/ToastSystem";
import { useWorkspace } from "./stores/workspace";
import { report, useFeedback } from "./stores/feedback";
import { documents } from "./services/documents/controller";
import { native, onNativeEvent } from "./services/tauri";
import { shortcut } from "./services/documents/shortcuts";
import type { Command, Entry } from "./types";
import "./themes/app.css";

export default function App() {
  const sidebar = useWorkspace((state) => state.sidebar);
  const theme = useWorkspace((state) => state.settings.theme);
  const closing = useWorkspace((state) => state.closing);
  const [settings, setSettings] = useState(false);
  const [palette, setPalette] = useState(false);
  const [find, setFind] = useState<"find" | "replace" | null>(null);
  const [folder, setFolder] = useState<Entry | null>(null);
  const openFolder = useCallback(() => {
    native
      .chooseFolder()
      .then((value) => {
        if (value) {
          setFolder(value);
          useWorkspace.setState({ sidebar: true });
        }
      })
      .catch(report);
  }, []);
  const run = useCallback(
    (command: Command) => {
      if (useFeedback.getState().question) return;
      const state = useWorkspace.getState();
      if (state.closing) return;
      switch (command) {
        case "new":
          void documents.newDocument().catch(report);
          break;
        case "open":
          void documents.open().catch(report);
          break;
        case "folder":
          openFolder();
          break;
        case "save":
          void documents.save();
          break;
        case "saveAs":
          void documents.save(state.active, true);
          break;
        case "close":
          void documents.close().catch(report);
          break;
        case "quit":
          void documents.quit();
          break;
        case "find":
        case "replace":
          if (state.active) setFind(command);
          break;
        case "goto":
          if (state.active) runEditorCommand(command);
          break;
        case "palette":
          setPalette(true);
          break;
        case "settings":
          setSettings(true);
          break;
        case "sidebar":
          useWorkspace.setState({ sidebar: !state.sidebar });
          break;
        case "wrap":
          state.setSettings({ wordWrap: !state.settings.wordWrap });
          break;
        case "nextTab":
        case "previousTab": {
          const index = state.active ? state.order.indexOf(state.active) : 0;
          const next =
            state.order[
              (index + (command === "nextTab" ? 1 : state.order.length - 1)) %
                state.order.length
            ];
          if (next) state.activate(next);
          break;
        }
      }
    },
    [openFolder],
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [theme]);
  useEffect(() => {
    void documents.initialize();
    let disposed = false;
    const registrations = Promise.all([
      onNativeEvent("request-close", () => void documents.quit()),
      onNativeEvent(
        "files-available",
        () => void documents.pending().catch(report),
      ),
    ]);
    void registrations
      .then((listeners) => {
        if (disposed) listeners.forEach((unlisten) => unlisten());
      })
      .catch(report);
    const interval = setInterval(() => {
      if (!document.hidden && isTauri()) void documents.checkExternal();
    }, 3000);
    let persistTimer: ReturnType<typeof setTimeout>;
    const unsubscribe = useWorkspace.subscribe((state, previous) => {
      if (!state.ready || !isTauri()) return;
      if (
        state.settings !== previous.settings ||
        state.order !== previous.order ||
        state.active !== previous.active ||
        state.recent !== previous.recent
      ) {
        clearTimeout(persistTimer);
        persistTimer = setTimeout(() => documents.persist().catch(report), 700);
      }
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        !isTauri() &&
        useWorkspace
          .getState()
          .order.some((id) => useWorkspace.getState().documents[id].dirty)
      ) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      disposed = true;
      void registrations.then((listeners) =>
        listeners.forEach((unlisten) => unlisten()),
      );
      clearInterval(interval);
      clearTimeout(persistTimer);
      unsubscribe();
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const command = shortcut(event);
      if (
        command &&
        !settings &&
        !palette &&
        !useFeedback.getState().question
      ) {
        event.preventDefault();
        event.stopPropagation();
        run(command);
      }
    };
    const showSettings = () => setSettings(true);
    window.addEventListener("keydown", keyboard, true);
    window.addEventListener("rustpad-settings", showSettings);
    return () => {
      window.removeEventListener("keydown", keyboard, true);
      window.removeEventListener("rustpad-settings", showSettings);
    };
  }, [run, settings, palette]);
  return (
    <div className="app-shell">
      <Titlebar run={run} />
      <div className="workspace">
        {sidebar && <Sidebar folder={folder} openFolder={openFolder} />}
        <div className="document-area">
          <TabBar />
          <div className="document-location">
            <span>{folder?.name ?? "Workspace"}</span>
            <span>/</span>
            <ActiveName />
          </div>
          <div id="editor-region" className="editor-region">
            <EditorPane
              findMode={find}
              closeFind={() => setFind(null)}
              run={run}
            />
          </div>
        </div>
      </div>
      <StatusBar />
      <SettingsDialog open={settings} onClose={() => setSettings(false)} />
      {palette && (
        <CommandPalette onClose={() => setPalette(false)} run={run} />
      )}
      {closing && <div className="closing-blocker" aria-hidden="true" />}
      <UnsavedChangesDialog />
      <ToastSystem />
    </div>
  );
}
function ActiveName() {
  const name = useWorkspace((state) =>
    state.active ? state.documents[state.active]?.name : undefined,
  );
  return <span>{name ?? "No document selected"}</span>;
}
