/** Writes an additive localhost QA build, never starts or changes a server. */
import { build } from "vite";
import { access, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  temporary = resolve(root, "apps/web/__mobile-world-qa.html");
try {
  await access(temporary);
  throw Error("QA entry exists; refusing to replace it.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
try {
  await writeFile(
    temporary,
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><title>La Baraj mobile QA</title></head><body><div id="root"></div><script type="module" src="../../tests/browser/mobile-world.tsx"></script></body></html>',
  );
  await build({
    configFile: resolve(root, "vite.config.ts"),
    define: {
      "import.meta.env.VITE_ROOM_SERVER_URL": JSON.stringify(""),
      "import.meta.env.VITE_CRUCE_WORLD_LAB": JSON.stringify("1"),
      "import.meta.env.VITE_GAME_DIAGNOSTICS": JSON.stringify("1"),
    },
    worker: {
      rollupOptions: {
        output: { entryFileNames: "assets/mobile-qa-[name]-[hash].js" },
      },
    },
    build: {
      outDir: resolve(root, ".impeccable/review/mobile-world/build"),
      emptyOutDir: true,
      rolldownOptions: { input: temporary },
    },
  });
} finally {
  await unlink(temporary);
}
