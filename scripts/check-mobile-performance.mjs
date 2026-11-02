/** Requires an explicitly published isolated localhost QA entry. Never starts or writes a server. */
import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const phase = process.argv[2] || "candidate",
  out = pathToFileURL(
    resolve(
      import.meta.dirname,
      "../.impeccable/review/mobile-input-performance",
      phase + "-evidence",
    ) + "/",
  );
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_EXECUTABLE || undefined,
  headless: true,
  args: ["--use-angle=metal"],
});
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  isMobile: true,
  hasTouch: true,
  deviceScaleFactor: 3,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1",
});
const page = await context.newPage();
page.setDefaultTimeout(7000);
const errors = [],
  sockets = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("websocket", (s) => sockets.push(s.url()));
await page.addInitScript(() => {
  Object.defineProperty(navigator, "standalone", {
    configurable: true,
    get: () => true,
  });
  const stats = {
    mainFrames: 0,
    offscreenClears: 0,
    mainDraws: 0,
    offscreenDraws: 0,
    mainTriangles: 0,
    offscreenTriangles: 0,
    rafCallbacks: 0,
    cpuMs: 0,
    cpuSamples: [],
    contexts: [],
    trace: [],
  };
  window.__mobileWork = stats;
  const nativeRAF = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (callback) =>
    nativeRAF((time) => {
      const start = performance.now();
      try {
        return callback(time);
      } finally {
        const ms = performance.now() - start;
        stats.rafCallbacks++;
        stats.cpuMs += ms;
        stats.cpuSamples.push(ms);
      }
    });
  for (const proto of [
    WebGLRenderingContext.prototype,
    WebGL2RenderingContext.prototype,
  ]) {
    const targets = new WeakMap();
    const bind = proto.bindFramebuffer;
    proto.bindFramebuffer = function (target, framebuffer) {
      if (target === this.FRAMEBUFFER || target === this.DRAW_FRAMEBUFFER)
        targets.set(this, framebuffer);
      return bind.call(this, target, framebuffer);
    };
    const clear = proto.clear;
    proto.clear = function (mask) {
      if (targets.get(this)) stats.offscreenClears++;
      else stats.mainFrames++;
      return clear.call(this, mask);
    };
    for (const [name, countIndex, instanceIndex] of [
      ["drawElements", 1, -1],
      ["drawArrays", 2, -1],
      ["drawElementsInstanced", 1, 4],
      ["drawArraysInstanced", 2, 3],
    ]) {
      const draw = proto[name];
      if (!draw) continue;
      proto[name] = function (...args) {
        const off = !!targets.get(this),
          instances = instanceIndex < 0 ? 1 : args[instanceIndex],
          triangles =
            args[0] === this.TRIANGLES ? (args[countIndex] * instances) / 3 : 0;
        if (off) {
          stats.offscreenDraws++;
          stats.offscreenTriangles += triangles;
        } else {
          stats.mainDraws++;
          stats.mainTriangles += triangles;
        }
        return draw.apply(this, args);
      };
    }
  }
  for (const type of [
    "pointerdown",
    "pointerup",
    "pointercancel",
    "lostpointercapture",
  ])
    document.addEventListener(
      type,
      (e) => {
        if (stats.trace.length < 2000)
          stats.trace.push({
            type,
            id: e.pointerId,
            target: e.target.className || e.target.nodeName,
            x: e.clientX,
            y: e.clientY,
          });
      },
      true,
    );
});
const cdp = await context.newCDPSession(page);
const touch = (points, type = "touchMove") =>
  cdp.send("Input.dispatchTouchEvent", {
    type,
    touchPoints: points.map((p) => ({
      ...p,
      radiusX: 6,
      radiusY: 6,
      force: 1,
    })),
  });
const motion = async () =>
  JSON.parse(
    (await page
      .locator('[data-testid="movement-metrics"]')
      .getAttribute("data-motion")) || "{}",
  );
const state = async () =>
  JSON.parse(
    (await page.locator("[data-mobile-qa]").getAttribute("data-state")) || "{}",
  );
const snapshot = () =>
  page.evaluate(() => ({
    ...window.__mobileWork,
    cpuSamples: [...window.__mobileWork.cpuSamples],
    runtime: JSON.parse(
      document
        .querySelector("canvas[data-mobile-frame-work]")
        ?.getAttribute("data-mobile-frame-work") || "null",
    ),
  }));
