/** Real NippleJS + trusted Chromium touch streams. In memory; starts no listener. */
import { build } from "vite";
import react from "@vitejs/plugin-react";
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import assert from "node:assert/strict";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = resolve(import.meta.dirname, ".."),
  out = resolve(root, ".impeccable/review/native-touch/library-probe");
await mkdir(out, { recursive: true });
const bundle = await build({
  configFile: false,
  plugins: [react()],
  publicDir: false,
  logLevel: "silent",
  define: { "process.env.NODE_ENV": JSON.stringify("production") },
  build: {
    write: false,
    lib: {
      entry: resolve(root, "tests/browser/mobile-joystick-fixture.tsx"),
      name: "JoystickQA",
      formats: ["iife"],
    },
  },
});
const output = Array.isArray(bundle)
  ? bundle.flatMap((b) => b.output)
  : bundle.output;
const css = output
    .filter((f) => f.type === "asset" && f.fileName.endsWith(".css"))
    .map((f) => f.source)
    .join("\n"),
  js = output.find((f) => f.type === "chunk").code;
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE || undefined,
  headless: true,
});
const evidence = {
  driver: browser.version(),
  scope:
    "Actual NippleJS 1.0.4 and application adapter, trusted Chromium touch + native TouchEvents; no physical iOS or world claim",
  cases: [],
};
try {
  const context = await browser.newContext({
    viewport: { width: 852, height: 393 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 1,
    userAgent: "iPhone",
  });
  const page = await context.newPage();
  const html =
    '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-status-bar-style" content="default"><title>La Baraj controller QA</title><style>html,body,#root{margin:0;width:100%;height:100%;overflow:hidden;--font-body:Arial;--font-heading:Arial}' +
    css +
    '</style></head><body><div id="root"></div><script>' +
    js.replaceAll("</script", "<\\/script") +
    "</script></body></html>";
  await writeFile(resolve(out, "fixture.html"), html);
  await page.evaluate(() =>
    Object.defineProperty(navigator, "standalone", { get: () => true }),
  );
  await page.setContent(html);
  await page.locator(".mobile-start").click();
  await page.locator(".mobile-stick-zone.is-ready").first().waitFor();
  await page.waitForTimeout(120);
  const state = async () =>
    JSON.parse(await page.locator("#input").getAttribute("data-state"));
  const cdp = await context.newCDPSession(page);
  const touch = (points, type = "touchMove") =>
    cdp.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: points.map((p) => ({
        ...p,
        radiusX: 5,
        radiusY: 5,
        force: 1,
      })),
    });
  const move = await page.locator(".mobile-move").boundingBox(),
    look = await page.locator(".mobile-look").boundingBox();
  const a = { id: 1, x: move.x + move.width / 2, y: move.y + move.height / 2 },
    b = { id: 2, x: look.x + look.width / 2, y: look.y + look.height / 2 };
  const original = (await state()).ids;
  for (let i = 0; i < 30; i++) {
    await touch([a], "touchStart");
    await touch([{ ...a, x: a.x + 25, y: a.y - 20 }]);
    await page.waitForTimeout(30);
    await touch([], "touchEnd");
    await page.waitForTimeout(45);
    const ended = await state();
    assert.deepEqual(ended.move, { x: 0, y: 0 });
    assert.deepEqual(ended.ids, original, "Ordinary end rebuilt a manager");
  }
  evidence.cases.push({
    name: "30 short static-reuse drags",
    pass: true,
    ids: original,
  });
  await page.evaluate(() => {
    window.__padEnds = [];
    document.addEventListener(
      "pointerup",
      (e) => {
        const pad =
          e.target instanceof Element
            ? e.target.closest(".mobile-stick-zone")
            : null;
        if (pad)
          window.__padEnds.push({
            id: e.pointerId,
            pad: pad.classList.contains("mobile-move") ? "move" : "look",
          });
      },
      true,
    );
  });
  for (let cycle = 0; cycle < 6; cycle++) {
    await touch([cycle % 2 ? a : b], "touchStart");
    await touch([a, b], "touchStart");
    const ma = { ...a, x: a.x + 20, y: a.y - 30 },
      lb = { ...b, x: b.x + 30 };
    await touch([ma, lb]);
    await page.waitForTimeout(80);
    const held = await state();
    assert(held.move.x > 0 && held.move.y < 0 && held.look.x > 0);
    await touch([cycle % 2 ? ma : lb], "touchEnd");
    await page.waitForTimeout(80);
    const end = await page.evaluate(() => window.__padEnds.at(-1)),
      after = await state();
    const cleared = end.pad,
      sibling = cleared === "move" ? "look" : "move";
    assert.deepEqual(after[cleared], { x: 0, y: 0 });
    assert.deepEqual(after[sibling], held[sibling]);
    await touch([], "touchCancel");
    await page.waitForTimeout(60);
    assert.deepEqual((await state()).ids, original);
  }
  evidence.cases.push({
    name: "both contact orders, one end leaves exact sibling held, final cancel",
    pass: true,
  });
  // Stop every pointer-end route for one gesture, while native touchend still reaches the adapter.
  await page.evaluate(() => {
    const stop = (e) => {
      if (
        (e.target instanceof Element && e.target.closest(".mobile-move")) ||
        e.pointerId === window.__orphanPointer
      ) {
        window.__orphanPointer = e.pointerId;
        e.stopImmediatePropagation();
      }
    };
    window.__stopPadEnd = stop;
    for (const type of ["pointerup", "pointercancel", "pointerleave"])
      document.addEventListener(type, stop, true);
  });
  await touch([a], "touchStart");
  await touch([{ ...a, y: a.y - 30 }]);
  await page.waitForTimeout(60);
  await touch([], "touchEnd");
  await page.waitForTimeout(100);
  const recovered = await state();
  assert.deepEqual(recovered.move, { x: 0, y: 0 });
  assert.notEqual(
    recovered.ids[0],
    original[0],
    "Missing end did not publicly rearm",
  );
  assert.equal(recovered.ids[1], original[1]);
  await page.evaluate(() => {
    for (const type of ["pointerup", "pointercancel", "pointerleave"])
      document.removeEventListener(type, window.__stopPadEnd, true);
  });
  await touch([a], "touchStart");
  await touch([{ ...a, x: a.x + 25 }]);
  await page.waitForTimeout(80);
  assert(
    (await state()).move.x > 0.4,
    "Next gesture is a dead pad after recovery",
  );
  await touch([], "touchEnd");
  await page.waitForTimeout(80);
  evidence.cases.push({
    name: "fault-injected missing pointer end: zero, per-zone rearm, next actual drag works",
    pass: true,
    ids: recovered.ids,
  });
  await writeFile(
    resolve(out, "results.json"),
    JSON.stringify(evidence, null, 2) + "\n",
  );
  await context.close();
} finally {
  await browser.close();
}
console.log(JSON.stringify(evidence, null, 2));
