import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
const folder = path.join(root, ".impeccable/review/boat-world");
await fs.mkdir(folder, { recursive: true });
const html = path.join(folder, "fixture.html");
await fs.writeFile(
  html,
  `<!doctype html><html><head><title>La Baraj boat collision QA</title><style>
html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}
#boat-controls{position:fixed;left:12px;top:95px;width:265px;z-index:200;background:#eee8d8;color:#263d32;padding:12px;font:13px system-ui;border:1px solid #715b3d}
#boat-controls select,#boat-controls button,#boat-controls output{display:block;margin:8px 0;width:100%}
aside[aria-label="Teste 3D Cruce"]{display:none!important}
</style></head><body><div id="root"></div><script type="module" src="/tests/browser/boat-world-fixture.tsx"></script></body></html>`,
);
await build({
  configFile: false,
  root,
  publicDir: false,
  plugins: [react()],
  define: {
    "import.meta.env.VITE_ROOM_SERVER_URL": JSON.stringify(""),
    "import.meta.env.VITE_GAME_DIAGNOSTICS": JSON.stringify("1"),
    "import.meta.env.VITE_CRUCE_WORLD_LAB": JSON.stringify("1"),
  },
  resolve: {
    alias: [
      {
        find: /^\.\/boat-spray\.tsx$/,
        replacement: path.join(root, "tests/browser/boat-wake-qa.tsx"),
      },
      {
        find: /^\.\/boat-collision$/,
        replacement: path.join(root, "tests/browser/boat-qa-collision.ts"),
      },
      {
        find: /^\.\/LocalWorldRoom$/,
        replacement: path.join(root, "tests/browser/boat-qa-room.ts"),
      },
    ],
  },
  build: {
    outDir: path.join(folder, "build"),
    emptyOutDir: true,
    rolldownOptions: { input: html },
  },
});
