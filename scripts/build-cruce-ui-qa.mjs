import { build } from "vite";
import base from "../vite.config.ts";
import { readFile, writeFile, unlink, access } from "node:fs/promises";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, ".."),
  temporary = resolve(root, "apps/web/__cruce-ui-presentation-qa.html");
try {
  await access(temporary);
  throw new Error("QA entry already exists; refusing to overwrite it.");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
process.env.VITE_CRUCE_WORLD_LAB = "1";
process.env.VITE_GAME_DIAGNOSTICS = "1";
process.env.VITE_ROOM_SERVER_URL = "";
try {
  const html = await readFile(
    resolve(root, "tests/browser/cruce-presentation.html"),
    "utf8",
  );
  await writeFile(
    temporary,
    html.replace(
      'src="./cruce-presentation.tsx"',
      'src="../../tests/browser/cruce-presentation.tsx"',
    ),
  );
  await build({
    ...base,
    configFile: false,
    build: {
      ...base.build,
      outDir: resolve(root, ".impeccable/review/cruce-ui/build"),
      rolldownOptions: {
        input: {
          main: resolve(root, "apps/web/index.html"),
          presentation: temporary,
        },
      },
    },
  });
} finally {
  await unlink(temporary);
}
