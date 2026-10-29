import { describe, it, expect } from "vitest";
import {
  makeRoadRibbon,
  makeHorizonLand,
  makeBackgroundForest,
  BACKGROUND_TREE_BUDGET,
} from "./landscape-geometry";
import { inWater, cabinSpots } from "./geography";

describe("continuous road surface", () => {
  it("shares cross-sections through corners, retains metre-based UVs and feathers only the verge", () => {
    const geometry = makeRoadRibbon(
      [
        {
          kind: "residential",
          points: [
            [0, 0],
            [12, 0],
            [12, 12],
          ],
        },
      ],
      () => 2,
    );
    const p = geometry.attributes.position,
      uv = geometry.attributes.uv,
      color = geometry.attributes.color;
    expect(p.count).toBe(7 * 4);
    expect(geometry.index!.count).toBe(6 * 18);
    for (let i = 0; i < p.count; i++) {
      expect(p.getY(i)).toBeCloseTo(2.065);
      expect(geometry.attributes.normal.getY(i)).toBeGreaterThan(0.99);
      expect(color.getW(i)).toBe(i % 4 === 0 || i % 4 === 3 ? 0 : 1);
    }
    expect(uv.getY(0)).toBe(0);
    expect(uv.getY(p.count - 1)).toBe(8);
    // Both neighbouring segments refer to the same four corner vertices.
    const before = Array.from(geometry.index!.array.slice(2 * 18, 3 * 18));
    const after = Array.from(geometry.index!.array.slice(3 * 18, 4 * 18));
    for (const vertex of [12, 13, 14, 15]) {
      expect(before).toContain(vertex);
      expect(after).toContain(vertex);
    }
    for (let i = 12; i < 16; i++)
      expect(Math.hypot(p.getX(i) - 12, p.getZ(i))).toBeLessThan(3.4);
    geometry.dispose();
  });
  it("preserves road classes and rejects zero-length, invalid and non-road segments", () => {
    const narrow = makeRoadRibbon(
      [
        {
          kind: "residential",
          points: [
            [0, 0],
            [6, 0],
          ],
        },
      ],
      () => 0,
    );
    const wide = makeRoadRibbon(
      [
        {
          kind: "secondary",
          points: [
            [0, 0],
            [6, 0],
          ],
        },
      ],
      () => 0,
    );
    expect(
      Math.abs(wide.attributes.position.getZ(0)) /
        Math.abs(narrow.attributes.position.getZ(0)),
    ).toBeCloseTo(2.8 / 1.8);
    const path = makeRoadRibbon(
      [
        {
          kind: "footway",
          points: [
            [0, 0],
            [6, 0],
          ],
        },
      ],
      () => 0,
    );
    expect(path.attributes.position.count).toBe(0);
    const awkward = makeRoadRibbon(
      [
        {
          kind: "residential",
          points: [
            [0, 0],
            [0, 0],
            [6, 0],
            [0, 0],
            [Infinity, 0],
            [12, 0],
            [15, 0],
          ],
        },
      ],
      () => 0,
    );
    expect(
      Array.from(awkward.attributes.position.array).every(Number.isFinite),
    ).toBe(true);
    expect(
      Array.from(awkward.index!.array).every(
        (i) => i >= 0 && i < awkward.attributes.position.count,
      ),
    ).toBe(true);
    for (const g of [narrow, wide, path, awkward]) g.dispose();
  });
});
describe("bounded background scenery", () => {
  it("encloses every original terrain edge using fewer than 2000 triangles", () => {
    const geometry = makeHorizonLand(),
      p = geometry.attributes.position;
    expect(geometry.index!.count / 3).toBeLessThan(2000);
    expect(p.count).toBeLessThan(1000);
    expect(Array.from(p.array).every(Number.isFinite)).toBe(true);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    expect(box.min.x).toBeLessThan(-3150);
    expect(box.max.x).toBeGreaterThan(1250);
    expect(box.min.z).toBeLessThan(-1575);
    expect(box.max.z).toBeGreaterThan(1475);
    geometry.dispose();
  });
  it("fills only background land using the existing four species and a fixed instance budget", () => {
    const forest = makeBackgroundForest(),
      items = Object.values(forest).flat();
    expect(Object.keys(forest)).toEqual([
      "Cincis_Oak_1",
      "Cincis_Beech_1",
      "Pine_2",
      "Pine_4",
    ]);
    expect(items).toHaveLength(BACKGROUND_TREE_BUDGET);
    for (const item of items) {
      expect(inWater(item.x, item.z)).toBe(false);
      expect(Number.isFinite(item.y)).toBe(true);
      expect(Math.hypot(item.x - 36, item.z - 40)).toBeGreaterThanOrEqual(240);
      expect(
        cabinSpots.every((c) => Math.hypot(item.x - c.x, item.z - c.z) >= 105),
      ).toBe(true);
    }
  }, 15000);
});
