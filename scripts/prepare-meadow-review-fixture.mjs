import { build } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import fs from "node:fs/promises";
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
  plugins: [react()],
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
    outDir: path.join(folder, "build"),
    emptyOutDir: true,
    rolldownOptions: { input: html },
  },
});
