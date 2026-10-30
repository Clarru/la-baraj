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

// Transitional shim: boat-rider.ts and its test still read the old procedural
// wheel. Removed in Task 3 when boat-rider takes a supplied wheel normal.
export const BOAT_METRICS = {
  wheelPivot: [0, 0.95, 0.05],
  wheelRadius: 0.19,
  wheelTilt: 0.6,
  grips: { left: [-0.19, 0, 0], right: [0.19, 0, 0] },
} as const;

const tiltAxis = new THREE.Vector3(1, 0, 0);
const wheelAxis = new THREE.Vector3(0, 0, 1);

/** Transitional shim (removed in Task 3): grip on the old procedural wheel rim. */
export function boatGripPosition(
  side: BoatSide,
  wheelAngle: number,
): [number, number, number] {
  return new THREE.Vector3(...BOAT_METRICS.grips[side])
    .applyAxisAngle(wheelAxis, -wheelAngle)
    .applyAxisAngle(tiltAxis, BOAT_METRICS.wheelTilt)
    .add(new THREE.Vector3(...BOAT_METRICS.wheelPivot))
    .toArray();
}
