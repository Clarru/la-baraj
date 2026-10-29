import { describe, expect, it } from "vitest";
import {
  BOAT_DOCK_XS,
  BOAT_BOARD_DISTANCE,
  boatDockSpawn,
  boatExitCandidates,
  canBoardBoat,
  chooseBoatExit,
  nearestDockSpawn,
} from "./boat-placement";
import { inWater, terrainHeight } from "./geography";
import { LAKE_LEVEL } from "./swim-motion";

describe("boat placement", () => {
  it("spawns each dock boat in open water clear of the dock", () => {
    for (const dockX of BOAT_DOCK_XS) {
      const {
        position: [x, y, z],
        yaw,
      } = boatDockSpawn(dockX);
      expect(inWater(x, z)).toBe(true);
      expect(LAKE_LEVEL - terrainHeight(x, z, undefined, true)).toBeGreaterThan(
        0.8,
      );
      expect(Math.abs(x - dockX)).toBeGreaterThanOrEqual(1.7 + 0.75 + 0.5);
      expect(y).toBe(LAKE_LEVEL);
      expect(Math.cos(yaw)).toBeLessThan(0);
    }
  });

  it("nearest dock follows the home side of the lake", () => {
    expect(nearestDockSpawn(-200)).toEqual(boatDockSpawn(-235));
    expect(nearestDockSpawn(40)).toEqual(boatDockSpawn(0));
  });

  it("boards from the ground or from swimming, never from the scooter", () => {
    const base = {
      distance: 2,
      scooterMounted: false,
      swimming: false,
      grounded: true,
      indoors: false,
      activity: "none",
      paused: false,
    };
    expect(BOAT_BOARD_DISTANCE).toBe(3.5);
    expect(canBoardBoat(base)).toBe(true);
    expect(canBoardBoat({ ...base, swimming: true, grounded: false })).toBe(
      true,
    );
    for (const patch of [
      { distance: 3.6 },
      { scooterMounted: true },
      { indoors: true },
      { activity: "sit" },
      { paused: true },
      { grounded: false },
    ])
      expect(canBoardBoat({ ...base, ...patch })).toBe(false);
  });

  it("tries both sides before the bow", () => {
    const c = boatExitCandidates(0, 0, 0);
    expect(c).toHaveLength(6);
    expect(c[0][0]).toBeCloseTo(1.6);
    expect(c[1][0]).toBeCloseTo(-1.6);
    expect(c.flat().every(Number.isFinite)).toBe(true);
  });

  it("steps onto the first dry, level-enough spot", () => {
    const c: [number, number][] = [
      [1, 1],
      [2, 2],
      [3, 3],
    ];
    expect(chooseBoatExit(c, (x) => (x === 1 ? undefined : 0.4))).toEqual({
      kind: "land",
      position: [2, 0.4, 2],
    });
    expect(chooseBoatExit(c, () => LAKE_LEVEL + 0.05).kind).toBe("water");
  });

  it("falls back to the water beside the boat mid-lake", () => {
    const c: [number, number][] = [
      [1, 1],
      [2, 2],
    ];
    expect(chooseBoatExit(c, () => undefined)).toEqual({
      kind: "water",
      position: [1, LAKE_LEVEL, 1],
    });
  });
});
