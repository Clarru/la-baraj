/** Build-only actual Game diagnosis; isolated transport and observation-only Canvas/GPU wrappers. */
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
  resolve: {
    alias: [
      {
        find: "./arcade2048-screen",
        replacement: resolve(root, "tests/browser/arcade-live-screen.ts"),
      },
      {
        find: "./arcade2048-tiles",
        replacement: resolve(root, "tests/browser/arcade-live-tiles.ts"),
      },
    ],
  },
  worker: {
    rollupOptions: {
      output: { entryFileNames: "assets/arcade-live-[name]-[hash].js" },
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
