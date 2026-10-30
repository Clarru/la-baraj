import * as THREE from "three";

/** Shipped runabout GLBs: the detailed boat and its light remote-player LOD. */
export const RUNABOUT_IDS = {
  full: "Lake_Runabout",
  lod: "Lake_Runabout_LOD",
} as const;

/**
 * Metres, from the detailed runabout's bounds in runabout-library.json. The
 * origin is on the waterline at the hull pivot; bow +Z, +Y up.
 * deckHeight is the foredeck crown above the waterline, measured on the
 * Varnish/DeckPlanks centreline of Lake_Runabout.glb: it rises from 0.76 m at
 * the windshield to 0.83 m at the bow, 0.80 m at mid-foredeck (z ≈ 2.5).
 */
export const BOAT_DIMENSIONS = {
  length: 6.146,
  beam: 2.207,
  bowExtent: 3.683,
  sternExtent: 2.463,
  draft: 0.5,
  deckHeight: 0.8,
} as const;

/**
 * Character root relative to the `DriverSeat` empty while driving. The empty is
 * on the cockpit floor directly under the seated hips. Activity_Sit puts the
 * pelvis 0.33 m behind the character root, on a seat 0.45 m above it. The
 * driver cushion top is 0.41 m above the floor (0.47 m above the waterline).
 * So the root moves 0.33 m forward, putting the hips over the empty, and
 * 0.04 m down, putting them on the cushion.
 */
export const BOAT_DRIVER_OFFSET = [0, -0.04, 0.33] as const;

/** The driver's left is +X (GLB `Grip_L`); right is −X (`Grip_R`). */
export type BoatSide = "left" | "right";

export type BoatRig = {
  group: THREE.Object3D;
  /** The tilted `SteeringWheel` node at the wheel pivot. */
  wheel: THREE.Object3D;
  /** Child of `wheel` carrying the rim and grips; spun about local Z. */
  wheelSpin: THREE.Object3D;
  grips: Record<BoatSide, THREE.Object3D>;
  driverSeat: THREE.Object3D;
  /** `Seat_0`..`Seat_5`, in order. */
  seats: THREE.Object3D[];
};

const SEAT_COUNT = 6;

/** Finds the runabout's contract nodes; throws naming every node that is missing. */
export function extractBoatRig(scene: THREE.Object3D): BoatRig {
  const missing: string[] = [];
  const find = (name: string) => {
    const node = scene.getObjectByName(name);
    if (!node) missing.push(name);
    return node as THREE.Object3D;
  };
  const rig: BoatRig = {
    group: scene,
    wheel: find("SteeringWheel"),
    wheelSpin: find("WheelSpin"),
    grips: { left: find("Grip_L"), right: find("Grip_R") },
    driverSeat: find("DriverSeat"),
    seats: Array.from({ length: SEAT_COUNT }, (_, i) => find(`Seat_${i}`)),
  };
  if (missing.length)
    throw new Error(`Runabout model is missing nodes: ${missing.join(", ")}`);
  return rig;
}

/** Turns the visible wheel; positive (left turn) reads counter-clockwise to the driver. */
export function setBoatWheelAngle(rig: BoatRig, wheelAngle: number): void {
  rig.wheelSpin.rotation.z = Number.isFinite(wheelAngle) ? -wheelAngle : 0;
}

/** Rolls the whole boat so seat, console and wheel lean together; positive dips +X (left). */
export function applyBoatLean(rig: BoatRig, lean: number): void {
  rig.group.rotation.z = -lean;
}
