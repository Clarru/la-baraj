import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mobileKeyDown,
  mobileMovement,
  mobileLook,
  setMobileLook,
  performMobileAction,
  resetMobileInput,
  setMobileMovement,
  setMobileRun,
  subscribeMobileActions,
} from "./mobile-input";
import { swipeDirection } from "./MobileArcade2048";
afterEach(() => {
  resetMobileInput();
  vi.restoreAllMocks();
});
describe("touch movement and actions", () => {
  it("preserves independent continuous movement/look vectors and resets both", () => {
    setMobileMovement(0.37, -0.81);
    setMobileLook(0.72, 0.1);
    expect(mobileMovement).toEqual({ x: 0.37, y: -0.81 });
    expect(mobileLook).toEqual({ x: 0.72, y: 0.1 });
    expect(mobileKeyDown("KeyW")).toBe(true);
    expect(mobileKeyDown("KeyD")).toBe(true);
    setMobileRun(true);
    expect(mobileKeyDown("ShiftLeft")).toBe(true);
    resetMobileInput();
    expect(mobileMovement).toEqual({ x: 0, y: 0 });
    expect(mobileLook).toEqual({ x: 0, y: 0 });
    expect(mobileKeyDown("ShiftLeft")).toBe(false);
  });
  it("uses the same action eligibility handlers without DOM key dispatch and supports cleanup", () => {
    const seen: string[] = [];
    const off = subscribeMobileActions((event) => seen.push(event.code));
    performMobileAction("interact");
    performMobileAction("jump");
    performMobileAction("vehicle");
    off();
    performMobileAction("sit");
    expect(seen).toEqual(["KeyE", "Space", "KeyV"]);
  });
  it("stops an action when an earlier handler owns it", () => {
    const seen: string[] = [];
    const off = subscribeMobileActions((event) => {
      seen.push("claimed");
      event.stopImmediatePropagation();
    });
    const later = subscribeMobileActions(() => seen.push("late"));
    performMobileAction("interact");
    off();
    later();
    expect(seen).toEqual(["claimed"]);
  });
  it.each([
    [80, 10, "right"],
    [-80, 0, "left"],
    [5, -50, "up"],
    [0, 50, "down"],
    [10, 10, null],
  ] as const)("maps a swipe (%s, %s) to %s", (x, y, direction) =>
    expect(swipeDirection(x, y)).toBe(direction),
  );
});

it("holds a tap just long enough for the physics controller to sample jump", () => {
  const now = vi.spyOn(performance, "now").mockReturnValue(1000);
  performMobileAction("jump");
  expect(mobileKeyDown("Space")).toBe(true);
  now.mockReturnValue(1121);
  expect(mobileKeyDown("Space")).toBe(false);
});
