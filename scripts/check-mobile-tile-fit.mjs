/** Builds the actual mobile board into an in-memory layout probe. Starts no listener. */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(import.meta.dirname, ".."),
  out = resolve(root, ".impeccable/review/mobile-tile-fit");
await mkdir(out, { recursive: true });
const bundle = await build({
  configFile: false,
  publicDir: false,
  logLevel: "silent",
  plugins: [react()],
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    write: false,
    lib: {
      entry: resolve(root, "tests/browser/mobile-tile-fit.tsx"),
      name: "MobileTileFit",
      formats: ["iife"],
    },
    minify: true,
  },
});
const output = Array.isArray(bundle)
  ? bundle.flatMap((item) => item.output)
  : bundle.output;
const js = output.find((f) => f.type === "chunk").code;
const css = output
  .filter((f) => f.type === "asset" && f.fileName.endsWith(".css"))
  .map((f) => f.source)
  .join("\n");
const font = (
  await readFile(
    resolve(root, "apps/web/public/fonts/alegreya-sans-latin-700-normal.woff2"),
  )
).toString("base64");
const serif = (
  await readFile(
    resolve(root, "apps/web/public/fonts/bree-serif-latin-400-normal.woff2"),
  )
).toString("base64");
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:"Alegreya Sans";font-weight:700;src:url(data:font/woff2;base64,${font})}@font-face{font-family:"Bree Serif";font-weight:400;src:url(data:font/woff2;base64,${serif})}:root{--font-body:"Alegreya Sans",sans-serif;--font-heading:"Bree Serif",serif}*{box-sizing:border-box}html,body,#root{margin:0;width:100%;height:100%}${css}</style><div id="root"></div><script>window.__tiles=[];const fill=CanvasRenderingContext2D.prototype.fillText;CanvasRenderingContext2D.prototype.fillText=function(s,x,y,...a){if(x===0&&y===1&&/^\\d+$/.test(s)){window.__tiles.push({value:s,width:this.measureText(s).width,font:this.font});if(window.__tiles.length>16)window.__tiles.shift()}return fill.call(this,s,x,y,...a)};</script><script>${js.replaceAll("</script", "<\\/script")}</script>`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE || undefined,
  headless: true,
});
const evidence = {
  browser: browser.version(),
  scope:
    "Actual mobile canvas, shared desktop renderer, authored legal values and real fonts; portrait and quarter-turn Chromium layout/input, not phone acceptance",
  cases: [],
};
try {
  for (const spec of [
    { width: 320, height: 740, turn: 0 },
    { width: 393, height: 852, turn: 0 },
    { width: 430, height: 932, turn: 0 },
    { width: 852, height: 393, turn: 90 },
    { width: 852, height: 334, turn: -90 },
  ]) {
    const { width, height, turn } = spec;
    const viewport = { width, height };
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    try {
      const page = await context.newPage();
      await page.evaluate(
        ({ turn }) =>
          Object.defineProperty(screen, "orientation", {
            configurable: true,
            value: Object.assign(new EventTarget(), {
              type:
                turn === 90
                  ? "landscape-primary"
                  : turn === -90
                    ? "landscape-secondary"
                    : "portrait-primary",
              angle: turn === -90 ? 270 : turn,
            }),
          }),
        { turn },
      );
      await page.setContent(html);
      await page.locator("canvas.mobile-arcade-board").waitFor();
      await page.evaluate(async () => {
        await Promise.all([
          document.fonts.load('400 49px "Bree Serif"'),
          document.fonts.load('700 21px "Alegreya Sans"'),
        ]);
        await document.fonts.ready;
      });
      await page.waitForTimeout(80);
      const tiles = await page.evaluate(() => window.__tiles);
      assert.equal(tiles.length, 16);
      assert(
        tiles.every((t) => t.width <= 86.1),
        JSON.stringify(tiles.filter((t) => t.width > 86.1)),
      );
      const board = await page.locator("canvas").boundingBox();
      assert(
        board.x >= 0 &&
          board.y >= 0 &&
          board.x + board.width <= viewport.width + 1 &&
          board.y + board.height <= viewport.height + 1,
      );
      assert(Math.abs(board.width / board.height - (turn ? 1.25 : 0.8)) < 0.01);
      assert.equal(
        await page.locator(".mobile-arcade").getAttribute("data-portrait-turn"),
        String(turn),
      );
      const xy = (u, v) =>
        turn === 90
          ? {
              x: board.x + (1 - v / 640) * board.width,
              y: board.y + (u / 512) * board.height,
            }
          : turn === -90
            ? {
                x: board.x + (v / 640) * board.width,
                y: board.y + (1 - u / 512) * board.height,
              }
            : {
                x: board.x + (u / 512) * board.width,
                y: board.y + (v / 640) * board.height,
              };
      await page.evaluate(() => {
        window.__pointerProof = [];
        for (const type of [
          "pointerdown",
          "pointerup",
          "pointercancel",
          "lostpointercapture",
        ])
          document.addEventListener(
            type,
            (e) =>
              window.__pointerProof.push({
                type,
                id: e.pointerId,
                x: e.clientX,
                y: e.clientY,
                target: e.target.className,
              }),
            true,
          );
      });
      const cdp = await context.newCDPSession(page);
      const start = xy(400, 360),
        end = xy(100, 360);
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ ...start, id: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ ...end, id: 1 }],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchEnd",
        touchPoints: [],
      });
      const tap = xy(240, 110);
      await page.touchscreen.tap(tap.x, tap.y);
      const touchHeight = (44 * 640) / (turn ? board.width : board.height);
      const leave = xy(430, 615 + Math.max(50, touchHeight) / 2 - 1);
      await page.touchscreen.tap(leave.x, leave.y);
      const events = await page.evaluate(() => window.__mobileArcadeEvents);
      assert.deepEqual(
        events,
        ["move:left", "new", "leave"],
        JSON.stringify({
          spec,
          board,
          events,
          pointers: await page.evaluate(() => window.__pointerProof),
        }),
      );
      await page.screenshot({
        path: resolve(out, `surface-${viewport.width}-${turn}.png`),
      });
      evidence.cases.push({ viewport, turn, board, tiles, events });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  resolve(out, "results.json"),
  JSON.stringify(evidence, null, 2),
);
console.log(
  JSON.stringify({
    cases: evidence.cases.map((c) => ({
      viewport: c.viewport,
      fit: c.tiles.length,
    })),
    output: out,
  }),
);
