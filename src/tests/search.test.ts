import { expect, it } from "vitest";
import { EditorState } from "@codemirror/state";
import { makeQuery } from "../services/editor/search";
import { languageLabel } from "../services/editor/languages";
it("finds whole words with case and Unicode text", () => {
  const state = EditorState.create({ doc: "Rust rust rustic สวัสดี👋" });
  const query = makeQuery({
    text: "rust",
    replace: "Go",
    wholeWord: true,
    caseSensitive: true,
    regexp: false,
  });
  const cursor = query.getCursor(state);
  expect(cursor.next().value).toMatchObject({ from: 5, to: 9 });
  expect(cursor.next().done).toBe(true);
});
it("validates regex and recognizes required file modes", () => {
  expect(
    makeQuery({
      text: "[",
      replace: "",
      wholeWord: false,
      caseSensitive: false,
      regexp: true,
    }).valid,
  ).toBe(false);
  expect(languageLabel("main.rs", "Auto")).toBe("Rust");
  expect(languageLabel("config.toml", "Auto")).toBe("TOML");
  expect(languageLabel("notes", "Plain text")).toBe("Plain text");
});
