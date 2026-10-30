// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlanesBoard from "./PlanesBoard";
import { REDUCED_SHOT_DURATION, SHOT_DURATION } from "./PlanesShot";
import {
  randomFleet,
  type PlanesView,
  type Shot,
} from "../../../packages/shared/planes";

let container: HTMLDivElement, root: Root, current: PlanesView;
let reduced = false;
const action = vi.fn(async () => null);
function render(open = true, connected = true) {
  act(() =>
    root.render(
      <PlanesBoard
        view={current}
        open={open}
        connected={connected}
        onAction={action}
        onClose={() => {}}
        onLeave={() => {}}
      />,
    ),
  );
}
function incoming(result: Shot["result"] = "body", winning = false) {
  current = {
    ...current,
    revision: current.revision + 1,
    turn: 0,
    shots: [current.shots[0], [...current.shots[1], { x: 3, y: 3, result }]],
    event: {
      id: current.revision + 1,
      at: Date.now(),
      actor: "b",
      target: "a",
      result,
      winner: winning ? 1 : null,
    },
    ...(winning
      ? ({ phase: "finished", winner: 1, reason: "fleet" } as const)
      : {}),
  };
  render();
}
function targets() {
  return [
    ...container.querySelectorAll<HTMLButtonElement>(
      '[aria-label="Opponent target grid"] button',
    ),
  ];
}
function advance(ms: number) {
  act(() => vi.advanceTimersByTime(ms));
}
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      "setTimeout",
      "clearTimeout",
      "setInterval",
      "clearInterval",
      "Date",
    ],
  });
  reduced = false;
  action.mockClear();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("matchMedia", () => ({
    matches: reduced,
    addEventListener() {},
    removeEventListener() {},
  }));
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      disconnect() {}
    },
  );
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  current = {
    version: 1,
    revision: 1,
    round: 1,
    phase: "playing",
    players: [
      {
        name: "Alice",
        online: true,
        ready: true,
        remaining: 3,
        awayUntil: null,
      },
      { name: "Bob", online: true, ready: true, remaining: 3, awayUntil: null },
    ],
    you: 0,
    ownPlanes: randomFleet(() => 0.3),
    shots: [[], []],
    turn: 1,
    winner: null,
    deadline: Date.now() + 60000,
    reason: null,
    event: null,
  };
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
describe("shot animation and the firing lock", () => {
  it.each(["miss", "body", "head"] as const)(
    "locks the actual targets during an incoming %s, then permits exactly the normal action",
    async (result) => {
      render();
      incoming(result);
      expect(targets()).toHaveLength(100);
      expect(targets().every((b) => b.disabled)).toBe(true);
      act(() => targets()[0].click());
      expect(action).not.toHaveBeenCalled();
      advance(SHOT_DURATION - 1);
      expect(targets().every((b) => b.disabled)).toBe(true);
      advance(1);
      expect(targets().every((b) => !b.disabled)).toBe(true);
      await act(async () => targets()[0].click());
      expect(action).toHaveBeenCalledExactlyOnceWith(
        { kind: "shot", x: 0, y: 0 },
        current.revision,
      );
    },
  );
  it("does not restart the lock on unrelated snapshots or replay the historical shot on mount", () => {
    render();
    incoming();
    advance(500);
    current = { ...current, revision: current.revision + 1 };
    render();
    advance(SHOT_DURATION - 500);
    expect(targets()[0].disabled).toBe(false);
    act(() => root.unmount());
    root = createRoot(container);
    render();
    expect(targets()[0].disabled).toBe(false);
    expect(container.querySelector(".planes-shot")).toBeNull();
  });
  it("clears the lock and pending callbacks on fold/reopen, reconnect, and a new round", () => {
    const timeoutSpy = vi.spyOn(globalThis, "setTimeout");
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    render();
    incoming();
    render(false);
    render();
    expect(targets()[0].disabled).toBe(false);
    current = { ...current, turn: 1 };
    render();
    incoming();
    render(true, false);
    render();
    expect(targets()[0].disabled).toBe(false);
    current = { ...current, turn: 1 };
    render();
    incoming();
    current = {
      ...current,
      round: 2,
      phase: "setup",
      turn: null,
      event: null,
      shots: [[], []],
    };
    render();
    expect(container.querySelector(".planes-shot")).toBeNull();
    expect(
      container.querySelector('[aria-label="Your plane placement grid"]'),
    ).not.toBeNull();
    current = { ...current, phase: "playing", turn: 1 };
    render();
    incoming();
    act(() => root.unmount());
    root = createRoot(container);
    for (const [index, call] of timeoutSpy.mock.calls.entries()) {
      if (call[1] === SHOT_DURATION)
        expect(clearSpy).toHaveBeenCalledWith(
          timeoutSpy.mock.results[index].value,
        );
    }
    timeoutSpy.mockRestore();
    clearSpy.mockRestore();
  });
  it("uses a short static acknowledgement for reduced motion", () => {
    reduced = true;
    render();
    incoming();
    advance(REDUCED_SHOT_DURATION - 1);
    expect(targets()[0].disabled).toBe(true);
    advance(1);
    expect(targets()[0].disabled).toBe(false);
  });
  it("lets the winning impact finish before showing rematch controls", () => {
    render();
    current = {
      ...current,
      players: current.players.map((p) =>
        p ? { ...p, ready: false } : p,
      ) as PlanesView["players"],
    };
    incoming("head", true);
    expect(
      container.querySelector('[aria-label="Opponent target grid"]'),
    ).not.toBeNull();
    expect(container.querySelector(".planes-ready")).toBeNull();
    advance(SHOT_DURATION);
    expect(
      container.querySelector('[aria-label="Opponent target grid"]'),
    ).toBeNull();
    expect(container.querySelector(".planes-ready")?.textContent).toBe(
      "Rematch",
    );
  });
  it("lands on the actual incoming square relative to the paper, including its page offset", () => {
    const bounds = vi
      .spyOn(HTMLElement.prototype, "getBoundingClientRect")
      .mockImplementation(function (this: HTMLElement) {
        const rect = this.matches(".planes-play-area--battle")
          ? { left: 120, top: 200, width: 760, height: 420 }
          : this.matches(".planes-main-grid h3")
            ? { left: 530, top: 200, width: 300, height: 20 }
            : { left: 250, top: 360, width: 32, height: 32 };
        return {
          ...rect,
          x: rect.left,
          y: rect.top,
          right: rect.left + rect.width,
          bottom: rect.top + rect.height,
          toJSON() {},
        };
      });
    render();
    incoming();
    expect(
      container.querySelector(".planes-shot")?.getAttribute("viewBox"),
    ).toBe("0 0 760 420");
    expect(
      container.querySelector(".planes-shot > g")?.getAttribute("transform"),
    ).toBe("translate(146 176)");
    expect(
      container.querySelector(".planes-shot-core")?.getAttribute("d"),
    ).toBe("M560,25 C560,-11 146,106 146,176");
    bounds.mockRestore();
  });
  it("replaces an outgoing animation with the next accepted incoming shot without unlocking early", () => {
    current = { ...current, turn: 0 };
    render();
    current = {
      ...current,
      revision: 2,
      turn: 1,
      shots: [[{ x: 0, y: 0, result: "miss" }], []],
      event: {
        id: 2,
        at: Date.now(),
        actor: "a",
        target: "b",
        result: "miss",
        winner: null,
      },
    };
    render();
    advance(400);
    incoming();
    advance(SHOT_DURATION - 400);
    expect(targets()[0].disabled).toBe(true);
    advance(400);
    expect(targets()[0].disabled).toBe(true);
    expect(targets()[1].disabled).toBe(false);
  });
  it("keeps your sheet first and equally detailed, and retains the incoming coordinate", () => {
    render();
    incoming();
    advance(SHOT_DURATION);
    const area = container.querySelector(".planes-play-area--battle")!;
    expect(area.firstElementChild?.className).toBe("planes-own-grid");
    expect(area.querySelectorAll(".paper-grid--small")).toHaveLength(0);
    expect(
      area.querySelector(".planes-own-grid .planes-shot-note")?.textContent,
    ).toContain("Bob fired D4 · Body hit.");
  });
});
