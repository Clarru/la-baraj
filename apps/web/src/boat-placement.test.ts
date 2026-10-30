import { describe, expect, it } from "vitest";
import {
  BOAT_DOCK_XS,
  BOAT_BOARD_DISTANCE,
  BOAT_PROBE_DISTANCE,
  boatBlockedAhead,
  boatDockSpawn,
  boatExitCandidates,
  canBoardBoat,
  chooseBoatExit,
  distanceToHull,
  nearestDockSpawn,
} from "./boat-placement";
import { BOAT_DIMENSIONS } from "./boat-geometry";
import { getBoatState, parkBoat, resetBoatToDock } from "./boat-state";
import { inWater, southShore, terrainHeight } from "./geography";
import { LAKE_LEVEL } from "./swim-motion";

const { beam, bowExtent, sternExtent } = BOAT_DIMENSIONS;
/** Hull footprint corners, then the bow tip, in world x/z. */
function hullPoints(x: number, z: number, yaw: number): [number, number][] {
  const fx = Math.sin(yaw),
    fz = Math.cos(yaw);
  const at = (side: number, forward: number): [number, number] => [
    x + side * fz + forward * fx,
    z - side * fx + forward * fz,
  ];
  return [
    at(beam / 2, bowExtent),
    at(-beam / 2, bowExtent),
    at(beam / 2, -sternExtent),
    at(-beam / 2, -sternExtent),
    at(0, bowExtent),
  ];
}

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
      expect(Math.abs(x - dockX)).toBeGreaterThanOrEqual(1.7 + beam / 2 + 0.5);
      expect(y).toBe(LAKE_LEVEL);
      expect(Math.cos(yaw)).toBeLessThan(0);
    }
  });

  it("the dock boat floats clear of the dock", () => {
    for (const dockX of BOAT_DOCK_XS) {
      const {
        position: [x, , z],
        yaw,
      } = boatDockSpawn(dockX);
      for (const [px, pz] of hullPoints(x, z, yaw)) {
        expect(inWater(px, pz)).toBe(true);
        expect(
          LAKE_LEVEL - terrainHeight(px, pz, undefined, true),
          JSON.stringify({ dockX, px, pz }),
        ).toBeGreaterThanOrEqual(0.6);
      }
      // Dock deck in settlement.tsx: x ± 1.7, z from shore − 11.3 to shore + 3.1.
      const shore = southShore(dockX);
      const deck = {
        minX: dockX - 1.7,
        maxX: dockX + 1.7,
        minZ: shore - 11.3,
        maxZ: shore + 3.1,
      };
      const hull = hullPoints(x, z, yaw).slice(0, 4);
      const hullBox = {
        minX: Math.min(...hull.map(([hx]) => hx)),
        maxX: Math.max(...hull.map(([hx]) => hx)),
        minZ: Math.min(...hull.map(([, hz]) => hz)),
        maxZ: Math.max(...hull.map(([, hz]) => hz)),
      };
      const gap = Math.hypot(
        Math.max(deck.minX - hullBox.maxX, hullBox.minX - deck.maxX, 0),
        Math.max(deck.minZ - hullBox.maxZ, hullBox.minZ - deck.maxZ, 0),
      );
      expect(gap).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("nearest dock follows the home side of the lake", () => {
    expect(nearestDockSpawn(-200)).toEqual(boatDockSpawn(-235));
    expect(nearestDockSpawn(40)).toEqual(boatDockSpawn(0));
  });

  it("boards from the ground or from swimming, never from the scooter", () => {
    const base = {
      distance: 1,
      scooterMounted: false,
      swimming: false,
      grounded: true,
      indoors: false,
      activity: "none",
      paused: false,
    };
    expect(BOAT_BOARD_DISTANCE).toBe(1.6);
    expect(canBoardBoat(base)).toBe(true);
    expect(canBoardBoat({ ...base, swimming: true, grounded: false })).toBe(
      true,
    );
    for (const patch of [
      { distance: 1.7 },
      { scooterMounted: true },
      { indoors: true },
      { activity: "sit" },
      { paused: true },
      { grounded: false },
    ])
      expect(canBoardBoat({ ...base, ...patch })).toBe(false);
  });

  it("boarding works along the whole hull", () => {
    const boat = { x: 10, z: -20, yaw: 0.7 };
    const [bowLeft, , sternLeft, sternRight, bow] = hullPoints(
      boat.x,
      boat.z,
      boat.yaw,
    );
    const away = (from: [number, number], to: [number, number], d: number) => {
      const len = Math.hypot(to[0] - from[0], to[1] - from[1]);
      return [
        to[0] + ((to[0] - from[0]) / len) * d,
        to[1] + ((to[1] - from[1]) / len) * d,
      ] as const;
    };
    const centre: [number, number] = [boat.x, boat.z];
    // 1.0 m diagonally off the stern corner and 1.0 m straight off the bow tip.
    const offStern = away(centre, sternLeft, 1);
    const offBow = away(centre, bow, 1);
    for (const [px, pz] of [offStern, offBow]) {
      expect(distanceToHull(px, pz, boat)).toBeLessThanOrEqual(1.0 + 1e-9);
      expect(distanceToHull(px, pz, boat)).toBeLessThanOrEqual(
        BOAT_BOARD_DISTANCE,
      );
    }
    // 2.0 m off either side, amidships, is too far.
    const fx = Math.sin(boat.yaw),
      fz = Math.cos(boat.yaw);
    for (const side of [1, -1]) {
      const d = beam / 2 + 2;
      const px = boat.x + side * fz * d,
        pz = boat.z - side * fx * d;
      expect(distanceToHull(px, pz, boat)).toBeCloseTo(2);
      expect(distanceToHull(px, pz, boat)).toBeGreaterThan(BOAT_BOARD_DISTANCE);
    }
    expect(distanceToHull(boat.x, boat.z, boat)).toBe(0);
    expect(distanceToHull(...bowLeft, boat)).toBeCloseTo(0);
    expect(distanceToHull(...sternRight, boat)).toBeCloseTo(0);
  });

  it("every exit lies clear of the hull", () => {
    for (const yaw of [0, 1, 2.5, -2]) {
      const boat = { x: 4, z: -9, yaw };
      for (const [px, pz] of boatExitCandidates(boat.x, boat.z, yaw))
        expect(
          distanceToHull(px, pz, boat),
          JSON.stringify({ yaw, px, pz }),
        ).toBeGreaterThanOrEqual(0.5);
    }
  });

  it("tries both sides before the bow", () => {
    const c = boatExitCandidates(0, 0, 0);
    expect(c).toHaveLength(9);
    expect(c[0][0]).toBeCloseTo(beam / 2 + 0.7);
    expect(c[1][0]).toBeCloseTo(-(beam / 2 + 0.7));
    expect(c[2][0]).toBeCloseTo(0);
    expect(c[2][1]).toBeCloseTo(bowExtent + 0.7);
    expect(c[3][0]).toBeCloseTo(beam / 2 + 1.7);
    expect(c[5][1]).toBeCloseTo(bowExtent + 1.7);
    // Far land-only ring reaches the bank from a shallows stop.
    expect(c[6][0]).toBeCloseTo(beam / 2 + 3);
    expect(c[6][1]).toBeCloseTo(0);
    expect(c[7][0]).toBeCloseTo(-(beam / 2 + 3));
    expect(c[7][1]).toBeCloseTo(0);
    expect(c[8][0]).toBeCloseTo(0);
    expect(c[8][1]).toBeCloseTo(bowExtent + 3);
    expect(c[8][1]).toBeGreaterThan(BOAT_PROBE_DISTANCE);
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
