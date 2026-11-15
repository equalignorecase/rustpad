import { shortcutLabel } from "../../services/documents/shortcuts";
import { File, Plus, X } from "lucide-react";
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
    <div className="tabbar">
      <div className="tab-strip" role="tablist" aria-label="Open documents">
        {order.map((id) => (
          <div
            className={`tab ${active === id ? "active" : ""}`}
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
          >
            <button
              role="tab"
              aria-selected={active === id}
              aria-controls="editor-region"
              tabIndex={active === id ? 0 : -1}
              onClick={() => activate(id)}
              onKeyDown={(e) => {
                const index = order.indexOf(id);
                if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  const next =
                    order[
                      (index +
                        (e.key === "ArrowRight" ? 1 : order.length - 1)) %
                        order.length
                    ];
                  activate(next);
                  e.currentTarget
                    .closest('[role="tablist"]')
                    ?.querySelectorAll<HTMLButtonElement>('[role="tab"]')
                    [order.indexOf(next)]?.focus();
                }
                if (
                  e.ctrlKey &&
                  e.shiftKey &&
                  (e.key === "ArrowRight" || e.key === "ArrowLeft")
                )
                  reorder(
                    id,
                    order[
                      (index +
                        (e.key === "ArrowRight" ? 1 : order.length - 1)) %
                        order.length
                    ],
                  );
              }}
              title={metadata[id].path ?? metadata[id].name}
            >
              <File size={13} />
              <span>{metadata[id].name}</span>
              {metadata[id].external && (
                <span title="Changed on disk" className="external-dot">
                  !
                </span>
              )}
            </button>
            <button
              className={`tab-close ${metadata[id].dirty ? "dirty" : ""}`}
              aria-label={`Close ${metadata[id].name}${metadata[id].dirty ? ", unsaved changes" : ""}`}
              onClick={() => documents.close(id).catch(report)}
            >
              {metadata[id].dirty ? (
                <span className="dirty-dot" />
              ) : (
                <X size={13} />
              )}
            </button>
          </div>
        ))}
      </div>
      <button
        className="icon-button new-tab"
        aria-label="New document"
        title={`New document (${shortcutLabel("new")})`}
        onClick={() => documents.newDocument().catch(report)}
      >
        <Plus size={17} />
      </button>
    </div>
  );
}
