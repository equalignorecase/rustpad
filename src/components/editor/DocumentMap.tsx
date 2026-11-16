import { useWorkspace } from "../../stores/workspace";
import { useEffect, useRef, useState } from "react";
import { sessions } from "../../services/editor/session";

export function DocumentMap() {
  const active = useWorkspace((state) => state.active);
  const metadata = useWorkspace((state) => state.documents);
  const [content, setContent] = useState<string>("");
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!active) {
      setContent("");
      return;
    }
    const session = sessions.get(active);
    if (session) {
      setContent(session.state.doc.toString());
    }
    // Update on session edit
    const interval = setInterval(() => {
      const s = sessions.get(active);
      if (s) {
        const text = s.state.doc.toString();
        setContent((prev) => (prev !== text ? text : prev));
      }
    }, 500);
    return () => clearInterval(interval);
  }, [active, metadata]);

  if (!active) return null;

  return (
    <aside className="npp-docmap" aria-label="Document Map">
      <div className="npp-docmap-header">Document Map</div>
      <div className="npp-docmap-content" ref={mapRef}>
        <pre className="npp-docmap-pre">{content}</pre>
      </div>
    </aside>
  );
}
