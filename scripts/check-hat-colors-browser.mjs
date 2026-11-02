/** Real settings/two-client fixture, intercepted in an owned browser; no listener. */
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { chromium } = require(
    process.env.PLAYWRIGHT_MODULE ||
      "/Users/claumarin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  );
const root = path.resolve(import.meta.dirname, ".."),
  build = path.join(root, ".impeccable/review/hat-colours/build");
const out = path.join(root, "docs/characters/wardrobe/quality-rework/settings");
await fs.mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  headless: true,
  args: ["--use-angle=metal"],
});
const report = {
  scope:
    "Real AppearanceDialog and RoomCore/two local clients; browser-intercepted fixture files, no shared-preview publication",
  checks: [],
  errors: [],
  sockets: [],
};
async function ready(p) {
  await p.waitForFunction(
    () => !document.querySelector(".appearance-preview-status"),
  );
}
async function open(p) {
  await p.getByRole("button", { name: "Open appearance", exact: true }).click();
  await p.getByRole("dialog", { name: "Appearance", exact: true }).waitFor();
  await ready(p);
  await p.getByRole("button", { name: "Hats", exact: true }).click();
}
try {
  for (const [name, viewport, mobile] of [
    ["desktop", { width: 1440, height: 1000 }, false],
    ["portrait", { width: 393, height: 852 }, true],
    ["landscape", { width: 852, height: 393 }, true],
  ]) {
    const c = await browser.newContext({
        viewport,
        isMobile: mobile,
        hasTouch: mobile,
        deviceScaleFactor: 1,
      }),
      p = await c.newPage();
    p.setDefaultTimeout(20000);
    p.on("pageerror", (e) => report.errors.push(e.message));
    p.on("websocket", (s) => report.sockets.push(s.url()));
    await p.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== "http://127.0.0.1:4173") {
        await route.abort();
        return;
      }
      const relative = decodeURIComponent(url.pathname).replace(/^\//, "");
      const file = path.resolve(build, relative);
      if (!file.startsWith(build + path.sep)) {
        await route.abort();
        return;
      }
      try {
        const body = await fs.readFile(file);
        const ext = path.extname(file),
          types = {
            ".html": "text/html",
            ".js": "text/javascript",
            ".css": "text/css",
            ".glb": "model/gltf-binary",
            ".json": "application/json",
            ".png": "image/png",
            ".webp": "image/webp",
            ".woff2": "font/woff2",
          };
        await route.fulfill({
          status: 200,
          body,
          contentType: types[ext] || "application/octet-stream",
        });
      } catch {
        await route.fulfill({ status: 404, body: "Missing fixture file" });
      }
    });
    await p.goto("http://127.0.0.1:4173/__hat-colours-qa.html");
    await p.waitForFunction(
      () => window.__wardrobeQA?.inspect().status === "online",
    );
    if (mobile)
      await p.evaluate(() =>
        document.querySelector(".wardrobe-qa").classList.add("mobile-shell"),
      );
    await open(p);
    await p.getByRole("button", { name: "Panel cap", exact: true }).click();
    await ready(p);
    for (const color of [
      "Navy",
      "Sage",
      "Charcoal",
      "Cream",
      "Rust",
      "Original",
    ]) {
      const b = p.getByRole("button", {
        name: "Hat color: " + color,
        exact: true,
      });
      await b.click();
      await ready(p);
      assert.equal(await b.getAttribute("aria-pressed"), "true");
    }
    await p
      .getByRole("button", { name: "Hat color: Cream", exact: true })
      .click();
    await ready(p);
    const bounds = await p
      .getByRole("dialog", { name: "Appearance", exact: true })
      .boundingBox();
    assert.ok(
      bounds.x >= 0 &&
        bounds.y >= 0 &&
        bounds.x + bounds.width <= viewport.width + 1 &&
        bounds.y + bounds.height <= viewport.height + 1,
    );
    await p.screenshot({ path: path.join(out, name + "-hat-colors.png") });
    await p.getByRole("button", { name: "Apply look", exact: true }).click();
    await p.waitForFunction(() => {
      const s = window.__wardrobeQA.inspect();
      return (
        s.local.hatColor === "cream" &&
        s.seenByObserver?.hatColor === "cream" &&
        !document.querySelector(".appearance-dialog")
      );
    });
    const saved = await p.evaluate(() => window.__wardrobeQA.inspect());
    assert.ok(saved.stored.some(([, a]) => a.hatColor === "cream"));
    await open(p);
    assert.equal(
      await p
        .getByRole("button", { name: "Hat color: Cream", exact: true })
        .getAttribute("aria-pressed"),
      "true",
    );
    await p.getByRole("button", { name: "Bucket hat", exact: true }).click();
    await ready(p);
    await p
      .getByRole("button", { name: "Hat color: Rust", exact: true })
      .click();
    await ready(p);
    await p.getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(
      (await p.evaluate(() => window.__wardrobeQA.inspect())).local.hatColor,
      "cream",
    );
    report.checks.push({
      name,
      allSixSwatches: true,
      apply: true,
      reopen: true,
      cancel: true,
      twoClientAgreement: true,
      persisted: true,
      bounds,
    });
    await c.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.sockets, []);
} catch (e) {
  report.failure = String(e);
  process.exitCode = 1;
} finally {
  await browser.close();
  await fs.writeFile(
    path.join(out, "browser-report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
}
console.log(JSON.stringify(report));
