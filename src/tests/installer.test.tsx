// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import InstallerApp from "../../installer/src/App";

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

  it("renders single-card install view with expandable customize options", () => {
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
  });

  it("renders uninstall confirmation when launched in uninstall mode", async () => {
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
          return {
            mode: "uninstall",
            version: "0.1.0",
            defaultInstallDir: "C:\\Users\\User\\AppData\\Local\\RustPad",
            existingInstallDir: "C:\\Users\\User\\AppData\\Local\\RustPad",
            installedVersion: "0.1.0",
            estimatedSizeMb: 18,
            platformSupported: true,
          };
        }
        return null;
      }),
      transformCallback: vi.fn(() => 0),
      unregisterCallback: vi.fn(),
    };

    render(<InstallerApp />);

    expect(await screen.findByText("RustPad Uninstaller")).toBeTruthy();
    expect(await screen.findByRole("button", { name: /Uninstall RustPad/i })).toBeTruthy();
  });
});
