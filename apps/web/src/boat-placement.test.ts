import { describe, expect, it } from "vitest";
import {
  BOAT_DOCK_XS,
  BOAT_BOARD_DISTANCE,
  boatBlockedAhead,
  boatDockSpawn,
  boatExitCandidates,
  canBoardBoat,
  chooseBoatExit,
  nearestDockSpawn,
} from "./boat-placement";
import { getBoatState, parkBoat, resetBoatToDock } from "./boat-state";
import { inWater, southShore, terrainHeight } from "./geography";
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
    expect(c).toHaveLength(9);
    expect(c[0][0]).toBeCloseTo(1.6);
    expect(c[1][0]).toBeCloseTo(-1.6);
    expect(c[2][0]).toBeCloseTo(0);
    expect(c[2][1]).toBeCloseTo(2.2);
    expect(c[5][1]).toBeCloseTo(3.2);
    // Far land-only ring reaches the bank from a shallows stop.
    expect(c[6][0]).toBeCloseTo(4.5);
    expect(c[6][1]).toBeCloseTo(0);
    expect(c[7][0]).toBeCloseTo(-4.5);
    expect(c[7][1]).toBeCloseTo(0);
    expect(c[8][0]).toBeCloseTo(0);
    expect(c[8][1]).toBeCloseTo(4.5);
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
    // Wadeable shallows count as land; deeper water does not.
    expect(chooseBoatExit(c, () => LAKE_LEVEL - 0.5).kind).toBe("water");
    expect(chooseBoatExit(c, () => LAKE_LEVEL - 0.3)).toEqual({
      kind: "land",
      position: [1, LAKE_LEVEL - 0.3, 1],
    });
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

  it("returning home puts the boat back at the nearest dock", () => {
    parkBoat([500, LAKE_LEVEL, -300], 1);
    resetBoatToDock(-200);
    const dock = nearestDockSpawn(-200);
    expect(getBoatState().parked).toEqual(dock.position);
    expect(getBoatState().yaw).toBe(dock.yaw);
    expect(getBoatState().mounted).toBe(false);
    expect(getBoatState().speed).toBe(0);
  });

  it("stops at the shallows ahead but can still back away from the bank", () => {
    const {
      position: [sx, , sz],
    } = boatDockSpawn(0);
    expect(boatBlockedAhead(sx, sz, Math.PI, 1)).toBe(false);
    const nearShore = southShore(0) - 1;
    expect(boatBlockedAhead(0, nearShore, 0, 1)).toBe(true);
    // Where the bow probe halts a shoreward boat, it can still turn or back out.
    const resting = southShore(0) - 6;
    expect(boatBlockedAhead(0, resting, 0, 1)).toBe(true);
    expect(boatBlockedAhead(0, resting, 0, -1)).toBe(false);
    expect(boatBlockedAhead(0, resting, Math.PI, 1)).toBe(false);
    expect(boatBlockedAhead(Number.NaN, nearShore, 0, 1)).toBe(true);
    expect(boatBlockedAhead(0, nearShore, Infinity, -1)).toBe(true);
  });
});
