import { southShore } from "./geography";
import { LAKE_LEVEL } from "./swim-motion";

/** The two `<Dock>` x positions in settlement.tsx. */
export const BOAT_DOCK_XS = [0, -235] as const;
/** Boat offset east of the dock centreline, clear of the deck and its posts. */
export const BOAT_DOCK_SIDE_OFFSET = 3.2;
/** Boat offset out into the lake from the south shore. */
export const BOAT_DOCK_LAKE_OFFSET = 11;
/** Furthest the player can be from the boat and still board. */
export const BOAT_BOARD_DISTANCE = 3.5;
const EXIT_MIN_DRY = 0.1;
const EXIT_STEPS = [1.6, 2.6] as const;

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

/** Exit points left, right, then bow at 1.6 m and 2.6 m (left of +Z-forward is +X). */
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
  for (const d of EXIT_STEPS)
    out.push(
      [px + lx * d, pz + lz * d],
      [px - lx * d, pz - lz * d],
      [px + fx * d, pz + fz * d],
    );
  return out;
}

/** First dry-enough candidate becomes a land exit; otherwise drop into the water at the first. */
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
      floor >= LAKE_LEVEL + EXIT_MIN_DRY
    )
      return { kind: "land", position: [x, floor, z] };
  }
  const [x, z] = candidates[0];
  return { kind: "water", position: [x, LAKE_LEVEL, z] };
}
