import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import appIcon from "../../assets/icon.png";
import { useWorkspace } from "../../stores/workspace";
import { MenuBar } from "./MenuBar";
import type { Command as Action } from "../../types";

export function Titlebar({ run }: { run: (command: Action) => void }) {
  const active = useWorkspace((state) => state.active);
  const name = useWorkspace((state) =>
    state.active ? state.documents[state.active]?.name : undefined,
  );
  const path = useWorkspace((state) =>
    state.active ? state.documents[state.active]?.path : undefined,
  );
  const dirty = useWorkspace((state) =>
    state.active ? state.documents[state.active]?.dirty : false,
  );

  const displayTitle = active
    ? `${dirty ? "*" : ""}${path ?? name ?? "new 1"} - RustPad++`
    : "RustPad++";

  const handleTitleDoubleClick = () => {
    if (!isTauri()) return;
    void getCurrentWindow().toggleMaximize();
  };

  return (
    <header className="npp-header" data-tauri-drag-region>
      <div
        className="npp-title-bar"
        data-tauri-drag-region
        onDoubleClick={handleTitleDoubleClick}
      >
        <div className="npp-title-bar-text" data-tauri-drag-region>
          <img
            src={appIcon}
            alt=""
            className="npp-app-icon h-4 w-4 rounded-sm object-cover"
            draggable={false}
          />
          <span>{displayTitle}</span>
        </div>
      </div>
      <MenuBar run={run} />
    </header>
  );
}
