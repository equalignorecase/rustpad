import { LanguageDescription } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
export const languageModes = [
  "Auto",
  "Plain text",
  "Rust",
  "TypeScript",
  "JavaScript",
  "JSON",
  "HTML",
  "CSS",
  "Markdown",
  "Python",
  "PHP",
  "SQL",
  "TOML",
  "YAML",
  "XML",
  "C",
  "C++",
  "C#",
  "Go",
  "Java",
  "Shell",
];
export function languageFor(name: string, mode: string) {
  if (mode === "Plain text") return null;
  return mode === "Auto"
    ? LanguageDescription.matchFilename(languages, name)
    : LanguageDescription.matchLanguageName(languages, mode, true);
}
export function languageLabel(name: string, mode: string) {
  return languageFor(name, mode)?.name ?? "Plain text";
}
