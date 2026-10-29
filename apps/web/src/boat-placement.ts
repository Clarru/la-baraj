import { inWater, southShore, terrainHeight } from "./geography";
import { LAKE_LEVEL } from "./swim-motion";

/** The two `<Dock>` x positions in settlement.tsx. */
export const BOAT_DOCK_XS = [0, -235] as const;
/** Boat offset east of the dock centreline, clear of the deck and its posts. */
export const BOAT_DOCK_SIDE_OFFSET = 3.2;
/** Boat offset out into the lake from the south shore. */
export const BOAT_DOCK_LAKE_OFFSET = 11;
/** Furthest the player can be from the boat and still board. */
export const BOAT_BOARD_DISTANCE = 3.5;
/**
 * Deepest water (m) a stepped-out driver stands in. Below the swim thresholds in
 * swim-motion.ts (enter 0.62, exit 0.42), so the player wades instead of swimming.
 */
export const BOAT_WADE_DEPTH = 0.4;
const EXIT_STEPS = [1.6, 2.6] as const;
/** Bow steps clear the 1.8 m hull half-length plus the 0.3 m capsule radius. */
const BOW_EXIT_STEPS = [2.2, 3.2] as const;
/** Land-only far ring: reaches a gentle bank from where the shallows stop the hull. */
const EXIT_FAR_STEP = 4.5;

type Spawn = { position: [number, number, number]; yaw: number };

/** Boat resting spot beside a dock, in open water, bow toward the lake (-Z). */
export function boatDockSpawn(dockX: number): Spawn {
  return {
    position: [
      dockX + BOAT_DOCK_SIDE_OFFSET,
      LAKE_LEVEL,
      southShore(dockX) - BOAT_DOCK_LAKE_OFFSET,
    ],
    yaw: Math.PI,
  };
}

/** Dock spawn nearest the given x, so the boat waits on the player's side of the lake. */
export function nearestDockSpawn(x: number): Spawn {
  const dockX = BOAT_DOCK_XS.reduce((best, d) =>
    Math.abs(d - x) < Math.abs(best - x) ? d : best,
  );
  return boatDockSpawn(dockX);
}

/** Whether the player may board the boat right now. */
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
/** Probe distance ahead of the hull centre: 1.8 m half-length plus margin. */
export const BOAT_PROBE_DISTANCE = 2.2;

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
 * Exit points per step: left and right at 1.6 m / 2.6 m, then bow at 2.2 m / 3.2 m,
 * then a far ring of left, right, bow at 4.5 m (left of +Z-forward is +X).
 * The water fallback always uses the first, nearest candidate.
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
  const sides = [...EXIT_STEPS, EXIT_FAR_STEP],
    bows = [...BOW_EXIT_STEPS, EXIT_FAR_STEP];
  sides.forEach((d, i) => {
    const bow = bows[i];
    out.push(
      [px + lx * d, pz + lz * d],
      [px - lx * d, pz - lz * d],
      [px + fx * bow, pz + fz * bow],
    );
  });
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
