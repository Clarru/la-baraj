import { expect, it } from "vitest";
import {
  arcadePortraitSurface,
  arcadePortraitTurn,
  arcadeTouchPoint,
  arcadeTouchDelta,
  type ArcadeQuarterTurn,
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
it("uses natural portrait and both supported landscape quarter-turns", () => {
  expect(arcadePortraitTurn(true, "landscape-secondary", 270)).toBe(0);
  expect(arcadePortraitTurn(false, "landscape-primary", 90)).toBe(90);
  expect(arcadePortraitTurn(false, "landscape-secondary", 270)).toBe(-90);
  expect(arcadePortraitTurn(false, "landscape-secondary", -90)).toBe(-90);
  expect(arcadePortraitTurn(false, "landscape-secondary", 0)).toBe(-90);
});
it.each([0, 90, -90] as ArcadeQuarterTurn[])(
  "maps every cabinet action through turn %s",
  (turn) => {
    const r = {
      left: 100,
      top: 200,
      width: turn ? 320 : 256,
      height: turn ? 256 : 320,
    };
    const physical = (u: number, v: number) =>
      turn === 90
        ? [r.left + (1 - v / 640) * r.width, r.top + (u / 512) * r.height]
        : turn === -90
          ? [r.left + (v / 640) * r.width, r.top + (1 - u / 512) * r.height]
          : [r.left + (u / 512) * r.width, r.top + (v / 640) * r.height];
    for (const [u, v, page, want] of [
      [240, 110, "board", "new"],
      [410, 110, "board", "scores"],
      [200, 565, "leaders", "back"],
      [350, 390, "confirm", "confirm"],
      [100, 390, "confirm", "back"],
      [430, 616, "board", "leave"],
    ] as const) {
      const [x, y] = physical(u, v),
        p = arcadeTouchPoint(x, y, r, turn);
      expect(p.u).toBeCloseTo(u);
      expect(p.v).toBeCloseTo(v);
      expect(hitArcadeScreen({ ...state, page }, p.u, p.v)).toBe(want);
    }
    const delta =
      turn === 90
        ? arcadeTouchDelta(0, -100, turn)
        : turn === -90
          ? arcadeTouchDelta(0, 100, turn)
          : arcadeTouchDelta(-100, 0, turn);
    expect(delta.x).toBe(-100);
    expect(Math.abs(delta.y)).toBe(0);
  },
);
it.each([0, 90, -90] as ArcadeQuarterTurn[])(
  "keeps aspect and physical safe bounds on resize at turn %s",
  (turn) => {
    for (const [w, h, safe] of [
      [393, 852, [59, 0, 34, 0]],
      [852, 393, [0, 59, 20, 59]],
      [852, 334, [0, 59, 20, 59]],
      [640, 320, [8, 30, 12, 10]],
    ] as [number, number, [number, number, number, number]][]) {
      const p = arcadePortraitSurface(w, h, safe, turn),
        bw = turn ? p.height : p.width,
        bh = turn ? p.width : p.height;
      expect(p.width / p.height).toBeCloseTo(0.8);
      expect(p.x - bw / 2).toBeGreaterThanOrEqual(safe[3] - 0.01);
      expect(p.x + bw / 2).toBeLessThanOrEqual(w - safe[1] + 0.01);
      expect(p.y - bh / 2).toBeGreaterThanOrEqual(safe[0] - 0.01);
      expect(p.y + bh / 2).toBeLessThanOrEqual(h - safe[2] + 0.01);
    }
  },
);
