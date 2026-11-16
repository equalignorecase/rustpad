import {
  FilePlus,
  FolderOpen,
  Save,
  Files,
  X,
  Scissors,
  Copy,
  ClipboardPaste,
  Undo2,
  Redo2,
  Search,
  Replace,
  ZoomIn,
  ZoomOut,
  WrapText,
  Map,
  Printer,
  Settings,
} from "lucide-react";
import { useWorkspace } from "../../stores/workspace";
import { documents } from "../../services/documents/controller";
import { shortcutLabel } from "../../services/documents/shortcuts";
import { useI18n } from "../../services/i18n";
import type { Command } from "../../types";

export function ToolBar({ run }: { run: (command: Command) => void }) {
  const active = useWorkspace((state) => state.active);
  const order = useWorkspace((state) => state.order);
  const busy = useWorkspace((state) => state.busy);
  const settings = useWorkspace((state) => state.settings);
  const setSettings = useWorkspace((state) => state.setSettings);
  const t = useI18n(settings.languageUI ?? "en");

  const canSave = Boolean(active && busy === 0);

  return (
    <div className="npp-toolbar" role="toolbar" aria-label="Toolbar">
      <button
        className="npp-tool-btn"
        title={`${t.new} (${shortcutLabel("new")})`}
        onClick={() => run("new")}
      >
        <FilePlus size={15} className="text-blue-500" />
      </button>
      <button
        className="npp-tool-btn"
        title={`${t.open} (${shortcutLabel("open")})`}
        onClick={() => run("open")}
      >
        <FolderOpen size={15} className="text-amber-500" />
      </button>
      <button
        className="npp-tool-btn"
        title={`${t.save} (${shortcutLabel("save")})`}
        disabled={!canSave}
        onClick={() => run("save")}
      >
        <Save size={15} className="text-emerald-500" />
      </button>
      <button
        className="npp-tool-btn"
        title={t.saveAll}
        disabled={!order.length}
        onClick={() => {
          order.forEach((id) => void documents.save(id));
        }}
      >
        <Files size={15} className="text-teal-600" />
      </button>
      <button
        className="npp-tool-btn"
        title={`${t.close} (${shortcutLabel("close")})`}
        disabled={!active}
        onClick={() => run("close")}
      >
        <X size={15} className="text-rose-500" />
      </button>

      <span className="npp-tool-divider" />

      <button
        className="npp-tool-btn"
        title={t.print}
        onClick={() => window.print()}
      >
        <Printer size={15} className="text-slate-600" />
      </button>

      <span className="npp-tool-divider" />

      <button
        className="npp-tool-btn"
        title={`${t.cut} (Ctrl+X)`}
        disabled={!active}
        onClick={() => document.execCommand("cut")}
      >
        <Scissors size={15} className="text-red-500" />
      </button>
      <button
        className="npp-tool-btn"
        title={`${t.copy} (Ctrl+C)`}
        disabled={!active}
        onClick={() => document.execCommand("copy")}
      >
        <Copy size={15} className="text-sky-500" />
      </button>
      <button
        className="npp-tool-btn"
        title={`${t.paste} (Ctrl+V)`}
        disabled={!active}
        onClick={() => document.execCommand("paste")}
      >
        <ClipboardPaste size={15} className="text-amber-600" />
      </button>

      <span className="npp-tool-divider" />

      <button
        className="npp-tool-btn"
        title={`${t.undo} (Ctrl+Z)`}
        disabled={!active}
        onClick={() => document.execCommand("undo")}
      >
        <Undo2 size={15} className="text-indigo-500" />
      </button>
      <button
        className="npp-tool-btn"
        title={`${t.redo} (Ctrl+Y)`}
        disabled={!active}
        onClick={() => document.execCommand("redo")}
      >
        <Redo2 size={15} className="text-indigo-500" />
      </button>

      <span className="npp-tool-divider" />

      <button
        className="npp-tool-btn"
        title={`${t.find} (${shortcutLabel("find")})`}
        disabled={!active}
        onClick={() => run("find")}
      >
        <Search size={15} className="text-blue-600" />
      </button>
      <button
        className="npp-tool-btn"
        title={`${t.replace} (${shortcutLabel("replace")})`}
        disabled={!active}
        onClick={() => run("replace")}
      >
        <Replace size={15} className="text-purple-600" />
      </button>

      <span className="npp-tool-divider" />

      <button
        className="npp-tool-btn"
        title={t.zoomIn}
        onClick={() =>
          setSettings({
            fontSize: Math.min(32, (settings.fontSize || 14) + 1),
          })
        }
      >
        <ZoomIn size={15} className="text-emerald-600" />
      </button>
      <button
        className="npp-tool-btn"
        title={t.zoomOut}
        onClick={() =>
          setSettings({
            fontSize: Math.max(9, (settings.fontSize || 14) - 1),
          })
        }
      >
        <ZoomOut size={15} className="text-emerald-600" />
      </button>
      <button
        className={`npp-tool-btn ${settings.wordWrap ? "active" : ""}`}
        title={t.wordWrap}
        onClick={() => run("wrap")}
      >
        <WrapText size={15} className="text-orange-500" />
      </button>
      <button
        className="npp-tool-btn"
        title={t.docMap}
        onClick={() => run("sidebar")}
      >
        <Map size={15} className="text-teal-600" />
      </button>

      <span className="npp-tool-divider" />

      <button
        className="npp-tool-btn"
        title={`${t.preferences} (${shortcutLabel("settings")})`}
        onClick={() => run("settings")}
      >
        <Settings size={15} className="text-slate-600" />
      </button>
    </div>
  );
}
