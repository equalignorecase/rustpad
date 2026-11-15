import {
  Compartment,
  EditorState,
  type Extension,
  type Text,
} from "@codemirror/state";
import { history } from "@codemirror/commands";
import type { DocumentInfo, Encoding, Ending } from "../../types";

export interface Snapshot {
  text: Text;
  content: string;
  ending: Ending;
  bom: boolean;
  encoding: Encoding;
}
interface Session {
  info: DocumentInfo;
  state: EditorState;
  saved: Text;
  savedBom: boolean;
  savedEncoding: Encoding;
  ending: Ending;
  bom: boolean;
  encoding: Encoding;
  scroll: number;
  configuration: Compartment;
}
export class EditorSession {
  private sessions = new Map<string, Session>();
  onChange: (id: string) => void = () => {};
  onEdit: (id: string) => void = () => {};
  add(info: DocumentInfo, extensions: Extension = []) {
    if (this.sessions.has(info.id)) return;
    const configuration = new Compartment();
    const state = EditorState.create({
      doc: info.content.replace(/\r\n?/g, "\n"),
      extensions: [history(), configuration.of(extensions)],
    });
    const encoding = info.encoding ?? (info.bom ? "UTF-8 BOM" : "UTF-8");
    this.sessions.set(info.id, {
      info,
      state,
      saved: state.doc,
      savedBom: info.bom,
      savedEncoding: encoding,
      ending: "Preserve",
      bom: info.bom,
      encoding,
      scroll: 0,
      configuration,
    });
  }
  get(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) throw new Error("Document is no longer open.");
    return session;
  }
  update(id: string, state: EditorState) {
    const session = this.get(id);
    const changed = session.state.doc !== state.doc;
    session.state = state;
    this.onChange(id);
    if (changed) this.onEdit(id);
  }
  isDirty(id: string) {
    const session = this.get(id);
    return (
      !session.state.doc.eq(session.saved) ||
      session.bom !== session.savedBom ||
      session.encoding !== session.savedEncoding ||
      session.ending !== "Preserve"
    );
  }
  snapshot(id: string): Snapshot {
    const session = this.get(id);
    return {
      text: session.state.doc,
      content: session.state.doc.toString(),
      ending: session.ending,
      bom: session.bom,
      encoding: session.encoding,
    };
  }
  saved(id: string, info: DocumentInfo, snapshot: Snapshot) {
    const session = this.get(id);
    session.info = info;
    session.saved = snapshot.text;
    session.savedBom = snapshot.bom;
    session.savedEncoding = info.encoding ?? snapshot.encoding;
    session.encoding = session.savedEncoding;
    if (session.ending === snapshot.ending) session.ending = "Preserve";
    this.onChange(id);
  }
  remove(id: string) {
    this.sessions.delete(id);
  }
}
export const sessions = new EditorSession();
