import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: "apps/web",
  plugins: [react()],
  // The paired browser harness replaces only the existing opt-in lab transport.
  // Its SharedWorker is never traversed or emitted in a normal production build.
  resolve: {
    alias:
      process.env.VITE_PLANES_PAIRED_LAB === "1"
        ? [
            {
              find: "./PlanesLab",
              replacement: resolve(
                import.meta.dirname,
                "tests/browser/planes-room.tsx",
              ),
            },
            {
              find: "./home",
              replacement: resolve(
                import.meta.dirname,
                "tests/browser/planes-home.ts",
              ),
            },
          ]
        : [],
  },
  build: { outDir: resolve(import.meta.dirname, "dist"), emptyOutDir: true },
  server: {
    host: "127.0.0.1",
    port: 4173,
    strictPort: true,
    fs: { allow: ["../.."] },
  },
  preview: { host: "127.0.0.1", port: 4173, strictPort: true },
});
