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
const html = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>@font-face{font-family:"Alegreya Sans";font-weight:700;src:url(data:font/woff2;base64,${font})}:root{--font-body:"Alegreya Sans",sans-serif;--font-heading:"Alegreya Sans",sans-serif}*{box-sizing:border-box}body{margin:0}${css}</style><div id="root"></div><script>${js.replaceAll("</script", "<\\/script")}</script>`;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE || undefined,
  headless: true,
});
const evidence = {
  browser: browser.version(),
  scope:
    "In-memory actual MobileArcade2048 DOM/CSS with authored legal values; Chromium emulation, no earned game or OS/hardware claim.",
  cases: [],
};
try {
  for (const viewport of [
    { width: 320, height: 740 },
    { width: 844, height: 390 },
  ]) {
    const context = await browser.newContext({
      viewport,
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 1,
    });
    try {
      const page = await context.newPage();
      await page.setContent(html);
      await page.locator(".mobile-tile").first().waitFor();
      await page.evaluate(async () => {
        await document.fonts.load('700 42px "Alegreya Sans"');
        await document.fonts.ready;
      });
      const measure = () =>
        page.locator(".mobile-tile").evaluateAll((tiles) =>
          tiles.map((tile) => {
            const cell = tile.getBoundingClientRect(),
              range = document.createRange();
            range.selectNodeContents(tile);
            const text = range.getBoundingClientRect();
            return {
              value: tile.textContent,
              aria: tile.getAttribute("aria-label"),
              cellWidth: cell.width,
              cellHeight: cell.height,
              textWidth: text.width,
              textLeft: text.left,
              textRight: text.right,
              cellLeft: cell.left,
              cellRight: cell.right,
              fontSize: getComputedStyle(tile).fontSize,
              fits:
                text.left >= cell.left - 0.5 && text.right <= cell.right + 0.5,
            };
          }),
        );
      const after = await measure();
      assert(
        after.every((r) => r.fits),
        `Current text overflow at ${viewport.width}: ${JSON.stringify(after.filter((r) => !r.fits))}`,
      );
      assert(
        after.every(
          (r) => r.cellWidth > 40 && Math.abs(r.cellWidth - r.cellHeight) < 1,
        ),
        "Board containment changed/collapsed square cells",
      );
      assert(
        after.every((r) => r.aria.endsWith(`: ${r.value}`)),
        "Tile value/ARIA semantics changed",
      );
      await page.screenshot({
        path: resolve(out, `after-${viewport.width}.png`),
      });
      await page.locator(".mobile-tile").evaluateAll((tiles) =>
        tiles.forEach((tile) => {
          tile.dataset.fitStyle = tile.style.fontSize;
          tile.style.fontSize = "clamp(22px, 7vw, 42px)";
        }),
      );
      const before = await measure();
      if (viewport.width === 844)
        assert(
          before.some((r) => r.value === "2048" && !r.fits),
          "Probe did not reproduce the released 2048 overflow",
        );
      await page.screenshot({
        path: resolve(out, `before-${viewport.width}.png`),
      });
      await page.locator(".mobile-tile").evaluateAll((tiles) =>
        tiles.forEach((tile) => {
          tile.style.fontSize = "calc(88px / var(--tile-digits, 4))";
        }),
      );
      const fallback = await measure();
      assert(
        fallback.every((r) => r.fits),
        `Pixel fallback overflow at ${viewport.width}`,
      );
      evidence.cases.push({ viewport, before, after, fallback });
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
await writeFile(
  resolve(out, "results.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(
  JSON.stringify(
    {
      browser: evidence.browser,
      cases: evidence.cases.map((c) => ({
        viewport: c.viewport,
        beforeOverflow: c.before.filter((r) => !r.fits).map((r) => r.value),
        afterFit: c.after.length,
        fallbackFit: c.fallback.length,
      })),
      output: out,
    },
    null,
    2,
  ),
);
