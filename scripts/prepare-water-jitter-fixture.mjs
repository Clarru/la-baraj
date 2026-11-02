import { build } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs/promises";
import path from "node:path";
const before = process.argv.includes("--before");
const root = process.cwd();
const folder = path.join(root, ".impeccable/review/water-jitter");
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
  plugins: [
    {
      name: "cached-eye-baseline",
      async load(id) {
        if (
          !before ||
          id !== path.join(root, "apps/web/src/water-reflection.ts")
        )
          return;
        const source = await fs.readFile(id, "utf8");
        const refresh = /water\.material\.uniforms\.eye\.value\.setFromMatrixPosition\(\s*args\[2\]\.matrixWorld,?\s*\);/;
        if (!refresh.test(source))
          throw new Error("Eye update changed; review baseline");
        return source.replace(refresh, "");
      },
    },
    react(),
    {
      name: "water-jitter-controls",
      load(id) {
        if (id !== path.join(root, "tests/browser/boat-world-fixture.tsx"))
          return;
        return fs
          .readFile(id, "utf8")
          .then((source) =>
            source
              .replace(
                '<button onClick={() => holdControls(["KeyW"])}>',
                '<button onClick={() => window.dispatchEvent(new Event("water-qa-reset"))}>Reset water trace</button><output id="water-frame-trace" data-frames="[]" hidden /><button onClick={() => holdControls(["KeyW"])}>',
              )
              .replace(
                '<output id="boat-history"',
                '<output id="boat-frame-trace" data-frames="[]" hidden /><output id="boat-history"',
              ),
          );
      },
    },
    {
      name: "isolated-boat-review-authority",
      transform(source, id) {
        if (id === path.join(root, "apps/web/src/multiplayer.ts"))
          return source.replace(
            "la-baraj-home-resume-v2:",
            "la-baraj-water-jitter-home:",
          );
        if (id !== path.join(root, "apps/web/src/LocalWorldRoom.ts")) return;
        source = source.replace(
          "la-baraj-local-preview-resume",
          "la-baraj-water-jitter-resume",
        );
        const match = '{ type: "module" }';
        if (!source.includes(match))
          throw new Error(
            "Local room worker constructor changed; review QA isolation",
          );
        return source.replace(
          match,
          '{ type: "module", name: "la-baraj-water-jitter-qa" }',
        );
      },
    },
  ],
  define: {
    "import.meta.env.VITE_ROOM_SERVER_URL": JSON.stringify(""),
    "import.meta.env.VITE_GAME_DIAGNOSTICS": JSON.stringify("1"),
    "import.meta.env.VITE_CRUCE_WORLD_LAB": JSON.stringify("1"),
  },
  resolve: {
    alias: [
      {
        find: /^\.\/environment$/,
        replacement: path.join(root, "tests/browser/water-eye-qa.tsx"),
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
    outDir: path.join(folder, before ? "before" : "after"),
    emptyOutDir: true,
    rolldownOptions: { input: html },
  },
});
