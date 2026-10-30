import { BOAT_DIMENSIONS } from "./boat-geometry";
import { cabinSpots, inWater, southShore, terrainHeight } from "./geography";
import { LAKE_LEVEL } from "./swim-motion";

const { beam, bowExtent, sternExtent } = BOAT_DIMENSIONS;

/** The two `<Dock>` x positions in settlement.tsx. */
export const BOAT_DOCK_XS = [0, -235] as const;
/**
 * Boat pivot east of the dock centreline: the 1.7 m deck half-width, the
 * 1.10 m hull half-beam and 0.9 m of open water between them.
 */
export const BOAT_DOCK_SIDE_OFFSET = 3.7;
/**
 * Boat pivot out into the lake from the south shore. At the shallower x = 0
 * dock the shoreward stern corner then floats in 0.68 m of water, and the
 * stern still lies alongside the deck's far end for boarding.
 */
export const BOAT_DOCK_LAKE_OFFSET = 13;
/** Furthest the player can be from the hull's edge and still board. */
export const BOAT_BOARD_DISTANCE = 1.6;
/**
 * Deepest water (m) a stepped-out driver stands in. Below the swim thresholds in
 * swim-motion.ts (enter 0.62, exit 0.42), so the player wades instead of swimming.
 */
export const BOAT_WADE_DEPTH = 0.4;
/** Exit steps beyond the hull's edge: clear of the hull with the 0.3 m capsule radius. */
const EXIT_CLEARANCES = [0.7, 1.7] as const;
/**
 * Land-only far ring beyond the hull's edge: from where the shallows stop the
 * hull, it reaches a gentle bank 2.2 m past the bow probe.
 */
const EXIT_FAR_CLEARANCE = 3;

type Spawn = { position: [number, number, number]; yaw: number };
const dockDepths = new Map<number, number>();
function firstBerthZ(dockX: number) {
  const cached = dockDepths.get(dockX);
  if (cached !== undefined) return cached;
  const columns = [3.7, -3.7, 6.8, -6.8, 9.9, -9.9];
  for (let extra = 0; extra <= 40; extra++) {
    const z = southShore(dockX) - BOAT_DOCK_LAKE_OFFSET - extra;
    const clear = columns.every((offset) =>
      [-beam / 2, beam / 2].every((side) =>
        [-bowExtent, sternExtent].every((end) => {
          const x = dockX + offset + side,
            pz = z + end;
          return (
            inWater(x, pz) &&
            LAKE_LEVEL - terrainHeight(x, pz, undefined, true) >= 0.65
          );
        }),
      ),
    );
    if (clear) {
      dockDepths.set(dockX, z);
      return z;
    }
  }
  throw new Error("No deep-water berths beside the dock");
}

/** Boat resting spot beside a dock, in open water, bow toward the lake (-Z). */
export function boatDockSpawn(dockX: number, berth = 0): Spawn {
  const column = berth % 6;
  const side = column % 2 === 0 ? 1 : -1;
  const offset = side * (BOAT_DOCK_SIDE_OFFSET + Math.floor(column / 2) * 3.1);
  return {
    position: [
      dockX + offset,
      LAKE_LEVEL,
      firstBerthZ(dockX) - Math.floor(berth / 6) * 7.5,
    ],
    yaw: Math.PI,
  };
}

/** Dock spawn nearest the given x, so the boat waits on the player's side of the lake. */
export function nearestDockSpawn(x: number, homeIndex?: number): Spawn {
  const homeX = homeIndex === undefined ? x : (cabinSpots[homeIndex]?.x ?? x);
  const dockX = BOAT_DOCK_XS.reduce((best, d) =>
    Math.abs(d - homeX) < Math.abs(best - homeX) ? d : best,
  );
  const homes = cabinSpots.filter(
    (p) =>
      BOAT_DOCK_XS.reduce((best, d) =>
        Math.abs(d - p.x) < Math.abs(best - p.x) ? d : best,
      ) === dockX,
  );
  const berth =
    homeIndex === undefined
      ? 0
      : Math.max(
          0,
          homes.findIndex((p) => p.i === homeIndex),
        );
  return boatDockSpawn(dockX, berth);
}

