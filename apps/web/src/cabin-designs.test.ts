import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { cabinDesigns, cabinDesignForPlot, cabinYaw } from "./cabin-designs";
const { loadRig } = await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
);
describe("stable cabin identity and architectural variation", () => {
  it("uses five of each of the six designs without a repeating three-house sequence", () => {
    const keys = Array.from(
      { length: 30 },
      (_, i) => cabinDesignForPlot(i).key,
    );
    for (const d of cabinDesigns)
      expect(keys.filter((k) => k === d.key)).toHaveLength(5);
    expect(keys.some((key, i) => i >= 3 && key !== keys[i - 3])).toBe(true);
    expect(
      Array.from({ length: 30 }, (_, i) => cabinDesignForPlot(i).key),
    ).toEqual(keys);
    expect(cabinYaw(18)).toBe(cabinYaw(18));
  });
  it("mounts every number above stair height and within a few centimetres of real model geometry", async () => {
    for (const design of cabinDesigns) {
      const { scene } = await loadRig(
        new URL(
          `../public/assets/optimized/Lake_Cabin_${design.key}.glb`,
          import.meta.url,
        ).pathname,
      );
      scene.updateMatrixWorld(true);
      const [x, y, z] = design.numberMount;
      const ray = new THREE.Raycaster(
        new THREE.Vector3(x, y, z + 0.2),
        new THREE.Vector3(0, 0, -1),
      );
      const hits = ray.intersectObject(scene, true);
      expect(hits.length, design.key).toBeGreaterThan(0);
      const gap = z - 0.0175 - hits[0].point.z;
      expect(y).toBeGreaterThan(1.5);
      expect(gap, `${design.key} plaque air gap`).toBeGreaterThanOrEqual(
        -0.015,
      );
      expect(gap, `${design.key} plaque air gap`).toBeLessThan(0.05);
    }
  });
});
