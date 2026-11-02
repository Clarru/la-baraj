/** Native dialog regression; no listener, Game scene, network or profile write. */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import { createRequire, stripTypeScriptTypes } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const playwright = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = path.resolve(import.meta.dirname, "..");
const source = await fs.readFile(path.join(root, "apps/web/src/game-input.ts"), "utf8");
const guard = '  if (state.panel === "appearance") return "block";\n';
assert.ok(source.includes(guard), "Expected Appearance native-key guard");
const report = {
  scope: "Actual game-input module with native dialog/default events; no Game scene, server or profile write",
  cases: [],
};

for (const engine of ["chromium", "webkit"]) {
  const browser = await playwright[engine].launch({
    headless: true,
    ...(engine === "chromium" && process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : {}),
  });
  try {
    for (const variant of ["before", "fixed"]) {
      const context = await browser.newContext();
      try {
        const page = await context.newPage();
        // Removing just this guard recreates the observed global Escape bypass.
        const input = variant === "before" ? source.replace(guard, "") : source;
        const moduleSource = stripTypeScriptTypes(input);
        await page.setContent(
          '<dialog><button id="apply">Apply look</button><button>Other</button></dialog>',
        );
        await page.evaluate(async (moduleSource) => {
          const module = await import(
            URL.createObjectURL(new Blob([moduleSource], { type: "text/javascript" }))
          );
          const dialog = document.querySelector("dialog");
          window.result = {
            busy: true, cancels: 0, closed: 0, help: 0,
            gameKeys: 0, clicks: 0, actions: [],
          };
          // Same pending-close behavior as GameDialog's native cancel handler.
          dialog.addEventListener("cancel", (event) => {
            event.preventDefault();
            result.cancels++;
            if (!result.busy) {
              result.closed++;
              dialog.close();
            }
          });
          document.querySelector("#apply").onclick = () => result.clicks++;
          window.addEventListener("keydown", (event) => {
            const action = module.captureGameKey(event, {
              panel: "appearance", homeView: false, indoors: false, typing: false,
            });
            result.actions.push({ code: event.code, action, defaultPrevented: event.defaultPrevented });
            // Reproduce Game's global close/help dispatch without a world scene.
            if (action === "close-panel") {
              result.closed++;
              dialog.close();
            }
            if (action === "controls") {
              result.help++;
              dialog.close();
            }
          }, true);
          window.addEventListener("keydown", () => result.gameKeys++);
          dialog.showModal();
        }, moduleSource);
        const snapshot = () => page.evaluate(() => ({
          ...result, open: document.querySelector("dialog").open,
        }));
        await page.keyboard.press("Escape");
        await page.waitForTimeout(100);
        const pending = await snapshot();
        const record = {
          engine, variant,
          sourceSHA256: crypto.createHash("sha256").update(input).digest("hex"),
          pending,
        };
        if (variant === "before") {
          assert.equal(pending.open, false);
          assert.equal(pending.closed, 1);
          report.cases.push(record);
          continue;
        }
        assert.equal(pending.open, true);
        assert.equal(pending.closed, 0);
        assert.equal(pending.cancels, 1);
        await page.keyboard.press("?");
        await page.keyboard.press("w");
        await page.locator("#apply").focus();
        await page.keyboard.press("Enter");
        await page.keyboard.press("Space");
        const buttons = await snapshot();
        assert.equal(buttons.help, 0);
        assert.equal(buttons.gameKeys, 0);
        assert.equal(buttons.clicks, 2);
        assert.equal(buttons.open, true);
        await page.evaluate(() => result.busy = false);
        await page.keyboard.press("Escape");
        await page.waitForTimeout(100);
        const settled = await snapshot();
        assert.equal(settled.open, false);
        assert.equal(settled.closed, 1);
        assert.equal(settled.cancels, 2);
        report.cases.push({ ...record, buttons, settled });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
const output = path.resolve(root, process.argv[2] || ".impeccable/review/wardrobe/native-cancel-report.json");
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ passed: true, cases: report.cases.length, output }));
