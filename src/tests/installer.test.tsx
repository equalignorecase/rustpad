// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InstallerApp from "../../installer/src/App";

function setupTauriMock(initPayload: Record<string, unknown>) {
  const win = window as unknown as {
    __TAURI_INTERNALS__: unknown;
    __TAURI_EVENT_PLUGIN_INTERNALS__: unknown;
  };
  win.__TAURI_EVENT_PLUGIN_INTERNALS__ = {
    unregisterListener: vi.fn(),
  };
  win.__TAURI_INTERNALS__ = {
    invoke: vi.fn(async (cmd: string) => {
      if (cmd === "get_installer_state") {
        return initPayload;
      }
      return null;
    }),
    transformCallback: vi.fn(() => 0),
    unregisterCallback: vi.fn(),
  };
}

describe("Custom Windows setup UI", () => {
  afterEach(() => {
    cleanup();
    const win = window as unknown as {
      __TAURI_INTERNALS__?: unknown;
      __TAURI_EVENT_PLUGIN_INTERNALS__?: unknown;
    };
    delete win.__TAURI_INTERNALS__;
    delete win.__TAURI_EVENT_PLUGIN_INTERNALS__;
  });

  it("renders single-card install view with expandable customize options and EN/TH toggle", () => {
    render(<InstallerApp />);

    expect(screen.getByText("RustPad Setup")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Install RustPad/i })).toBeTruthy();
    expect(screen.queryByText("Start Menu shortcut")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /Customize/i }));

    expect(screen.getByLabelText("Folder path")).toBeTruthy();
    expect(screen.getByText("Start Menu shortcut")).toBeTruthy();
    expect(screen.getByText("Desktop shortcut")).toBeTruthy();
    expect(screen.getByText("Open with RustPad menu")).toBeTruthy();
    expect(screen.getByText("Associate 18 file types")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Switch language/i }));
    expect(screen.getByRole("button", { name: /ติดตั้ง RustPad/i })).toBeTruthy();
    expect(screen.getByText("ชอร์ตคัตหน้าจอ Desktop")).toBeTruthy();
  });

  it("restores saved registry options when updating an existing installation", async () => {
    setupTauriMock({
      mode: "install",
      version: "0.1.1",
      defaultInstallDir: "C:\\Users\\User\\AppData\\Local\\RustPad",
      existingInstallDir: "D:\\Apps\\RustPad",
      installedVersion: "0.1.0",
      savedOptions: {
        startMenuShortcut: true,
        desktopShortcut: false,
        contextMenu: true,
        fileAssociations: false,
      },
      estimatedSizeMb: 18,
      platformSupported: true,
    });

    render(<InstallerApp />);

    expect(await screen.findByText("Updating v0.1.0")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Customize/i }));

    const dirInput = screen.getByLabelText("Folder path") as HTMLInputElement;
    expect(dirInput.value).toBe("D:\\Apps\\RustPad");

    const desktopBtn = screen.getByRole("button", { name: "Desktop shortcut" });
    const startMenuBtn = screen.getByRole("button", { name: "Start Menu shortcut" });
    const fileAssocBtn = screen.getByRole("button", {
      name: "Associate 18 file types",
    });
    expect(desktopBtn.getAttribute("aria-pressed")).toBe("false");
    expect(startMenuBtn.getAttribute("aria-pressed")).toBe("true");
    expect(fileAssocBtn.getAttribute("aria-pressed")).toBe("false");
  });

  it("renders uninstall confirmation when launched in uninstall mode", async () => {
    setupTauriMock({
      mode: "uninstall",
      version: "0.1.1",
      defaultInstallDir: "C:\\Users\\User\\AppData\\Local\\RustPad",
      existingInstallDir: "C:\\Users\\User\\AppData\\Local\\RustPad",
      installedVersion: "0.1.1",
      savedOptions: {
        startMenuShortcut: true,
        desktopShortcut: true,
        contextMenu: true,
        fileAssociations: true,
      },
      estimatedSizeMb: 18,
      platformSupported: true,
    });

    render(<InstallerApp />);

    expect(await screen.findByText("RustPad Uninstaller")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Uninstall RustPad/i })).toBeTruthy();
  });
});
