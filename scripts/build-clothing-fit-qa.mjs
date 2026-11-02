/** One bounded clothing-only fixture build. No listener or shared dist mutation. */
import { build } from "vite";
import fs from "node:fs/promises";
import path from "node:path";
const root = path.resolve(import.meta.dirname, ".."),
  output = path.join(root, ".impeccable/review/clothing-fit/build");
const stat = await fs.statfs(root),
  free = stat.bavail * stat.bsize,
  expected = 96 * 1024 ** 2,
  reserve = 4 * 1024 ** 3,
  margin = 128 * 1024 ** 2;
if (free < reserve + expected + margin)
  throw Error(
    `Insufficient disk reserve: ${free} available, ${reserve + expected + margin} required`,
  );
const entries = [
  ["__clothing-fit-qa.html", "wardrobe-world.tsx"],
  ["__clothing-fit-game-qa.html", "wardrobe-game.tsx"],
];
for (const [name] of entries) {
  try {
    await fs.access(path.join(root, "apps/web", name));
    throw Error("QA entry already exists: " + name);
  } catch (e) {
    if (e.code !== "ENOENT") throw e;
  }
}
try {
  for (const [name, source] of entries)
    await fs.writeFile(
      path.join(root, "apps/web", name),
      `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Clothing fit acceptance</title></head><body><div id="root"></div><script type="module" src="../../tests/browser/${source}"></script></body></html>`,
    );
  await build({
    configFile: path.join(root, "vite.config.ts"),
    resolve: {
      alias: [
        {
          find: "./wardrobe-catalog",
          replacement: path.join(
            root,
            "tests/browser/clothing-wardrobe-catalog.ts",
          ),
        },
      ],
    },
    define: {
      "import.meta.env.VITE_ROOM_SERVER_URL": JSON.stringify(""),
      "import.meta.env.VITE_CRUCE_WORLD_LAB": JSON.stringify("1"),
    },
    worker: {
      rollupOptions: {
        output: {
          entryFileNames: "assets/clothing-fit-qa-[name]-[hash].js",
        },
      },
    },
    build: {
      outDir: output,
      emptyOutDir: true,
      rolldownOptions: {
        input: entries.map(([name]) => path.join(root, "apps/web", name)),
      },
    },
  });
  const versions = JSON.parse(
    await fs.readFile(
      path.join(root, "apps/web/src/wardrobe-asset-versions.json"),
      "utf8",
    ),
  );
  const dest = path.join(output, "assets/clothing-fit-qa");
  await fs.mkdir(dest, { recursive: true });
  await fs.copyFile(path.join(root,"apps/web/public/assets/avatars/wardrobe/ATTRIBUTION.md"),path.join(dest,"ATTRIBUTION.md"));
  for (const id of [
    "female-brunette-tailored",
    "male-custom-top-skin",
    "top-trail-overshirt",
    "top-weekend-knit",
    "shoes-canvas-low",
  ])
    await fs.copyFile(
      path.join(root, "apps/web/public/assets/avatars/wardrobe", id + ".glb"),
      path.join(dest, id + "-" + versions[id].slice(0, 16) + ".glb"),
    );
} finally {
  for (const [name] of entries)
    await fs.unlink(path.join(root, "apps/web", name)).catch(() => {});
}
