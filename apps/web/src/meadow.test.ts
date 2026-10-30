import {
  advanceMeadowFrameGuard,
  createMeadowFrameGuard,
  resetMeadowFrameGuard,
} from "./meadow";
import { describe, it, expect } from "vitest";
import * as THREE from "three";
import {
  meadowTier,
  TIERS,
  canMeadow,
  chunkWindow,
  sampleChunk,
  densityAt,
  tuftGeometry,
  flowerGeometry,
  meadowMaterial,
  FLOWER_COLOURS,
  planChunkUpdates,
  windAmplitude,
  beginChunk,
  stepChunk,
  finishChunk,
  resetMeadowGridCache,
  drawnRoadDistance,
} from "./meadow";
import {
  FISHING_CLEARANCE,
  SHARED_GROUND_CLEARANCE,
  southShore,
  cabinSpots,
  fishingSpots,
  terrainHeight,
  roads,
  inWater,
  shoreDistance,
  activityClearance,
  sharedGrounds,
  DOCK_CENTRE_X,
  dockCentreZ,
} from "./geography";

describe("meadow tier", () => {
  it("prefers overrides, downgrades weak or mobile devices", () => {
    expect(
      meadowTier({ override: "off", mobile: false, renderer: "Apple M2" }),
    ).toBe("off");
    expect(meadowTier({ mobile: true, renderer: "Apple M2" })).toBe("low");
    expect(
      meadowTier({ mobile: false, cores: 4, renderer: "ANGLE (Apple M2)" }),
    ).toBe("low");
    expect(
      meadowTier({
        mobile: false,
        cores: 10,
        memoryGiB: 8,
        renderer: "ANGLE (Intel, Intel(R) UHD Graphics 620)",
      }),
    ).toBe("low");
    expect(
      meadowTier({
        mobile: false,
        cores: 10,
        memoryGiB: 8,
        renderer: "ANGLE (Apple, ANGLE Metal Renderer: Apple M2 Pro)",
      }),
    ).toBe("high");
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
describe("canMeadow binding exclusions", () => {
  const mids = (kinds: string[]) =>
    roads
      .filter((r) => kinds.includes(r.kind))
      .flatMap((r) =>
        r.points
          .slice(1)
          .map((p, i) => ({
            x: (p[0] + r.points[i][0]) / 2,
            z: (p[1] + r.points[i][1]) / 2,
          })),
      );
  it("is false on a drawn road", () => {
    const m = mids(["secondary", "tertiary"]).find((p) => !inWater(p.x, p.z));
    expect(m).toBeDefined();
    expect(canMeadow(m!.x, m!.z)).toBe(false);
  });
  it("is false at the dock centre", () => {
    expect(canMeadow(DOCK_CENTRE_X, dockCentreZ())).toBe(false);
    expect(canMeadow(4, southShore(0) + 12)).toBe(false);
  });
  it("is true on a footway-only point when one exists", () => {
    const p = mids(["path"]).find(
      (q) =>
        !inWater(q.x, q.z) &&
        shoreDistance(q.x, q.z) > 4 &&
        drawnRoadDistance(q.x, q.z) > 3.2 &&
        activityClearance(q.x, q.z) &&
        !cabinSpots.some((c) => Math.hypot(q.x - c.x, q.z - c.z) < 7.5) &&
        Math.hypot(q.x - DOCK_CENTRE_X, q.z - dockCentreZ()) > 16 &&
        !fishingSpots.some(
          (c) => Math.hypot(q.x - c.x, q.z - c.z) < FISHING_CLEARANCE,
        ) &&
        !sharedGrounds.some(
          (c) => Math.hypot(q.x - c.x, q.z - c.z) < SHARED_GROUND_CLEARANCE,
        ),
    );
    // No such point in the data means nothing to assert; the footway-is-not-excluded rule is then untestable here.
    if (p) expect(canMeadow(p.x, p.z)).toBe(true);
  });
});
describe("chunk window", () => {
  it("is ring×ring, nearest first, stable within a chunk", () => {
    const s = TIERS.high;
    const a = chunkWindow(3, 3, s),
      b = chunkWindow(12, 9, s);
    expect(a).toHaveLength(49);
    expect(a).toEqual(b);
    expect(a[0]).toBe("0,0");
    expect(new Set(a).size).toBe(49);
  });
});
describe("sampleChunk", () => {
  it("is deterministic, bounded by capacity, lands on the terrain and avoids excluded ground", () => {
    const s = TIERS.high,
      key = `${Math.floor(-150 / s.chunk)},${Math.floor((southShore(-150) + 60) / s.chunk)}`;
    const a = sampleChunk(key, s),
      b = sampleChunk(key, s);
    expect(a.grassCount).toBeGreaterThan(100);
    expect(a.grassCount).toBeLessThanOrEqual(s.grassPerChunk);
    expect(a.flowerCount).toBeLessThanOrEqual(s.flowersPerChunk);
    expect(Array.from(a.grass.subarray(0, a.grassCount * 6))).toEqual(
      Array.from(b.grass.subarray(0, b.grassCount * 6)),
    );
    for (let i = 0; i < a.grassCount; i++) {
      const x = a.grass[i * 6],
        y = a.grass[i * 6 + 1],
        z = a.grass[i * 6 + 2];
      expect(Math.abs(y - terrainHeight(x, z))).toBeLessThan(0.35);
      expect(canMeadow(x, z)).toBe(true);
    }
    for (let i = 0; i < a.flowerCount; i++)
      expect(a.flowers[i * 7 + 6]).toBeLessThan(FLOWER_COLOURS.length);
  });
  it("spreads saturated flowers across the whole chunk, not a cut-off row", () => {
    const s = TIERS.high;
    let found = false;
    const kz0 = Math.floor((southShore(-150) + 20) / s.chunk),
      kz1 = Math.floor((southShore(-150) + 200) / s.chunk);
    for (let kx = -14; kx <= -6 && !found; kx++)
      for (let kz = kz0; kz < kz1 && !found; kz++) {
        const r = sampleChunk(`${kx},${kz}`, s);
        if (r.flowerCount !== s.flowersPerChunk) continue;
        found = true;
        const x0 = kx * s.chunk,
          z0 = kz * s.chunk,
          h = s.chunk / 2;
        const q = [0, 0, 0, 0];
        for (let i = 0; i < r.flowerCount; i++) {
          if (r.flowers[i * 7 + 2] < z0 + h) q[0]++;
          else q[1]++;
          if (r.flowers[i * 7] < x0 + h) q[2]++;
          else q[3]++;
        }
        expect(q.every((n) => n > 0)).toBe(true);
      }
    expect(found).toBe(true);
  });
  it("returns no instances for a chunk in open water", () => {
    const s = TIERS.high,
      r = sampleChunk(
        `${Math.floor(-10 / s.chunk)},${Math.floor((southShore(-10) - 60) / s.chunk)}`,
        s,
      );
    expect(r.grassCount).toBe(0);
    expect(r.flowerCount).toBe(0);
  });
});
describe("density and geometry", () => {
  it("fades from full to zero across the tier radii", () => {
    const s = TIERS.high;
    expect(densityAt(0, s)).toBe(1);
    expect(densityAt(s.fullRadius, s)).toBe(1);
    expect(densityAt((s.fullRadius + s.fadeRadius) / 2, s)).toBeCloseTo(0.5, 5);
    expect(densityAt(s.fadeRadius + 1, s)).toBe(0);
  });
  it("builds solid blades and flowers with height uv and upward normals", () => {
    const g = tuftGeometry(),
      f = flowerGeometry();
    const tris = (geo: THREE.BufferGeometry) =>
      (geo.index ? geo.index.count : geo.attributes.position.count) / 3;
    expect(tris(g)).toBe(18);
    expect(tris(f)).toBeGreaterThanOrEqual(20);
    expect(tris(f)).toBeLessThanOrEqual(30);
    const uv = g.attributes.uv;
    let maxY = 0;
    for (let i = 0; i < uv.count; i++) maxY = Math.max(maxY, uv.getY(i));
    expect(maxY).toBe(1);
    const n = g.attributes.normal;
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0.7);
    const fuv = f.attributes.uv,
      fx = new Set<number>();
    let fMaxY = 0;
    for (let i = 0; i < fuv.count; i++) {
      fx.add(fuv.getX(i));
      fMaxY = Math.max(fMaxY, fuv.getY(i));
    }
    expect([...fx].sort()).toEqual([0, 1]);
    expect(fMaxY).toBe(1);
    f.computeBoundingBox();
    expect(f.boundingBox!.max.y).toBeLessThanOrEqual(0.26);
    expect(f.boundingBox!.max.y).toBeGreaterThanOrEqual(0.2);
    expect(FLOWER_COLOURS).toHaveLength(5);
    expect(FLOWER_COLOURS).toContain("#c8402f");
  });
  it("gives each material kind its own program key and shared uniforms", () => {
    const a = meadowMaterial("grass"),
      b = meadowMaterial("flower");
    expect(a.customProgramCacheKey()).not.toBe(b.customProgramCacheKey());
    expect(a.side).toBe(THREE.DoubleSide);
    expect(a.userData.meadowUniforms).toBe(b.userData.meadowUniforms);
  });
});
describe("clearance radii", () => {
  it("uses the geography clearance constants for activity spots", () => {
    expect(FISHING_CLEARANCE).toBe(7);
    expect(SHARED_GROUND_CLEARANCE).toBe(11);
    const f = fishingSpots[0];
    expect(canMeadow(f.x, f.z + FISHING_CLEARANCE - 0.5)).toBe(false);
    const s = TIERS.high,
      r = sampleChunk(
        `${Math.floor(f.x / s.chunk)},${Math.floor(f.z / s.chunk)}`,
        s,
      );
    for (let i = 0; i < r.grassCount; i++)
      expect(
        Math.hypot(r.grass[i * 6] - f.x, r.grass[i * 6 + 2] - f.z),
      ).toBeGreaterThanOrEqual(FISHING_CLEARANCE);
  });
});

describe("planChunkUpdates", () => {
  it("keeps existing chunks, frees departed slots and reuses them for new keys nearest-first", () => {
    const current = new Map([
      ["0,0", 0],
      ["1,0", 1],
      ["9,9", 2],
    ]);
    const plan = planChunkUpdates(current, ["0,0", "1,0", "0,1"], 4);
    expect(plan.clear).toEqual([2]);
    expect(plan.build).toEqual([{ key: "0,1", slot: 2 }]);
  });
  it("never exceeds the slot count when the whole window changes", () => {
    const current = new Map(
      Array.from({ length: 49 }, (_, i) => [`${i},100`, i] as const),
    );
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
  const s = TIERS.high,
    key = "-3,5";
  resetMeadowGridCache();
  const b = beginChunk(key, s);
  while (!stepChunk(b, performance.now() + 0.2));
  const a = finishChunk(b);
  resetMeadowGridCache();
  const c = sampleChunk(key, s);
  expect(a.grassCount).toBe(c.grassCount);
  expect(Array.from(a.grass)).toEqual(Array.from(c.grass));
  expect(a.flowerCount).toBe(c.flowerCount);
  expect(Array.from(a.flowers)).toEqual(Array.from(c.flowers));
});

describe("adaptive meadow frame guard", () => {
  it("downgrades sustained very slow rendering instead of treating everyframe as a tabresume", () => {
    const g = createMeadowFrameGuard();
    let down = false;
    for (let i = 0; i < 34; i++) down = advanceMeadowFrameGuard(g, 0.3) || down;
    expect(down).toBe(true);
  });
  it("downgrades sustained50ms frames afterwarmup", () => {
    const g = createMeadowFrameGuard();
    let down = false;
    for (let i = 0; i < 205; i++)
      down = advanceMeadowFrameGuard(g, 0.05) || down;
    expect(down).toBe(true);
  });
  it("doesnot downgrade a healthy rendering cadence with occasionalstalls", () => {
    const g = createMeadowFrameGuard();
    for (let i = 0; i < 1200; i++)
      expect(advanceMeadowFrameGuard(g, i % 180 === 179 ? 0.6 : 1 / 60)).toBe(
        false,
      );
  });
  it("keeps the warmup period before judging coldscene loading", () => {
    const g = createMeadowFrameGuard();
    for (let i = 0; i < 100; i++)
      expect(advanceMeadowFrameGuard(g, 0.05)).toBe(false);
  });
  it("resets pre-hide timing without replacing its fixed sample buffer", () => {
    const g = createMeadowFrameGuard(),
      buffer = g.deltas;
    for (let i = 0; i < 150; i++) advanceMeadowFrameGuard(g, 0.05);
    resetMeadowFrameGuard(g);
    expect(g.deltas).toBe(buffer);
    expect(g.n).toBe(0);
    for (let i = 0; i < 300; i++)
      expect(advanceMeadowFrameGuard(g, 1 / 60)).toBe(false);
  });
  it("ignores invalid deltas without poisoning later valid observations", () => {
    const g = createMeadowFrameGuard();
    for (const dt of [0, -1, NaN, Infinity])
      expect(advanceMeadowFrameGuard(g, dt)).toBe(false);
    expect(g.n).toBe(0);
    expect(g.elapsed).toBe(0);
  });
});
