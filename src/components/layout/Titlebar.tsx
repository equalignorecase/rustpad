import { shortcutLabel } from "../../services/documents/shortcuts";
import {
  Braces,
  Command,
  FolderOpen,
  PanelLeft,
  RefreshCw,
  Save,
  Search,
  Settings2,
} from "lucide-react";
import { useState } from "react";
import { useWorkspace } from "../../stores/workspace";
import { promptUpdateCheck } from "../../services/updates";
import type { Command as Action } from "../../types";
export function Titlebar({ run }: { run: (command: Action) => void }) {
  const active = useWorkspace((state) => state.active);
  const name = useWorkspace((state) =>
    state.active ? state.documents[state.active]?.name : undefined,
  );
  const busy = useWorkspace((state) => state.busy);
  const [checking, setChecking] = useState(false);
  const checkForUpdates = () => {
    if (checking) return;
    setChecking(true);
    void promptUpdateCheck().finally(() => setChecking(false));
  };
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <button
          className="icon-button"
          title={`Toggle sidebar (${shortcutLabel("sidebar")})`}
          aria-label="Toggle sidebar"
          onClick={() => run("sidebar")}
        >
          <PanelLeft size={16} />
        </button>
        <span className="titlebar-divider" />
        <Braces size={16} className="brand-mark" />
        <span className="brand-name">RustPad</span>
      </div>
      <div className="window-title" data-tauri-drag-region>
        {name ?? "RustPad"}
        <span>{busy ? "Saving…" : "Text editor"}</span>
      </div>
      <nav className="titlebar-actions" aria-label="Editor actions">
        <button
          className="icon-button"
          aria-label="Open files"
          title={`Open files (${shortcutLabel("open")})`}
          onClick={() => run("open")}
        >
          <FolderOpen size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Save document"
          title={`Save (${shortcutLabel("save")})`}
          disabled={!active || busy > 0}
          onClick={() => run("save")}
        >
          <Save size={16} />
        </button>
        <span className="titlebar-divider" />
        <button
          className="icon-button"
          aria-label="Find in document"
          title={`Find (${shortcutLabel("find")})`}
          disabled={!active}
          onClick={() => run("find")}
        >
          <Search size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Command palette"
          title={`Commands (${shortcutLabel("palette")})`}
          onClick={() => run("palette")}
        >
          <Command size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Settings"
          title={`Settings (${shortcutLabel("settings")})`}
          onClick={() => run("settings")}
        >
          <Settings2 size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Check for updates"
          title="Check for updates on GitHub"
          disabled={checking}
          onClick={checkForUpdates}
        >
          <RefreshCw size={16} className={checking ? "spinning" : undefined} />
        </button>
      </nav>
    </header>
  );
}