/** Ground distance from (px, pz) to the hull's footprint rectangle; 0 inside. */
export function distanceToHull(
  px: number,
  pz: number,
  boat: { x: number; z: number; yaw: number },
): number {
  const dx = px - boat.x,
    dz = pz - boat.z;
  const sin = Math.sin(boat.yaw),
    cos = Math.cos(boat.yaw);
  const forward = dx * sin + dz * cos,
    side = dx * cos - dz * sin;
  return Math.hypot(
    Math.max(Math.abs(side) - beam / 2, 0),
    Math.max(forward - bowExtent, -sternExtent - forward, 0),
  );
}

/** Whether the player may board the boat right now; `distance` is distanceToHull. */
export function canBoardBoat(input: {
  distance: number;
  scooterMounted: boolean;
  swimming: boolean;
  grounded: boolean;
  indoors: boolean;
  activity: string;
  paused: boolean;
}): boolean {
  return (
    input.distance <= BOAT_BOARD_DISTANCE &&
    !input.scooterMounted &&
    !input.indoors &&
    !input.paused &&
    input.activity === "none" &&
    (input.swimming || input.grounded)
  );
}

/** Shallowest water (m) the hull may enter. */
export const BOAT_MIN_DEPTH = 0.5;
/** Probe distance ahead of the pivot: the bow extent plus 0.8 m margin. */
export const BOAT_PROBE_DISTANCE = bowExtent + 0.8;

/** Whether land or shallows lie just ahead (direction 1) or astern (-1); non-finite input counts as blocked. */
export function boatBlockedAhead(
  x: number,
  z: number,
  yaw: number,
  direction: 1 | -1,
): boolean {
  if (![x, z, yaw].every(Number.isFinite)) return true;
  const d = BOAT_PROBE_DISTANCE * direction;
  const px = x + Math.sin(yaw) * d,
    pz = z + Math.cos(yaw) * d;
  return (
    !inWater(px, pz) ||
    LAKE_LEVEL - terrainHeight(px, pz, undefined, true) < BOAT_MIN_DEPTH
  );
}

/**
 * Exit points per step, measured from the hull's edge: left and right of the
 * pivot, then ahead of the bow, at 0.7 m and 1.7 m, then a land-only far ring
 * at 3 m (left of +Z-forward is +X). The water fallback always uses the first,
 * nearest candidate.
 */
export function boatExitCandidates(
  x: number,
  z: number,
  yaw: number,
): [number, number][] {
  const px = Number.isFinite(x) ? x : 0;
  const pz = Number.isFinite(z) ? z : 0;
  const a = Number.isFinite(yaw) ? yaw : 0;
  const fx = Math.sin(a),
    fz = Math.cos(a);
  const lx = fz,
    lz = -fx;
  const out: [number, number][] = [];
  for (const clearance of [...EXIT_CLEARANCES, EXIT_FAR_CLEARANCE]) {
    const d = beam / 2 + clearance,
      bow = bowExtent + clearance;
    out.push(
      [px + lx * d, pz + lz * d],
      [px - lx * d, pz - lz * d],
      [px + fx * bow, pz + fz * bow],
    );
  }
  return out;
}

/** First candidate with ground no deeper than BOAT_WADE_DEPTH becomes a land (wade-ashore) exit; otherwise drop into the water at the first. */
export function chooseBoatExit(
  candidates: [number, number][],
  floorAt: (x: number, z: number) => number | undefined,
):
  | { kind: "land"; position: [number, number, number] }
  | { kind: "water"; position: [number, number, number] } {
  for (const [x, z] of candidates) {
    const floor = floorAt(x, z);
    if (
      floor !== undefined &&
      Number.isFinite(floor) &&
      floor >= LAKE_LEVEL - BOAT_WADE_DEPTH
    )
      return { kind: "land", position: [x, floor, z] };
  }
  const [x, z] = candidates[0];
  return { kind: "water", position: [x, LAKE_LEVEL, z] };
}
