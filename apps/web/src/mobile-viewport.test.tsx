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
