// @vitest-environment jsdom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { MobileArcade2048 } from "./MobileArcade2048";
import type { useArcade2048 } from "./use-arcade2048";
import { drawArcadeScreen, ARCADE_TILE_MS } from "./arcade2048-screen";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root,
  host: HTMLDivElement,
  controls: ReturnType<typeof useArcade2048>,
  frame = new Map<number, FrameRequestCallback>(),
  now = 0,
  serial = 0;
const words: string[] = [];
const paint = vi.fn();
function context() {
  return {
    setTransform() {},
    save() {},
    restore() {},
    clearRect: paint,
    fillRect() {},
    beginPath() {},
    roundRect() {},
    fill() {},
    stroke() {},
    translate() {},
    scale() {},
    measureText(s: string) {
      return { width: s.length * 10 };
    },
    fillText(s: string) {
      words.push(s);
    },
  } as unknown as CanvasRenderingContext2D;
}
const move = vi.fn(),
  action = vi.fn(),
  leave = vi.fn();
const render = () =>
  root.render(<MobileArcade2048 controls={controls} onExit={leave} />);
function pointer(type: string, x: number, y: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(e, { pointerId: 1, clientX: x, clientY: y });
  host.querySelector("canvas")!.dispatchEvent(e);
}
beforeEach(async () => {
  words.length = 0;
  paint.mockClear();
  move.mockClear();
  action.mockClear();
  leave.mockClear();
  frame.clear();
  now = 0;
  vi.stubGlobal("navigator", { userAgent: "iPhone", maxTouchPoints: 5 });
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: query.includes("orientation: portrait"),
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
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frame.set(++serial, cb);
    return serial;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frame.delete(id));
  vi.spyOn(performance, "now").mockImplementation(() => now);
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context() as never,
  );
  HTMLElement.prototype.setPointerCapture = vi.fn();
  HTMLElement.prototype.hasPointerCapture = () => false;
  vi.spyOn(
    HTMLCanvasElement.prototype,
    "getBoundingClientRect",
  ).mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: 512,
    bottom: 640,
    width: 512,
    height: 640,
    toJSON() {},
  });
  controls = {
    state: {
      view: {
        game: {
          board: [2, 2, ...Array(14).fill(0)],
          score: 0,
          moves: 1,
          revision: 1,
          continued: false,
        },
        best: 0,
        leaders: [],
        ranked: false,
      },
      page: "board",
      active: true,
      pending: false,
      error: "",
      local: true,
      focused: false,
    },
    move,
    action,
    direction: { current: null },
    hardware: { current: { kind: "", at: 0 } },
    setFocused() {},
  };
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => render());
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("uses the exact desktop renderer and does not announce saves during ordinary play", async () => {
  const expected: string[] = [];
  const c = context();
  c.fillText = (s: string) => expected.push(s);
  drawArcadeScreen(c, controls.state, null, now, { touch: true });
  expect(words.slice(-expected.length)).toEqual(expected);
  expect(words.join(" ")).not.toMatch(/Saving|saves as you play/);
  const before = [...words];
  controls = { ...controls, state: { ...controls.state, pending: true } };
  await act(async () => render());
  expect(words.slice(before.length)).toEqual(expected);
  expect(frame.size).toBe(0);
});
it("maps swipes and desktop canvas buttons without turning a swipe into a tap", async () => {
  await act(async () => {
    pointer("pointerdown", 400, 360);
    pointer("pointerup", 100, 360);
  });
  expect(move).toHaveBeenCalledWith("left");
  expect(action).not.toHaveBeenCalled();
  await act(async () => {
    pointer("pointerdown", 240, 110);
    pointer("pointerup", 240, 110);
  });
  expect(action).toHaveBeenCalledWith("new");
  await act(async () => {
    pointer("pointerdown", 425, 616);
    pointer("pointerup", 425, 616);
  });
  expect(leave).toHaveBeenCalledOnce();
});
it("animates an accepted merge/spawn for the shared duration, then schedules no idle work", async () => {
  controls.direction.current = "left";
  controls = {
    ...controls,
    state: {
      ...controls.state,
      view: {
        ...controls.state.view!,
        game: {
          ...controls.state.view!.game!,
          board: [4, 2, ...Array(14).fill(0)],
          score: 4,
          moves: 2,
          revision: 2,
        },
      },
    },
  };
  await act(async () => render());
  expect(frame.size).toBe(1);
  now = ARCADE_TILE_MS / 2;
  let jobs = [...frame.values()];
  frame.clear();
  jobs.forEach((cb) => cb(now));
  expect(frame.size).toBe(1);
  now = ARCADE_TILE_MS;
  jobs = [...frame.values()];
  frame.clear();
  jobs.forEach((cb) => cb(now));
  expect(frame.size).toBe(0);
  const count = paint.mock.calls.length;
  await act(async () => render());
  expect(paint).toHaveBeenCalledTimes(count);
  controls = { ...controls, state: { ...controls.state, active: false } };
  await act(async () => render());
  expect(host.querySelector("canvas")).toBeNull();
  expect(frame.size).toBe(0);
});

