import { shortcutLabel } from "../../services/documents/shortcuts";
import { useState } from "react";
import { Search } from "lucide-react";
import { Modal } from "../ui/dialog";
import type { Command } from "../../types";
export const commands: { id: Command; label: string }[] = [
  { id: "new", label: "New document" },
  { id: "open", label: "Open files…" },
  { id: "folder", label: "Open folder…" },
  { id: "save", label: "Save document" },
  { id: "saveAs", label: "Save document as…" },
  { id: "close", label: "Close tab" },
  { id: "find", label: "Find in document" },
  { id: "replace", label: "Find and replace" },
  { id: "goto", label: "Go to line / column…" },
  { id: "wrap", label: "Toggle word wrap" },
  { id: "sidebar", label: "Toggle sidebar" },
  { id: "settings", label: "Open settings" },
  { id: "nextTab", label: "Next tab" },
  { id: "previousTab", label: "Previous tab" },
  { id: "quit", label: "Quit RustPad" },
];
export function CommandPalette({
  onClose,
  run,
}: {
  onClose: () => void;
  run: (command: Command) => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const results = commands.filter((command) =>
    command.label.toLowerCase().includes(query.toLowerCase()),
  );
  function execute(command: Command) {
    onClose();
    setTimeout(() => run(command), 0);
  }
  return (
    <Modal
      title="Commands"
      description="Search actions and keyboard shortcuts."
      open
      onClose={onClose}
      className="palette"
    >
      <div className="palette-input">
        <Search size={17} />
        <input
          aria-label="Search commands"
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setSelected((value) => Math.min(results.length - 1, value + 1));
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setSelected((value) => Math.max(0, value - 1));
            }
            if (e.key === "Enter" && results[selected])
              execute(results[selected].id);
          }}
          placeholder="Type a command…"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-results"
          aria-activedescendant={
            results[selected] ? `command-${results[selected].id}` : undefined
          }
        />
      </div>
      <div
        id="command-results"
        role="listbox"
        aria-label="Commands"
        className="command-list"
      >
        {results.map((command, index) => (
          <button
            id={`command-${command.id}`}
            role="option"
            aria-selected={selected === index}
            className={selected === index ? "selected" : ""}
            key={command.id}
            onMouseEnter={() => setSelected(index)}
            onClick={() => execute(command.id)}
          >
            <span>{command.label}</span>
            <kbd>{shortcutLabel(command.id)}</kbd>
          </button>
        ))}
        {!results.length && (
          <p className="empty-results">No matching commands.</p>
        )}
      </div>
    </Modal>
  );
}
