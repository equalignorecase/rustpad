import {
  Braces,
  Command,
  FolderOpen,
  PanelLeft,
  Save,
  Search,
  Settings2,
} from "lucide-react";
import { useWorkspace } from "../../stores/workspace";
import type { Command as Action } from "../../types";
export function Titlebar({ run }: { run: (command: Action) => void }) {
  const active = useWorkspace((state) => state.active);
  const name = useWorkspace((state) =>
    state.active ? state.documents[state.active]?.name : undefined,
  );
  const busy = useWorkspace((state) => state.busy);
  return (
    <header className="titlebar" data-tauri-drag-region>
      <div className="titlebar-left" data-tauri-drag-region>
        <button
          className="icon-button"
          title="Toggle sidebar (⌘B)"
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
          title="Open files (⌘O)"
          onClick={() => run("open")}
        >
          <FolderOpen size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Save document"
          title="Save (⌘S)"
          disabled={!active || busy > 0}
          onClick={() => run("save")}
        >
          <Save size={16} />
        </button>
        <span className="titlebar-divider" />
        <button
          className="icon-button"
          aria-label="Find in document"
          title="Find (⌘F)"
          disabled={!active}
          onClick={() => run("find")}
        >
          <Search size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Command palette"
          title="Commands (⇧⌘P)"
          onClick={() => run("palette")}
        >
          <Command size={16} />
        </button>
        <button
          className="icon-button"
          aria-label="Settings"
          title="Settings (⌘,)"
          onClick={() => run("settings")}
        >
          <Settings2 size={16} />
        </button>
      </nav>
    </header>
  );
}
