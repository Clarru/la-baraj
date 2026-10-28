import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  build: { outDir: resolve(import.meta.dirname, "dist"), emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    fs: { allow: ["../.."] },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
