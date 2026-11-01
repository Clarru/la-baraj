// @vitest-environment jsdom
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { mobileViewport } from "./mobile-viewport";
import { MobileExperience } from "./MobileExperience";
import { useMobileBlocked } from "./mobile-display";
import {
  mobileMovement,
  mobileLook,
  setMobileMovement,
  setMobileLook,
} from "./mobile-input";
(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
it("uses the visible viewport offsets and height without double-counting safe areas", () => {
  vi.stubGlobal("visualViewport", {
    width: 852,
    height: 370,
    offsetTop: 23,
    offsetLeft: 0,
    scale: 1,
  });
  expect(mobileViewport()).toEqual({
    width: 852,
    height: 370,
    top: 23,
    left: 0,
  });
});
it("does not fight an intentional pinch zoom by resizing the app into its zoomed viewport", () => {
  vi.stubGlobal("visualViewport", {
    width: 400,
    height: 200,
    offsetTop: 100,
    offsetLeft: 50,
    scale: 2,
  });
  expect(mobileViewport()).toEqual({
    width: window.innerWidth,
    height: window.innerHeight,
    top: 0,
    left: 0,
  });
});
it("requires landscape, resets both axes on portrait, and resumes the same mounted game", async () => {
  let portrait = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal("navigator", { userAgent: "iPhone", standalone: true });
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("orientation") ? portrait : false;
    },
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
  const div = document.createElement("div");
  document.body.append(div);
  const root = createRoot(div);
  function Game() {
    const paused = useMobileBlocked();
    return (
      <div data-game data-paused={paused}>
        Game
      </div>
    );
  }
  await act(async () =>
    root.render(
      <MobileExperience>
        <Game />
      </MobileExperience>,
    ),
  );
  await act(async () =>
    div.querySelector<HTMLButtonElement>(".mobile-start")!.click(),
  );
  const game = div.querySelector("[data-game]");
  setMobileMovement(0.2, -0.8);
  setMobileLook(0.6, 0);
  await act(async () => {
    portrait = true;
    listeners.forEach((notify) => notify());
  });
  expect(div.textContent).toContain("Rotate your phone to play");
  expect(game?.getAttribute("data-paused")).toBe("true");
  expect(mobileMovement).toEqual({ x: 0, y: 0 });
  expect(mobileLook).toEqual({ x: 0, y: 0 });
  await act(async () => {
    portrait = false;
    listeners.forEach((notify) => notify());
  });
  expect(div.querySelector("[data-game]")).toBe(game);
  expect(game?.getAttribute("data-paused")).toBe("false");
  await act(async () => root.unmount());
  div.remove();
});

it("keeps the world size while typing and restores it despite stale iOS keyboard geometry", async () => {
  const { useRef } = await import("react");
  const { useMobileViewport } = await import("./mobile-viewport");
  const view = Object.assign(new EventTarget(), {
    width: 852,
    height: 393,
    offsetTop: 0,
    offsetLeft: 0,
    scale: 1,
  });
  vi.stubGlobal("visualViewport", view);
  const frames = new Map<number, FrameRequestCallback>();
  let serial = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    frames.set(++serial, cb);
    return serial;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  const flush = () => {
    const work = [...frames.values()];
    frames.clear();
    work.forEach((cb) => cb(0));
  };
  let scrollY = 0;
  vi.spyOn(window, "scrollY", "get").mockImplementation(() => scrollY);
  const scrollTo = vi
    .spyOn(window, "scrollTo")
    .mockImplementation((options: ScrollToOptions | number) => {
      scrollY = typeof options === "object" ? (options.top ?? 0) : 0;
    });
  function Frame() {
    const ref = useRef<HTMLDivElement>(null);
    useMobileViewport(ref, true);
    return (
      <div ref={ref} data-frame>
        <textarea />
      </div>
    );
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Frame />));
    const frame = host.querySelector<HTMLElement>("[data-frame]")!,
      input = host.querySelector("textarea")!;
    const geometry = () =>
      ["width", "height", "top", "left"].map((k) =>
        frame.style.getPropertyValue(`--mobile-${k}`),
      );
    expect(geometry()).toEqual(["852px", "393px", "0px", "0px"]);
    await act(async () => input.focus());
    flush();
    view.height = 117;
    view.offsetTop = 25;
    scrollY = 25;
    await act(async () => view.dispatchEvent(new Event("resize")));
    flush();
    expect(geometry()).toEqual(["852px", "393px", "25px", "0px"]);
    await act(async () => {
      input.blur();
      await Promise.resolve();
    });
    flush();
    expect(geometry()).toEqual(["852px", "393px", "0px", "0px"]);
    expect(scrollTo).toHaveBeenCalledWith({
      left: 0,
      top: 0,
      behavior: "instant",
    });
    // Safari can retain both an old offset and an intermediate height after Done.
    view.height = 325;
    view.offsetTop = 25;
    await act(async () => view.dispatchEvent(new Event("scroll")));
    flush();
    expect(geometry()).toEqual(["852px", "393px", "0px", "0px"]);
    view.height = 393;
    view.offsetTop = 0;
    await act(async () => view.dispatchEvent(new Event("resize")));
    flush();
    expect(geometry()).toEqual(["852px", "393px", "0px", "0px"]);
    // iOS may finish orientation layout after orientationchange, while still editing.
    await act(async () => input.focus());
    flush();
    await act(async () => window.dispatchEvent(new Event("orientationchange")));
    vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(
      393,
    );
    vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(
      852,
    );
    view.width = 393;
    view.height = 300;
    view.offsetTop = 0;
    await act(async () => view.dispatchEvent(new Event("resize")));
    flush();
    expect(geometry()).toEqual(["393px", "852px", "0px", "0px"]);
    await act(async () => {
      input.blur();
      await Promise.resolve();
    });
    flush();
    expect(geometry()).toEqual(["393px", "852px", "0px", "0px"]);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
  expect(frames.size).toBe(0);
});

it("keeps the world landscape gate while the activity supplies a portrait surface without remounting", async () => {
  const { setMobileOrientation } = await import("./mobile-display");
  let portrait = false;
  const listeners = new Set<() => void>();
  vi.stubGlobal("navigator", { userAgent: "iPhone", standalone: true });
  vi.stubGlobal("matchMedia", (query: string) => ({
    get matches() {
      return query.includes("orientation") ? portrait : false;
    },
    addEventListener: (_: string, cb: () => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
  }));
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <MobileExperience>
          <div data-game>Game</div>
        </MobileExperience>,
      ),
    );
    await act(async () =>
      host.querySelector<HTMLButtonElement>(".mobile-start")!.click(),
    );
    const game = host.querySelector("[data-game]");
    await act(async () => setMobileOrientation("portrait"));
    expect(host.querySelector(".mobile-rotate")).toBeNull(); // The activity supplies a portrait surface, including cached landscape views.
    await act(async () => {
      portrait = true;
      listeners.forEach((f) => f());
    });
    expect(host.querySelector(".mobile-rotate")).toBeNull();
    expect(host.querySelector("[data-game]")).toBe(game);
    await act(async () => setMobileOrientation("landscape"));
    expect(host.textContent).toContain("La Baraj plays in landscape");
    await act(async () => {
      portrait = false;
      listeners.forEach((f) => f());
    });
    expect(host.querySelector(".mobile-rotate")).toBeNull();
    expect(host.querySelector("[data-game]")).toBe(game);
  } finally {
    await act(async () => {
      setMobileOrientation("landscape");
      root.unmount();
    });
    host.remove();
  }
});
