import { expect, it } from "vitest";
import {
  arcadePortraitSurface,
  arcadeTouchPoint,
} from "./mobile-arcade-surface";
import { hitArcadeScreen, type ArcadeScreenState } from "./arcade2048-screen";
const state: ArcadeScreenState = {
  active: true,
  pending: false,
  page: "board",
  error: "",
  local: true,
  view: null,
};
it("maps the portrait cabinet buttons through the measured canvas bounds", () => {
  const r = { left: 100, top: 200, width: 256, height: 320 };
  for (const [u, v, page, want] of [
    [240, 110, "board", "new"],
    [410, 110, "board", "scores"],
    [200, 565, "leaders", "back"],
    [350, 390, "confirm", "confirm"],
    [100, 390, "confirm", "back"],
    [430, 616, "board", "leave"],
  ] as const) {
    const p = arcadeTouchPoint(r.left + u / 2, r.top + v / 2, r);
    expect(hitArcadeScreen({ ...state, page }, p.u, p.v)).toBe(want);
  }
});
it("preserves portrait aspect and safe bounds when the available frame changes", () => {
  for (const [w, h, safe] of [
    [393, 852, [59, 0, 34, 0]],
    [430, 932, [59, 0, 34, 0]],
    [320, 568, [0, 0, 20, 0]],
  ] as [number, number, [number, number, number, number]][]) {
    const p = arcadePortraitSurface(w, h, safe);
    expect(p.width / p.height).toBeCloseTo(0.8);
    expect(p.x - p.width / 2).toBeGreaterThanOrEqual(safe[3] - 0.01);
    expect(p.x + p.width / 2).toBeLessThanOrEqual(w - safe[1] + 0.01);
    expect(p.y - p.height / 2).toBeGreaterThanOrEqual(safe[0] - 0.01);
    expect(p.y + p.height / 2).toBeLessThanOrEqual(h - safe[2] + 0.01);
  }
});
