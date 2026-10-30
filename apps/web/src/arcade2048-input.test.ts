// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { captureArcadeKey } from "./arcade2048-input";
import type { ArcadeScreenState } from "./arcade2048-screen";
const cleanup: (() => void)[] = [];
afterEach(() => {
  cleanup.splice(0).forEach((fn) => fn());
  document.body.replaceChildren();
});
function fixture() {
  const state: ArcadeScreenState = {
    active: true,
    pending: false,
    page: "board",
    error: "",
    local: false,
    view: {
      ranked: true,
      best: 0,
      leaders: [],
      game: {
        board: [2, 2, ...Array(14).fill(0)],
        score: 0,
        moves: 1,
        revision: 1,
        continued: false,
      },
    },
  };
  const controls = {
    move: vi.fn(),
    action: vi.fn((action: string) => {
      if (action === "new") state.page = "confirm";
      if (action === "back") state.page = "board";
    }),
    leave: vi.fn(),
  };
  const section = document.createElement("section");
  section.tabIndex = 0;
  section.dataset.arcadeControls = "";
  document.body.append(section);
  section.focus();
  const capture = (e: KeyboardEvent) => captureArcadeKey(e, state, controls);
  window.addEventListener("keydown", capture, true);
  cleanup.push(() => window.removeEventListener("keydown", capture, true));
  const press = (
    code: string,
    repeat = false,
    target: HTMLElement = section,
  ) => {
    const event = new KeyboardEvent("keydown", {
      code,
      repeat,
      bubbles: true,
      cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
  };
  return { state, controls, section, press };
}
it.each(["Enter", "Space"])(
  "routes N then %s from the focused section to explicit confirmation",
  (code) => {
    const f = fixture();
    f.press("KeyN");
    expect(f.state.page).toBe("confirm");
    expect(f.press(code).defaultPrevented).toBe(true);
    expect(f.controls.action.mock.calls.map((c) => c[0])).toEqual([
      "new",
      "confirm",
    ]);
  },
);
it("continues a win from the focused section and never resets a normal board on Enter/Space", () => {
  const f = fixture();
  f.press("Enter");
  f.press("Space");
  expect(f.controls.action).not.toHaveBeenCalled();
  f.state.view!.game!.board = [
    2048, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2,
  ];
  f.press("Enter");
  expect(f.controls.action).toHaveBeenLastCalledWith("continue");
});
it("uses Escape to cancel/return/leave, and Enter to return from records", () => {
  const f = fixture();
  f.state.page = "confirm";
  f.press("Escape");
  expect(f.controls.action).toHaveBeenLastCalledWith("back");
  expect(f.controls.leave).not.toHaveBeenCalled();
  f.state.page = "leaders";
  f.press("Enter");
  expect(f.state.page).toBe("board");
  f.press("Escape");
  expect(f.controls.leave).toHaveBeenCalledOnce();
});
it("ignores held activation and saving, retains native button activation and browser shortcuts", () => {
  const f = fixture();
  f.state.page = "confirm";
  f.press("Enter", true);
  f.state.pending = true;
  f.press("Space");
  expect(f.controls.action).not.toHaveBeenCalled();
  const button = document.createElement("button");
  f.section.append(button);
  button.focus();
  expect(f.press("Enter", false, button).defaultPrevented).toBe(false);
  expect(f.press("Tab").defaultPrevented).toBe(false);
});
