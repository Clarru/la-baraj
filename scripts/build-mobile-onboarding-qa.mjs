/** Builds an isolated real form fixture without starting a server or room. */
import { build } from "vite";
import { access, writeFile, unlink } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  temporary = resolve(root, "apps/web/__mobile-onboarding-qa.html");
try {
  await access(temporary);
  throw Error("QA entry exists; refusing to replace it.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
try {
  await writeFile(
    temporary,
    '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="black-translucent"><title>La Baraj onboarding QA</title></head><body><div id="root"></div><script type="module" src="../../tests/browser/mobile-onboarding.tsx"></script></body></html>',
  );
  await build({
    configFile: resolve(root, "vite.config.ts"),
    build: {
      outDir: resolve(root, ".impeccable/review/mobile-onboarding/build"),
      emptyOutDir: true,
      rolldownOptions: { input: temporary },
    },
  });
} finally {
  await unlink(temporary);
}
