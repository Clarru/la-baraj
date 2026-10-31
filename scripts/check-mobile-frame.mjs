/** In-memory actual R3F lifecycle check; no game or backend listener. */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(import.meta.dirname, ".."),
  out = resolve(
    root,
    ".impeccable/review/mobile-input-performance/frame-lifecycle",
  );
await mkdir(out, { recursive: true });
const bundle = await build({
  configFile: false,
  plugins: [react()],
  publicDir: false,
  logLevel: "silent",
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
    "import.meta.env.VITE_GAME_DIAGNOSTICS": JSON.stringify("1"),
  },
  build: {
    write: false,
    lib: {
      entry: resolve(root, "tests/browser/mobile-frame-fixture.tsx"),
      name: "FrameQA",
      formats: ["iife"],
    },
  },
});
const output = Array.isArray(bundle)
  ? bundle.flatMap((b) => b.output)
  : bundle.output;
const html =
  '<style>html,body{margin:0}</style><div id="root"></div><script>' +
  output
    .find((f) => f.type === "chunk")
    .code.replaceAll("</script", "<\\/script") +
  "</script>";
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE || undefined,
  headless: true,
});
const evidence = {
  driver: browser.version(),
  scope:
    "Actual Canvas/Driver with 10 parent React updates/s; in-memory, not phone hardware",
  cases: [],
};
try {
  const page = await browser.newPage({
    viewport: { width: 393, height: 852 },
    deviceScaleFactor: 3,
  });
  await page.setContent(html);
  await page.locator("canvas[data-mobile-frame-work]").waitFor();
  const work = () =>
    page
      .locator("canvas")
      .evaluate((e) => JSON.parse(e.getAttribute("data-mobile-frame-work")));
  for (const viewport of [
    { width: 393, height: 852 },
    { width: 844, height: 390 },
    { width: 1366, height: 1024 },
  ]) {
    await page.setViewportSize(viewport);
    await page.waitForTimeout(1300);
    const sample = await work();
    assert(
      sample.width * sample.height <= 360000,
      "Pixel budget undone by parent rerender",
    );
    assert(sample.width <= viewport.width * 0.9 + 1, "DPR ceiling undone");
    assert(
      sample.updates > sample.draws * 1.8 &&
        sample.updates < sample.draws * 2.2,
      "Simulation/draw clocks coupled",
    );
    evidence.cases.push({ viewport, sample });
  }
  await page.locator("#cover").click();
  await page.waitForTimeout(1500);
  const stopped = await work();
  assert(stopped.stopped, "Covered world did not stop");
  await page.waitForTimeout(700);
  assert.deepEqual(
    await work(),
    stopped,
    "Parent UI updates restarted covered world",
  );
  await page.locator("#cover").click();
  await page.waitForTimeout(800);
  const resumed = await work();
  assert(
    !resumed.stopped && resumed.updates > stopped.updates,
    "World did not resume",
  );
  assert(
    resumed.simulationTime - stopped.simulationTime < 1,
    "Resume replayed hidden time",
  );
  evidence.covered = { stopped, resumed };
} finally {
  await browser.close();
}
await writeFile(
  resolve(out, "results.json"),
  JSON.stringify(evidence, null, 2) + "\n",
);
console.log(JSON.stringify(evidence, null, 2));
