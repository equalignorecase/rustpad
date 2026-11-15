import type { Command } from "../../types";
interface KeyInput {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}
export function shortcut(event: KeyInput): Command | null {
  if (event.isComposing || event.altKey || !(event.metaKey || event.ctrlKey))
    return null;
  const key = event.key.toLowerCase();
  if (event.shiftKey)
    return (
      (
        {
          s: "saveAs",
          p: "palette",
          f: "replace",
          "]": "nextTab",
          "[": "previousTab",
        } as Record<string, Command>
      )[key] ?? null
    );
  return (
    (
      {
        n: "new",
        o: "open",
        s: "save",
        w: "close",
        q: "quit",
        f: "find",
        g: "goto",
        p: "palette",
        ",": "settings",
        b: "sidebar",
      } as Record<string, Command>
    )[key] ?? null
  );
}
