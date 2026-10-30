import { execFileSync } from "node:child_process";
import { build } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs/promises";
const before = process.argv.includes("--before");
const root = process.cwd(),
  folder = path.resolve(".impeccable/review/meadow-review"),
  html = path.join(folder, "fixture.html");
await fs.mkdir(folder, { recursive: true });
await fs.writeFile(
  html,
  `<!doctype html><html><head><title>La Baraj meadow review</title><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden}</style></head><body><div id="root"></div><script type="module" src="/tests/browser/meadow-review.tsx"></script></body></html>`,
);
await build({
  configFile: false,
  root,
  publicDir: false,
  plugins: [
    react(),
    {
      name: "historical-empty-draw-baseline",
      load(id) {
        if (!before || id !== path.join(root, "apps/web/src/MeadowLayer.tsx"))
          return;
        // Same current Game, shader, terrain, camera and instrumentation; only
        // the pre-review full-capacity draw layer is restored for comparison.
        return execFileSync(
          "git",
          [
            "show",
            "a52409a521433bd242cdcabd13b27ac088a0461f:apps/web/src/MeadowLayer.tsx",
          ],
          { encoding: "utf8" },
        );
      },
    },
  ],
  define: {
    "import.meta.env.VITE_ROOM_SERVER_URL": JSON.stringify(""),
    "import.meta.env.VITE_GAME_DIAGNOSTICS": JSON.stringify("1"),
    "import.meta.env.VITE_PERFORMANCE_LAB": JSON.stringify("1"),
  },
  resolve: {
    alias: [
      {
        find: /^\.\/MeadowLayer$/,
        replacement: path.join(root, "tests/browser/MeadowReviewLayer.tsx"),
      },
      {
        find: /^\.\/PerformanceLab$/,
        replacement: path.join(
          root,
          "tests/browser/MeadowReviewPerformance.tsx",
        ),
      },
    ],
  },
  build: {
    outDir: path.join(folder, before ? "build-before-empty-fix" : "build"),
    emptyOutDir: true,
    rolldownOptions: { input: html },
  },
});
