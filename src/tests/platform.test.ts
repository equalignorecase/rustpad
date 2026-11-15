import { describe, expect, it } from "vitest";
import { shortcut, shortcutLabel } from "../services/documents/shortcuts";
import { settingsForPlatform } from "../stores/workspace";
import { pathLabel } from "../utils/paths";

describe("Windows keyboard conventions", () => {
  it("dispatches Ctrl commands and ignores Win-key, AltGr and IME chords", () => {
    expect(shortcut({ key: "s", ctrlKey: true }, false)).toBe("save");
    expect(shortcut({ key: "s", ctrlKey: true, shiftKey: true }, false)).toBe(
      "saveAs",
    );
    expect(shortcut({ key: "h", ctrlKey: true }, false)).toBe("replace");
    expect(shortcut({ key: "n", metaKey: true }, false)).toBe(null);
    expect(shortcut({ key: "s", ctrlKey: true, altKey: true }, false)).toBe(
      null,
    );
    expect(
      shortcut({ key: "n", ctrlKey: true, isComposing: true }, false),
    ).toBe(null);
  });
  it("switches tabs using Ctrl+Tab and handles shifted bracket key values", () => {
    expect(shortcut({ key: "Tab", ctrlKey: true }, false)).toBe("nextTab");
    expect(shortcut({ key: "Tab", ctrlKey: true, shiftKey: true }, false)).toBe(
      "previousTab",
    );
    expect(shortcut({ key: "}", metaKey: true, shiftKey: true }, true)).toBe(
      "nextTab",
    );
    expect(shortcut({ key: "{", metaKey: true, shiftKey: true }, true)).toBe(
      "previousTab",
    );
  });
  it("shows platform shortcuts matching keyboard and native window actions", () => {
    expect(shortcutLabel("saveAs", false)).toBe("Ctrl+Shift+S");
    expect(shortcutLabel("replace", false)).toBe("Ctrl+H");
    expect(shortcutLabel("nextTab", false)).toBe("Ctrl+Tab");
    expect(shortcutLabel("quit", false)).toBe("Alt+F4");
    expect(shortcutLabel("saveAs", true)).toBe("⇧⌘S");
  });
});

it("uses Windows editor defaults without changing macOS defaults", () => {
  expect(settingsForPlatform(false)).toMatchObject({
    fontFamily: "Consolas",
    preferredEnding: "CRLF",
    autoSave: false,
  });
  expect(settingsForPlatform(true)).toMatchObject({
    fontFamily: "Menlo",
    preferredEnding: "LF",
  });
});
it("renders Windows, UNC and macOS recent-file labels", () => {
  expect(pathLabel("C:\\Users\\ผู้ใช้\\notes.txt")).toEqual({
    name: "notes.txt",
    parent: "ผู้ใช้",
  });
  expect(pathLabel("\\\\server\\share\\project\\main.rs")).toEqual({
    name: "main.rs",
    parent: "project",
  });
  expect(pathLabel("/Users/user/project/main.rs")).toEqual({
    name: "main.rs",
    parent: "project",
  });
});
