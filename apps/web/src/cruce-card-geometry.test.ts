import { expect, it } from "vitest";
import { createCruceCardGeometry } from "./cruce-card-geometry";
import {
  CRUCE_CARD_WIDTH,
  CRUCE_CARD_HEIGHT,
  CRUCE_CARD_RADIUS,
} from "../../../packages/shared/cruce-card-frame";
it("removes the opaque source corners while retaining portrait orientation and full-face UVs", () => {
  const g = createCruceCardGeometry(),
    p = g.getAttribute("position"),
    uv = g.getAttribute("uv");
  g.computeBoundingBox();
  const b = g.boundingBox!;
  expect(b.max.x - b.min.x).toBeCloseTo(CRUCE_CARD_WIDTH, 6);
  expect(b.max.y - b.min.y).toBeCloseTo(CRUCE_CARD_HEIGHT, 6);
  for (let i = 0; i < p.count; i++) {
    expect(uv.getX(i)).toBeGreaterThanOrEqual(-0.000001);
    expect(uv.getX(i)).toBeLessThanOrEqual(1.000001);
    expect(uv.getY(i)).toBeGreaterThanOrEqual(-0.000001);
    expect(uv.getY(i)).toBeLessThanOrEqual(1.000001);
    if (p.getY(i) > b.max.y - 0.000001)
      expect(Math.abs(p.getX(i))).toBeLessThanOrEqual(
        CRUCE_CARD_WIDTH / 2 - CRUCE_CARD_RADIUS + 0.000001,
      );
    if (p.getY(i) > b.max.y - 0.000001) expect(uv.getY(i)).toBeCloseTo(1, 5);
  }
  g.dispose();
});
