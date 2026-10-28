import { describe, it, expect } from "vitest";
import * as THREE from "three";
import { cabinSpots, terrainHeight } from "./geography";
import { cabinDesignForPlot, cabinYaw } from "./cabin-designs";
import {
  cabinDoor,
  cabinLocalToWorld,
  cabinTransfer,
  queueCabinTransfer,
  takeCabinTransfer,
  clearCabinTransfer,
  nearestCabinDoor,
  roomSizes,
  roomNames,
} from "./cabin-interior-state";
const { loadRig } = await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
);
describe("real cabin entry and return", () => {
  it("places each arrival inside its room and every return on its actual exterior porch", () => {
    for (const cabin of cabinSpots) {
      const design = cabinDesignForPlot(cabin.i),
        door = cabinDoor(cabin.i),
        inside = cabinTransfer(cabin.i, true),
        outside = cabinTransfer(cabin.i, false);
      const local = (point: [number, number, number]) => {
        const x = point[0] - cabin.x,
          z = point[2] - cabin.z,
          a = cabinYaw(cabin.i);
        return {
          x: x * Math.cos(a) - z * Math.sin(a),
          z: x * Math.sin(a) + z * Math.cos(a),
        };
      };
      const a = local(inside.position),
        b = local(outside.position),
        room = roomSizes[design.family];
      expect(Math.abs(a.x)).toBeLessThan(room.width / 2 - 0.3);
      expect(Math.abs(a.z - door.roomOffsetZ)).toBeLessThan(room.depth / 2 - 0.3);
      expect(door.insideZ).toBe(door.outsideZ);
      expect(door.roomOffsetZ + room.depth / 2).toBeCloseTo(door.outsideZ);
      expect(a.x).toBeCloseTo(b.x);
      expect(a.z).toBeLessThan(door.outsideZ);
      expect(b.z).toBeGreaterThan(door.outsideZ);
      expect(inside.position[1]).toBeCloseTo(
        terrainHeight(cabin.x, cabin.z) + 0.64 + 1.05,
      );
      expect(
        design.porches.some(
          (p) => b.x > p.minX && b.x < p.maxX && b.z > p.minZ && b.z < p.maxZ,
        ),
      ).toBe(true);
      const approach = cabinLocalToWorld(cabin.i, door.x, door.outsideZ + 0.6);
      expect(nearestCabinDoor(approach, 0.5)).toBe(cabin.i);
    }
  });
  it("consumes each transfer exactly once and clears a pending transfer on reset", () => {
    queueCabinTransfer(18, true);
    expect(takeCabinTransfer()).toEqual(cabinTransfer(18, true));
    expect(takeCabinTransfer()).toBeNull();
    queueCabinTransfer(18, false);
    clearCabinTransfer();
    expect(takeCabinTransfer()).toBeNull();
    expect(() => cabinTransfer(99, true)).toThrow(RangeError);
  });
  it("ships furnished geometry with a clear floor beneath each indoor arrival", async () => {
    for (let family = 0; family < 3; family++) {
      const index = cabinSpots.find(
        (c) => cabinDesignForPlot(c.i).family === family,
      )!.i;
      const { scene } = await loadRig(
        new URL(
          `../public/assets/optimized/Lake_Interior_${roomNames[family]}.glb`,
          import.meta.url,
        ).pathname,
      );
      scene.updateMatrixWorld(true);
      const door = cabinDoor(index),
        ray = new THREE.Raycaster(
          new THREE.Vector3(door.x, 2, door.insideZ - door.roomOffsetZ - .85),
          new THREE.Vector3(0, -1, 0),
        );
      const hits = ray.intersectObject(scene, true);
      expect(hits.length).toBeGreaterThan(0);
      expect(hits[0].point.y).toBeCloseTo(0, 2);
      expect(new THREE.Box3().setFromObject(scene).max.y).toBeGreaterThan(3);
    }
  });
});
