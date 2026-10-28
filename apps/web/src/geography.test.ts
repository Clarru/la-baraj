import { describe, it, expect } from "vitest";
import {
  cabinSpots,
  inWater,
  project,
  southShore,
  terrainHeight,
  lake,
  SCALE,
  settlementRoadZ,
} from "./geography";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
describe("real geographic layer and fictional settlement boundary", () => {
  it("expands geographic distances fivefold from the initial test", () => {
    expect(SCALE / 0.15).toBeCloseTo(5, 8);
  });
  it("keeps every cabin on land on the southern shore of the selected basin", () => {
    for (const c of cabinSpots) {
      expect(inWater(c.x, c.z)).toBe(false);
      expect(c.z).toBeGreaterThan(southShore(c.x) + 10);
      expect(terrainHeight(c.x, c.z)).toBeCloseTo(c.ground, 5);
    }
  });
  it("preserves the original plots and provides 50 stable plots on both sides of the southern road while preserving the lakefront", () => {
    expect(cabinSpots).toHaveLength(50);
    expect(cabinSpots.filter((c) => c.z > settlementRoadZ(c.x))).toHaveLength(
      25,
    );
    expect(cabinSpots.filter((c) => c.z < settlementRoadZ(c.x))).toHaveLength(
      25,
    );
    for (const c of cabinSpots)
      expect(c.z - southShore(c.x)).toBeGreaterThanOrEqual(27);
    for (const a of cabinSpots)
      for (const b of cabinSpots)
        if (a.i !== b.i)
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(16);
  });
  it("uses longitude/latitude in a stable local metric scale and a closed shoreline", () => {
    expect(project([22.864, 45.69])).toEqual([0, -0]);
    expect(project([22.865, 45.69])[0]).toBeGreaterThan(10);
    expect(project([22.864, 45.691])[1]).toBeLessThan(-10);
    expect(lake[0]).toEqual(lake[lake.length - 1]);
  });
});
describe("downloaded and optimized asset integrity", () => {
  it("ships valid GLB files for every catalog model and retains matching source hashes and animation clips", () => {
    const base = resolve(import.meta.dirname, "../public/assets");
    const catalog = JSON.parse(
      readFileSync(resolve(base, "asset-catalog.json"), "utf8"),
    );
    expect(catalog.models.length).toBeGreaterThan(20);
    for (const model of [
      ...catalog.models,
      { id: "Lakeside_Man", optimizedBytes: 1867672 },
      ...JSON.parse(
        readFileSync(resolve(base, "cabin-library.json"), "utf8"),
      ).models.map((model: { id: string; bytes: number; bounds: unknown }) => ({
        ...model,
        optimizedBytes: model.bytes,
      })),
    ]) {
      const bytes = readFileSync(resolve(base, "optimized", model.id + ".glb"));
      expect(bytes.readUInt32LE(0)).toBe(0x46546c67);
      expect(bytes.readUInt32LE(4)).toBe(2);
      expect(bytes.readUInt32LE(8)).toBe(bytes.length);
      expect(bytes.length).toBe(model.optimizedBytes);
      const jsonSize = bytes.readUInt32LE(12);
      const doc = JSON.parse(bytes.subarray(20, 20 + jsonSize).toString());
      expect(doc.meshes.length).toBeGreaterThan(0);
      if (model.bounds)
        expect(model.bounds.max[1]).toBeGreaterThan(model.bounds.min[1]);
      if (["Casual_Hoodie", "Lakeside_Man"].includes(model.id)) {
        const names = doc.animations.map((a: { name: string }) => a.name);
        expect(names).toContain("Walk");
        expect(names).toContain("Run");
        expect(names).toContain("Idle_Neutral");
        expect(names).toContain("Punch_Left");
      }
    }
  });
});
