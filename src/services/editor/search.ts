import { SearchQuery, setSearchQuery } from "@codemirror/search";
import type { EditorView } from "@codemirror/view";
export interface FindOptions {
  text: string;
  replace: string;
  caseSensitive: boolean;
  wholeWord: boolean;
  regexp: boolean;
}
export function makeQuery(options: FindOptions) {
  return new SearchQuery({
    search: options.text,
    replace: options.replace,
    caseSensitive: options.caseSensitive,
    wholeWord: options.wholeWord,
    regexp: options.regexp,
  });
}
export function applyQuery(view: EditorView, options: FindOptions) {
  const query = makeQuery(options);
  view.dispatch({ effects: setSearchQuery.of(query) });
  return query.valid;
}
