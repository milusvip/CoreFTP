import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  clearScreen: false,
  server: {
    port: 19204,
    strictPort: true,
    fs: {
      allow: [rootDir],
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
}));
