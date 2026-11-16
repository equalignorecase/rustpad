import { useState, useRef, useEffect } from "react";
import { shortcutLabel } from "../../services/documents/shortcuts";
import { useWorkspace } from "../../stores/workspace";
import { documents } from "../../services/documents/controller";
import { promptUpdateCheck } from "../../services/updates";
import { languageModes } from "../../services/editor/languages";
import { useI18n } from "../../services/i18n";
import type { Command, Encoding } from "../../types";

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  disabled?: boolean;
  divider?: boolean;
}

export function MenuBar({ run }: { run: (command: Command) => void }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const active = useWorkspace((state) => state.active);
  const order = useWorkspace((state) => state.order);
  const recent = useWorkspace((state) => state.recent);
  const wordWrap = useWorkspace((state) => state.settings.wordWrap);
  const langUI = useWorkspace((state) => state.settings.languageUI ?? "en");
  const t = useI18n(langUI);
  const doc = useWorkspace((state) => (active ? state.documents[active] : undefined));
  const patch = useWorkspace((state) => state.patch);
  const menuBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (menuBarRef.current && !menuBarRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    };
    window.addEventListener("mousedown", handleOutsideClick);
    return () => window.removeEventListener("mousedown", handleOutsideClick);
  }, []);

  const encodings: Encoding[] = [
    "UTF-8",
    "UTF-8 BOM",
    "UTF-16 LE",
    "UTF-16 BE",
    "Windows-874",
  ];

  const menus: Record<string, MenuItem[]> = {
    [t.file]: [
      {
        label: t.new,
        shortcut: shortcutLabel("new"),
        action: () => run("new"),
      },
      {
        label: t.open,
        shortcut: shortcutLabel("open"),
        action: () => run("open"),
      },
      {
        label: t.openFolder,
        action: () => run("folder"),
      },
      ...(recent.length > 0
        ? [
            { divider: true, label: "" },
            ...recent.slice(0, 5).map((path, idx) => ({
              label: `${idx + 1}: ${path.split(/[/\\]/).pop() || path}`,
              action: () => {
                void documents.recent(idx);
              },
            })),
          ]
        : []),
      { divider: true, label: "" },
      {
        label: t.save,
        shortcut: shortcutLabel("save"),
        disabled: !active,
        action: () => run("save"),
      },
      {
        label: t.saveAs,
        shortcut: shortcutLabel("saveAs"),
        disabled: !active,
        action: () => run("saveAs"),
      },
      {
        label: t.saveAll,
        disabled: !order.length,
        action: () => {
          order.forEach((id) => void documents.save(id));
        },
      },
      { divider: true, label: "" },
      {
        label: t.close,
        shortcut: shortcutLabel("close"),
        disabled: !active,
        action: () => run("close"),
      },
      {
        label: t.closeAll,
        disabled: !order.length,
        action: () => {
          [...order].forEach((id) => void documents.close(id));
        },
      },
      { divider: true, label: "" },
      {
        label: t.exit,
        shortcut: shortcutLabel("quit"),
        action: () => run("quit"),
      },
    ],
    [t.edit]: [
      {
        label: t.undo,
        shortcut: "Ctrl+Z",
        disabled: !active,
        action: () => document.execCommand("undo"),
      },
      {
        label: t.redo,
        shortcut: "Ctrl+Y",
        disabled: !active,
        action: () => document.execCommand("redo"),
      },
      { divider: true, label: "" },
      {
        label: t.cut,
        shortcut: "Ctrl+X",
        disabled: !active,
        action: () => document.execCommand("cut"),
      },
      {
        label: t.copy,
        shortcut: "Ctrl+C",
        disabled: !active,
        action: () => document.execCommand("copy"),
      },
      {
        label: t.paste,
        shortcut: "Ctrl+V",
        disabled: !active,
        action: () => document.execCommand("paste"),
      },
      {
        label: t.delete,
        shortcut: "Del",
        disabled: !active,
        action: () => document.execCommand("delete"),
      },
      { divider: true, label: "" },
      {
        label: t.selectAll,
        shortcut: "Ctrl+A",
        disabled: !active,
        action: () => document.execCommand("selectAll"),
      },
    ],
    [t.search]: [
      {
        label: t.find,
        shortcut: shortcutLabel("find"),
        disabled: !active,
        action: () => run("find"),
      },
      {
        label: t.replace,
        shortcut: shortcutLabel("replace"),
        disabled: !active,
        action: () => run("replace"),
      },
      {
        label: t.goto,
        shortcut: shortcutLabel("goto"),
        disabled: !active,
        action: () => run("goto"),
      },
    ],
    [t.view]: [
      {
        label: t.docMap,
        action: () => run("sidebar"),
      },
      {
        label: `${t.wordWrap} (${wordWrap ? "✓" : " "})`,
        action: () => run("wrap"),
      },
      { divider: true, label: "" },
      {
        label: t.palette,
        shortcut: shortcutLabel("palette"),
        action: () => run("palette"),
      },
    ],
    [t.encoding]: encodings.map((enc) => {
      const isCurrent = (doc?.encoding ?? (doc?.bom ? "UTF-8 BOM" : "UTF-8")) === enc;
      return {
        label: `${isCurrent ? "● " : "   "}${enc}`,
        disabled: !active,
        action: () => {
          if (active) void documents.format(active, undefined, undefined, enc);
        },
      };
    }),
    [t.language]: languageModes.map((lang) => {
      const isCurrent = doc?.language === lang;
      return {
        label: `${isCurrent ? "● " : "   "}${lang}`,
        disabled: !active,
        action: () => {
          if (active) patch(active, { language: lang });
        },
      };
    }),
    [t.settings]: [
      {
        label: t.preferences,
        shortcut: shortcutLabel("settings"),
        action: () => run("settings"),
      },
    ],
    [t.tools]: [
      {
        label: "MD5 / SHA-256 Checksum",
        disabled: true,
      },
      {
        label: "Generate Statistics",
        disabled: true,
      },
    ],
    [t.macro]: [
      {
        label: "Start Recording",
        disabled: true,
      },
      {
        label: "Stop Recording",
        disabled: true,
      },
      {
        label: "Playback",
        disabled: true,
      },
    ],
    [t.run]: [
      {
        label: "Run in Browser...",
        action: () => {
          window.open(window.location.href, "_blank");
        },
      },
    ],
    [t.plugins]: [
      {
        label: "Plugins Admin...",
        action: () => run("settings"),
      },
    ],
    [t.window]: [
      ...(order.map((id, index) => {
        const d = useWorkspace.getState().documents[id];
        return {
          label: `${index + 1}: ${d?.name ?? "Document"}`,
          action: () => useWorkspace.getState().activate(id),
        };
      })),
    ],
    [t.help]: [
      {
        label: t.checkUpdates,
        action: () => void promptUpdateCheck(),
      },
      {
        label: t.about,
        action: () => run("settings"),
      },
    ],
  };

  return (
    <div className="npp-menubar" ref={menuBarRef}>
      {Object.entries(menus).map(([name, items]) => {
        const isOpen = openMenu === name;
        return (
          <div key={name} className="npp-menu-item">
            <button
              className={`npp-menu-button ${isOpen ? "active" : ""}`}
              onClick={() => setOpenMenu(isOpen ? null : name)}
              onMouseEnter={() => {
                if (openMenu !== null && openMenu !== name) {
                  setOpenMenu(name);
                }
              }}
            >
              {name}
            </button>
            {isOpen && (
              <div className="npp-dropdown">
                {items.map((item, i) =>
                  item.divider ? (
                    <div key={i} className="npp-dropdown-divider" />
                  ) : (
                    <button
                      key={i}
                      disabled={item.disabled}
                      className="npp-dropdown-item"
                      onClick={() => {
                        setOpenMenu(null);
                        item.action?.();
                      }}
                    >
                      <span className="npp-dropdown-label">{item.label}</span>
                      {item.shortcut && (
                        <span className="npp-dropdown-shortcut">
                          {item.shortcut}
                        </span>
                      )}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