it.each([90, -90] as const)(
  "routes real canvas swipes and menus at turn %s",
  async (turn) => {
    vi.stubGlobal("matchMedia", () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }));
    vi.stubGlobal("screen", {
      orientation: Object.assign(new EventTarget(), {
        type: turn === 90 ? "landscape-primary" : "landscape-secondary",
        angle: turn === 90 ? 90 : 270,
      }),
    });
    vi.mocked(
      HTMLCanvasElement.prototype.getBoundingClientRect,
    ).mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: 640,
      bottom: 512,
      width: 640,
      height: 512,
      toJSON() {},
    });
    await act(async () => render());
    expect(
      host.querySelector<HTMLElement>(".mobile-arcade")!.dataset.portraitTurn,
    ).toBe(String(turn));
    const xy = (u: number, v: number) =>
      turn === 90 ? [640 - v, u] : [v, 512 - u];
    const tap = (u: number, v: number) => {
      const [x, y] = xy(u, v);
      pointer("pointerdown", x, y);
      pointer("pointerup", x, y);
    };
    await act(async () => {
      const [a, b] = xy(400, 360),
        [x, y] = xy(100, 360);
      pointer("pointerdown", a, b);
      pointer("pointerup", x, y);
    });
    expect(move).toHaveBeenCalledWith("left");
    await act(async () => tap(240, 110));
    expect(action).toHaveBeenLastCalledWith("new");
    await act(async () => tap(410, 110));
    expect(action).toHaveBeenLastCalledWith("scores");
    controls = { ...controls, state: { ...controls.state, page: "leaders" } };
    await act(async () => render());
    await act(async () => tap(200, 565));
    expect(action).toHaveBeenLastCalledWith("back");
    controls = { ...controls, state: { ...controls.state, page: "confirm" } };
    await act(async () => render());
    await act(async () => tap(350, 390));
    expect(action).toHaveBeenLastCalledWith("confirm");
    await act(async () => tap(100, 390));
    expect(action).toHaveBeenLastCalledWith("back");
    await act(async () => tap(430, 616));
    expect(leave).toHaveBeenCalledOnce();
  },
);

it("cancels animation callbacks while hidden and settles without an idle loop", async () => {
  controls.direction.current = "left";
  controls = {
    ...controls,
    state: {
      ...controls.state,
      view: {
        ...controls.state.view!,
        game: {
          ...controls.state.view!.game!,
          board: [4, 2, ...Array(14).fill(0)],
          score: 4,
          moves: 2,
          revision: 2,
        },
      },
    },
  };
  await act(async () => render());
  expect(frame.size).toBe(1);
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(frame.size).toBe(0);
  now = ARCADE_TILE_MS + 1;
  hidden.mockReturnValue(false);
  await act(async () => document.dispatchEvent(new Event("visibilitychange")));
  expect(frame.size).toBe(0);
});
