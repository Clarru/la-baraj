import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { meadowTier, TIERS, canMeadow, chunkWindow, sampleChunk, densityAt, tuftGeometry, flowerGeometry, meadowMaterial, FLOWER_COLOURS, planChunkUpdates, windAmplitude, beginChunk, stepChunk, finishChunk } from "./meadow";
import { FISHING_CLEARANCE, SHARED_GROUND_CLEARANCE } from "./geography";
import { southShore, cabinSpots, fishingSpots, terrainHeight } from "./geography";

describe("meadow tier", () => {
  it("prefers overrides, downgrades weak or mobile devices", () => {
    expect(meadowTier({ override: "off", mobile: false, renderer: "Apple M2" })).toBe("off");
    expect(meadowTier({ mobile: true, renderer: "Apple M2" })).toBe("low");
    expect(meadowTier({ mobile: false, cores: 4, renderer: "ANGLE (Apple M2)" })).toBe("low");
    expect(meadowTier({ mobile: false, cores: 10, memoryGiB: 8, renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620)" })).toBe("low");
    expect(meadowTier({ mobile: false, cores: 10, memoryGiB: 8, renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro)" })).toBe("high");
  });
});
describe("canMeadow", () => {
  it("keeps plants off water, sand, drawn roads, cabin plots and activity spots", () => {
    const shore = southShore(0);
    expect(canMeadow(0, shore - 5)).toBe(false);
    expect(canMeadow(0, shore + 2)).toBe(false);
    const c = cabinSpots[0];
    expect(canMeadow(c.x, c.z)).toBe(false);
    expect(canMeadow(c.x + 12, c.z) || canMeadow(c.x - 12, c.z)).toBe(true);
    const f = fishingSpots[0];
    expect(canMeadow(f.x, f.z + 1)).toBe(false);
    expect(canMeadow(-150, southShore(-150) + 60)).toBe(true);
  });
});
describe("chunk window", () => {
  it("is ring×ring, nearest first, stable within a chunk", () => {
    const s = TIERS.high;
    const a = chunkWindow(3, 3, s), b = chunkWindow(12, 9, s);
    expect(a).toHaveLength(49); expect(a).toEqual(b); expect(a[0]).toBe("0,0");
    expect(new Set(a).size).toBe(49);
  });
});
describe("sampleChunk", () => {
  it("is deterministic, bounded by capacity, lands on the terrain and avoids excluded ground", () => {
    const s = TIERS.high, key = `${Math.floor(-150 / s.chunk)},${Math.floor((southShore(-150) + 60) / s.chunk)}`;
    const a = sampleChunk(key, s), b = sampleChunk(key, s);
    expect(a.grassCount).toBeGreaterThan(100); expect(a.grassCount).toBeLessThanOrEqual(s.grassPerChunk);
    expect(a.flowerCount).toBeLessThanOrEqual(s.flowersPerChunk);
    expect(Array.from(a.grass.subarray(0, a.grassCount * 6))).toEqual(Array.from(b.grass.subarray(0, b.grassCount * 6)));
    for (let i = 0; i < a.grassCount; i++) {
      const x = a.grass[i*6], y = a.grass[i*6+1], z = a.grass[i*6+2];
      expect(Math.abs(y - terrainHeight(x, z))).toBeLessThan(0.35);
      expect(canMeadow(x, z)).toBe(true);
    }
    for (let i = 0; i < a.flowerCount; i++) expect(a.flowers[i*7+6]).toBeLessThan(FLOWER_COLOURS.length);
  });
  it("returns no instances for a chunk in open water", () => {
    const s = TIERS.high, r = sampleChunk(`${Math.floor(-10 / s.chunk)},${Math.floor((southShore(-10) - 60) / s.chunk)}`, s);
    expect(r.grassCount).toBe(0); expect(r.flowerCount).toBe(0);
  });
});
describe("density and geometry", () => {
  it("fades from full to zero across the tier radii", () => {
    const s = TIERS.high;
    expect(densityAt(0, s)).toBe(1); expect(densityAt(s.fullRadius, s)).toBe(1);
    expect(densityAt((s.fullRadius + s.fadeRadius) / 2, s)).toBeCloseTo(0.5, 5);
    expect(densityAt(s.fadeRadius + 1, s)).toBe(0);
  });
  it("builds solid blades and flowers with height uv and upward normals", () => {
    const g = tuftGeometry(), f = flowerGeometry();
    const tris = (geo: THREE.BufferGeometry) => (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    expect(tris(g)).toBe(18); expect(tris(f)).toBeGreaterThanOrEqual(10);
    const uv = g.attributes.uv; let maxY = 0; for (let i = 0; i < uv.count; i++) maxY = Math.max(maxY, uv.getY(i));
    expect(maxY).toBe(1);
    const n = g.attributes.normal; for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.7);
  });
  it("gives each material kind its own program key and shared uniforms", () => {
    const a = meadowMaterial("grass"), b = meadowMaterial("flower");
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
    expect(a.side).toBe(THREE.DoubleSide);
    expect(a.userData.meadowUniforms).toBe(b.userData.meadowUniforms);
  });
});
describe("clearance radii", () => {
  it("uses the geography clearance constants for activity spots", () => {
    expect(FISHING_CLEARANCE).toBe(7); expect(SHARED_GROUND_CLEARANCE).toBe(11);
    const f = fishingSpots[0];
    expect(canMeadow(f.x, f.z + FISHING_CLEARANCE - 0.5)).toBe(false);
    const s = TIERS.high, r = sampleChunk(`${Math.floor(f.x / s.chunk)},${Math.floor(f.z / s.chunk)}`, s);
    for (let i = 0; i < r.grassCount; i++)
      expect(Math.hypot(r.grass[i*6] - f.x, r.grass[i*6+2] - f.z)).toBeGreaterThanOrEqual(FISHING_CLEARANCE);
  });
});

describe("planChunkUpdates", () => {
  it("keeps existing chunks, frees departed slots and reuses them for new keys nearest-first", () => {
    const current = new Map([["0,0", 0], ["1,0", 1], ["9,9", 2]]);
    const plan = planChunkUpdates(current, ["0,0", "1,0", "0,1"], 4);
    expect(plan.clear).toEqual([2]);
    expect(plan.build).toEqual([{ key: "0,1", slot: 2 }]);
  });
  it("never exceeds the slot count when the whole window changes", () => {
    const current = new Map(Array.from({ length: 49 }, (_, i) => [`${i},100`, i] as const));
    const next = chunkWindow(0, 0, TIERS.high);
    const plan = planChunkUpdates(current, next, 49);
    expect(plan.build).toHaveLength(49);
    expect(new Set(plan.build.map((b) => b.slot)).size).toBe(49);
    expect(plan.build[0].key).toBe(next[0]);
  });
});
it("silences wind under reduced motion", () => {
  expect(windAmplitude(true)).toBe(0);
  expect(windAmplitude(false)).toBeGreaterThan(0);
});
it("resumable chunk builds match sampleChunk", () => {
  const s = TIERS.high, key = "-3,5";
  const b = beginChunk(key, s);
  let steps = 0;
  while (!stepChunk(b, performance.now() - 1)) steps++; // expired deadline: one 9-sample slice per call
  expect(steps).toBeGreaterThan(1);
  const a = finishChunk(b), c = sampleChunk(key, s);
  expect(a.grassCount).toBe(c.grassCount); expect(Array.from(a.grass)).toEqual(Array.from(c.grass));
  expect(a.flowerCount).toBe(c.flowerCount); expect(Array.from(a.flowers)).toEqual(Array.from(c.flowers));
});
