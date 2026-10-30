/** Build only: publish the resulting additive files after the preview owner's grant. */
import { build } from "vite";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "../..");
await build({
  configFile: resolve(root, "vite.config.ts"),
  root,
  publicDir: false,
  define: {
    "import.meta.env.VITE_ROOM_SERVER_URL": JSON.stringify(""),
    "import.meta.env.VITE_CRUCE_WORLD_LAB": JSON.stringify("1"),
  },
  // The normal preview may already use identical server code. A distinct URL keeps QA isolated.
  worker: {
    rollupOptions: {
      output: { entryFileNames: "assets/arcade-yaw-[name]-[hash].js" },
    },
  },
  build: {
    outDir: resolve(root, "dist"),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(root, "tests/browser/arcade2048-world.html"),
    },
  },
});
