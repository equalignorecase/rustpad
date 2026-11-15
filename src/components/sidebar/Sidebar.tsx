import { pathLabel } from "../../utils/paths";
import { useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Clock3,
  File,
  Folder,
  FolderOpen,
  Plus,
} from "lucide-react";
import { useWorkspace } from "../../stores/workspace";
import { native } from "../../services/tauri";
import { documents } from "../../services/documents/controller";
import { report } from "../../stores/feedback";
import type { Entry } from "../../types";
function FileTree({ entry, depth = 0 }: { entry: Entry; depth?: number }) {
  const [children, setChildren] = useState<Entry[] | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  async function click() {
    if (!entry.directory) {
      await documents.openEntry(entry.id);
      return;
    }
    if (!children) {
      setLoading(true);
      try {
        const listing = await native.listFolder(entry.id);
        setChildren(listing.entries);
        setTruncated(listing.truncated);
      } finally {
        setLoading(false);
      }
    }
    setExpanded(!expanded);
  }
  return (
    <div>
      <button
        className="tree-entry"
        style={{ paddingLeft: 12 + depth * 13 }}
        onClick={() => click().catch(report)}
        aria-expanded={entry.directory ? expanded : undefined}
        disabled={loading}
        title={entry.name}
      >
        {entry.directory ? (
          expanded ? (
            <ChevronDown size={12} />
          ) : (
            <ChevronRight size={12} />
          )
        ) : (
          <span className="tree-spacer" />
        )}
        {entry.directory ? <Folder size={14} /> : <File size={14} />}
        <span>{entry.name}</span>
        {loading && <small>Loading…</small>}
      </button>
      {expanded &&
        children?.map((child) => (
          <FileTree entry={child} depth={depth + 1} key={child.id} />
        ))}
      {expanded && children?.length === 0 && (
        <p className="tree-note">Empty folder</p>
      )}
      {expanded && truncated && (
        <p className="tree-note">Showing first 500 entries.</p>
      )}
    </div>
  );
}
export function Sidebar({
  folder,
  openFolder,
}: {
  folder: Entry | null;
  openFolder: () => void;
}) {
  const order = useWorkspace((state) => state.order);
  const metadata = useWorkspace((state) => state.documents);
  const active = useWorkspace((state) => state.active);
  const activate = useWorkspace((state) => state.activate);
  const recent = useWorkspace((state) => state.recent);
  const showRecent = useWorkspace((state) => state.settings.showRecent);
  const [filesExpanded, setFilesExpanded] = useState(true);
  const [recentExpanded, setRecentExpanded] = useState(true);
  return (
    <aside className="sidebar" aria-label="File explorer">
      <div className="sidebar-title">
        <span>Explorer</span>
        <div>
          <button
            className="icon-button"
            aria-label="Open folder"
            title="Open folder"
            onClick={openFolder}
          >
            <FolderOpen size={15} />
          </button>
          <button
            className="icon-button"
            aria-label="Create document"
            title="New document"
            onClick={() => documents.newDocument().catch(report)}
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
      <section>
        <button
          className="section-heading"
          onClick={() => setFilesExpanded(!filesExpanded)}
          aria-expanded={filesExpanded}
        >
          {filesExpanded ? (
            <ChevronDown size={13} />
          ) : (
            <ChevronRight size={13} />
          )}
          Open files<span>{order.length}</span>
        </button>
        {filesExpanded && (
          <div className="open-files">
            {order.map((id) => (
              <button
                key={id}
                className={`file-row ${active === id ? "selected" : ""}`}
                title={metadata[id].path ?? metadata[id].name}
                onClick={() => activate(id)}
              >
                <File size={14} />
                <span>{metadata[id].name}</span>
                {metadata[id].dirty && (
                  <span className="dirty-dot" aria-label="Unsaved" />
                )}
              </button>
            ))}
            {!order.length && <p className="sidebar-note">No open files</p>}
          </div>
        )}
      </section>
      <section className="folder-section">
        {folder ? (
          <FileTree key={folder.id + folder.name} entry={folder} />
        ) : (
          <div className="folder-empty">
            <Folder size={21} strokeWidth={1.3} />
            <p>Bring a project into view.</p>
            <button className="button small" onClick={openFolder}>
              Open folder…
            </button>
          </div>
        )}
      </section>
      {showRecent && (
        <section>
          <button
            className="section-heading"
            aria-expanded={recentExpanded}
            onClick={() => setRecentExpanded(!recentExpanded)}
          >
            {recentExpanded ? (
              <ChevronDown size={13} />
            ) : (
              <ChevronRight size={13} />
            )}
            Recent files
            <Clock3 size={12} />
          </button>
          {recentExpanded && (
            <div className="recent-files">
              {recent.slice(0, 8).map((path, index) => (
                <button
                  key={path}
                  className="file-row recent-row"
                  title={path}
                  onClick={() => documents.recent(index).catch(report)}
                >
                  <File size={13} />
                  <span>
                    {pathLabel(path).name}
                    <small>{pathLabel(path).parent}</small>
                  </span>
                </button>
              ))}
              {!recent.length && (
                <p className="sidebar-note">Opened files will appear here.</p>
              )}
            </div>
          )}
        </section>
      )}
      <div className="sidebar-footer">
        <span className="local-dot" />
        On this device<span>Offline</span>
      </div>
    </aside>
  );
}
