// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { blockPlanesResultExit } from "./planes-input";
function board(value = "3", hidden = false) {
  document.body.innerHTML = `<section class="planes-notebook" data-result-countdown="${value}" ${hidden ? "hidden" : ""}></section>`;
}
afterEach(() => document.body.replaceChildren());
describe("round-result exit boundary used by Game capture", () => {
  it.each(["Escape", "KeyF"])(
    "blocks plain %s before later window listeners can close or stand",
    (code) => {
      board();
      const exit = vi.fn();
      const capture = (event: KeyboardEvent) => {
        if (blockPlanesResultExit(event, true)) return;
        exit();
      };
      window.addEventListener("keydown", capture, true);
      const event = new KeyboardEvent("keydown", {
        code,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(event);
      expect(event.defaultPrevented).toBe(true);
      expect(exit).not.toHaveBeenCalled();
      document.body.replaceChildren();
      const after = new KeyboardEvent("keydown", {
        code,
        bubbles: true,
        cancelable: true,
      });
      window.dispatchEvent(after);
      expect(exit).toHaveBeenCalledOnce();
      expect(after.defaultPrevented).toBe(false);
      window.removeEventListener("keydown", capture, true);
    },
  );
  it("does not lock on hidden, stale, false or expired result attributes", () => {
    for (const value of ["false", "true", "0", "4", ""]) {
      board(value);
      expect(
        blockPlanesResultExit(
          new KeyboardEvent("keydown", { code: "Escape" }),
          true,
        ),
      ).toBe(false);
    }
    board("3", true);
    expect(
      blockPlanesResultExit(
        new KeyboardEvent("keydown", { code: "Escape" }),
        true,
      ),
    ).toBe(false);
    board();
    expect(
      blockPlanesResultExit(
        new KeyboardEvent("keydown", { code: "Escape" }),
        false,
      ),
    ).toBe(false);
  });
  it("retains Tab and browser modifier shortcuts", () => {
    board();
    for (const init of [
      { code: "Tab" },
      { code: "Escape", shiftKey: true },
      { code: "KeyF", ctrlKey: true },
      { code: "KeyF", metaKey: true },
      { code: "KeyF", altKey: true },
    ]) {
      const event = new KeyboardEvent("keydown", { ...init, cancelable: true });
      expect(blockPlanesResultExit(event, true)).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    }
  });
});
