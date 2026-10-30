// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import PlanesBoard from "./PlanesBoard";
import {
  REDUCED_SHOT_DURATION,
  SHOT_DURATION,
  COCKPIT_SHOT_DURATION,
  ROUND_RESULT_DURATION,
  shotDuration,
} from "./PlanesShot";
import {
  randomFleet,
  type PlanesView,
  type Shot,
} from "../../../packages/shared/planes";

let container: HTMLDivElement, root: Root, current: PlanesView;
let reduced = false;
const action = vi.fn(async () => null);
function render(
  open = true,
  connected = true,
  state: PlanesView | null = current,
) {
  act(() =>
    root.render(
      <PlanesBoard
        view={state}
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
      advance(shotDuration({ x: 3, y: 3, result }) - 1);
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
      if (call[1] === SHOT_DURATION || call[1] === COCKPIT_SHOT_DURATION)
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
  it("keeps the final boards visible for five seconds and until the player explicitly prepares a rematch", () => {
    render();
    const winnerFleet = randomFleet(() => 0.713);
    current = {
      ...current,
      revealedPlanes: [current.ownPlanes, winnerFleet],
      players: current.players.map((p) =>
        p ? { ...p, ready: false } : null,
      ) as PlanesView["players"],
    };
    incoming("head", true);
    expect(container.querySelector(".planes-result-banner")).toBeNull();
    expect(
      container.querySelector(".planes-main-grid .paper-plane-outlines")
        ?.children,
    ).toHaveLength(0);
    advance(COCKPIT_SHOT_DURATION);
    expect(
      container.querySelector(".planes-result-banner")?.textContent,
    ).toContain("Bob wins!");
    expect(container.querySelector(".planes-round-result")).toBeNull();
    expect(
      container.querySelector('[aria-label="Opponent target grid"]'),
    ).not.toBeNull();
    expect(
      container.querySelector(".planes-main-grid .paper-plane-outlines")
        ?.children,
    ).toHaveLength(3);
    const prepare =
      container.querySelector<HTMLButtonElement>(".planes-ready")!;
    expect(prepare.disabled).toBe(true);
    expect(prepare.textContent).toBe("Prepare rematch in 5s");
    advance(ROUND_RESULT_DURATION - 1);
    expect(prepare.disabled).toBe(true);
    advance(1);
    expect(prepare.disabled).toBe(false);
    expect(prepare.textContent).toBe("Prepare rematch");
    advance(20000);
    expect(
      container.querySelector('[aria-label="Opponent target grid"]'),
    ).not.toBeNull();
    expect(action).not.toHaveBeenCalled();
    act(() => prepare.click());
    expect(
      container.querySelector('[aria-label="Opponent target grid"]'),
    ).toBeNull();
    expect(
      container.querySelector('[aria-label="Your plane placement grid"]'),
    ).not.toBeNull();
    expect(container.querySelector(".planes-ready")?.textContent).toBe(
      "Rematch",
    );
    expect(action).not.toHaveBeenCalled();
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
  it("finishes an outgoing flight before starting the queued incoming shot", () => {
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
    expect(
      container.querySelector(".planes-shot")?.getAttribute("data-shot-id"),
    ).toBe("0:0");
    expect(
      container.querySelector(".planes-own-grid .paper-cell--body"),
    ).toBeNull();
    advance(SHOT_DURATION - 400);
    expect(
      container.querySelector(".planes-shot")?.getAttribute("data-shot-id"),
    ).toBe("1:0");
    expect(targets().every((b) => b.disabled)).toBe(true);
    advance(SHOT_DURATION - 1);
    expect(targets()[1].disabled).toBe(true);
    advance(1);
    expect(targets()[1].disabled).toBe(false);
  });
  it("plays a coalesced three-shot exchange completely before allowing another shot", () => {
    current = { ...current, turn: 0 };
    render();
    current = {
      ...current,
      revision: 4,
      turn: 1,
      shots: [
        [
          { x: 0, y: 0, result: "miss" },
          { x: 1, y: 0, result: "miss" },
        ],
        [{ x: 3, y: 3, result: "body" }],
      ],
      event: {
        id: 4,
        at: Date.now(),
        actor: "a",
        target: "b",
        result: "miss",
        winner: null,
      },
    };
    render();
    expect(
      container.querySelector(".planes-shot")?.getAttribute("data-shot-id"),
    ).toBe("0:0");
    advance(SHOT_DURATION);
    expect(
      container.querySelector(".planes-shot")?.getAttribute("data-shot-id"),
    ).toBe("1:0");
    advance(SHOT_DURATION);
    expect(
      container.querySelector(".planes-shot")?.getAttribute("data-shot-id"),
    ).toBe("0:1");
    advance(SHOT_DURATION);
    expect(container.querySelector(".planes-shot")).toBeNull();
    expect(
      container.querySelector(".planes-main-grid .planes-shot-note")
        ?.textContent,
    ).toContain("B1");
  });
  it("waits for an existing flight and the queued winning explosion before the five-second result pause", () => {
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
    incoming("head", true);
    expect(
      container.querySelector(".planes-shot")?.getAttribute("data-shot-id"),
    ).toBe("0:0");
    advance(SHOT_DURATION - 400);
    expect(container.querySelector(".planes-shot-explosion")).not.toBeNull();
    expect(container.querySelector(".planes-result-banner")).toBeNull();
    advance(COCKPIT_SHOT_DURATION - 1);
    expect(container.querySelector(".planes-result-banner")).toBeNull();
    advance(1);
    expect(
      container.querySelector('[data-result-countdown="5"]'),
    ).not.toBeNull();
  });
  it("ignores click spam without restarting the active animation or submitting a shot", () => {
    render();
    incoming();
    advance(500);
    for (let i = 0; i < 30; i++) act(() => targets()[i].click());
    expect(action).not.toHaveBeenCalled();
    expect(
      container.querySelector(".planes-shot")?.getAttribute("data-shot-id"),
    ).toBe("1:0");
    advance(SHOT_DURATION - 500);
    expect(targets()[0].disabled).toBe(false);
  });
  it("does not celebrate a finished history arriving after a loading or reconnect null snapshot", () => {
    render(true, true, null);
    current = { ...current, phase: "finished", winner: 0, reason: "fleet" };
    render();
    expect(container.querySelector("[data-result-countdown]")).toBeNull();
    current = { ...current, phase: "playing", winner: null, reason: null };
    render();
    render(true, true, null);
    current = { ...current, phase: "finished", winner: 1, reason: "fleet" };
    render();
    expect(container.querySelector("[data-result-countdown]")).toBeNull();
  });
  it("suppresses a historical victory on mount and on fold/reopen during the result", () => {
    current = { ...current, phase: "finished", winner: 0, reason: "fleet" };
    render();
    expect(container.querySelector("[data-result-countdown]")).toBeNull();
    current = {
      ...current,
      phase: "playing",
      winner: null,
      reason: null,
      turn: 1,
    };
    render();
    incoming("head", true);
    advance(COCKPIT_SHOT_DURATION);
    expect(
      container.querySelector('[data-result-countdown="5"]'),
    ).not.toBeNull();
    render(false);
    render();
    expect(container.querySelector("[data-result-countdown]")).toBeNull();
  });
  it("clears the victory gate on a new round without sending any rematch command", () => {
    render();
    incoming("head", true);
    advance(COCKPIT_SHOT_DURATION);
    current = {
      ...current,
      round: 2,
      phase: "setup",
      winner: null,
      reason: null,
      shots: [[], []],
      event: null,
    };
    render();
    expect(container.querySelector("[data-result-countdown]")).toBeNull();
    expect(action).not.toHaveBeenCalled();
    advance(ROUND_RESULT_DURATION);
    expect(action).not.toHaveBeenCalled();
  });
  it.each([0, 1] as const)(
    "reveals the opponent layout for viewer %i while retaining every shot mark",
    (you) => {
      const fleets: [
        NonNullable<PlanesView["ownPlanes"]>,
        NonNullable<PlanesView["ownPlanes"]>,
      ] = [randomFleet(() => 0.3), randomFleet(() => 0.713)];
      const enemy = you === 0 ? 1 : 0,
        point = fleets[enemy][0];
      current = {
        ...current,
        you,
        ownPlanes: fleets[you],
        phase: "finished",
        winner: enemy,
        reason: "fleet",
        revealedPlanes: fleets,
        shots:
          you === 0
            ? [[{ x: point.x, y: point.y, result: "body" }], []]
            : [[], [{ x: point.x, y: point.y, result: "body" }]],
      };
      render();
      const target = container.querySelector(".planes-main-grid")!;
      expect(
        target.querySelectorAll(".paper-plane-outlines path"),
      ).toHaveLength(3);
      expect(target.querySelectorAll(".paper-cell--body")).toHaveLength(1);
      expect(target.querySelectorAll("button:not(:disabled)")).toHaveLength(0);
      expect(container.querySelector("[data-result-countdown]")).toBeNull();
      const before = target.querySelector(".paper-plane-outlines")!.innerHTML;
      current = {
        ...current,
        revision: current.revision + 1,
        ownPlanes: randomFleet(() => 0.91),
        players: current.players.map((p, i) =>
          p ? { ...p, ready: i === enemy } : null,
        ) as PlanesView["players"],
      };
      render();
      expect(
        container.querySelector(".planes-main-grid .paper-plane-outlines")!
          .innerHTML,
      ).toBe(before);
      expect(
        container.querySelectorAll(".planes-main-grid .paper-cell--body"),
      ).toHaveLength(1);
    },
  );
  it("does not overlay a prepared next fleet onto an unreconstructable legacy result", () => {
    current = {
      ...current,
      phase: "finished",
      winner: 1,
      reason: "fleet",
      players: current.players.map((p, i) =>
        p ? { ...p, ready: i === 0 } : null,
      ) as PlanesView["players"],
      ownPlanes: randomFleet(() => 0.91),
    };
    render();
    expect(
      container.querySelectorAll(".planes-own-grid .paper-plane-outlines path"),
    ).toHaveLength(0);
    expect(
      container.querySelector('[aria-label="Opponent target grid"]'),
    ).not.toBeNull();
  });
  it("ignores accidental revealed layouts during live play", () => {
    current = {
      ...current,
      revealedPlanes: [randomFleet(() => 0.3), randomFleet(() => 0.713)],
    };
    render();
    expect(
      container.querySelectorAll(
        ".planes-main-grid .paper-plane-outlines path",
      ),
    ).toHaveLength(0);
  });
  it("keeps player colors tied to seats and aligns the reverse player's header with their sheet", () => {
    current = { ...current, you: 1, turn: 0 };
    render();
    const header = container.querySelector(".planes-player")!;
    expect(header.classList.contains("planes-side-1")).toBe(true);
    expect(header.textContent).toContain("Bob (you)");
    expect(
      container
        .querySelector(".planes-own-grid")
        ?.classList.contains("planes-side-1"),
    ).toBe(true);
    expect(
      container
        .querySelector(".planes-main-grid")
        ?.classList.contains("planes-side-0"),
    ).toBe(true);
  });
  it("keeps your sheet first and equally detailed, and retains the incoming coordinate", () => {
    render();
    incoming();
    advance(SHOT_DURATION);
    const area = container.querySelector(".planes-play-area--battle")!;
    expect(area.firstElementChild?.classList.contains("planes-own-grid")).toBe(
      true,
    );
    expect(area.querySelectorAll(".paper-grid--small")).toHaveLength(0);
    expect(
      area.querySelector(".planes-own-grid .planes-shot-note")?.textContent,
    ).toContain("Bob fired D4 · Body hit.");
  });
});
