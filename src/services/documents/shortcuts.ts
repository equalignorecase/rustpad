import type { Command } from "../../types";
import { isMac } from "../../utils/platform";
interface KeyInput {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
  isComposing?: boolean;
}
export function shortcut(event: KeyInput, mac = isMac): Command | null {
  if (event.isComposing || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (event.ctrlKey && !event.metaKey && key === "tab")
    return event.shiftKey ? "previousTab" : "nextTab";
  if (mac ? !event.metaKey : !event.ctrlKey || event.metaKey) return null;
  if (event.shiftKey)
    return (
      (
        {
          s: "saveAs",
          p: "palette",
          f: "replace",
          "]": "nextTab",
          "}": "nextTab",
          "[": "previousTab",
          "{": "previousTab",
        } as Record<string, Command>
      )[key] ?? null
    );
  if (!mac && key === "h") return "replace";
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
const keys: Partial<Record<Command, [string, boolean?]>> = {
  new: ["N"],
  open: ["O"],
  save: ["S"],
  saveAs: ["S", true],
  close: ["W"],
  quit: ["Q"],
  find: ["F"],
  replace: ["F", true],
  goto: ["G"],
  palette: ["P", true],
  settings: [","],
  sidebar: ["B"],
  nextTab: ["]", true],
  previousTab: ["[", true],
};
export function shortcutLabel(command: Command, mac = isMac): string {
  if (!mac) {
    if (command === "quit") return "Alt+F4";
    if (command === "replace") return "Ctrl+H";
    if (command === "nextTab") return "Ctrl+Tab";
    if (command === "previousTab") return "Ctrl+Shift+Tab";
  }
  const binding = keys[command];
  if (!binding) return "";
  const [key, shift] = binding;
  return mac
    ? `${shift ? "⇧" : ""}⌘${key}`
    : `Ctrl+${shift ? "Shift+" : ""}${key}`;
}
