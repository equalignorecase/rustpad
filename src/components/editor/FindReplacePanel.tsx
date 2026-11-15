import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, X } from "lucide-react";
import {
  findNext,
  findPrevious,
  replaceAll,
  replaceNext,
} from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
import { applyQuery, type FindOptions } from "../../services/editor/search";
export function FindReplacePanel({
  view,
  replace,
  onClose,
}: {
  view: EditorView | null;
  replace: boolean;
  onClose: () => void;
}) {
  const [expanded, setExpanded] = useState(replace);
  const [options, setOptions] = useState<FindOptions>({
    text: "",
    replace: "",
    caseSensitive: false,
    wholeWord: false,
    regexp: false,
  });
  const [valid, setValid] = useState(true);
  useEffect(() => {
    setExpanded(replace);
  }, [replace]);
  useEffect(() => {
    if (view) {
      const validQuery = applyQuery(view, options);
      setValid(!options.text || validQuery);
    }
  }, [view, options]);
  const set = (change: Partial<FindOptions>) =>
    setOptions((current) => ({ ...current, ...change }));
  return (
    <section
      className="find-panel"
      aria-label="Find and replace"
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          onClose();
          view?.focus();
        }
      }}
    >
      <div className="find-row">
        <button
          className="icon-button"
          aria-label={expanded ? "Hide replace" : "Show replace"}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
        </button>
        <input
          autoFocus
          aria-label="Find text"
          value={options.text}
          onChange={(e) => set({ text: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && view) {
              e.preventDefault();
              if (e.shiftKey) findPrevious(view);
              else findNext(view);
            }
          }}
          placeholder="Find in document"
          aria-invalid={!valid}
        />
        {(["caseSensitive", "wholeWord", "regexp"] as const).map((key, i) => (
          <button
            key={key}
            className={`find-option ${options[key] ? "enabled" : ""}`}
            aria-label={["Match case", "Whole word", "Regular expression"][i]}
            title={["Match case", "Whole word", "Regular expression"][i]}
            aria-pressed={options[key]}
            onClick={() => set({ [key]: !options[key] })}
          >
            {["Aa", "ab", ".*"][i]}
          </button>
        ))}
        <button
          className="icon-button"
          aria-label="Previous match"
          disabled={!valid || !options.text}
          onClick={() => view && findPrevious(view)}
        >
          <ArrowUp size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="Next match"
          disabled={!valid || !options.text}
          onClick={() => view && findNext(view)}
        >
          <ArrowDown size={15} />
        </button>
        <button
          className="icon-button"
          aria-label="Close find"
          onClick={() => {
            onClose();
            view?.focus();
          }}
        >
          <X size={15} />
        </button>
      </div>
      {expanded && (
        <div className="find-row replace-row">
          <input
            aria-label="Replace text"
            value={options.replace}
            onChange={(e) => set({ replace: e.target.value })}
            placeholder="Replace with"
          />
          <button
            className="button small"
            disabled={!valid || !options.text}
            onClick={() => view && replaceNext(view)}
          >
            Replace
          </button>
          <button
            className="button small"
            disabled={!valid || !options.text}
            onClick={() => view && replaceAll(view)}
          >
            Replace All
          </button>
        </div>
      )}
      {!valid && (
        <p className="find-error" role="alert">
          Invalid regular expression.
        </p>
      )}
    </section>
  );
}
