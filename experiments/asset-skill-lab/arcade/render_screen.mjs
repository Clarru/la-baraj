// Render the actual runtime Canvas renderer without a second game/browser server.
// Pass a path to an installed @napi-rs/canvas; it is QA-only, not a game dependency.
import { createRequire } from "node:module";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { build } from "esbuild";
const output = resolve(import.meta.dirname, "screen-renderer.cjs");
await build({
  entryPoints: [
    resolve(import.meta.dirname, "../../../apps/web/src/arcade2048-screen.ts"),
  ],
  bundle: true,
  platform: "node",
  format: "cjs",
  outfile: output,
});
const require = createRequire(import.meta.url),
  { createCanvas, GlobalFonts } = require(process.argv[2] ?? "@napi-rs/canvas");
GlobalFonts.registerFromPath(
  resolve(import.meta.dirname, "BreeSerif.ttf"),
  "Bree Serif",
);
GlobalFonts.registerFromPath(
  resolve(
    import.meta.dirname,
    "../../../apps/web/public/fonts/AlegreyaSans-Bold.ttf",
  ),
  "Alegreya Sans",
);
const { drawArcadeScreen } = require(output);
const game = {
  board: [2, 4, 0, 0, 16, 0, 2, 4, 64, 32, 8, 0, 128, 2, 0, 0],
  score: 312,
  moves: 40,
  revision: 41,
  continued: false,
};
const view = {
  game,
  best: 1280,
  ranked: true,
  leaders: [
    { rank: 1, name: "Clau", score: 1280, tile: 128 },
    { rank: 2, name: "Lake regular", score: 960, tile: 64 },
  ],
};
for (const page of ["board", "leaders", "confirm"]) {
  const canvas = createCanvas(768, 960),
    context = canvas.getContext("2d");
  context.scale(1.5, 1.5);
  drawArcadeScreen(context, {
    view,
    page,
    active: true,
    pending: false,
    error: "",
    local: false,
  });
  await writeFile(
    resolve(
      import.meta.dirname,
      page === "board" ? "screen-preview.png" : `screen-${page}.png`,
    ),
    canvas.toBuffer("image/png"),
  );
}
