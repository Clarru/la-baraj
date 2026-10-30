/**
 * Build the local-only live-room boat QA page (tests/browser/boat-live-fixture.tsx)
 * against a room Worker running on this machine. Usage:
 *   node scripts/prepare-boat-live-fixture.mjs [room-url]   (default http://127.0.0.1:8790)
 * Output: .impeccable/review/boat-live/build, served under /boat-qa/ by copying it
 * into dist/boat-qa/ next to a normal production build. Never point this at the
 * production Worker.
 */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";
const root = process.cwd();
const roomUrl = process.argv[2] ?? "http://127.0.0.1:8790";
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(roomUrl))
  throw new Error("The live fixture only accepts a local room URL");
const folder = path.join(root, ".impeccable/review/boat-live");
await fs.mkdir(folder, { recursive: true });
const html = path.join(folder, "index.html");
await fs.writeFile(
  html,
  `<!doctype html><html><head><meta charset="utf-8"><title>La Baraj boat live-room QA</title><style>
html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}
#boat-controls{position:fixed;left:12px;top:95px;width:265px;z-index:200;background:#eee8d8;color:#263d32;padding:12px;font:13px system-ui;border:1px solid #715b3d}
#boat-controls select,#boat-controls button,#boat-controls output{display:block;margin:8px 0;width:100%}
aside[aria-label="Teste 3D Cruce"]{display:none!important}
</style></head><body><div id="root"></div><script type="module" src="../../../tests/browser/boat-live-fixture.tsx"></script></body></html>`,
);
await build({
  configFile: false,
  root: folder,
  base: "/boat-qa/",
  publicDir: false,
  plugins: [react()],
  define: {
    "import.meta.env.VITE_ROOM_SERVER_URL": JSON.stringify(roomUrl),
    "import.meta.env.VITE_GAME_DIAGNOSTICS": JSON.stringify("1"),
    "import.meta.env.VITE_CRUCE_WORLD_LAB": JSON.stringify("1"),
  },
  server: { fs: { allow: [root] } },
  build: {
    outDir: path.join(folder, "build"),
    emptyOutDir: true,
    rolldownOptions: { input: html },
  },
});
console.log(`Built ${path.join(folder, "build")} for room ${roomUrl}`);