const cases = [];
async function sample(name, ms, work) {
  const before = await snapshot(),
    start = Date.now();
  if (work) await work();
  else await page.waitForTimeout(ms);
  const after = await snapshot(),
    seconds = (Date.now() - start) / 1000;
  const delta = {};
  if (before.runtime && after.runtime) {
    delta.simulationUpdates = after.runtime.updates - before.runtime.updates;
    delta.driverDraws = after.runtime.draws - before.runtime.draws;
  }
  for (const key of [
    "mainFrames",
    "offscreenClears",
    "mainDraws",
    "offscreenDraws",
    "mainTriangles",
    "offscreenTriangles",
    "rafCallbacks",
    "cpuMs",
  ])
    delta[key] = after[key] - before[key];
  const cpu = after.cpuSamples
    .slice(before.cpuSamples.length)
    .sort((a, b) => a - b);
  cases.push({
    name,
    seconds,
    delta,
    runtime: after.runtime,
    perSecond: Object.fromEntries(
      Object.entries(delta).map(([k, v]) => [k, v / seconds]),
    ),
    rafCpuP95Ms: cpu[Math.floor(cpu.length * 0.95)] ?? 0,
  });
  await writeFile(new URL("samples.json", out), JSON.stringify(cases, null, 2));
  console.log(JSON.stringify(cases.at(-1)));
}
try {
  await page.goto("http://127.0.0.1:4173/__mobile-world-qa.html");
  assert.equal(
    await page.title(),
    "La Baraj mobile QA",
    "Publish the isolated QA entry in a coordinated slot before running this script",
  );
  await page.locator(".mobile-start").click();
  await page
    .locator('[data-testid="movement-metrics"][data-motion]')
    .waitFor({ state: "attached", timeout: 25000 });
  await page.waitForTimeout(2500);
  await page
    .locator('aside[aria-label="Teste 3D Cruce"]')
    .evaluate((e) => (e.style.display = "none"));
  await sample("idle-world", 30000);
  const initial = await motion(),
    gestureSamples = [];
  await sample("two-finger-move-look", 0, async () => {
    for (let cycle = 0; cycle < 24; cycle++) {
      const move = await page.locator(".mobile-stick").first().boundingBox();
      const look =
        phase === "baseline"
          ? { x: 250, y: 260, width: 100, height: 160 }
          : await page.locator(".mobile-look").boundingBox();
      const a = {
          id: 1,
          x: move.x + move.width / 2,
          y: move.y + move.height / 2,
        },
        b = { id: 2, x: look.x + look.width / 2, y: look.y + look.height / 2 };
      // Alternate first-contact order, then release only one contact.
      await touch([cycle % 2 ? a : b], "touchStart");
      await page.waitForTimeout(50);
      await touch([a, b], "touchStart");
      const moved = { ...a, y: a.y + (cycle % 2 ? -40 : 40) },
        turned = { ...b, x: b.x + (cycle % 2 ? -32 : 32) };
      await touch([moved, turned]);
      await page.waitForTimeout(600);
      gestureSamples.push({ cycle, during: await motion() });
      await touch(cycle % 2 ? [moved] : [turned], "touchEnd");
      await page.waitForTimeout(180);
      gestureSamples.at(-1).oneReleased = await motion();
      await touch([], cycle % 3 === 0 ? "touchCancel" : "touchEnd");
      await page.waitForTimeout(180);
      gestureSamples.at(-1).released = await motion();
    }
  });
  await page.getByText("Local touch QA", { exact: true }).click();
  await page
    .getByRole("button", { name: "Approach 2048", exact: true })
    .click();
  await page
    .locator('aside[aria-label="Mobile QA tools"]')
    .evaluate((e) => (e.style.display = "none"));
  await page.waitForTimeout(800);
  await page
    .locator(".planes-entry")
    .getByRole("button", { name: /Play 2048/ })
    .click();
  await page.locator(".mobile-arcade-board").waitFor();
  await page.waitForTimeout(2000);
  await sample("2048-opaque-board", 20000);
  const arcadeBefore = (await state()).arcade?.game;
  const board = await page.locator(".mobile-arcade-board").boundingBox();
  await touch(
    [
      {
        id: 3,
        x: board.x + board.width * 0.8,
        y: board.y + board.height * 0.5,
      },
    ],
    "touchStart",
  );
  await page.waitForTimeout(100);
  await touch([
    { id: 3, x: board.x + board.width * 0.2, y: board.y + board.height * 0.5 },
  ]);
  await page.waitForTimeout(100);
  await touch([], "touchEnd");
  await page.waitForTimeout(500);
  const arcadeAfter = (await state()).arcade?.game;
  await page
    .locator(".mobile-arcade")
    .getByRole("button", { name: "Leave cabinet", exact: true })
    .click();
  await page.waitForTimeout(1000);
  await sample("world-resumed", 10000);
  await page
    .locator('aside[aria-label="Teste 3D Cruce"]')
    .evaluate((e) => (e.style.display = "block"));
  await page
    .getByRole("button", { name: "Mergi lângă masa Cruce (test)", exact: true })
    .click();
  await page.waitForTimeout(700);
  await page
    .locator('aside[aria-label="Teste 3D Cruce"]')
    .evaluate((e) => (e.style.display = "none"));
  await page.locator(".mobile-context").click();
  await page.locator(".cruce-board").waitFor();
  await page.waitForTimeout(1800);
  await sample("cruce-opaque-lobby", 20000);
  await page
    .locator(".cruce-board")
    .getByRole("button", { name: /Ridică-te/ })
    .click();
  if (await page.locator(".cruce-exit").count())
    await page.locator(".cruce-exit").getByRole("button").last().click();
  await page.waitForTimeout(1000);
  const final = await motion(),
    work = await snapshot();
  await writeFile(
    new URL("results.json", out),
    JSON.stringify(
      {
        phase,
        head: "artifact recorded in payload manifest",
        driver: browser.version(),
        viewport:
          "393x852 / DPR3 / coarse touch / iPhone UA / standalone hint; Chromium emulation, not physical Safari",
        errors,
        sockets,
        cases,
        initial,
        final,
        gestureSamples,
        arcadeBefore,
        arcadeAfter,
        trace: work.trace,
      },
      null,
      2,
    ),
  );
  if (phase !== "baseline") {
    for (const entry of cases) {
      if (entry.name === "idle-world" || entry.name === "world-resumed") {
        assert(
          entry.perSecond.mainFrames > 28 && entry.perSecond.mainFrames < 32,
          "draw budget outside 30 Hz",
        );
        assert(
          entry.perSecond.simulationUpdates > 56 &&
            entry.perSecond.simulationUpdates < 64,
          "simulation budget outside 60 Hz",
        );
      }
      if (entry.name.includes("opaque")) {
        assert.equal(entry.delta.mainFrames, 0, "opaque world drew frames");
        assert.equal(
          entry.delta.offscreenDraws,
          0,
          "opaque world drew offscreen",
        );
        assert.equal(
          entry.delta.simulationUpdates,
          0,
          "opaque world simulated",
        );
      }
    }
    const active = new Map(),
      ended = [];
    for (const event of work.trace) {
      const role = event.target.includes("mobile-look")
        ? "look"
        : event.target.includes("mobile-move")
          ? "move"
          : null;
      if (event.type === "pointerdown" && role) active.set(event.id, role);
      if (
        (event.type === "pointerup" || event.type === "pointercancel") &&
        active.has(event.id)
      ) {
        if (active.size === 2) ended.push(active.get(event.id));
        active.delete(event.id);
      }
    }
    assert.equal(
      ended.length,
      gestureSamples.length,
      "A gesture did not end exactly one captured pad first",
    );
    for (let i = 0; i < gestureSamples.length; i++) {
      const sample = gestureSamples[i],
        cleared = ended[i] === "look" ? "touchLook" : "touchMovement",
        held = ended[i] === "look" ? "touchMovement" : "touchLook";
      assert.deepEqual(
        sample.oneReleased[cleared],
        [0, 0],
        "Ended pad remained held",
      );
      assert.deepEqual(
        sample.oneReleased[held],
        sample.during[held],
        "Ending one pad changed the other pointer",
      );
      assert.deepEqual(
        sample.released.touchMovement,
        [0, 0],
        "Movement remained held",
      );
      assert.deepEqual(sample.released.touchLook, [0, 0], "Look remained held");
    }
  }

  assert.equal(sockets.length, 0, "QA opened a network socket");
  assert.equal(errors.length, 0, "Page errors");
  console.log("Evidence saved " + out.pathname);
} finally {
  await page.setViewportSize({ width: 393, height: 852 }).catch(() => {});
  await context.close();
  await browser.close();
}
