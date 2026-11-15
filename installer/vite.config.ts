import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(() => ({
  root: rootDir,
  plugins: [react(), tailwindcss()],
  build: {
    outDir: path.join(rootDir, "dist"),
    emptyOutDir: true,
    target: ["safari16.4", "chrome111"],
  },
  clearScreen: false,
  server: {
    port: 1425,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1426,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
