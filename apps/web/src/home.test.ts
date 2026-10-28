import { describe, it, expect } from "vitest";
import {
  homeWalkCameraOffset,
  readLocalHome,
  displayedHomeIndex,
  shouldSpawnAtHome,
  homeSpawn,
  mapHomePosition,
  playerMapRotation,
} from "./home";
import {
  cabinSpots,
  inWater,
  roads,
  segmentDistance,
  terrainHeight,
} from "./geography";
import { cabinDesignForPlot, cabinYaw } from "./cabin-designs";
describe("assigned home and navigation", () => {
  it("starts the single-player offline preview at cabin 1 instead of reviving old random plots", () => {
    expect(readLocalHome()).toBe(0);
    expect(readLocalHome()).toBe(0);
  });
  it("uses each server assignment for UI and only changes spawn when the assigned plot changes", () => {
    expect(displayedHomeIndex(2, 18)).toBe(2);
    expect(displayedHomeIndex(25, 18)).toBe(25);
    expect(displayedHomeIndex(null, 6)).toBe(6);
    expect(displayedHomeIndex(52, 6)).toBe(6);
    expect(shouldSpawnAtHome(null, 2)).toBe(true);
    expect(shouldSpawnAtHome(2, 2)).toBe(false);
    expect(shouldSpawnAtHome(2, 25)).toBe(true);
    expect(shouldSpawnAtHome(2, -1)).toBe(false);
  });
  it("places all 50 arrivals and scooters on dry ground beyond front steps, clear of roads and house bodies", () => {
    const designs = new Set<string>();
    for (const plot of cabinSpots) {
      const spawn = homeSpawn(plot.i),
        design = cabinDesignForPlot(plot.i),
        yaw = cabinYaw(plot.i);
      designs.add(design.key);
      expect(spawn.yaw).toBe(yaw);
      expect(spawn.position.every(Number.isFinite)).toBe(true);
      expect(homeSpawn(plot.i)).toEqual(spawn);
      for (const point of [spawn.position, spawn.scooter]) {
        const [x, y, z] = point,
          dx = x - plot.x,
          dz = z - plot.z;
        const localZ = dx * Math.sin(yaw) + dz * Math.cos(yaw);
        expect(
          localZ,
          `cabin ${plot.i + 1} step clearance`,
        ).toBeGreaterThanOrEqual(design.stairZ + 1.25 - 1e-8);
        expect(localZ).toBeGreaterThan(design.depth / 2 + 1);
        expect(inWater(x, z), `cabin ${plot.i + 1} dry arrival`).toBe(false);
        for (const road of roads) {
          if (
            [
              "steps",
              "path",
              "track",
              "footway",
              "cycleway",
              "bridleway",
            ].includes(road.kind)
          )
            continue;
          const halfWidth = ["tertiary", "secondary", "primary"].includes(
            road.kind,
          )
            ? 2.8
            : 1.8;
          const clearance =
            Math.min(
              ...road.points
                .slice(1)
                .map((point, i) =>
                  segmentDistance(x, z, road.points[i], point),
                ),
            ) - halfWidth;
          expect(
            clearance,
            `cabin ${plot.i + 1} ${road.kind} edge clearance`,
          ).toBeGreaterThanOrEqual(0.45);
        }
        expect(y).toBe(terrainHeight(x, z));
        // Other house cores remain outside a capsule's horizontal clearance.
        for (const other of cabinSpots) {
          const otherDesign = cabinDesignForPlot(other.i),
            otherYaw = cabinYaw(other.i),
            ox = x - other.x,
            oz = z - other.z;
          const across = ox * Math.cos(otherYaw) - oz * Math.sin(otherYaw),
            forward = ox * Math.sin(otherYaw) + oz * Math.cos(otherYaw);
          expect(
            Math.abs(across) > otherDesign.width / 2 + 0.5 ||
              Math.abs(forward) > otherDesign.depth / 2 + 0.5,
          ).toBe(true);
        }
      }
      expect(
        Math.hypot(
          spawn.position[0] - spawn.scooter[0],
          spawn.position[2] - spawn.scooter[2],
        ),
      ).toBeGreaterThan(1.5);
    }
    expect(designs.size).toBe(6);
    expect(() => homeSpawn(50)).toThrow("Unknown home");
  });
  it("puts the follow camera on the open front side of every arrival", () => {
    for (const plot of cabinSpots) {
      const spawn = homeSpawn(plot.i),
        yaw = cabinYaw(plot.i),
        offset = homeWalkCameraOffset(plot.i);
      const outward = offset[0] * Math.sin(yaw) + offset[2] * Math.cos(yaw);
      expect(outward).toBeCloseTo(7);
      expect(offset[1]).toBeGreaterThan(2);
      const dx = spawn.position[0] + offset[0] - plot.x,
        dz = spawn.position[2] + offset[2] - plot.z;
      expect(dx * Math.sin(yaw) + dz * Math.cos(yaw)).toBeGreaterThan(
        cabinDesignForPlot(plot.i).stairZ + 7,
      );
    }
  });
  it("keeps an offscreen home at the correct edge bearing and maps north/east/south correctly", () => {
    const point = mapHomePosition({ x: 300, z: 150 }, { x: 0, z: 0 }, 220);
    expect(point.offscreen).toBe(true);
    expect(point.x).toBeCloseTo(91.3);
    expect(point.z / point.x).toBeCloseTo(0.5);
    expect(playerMapRotation(Math.PI)).toBeCloseTo(0);
    expect(playerMapRotation(Math.PI / 2)).toBeCloseTo(90);
    expect(playerMapRotation(0)).toBeCloseTo(180);
  });
});
