import { shortcutLabel } from "../../services/documents/shortcuts";
import { FileText, Plus, X } from "lucide-react";
import { useWorkspace } from "../../stores/workspace";
import { documents } from "../../services/documents/controller";
import { report } from "../../stores/feedback";

export function TabBar() {
  const order = useWorkspace((state) => state.order);
  const active = useWorkspace((state) => state.active);
  const metadata = useWorkspace((state) => state.documents);
  const activate = useWorkspace((state) => state.activate);
  const reorder = useWorkspace((state) => state.reorder);

  return (
    <div
      className="npp-tabbar"
      onDoubleClick={(e) => {
        // Double-click empty area on tabbar creates a new tab like Notepad++
        if (
          e.target === e.currentTarget ||
          (e.target as HTMLElement).classList.contains("npp-tab-strip")
        ) {
          void documents.newDocument().catch(report);
        }
      }}
    >
      <div className="npp-tab-strip" role="tablist" aria-label="Open documents">
        {order.map((id) => {
          const doc = metadata[id];
          if (!doc) return null;
          const isActive = active === id;
          const isDirty = doc.dirty;

          return (
            <div
              className={`npp-tab ${isActive ? "active" : ""} ${isDirty ? "dirty" : ""}`}
              key={id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData("text/rustpad-tab", id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                const sourceTab = e.dataTransfer.getData("text/rustpad-tab");
                if (sourceTab) {
                  e.preventDefault();
                  reorder(sourceTab, id);
                }
              }}
              onMouseDown={(e) => {
                // Middle click (button 1) closes tab like Notepad++
                if (e.button === 1) {
                  e.preventDefault();
                  void documents.close(id).catch(report);
                }
              }}
            >
              <button
                role="tab"
                aria-selected={isActive}
                aria-controls="editor-region"
                tabIndex={isActive ? 0 : -1}
                onClick={() => activate(id)}
                title={doc.path ?? doc.name}
                className="npp-tab-btn"
              >
                {/* Notepad++ style floppy / document icon */}
                <span className={`npp-tab-icon ${isDirty ? "dirty" : "saved"}`}>
                  <FileText size={12} />
                </span>
                <span className="npp-tab-title">{doc.name}</span>
                {doc.external && (
                  <span title="Changed on disk" className="external-dot">
                    !
                  </span>
                )}
              </button>
              <button
                className="npp-tab-close"
                aria-label={`Close ${doc.name}`}
                title="Close"
                onClick={(e) => {
                  e.stopPropagation();
                  void documents.close(id).catch(report);
                }}
              >
                <X size={11} strokeWidth={2.5} />
              </button>
            </div>
          );
        })}
      </div>
      <button
        className="npp-new-tab-btn"
        aria-label="New document"
        title={`New document (${shortcutLabel("new")})`}
        onClick={() => documents.newDocument().catch(report)}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
