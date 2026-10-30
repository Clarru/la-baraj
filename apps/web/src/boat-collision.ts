import type RAPIER from "@dimforge/rapier3d-compat";
import { BOAT_DIMENSIONS } from "./boat-geometry";
import { LAKE_LEVEL } from "./swim-motion";

const { beam, bowExtent, sternExtent } = BOAT_DIMENSIONS;
/** Hull box: full beam and length, 0.7 m tall (world y 0.10..0.80, clearing the 0.65..0.89 dock deck slab), riding above the lakebed. */
const HALF_EXTENTS = { x: beam / 2, y: 0.35, z: (bowExtent + sternExtent) / 2 };
/** The hull midpoint lies this far forward of the pivot (the boat origin). */
const CENTRE_FORWARD = (bowExtent - sternExtent) / 2;
/** Box centre height: its 0.05 m underside clears a deep lakebed, so open water never drags. */
const CENTRE_Y = LAKE_LEVEL + 0.4;
/** Extra distance swept past this frame's motion, so the hull stops short of contact. */
const LOOK_AHEAD = 0.3;
/** Limit each conservative angular sweep to about one degree. */
const TURN_STEP = 0.02;
const HULL_RADIUS = Math.hypot(beam / 2, Math.max(bowExtent, sternExtent));

/**
 * Test the complete bow/stern sweep before accepting a new heading. Each
 * midpoint box is expanded by the furthest any hull point can travel during
 * that angular interval, covering thin obstacles between the sampled poses.
 * Translation is checked separately, after the heading has been accepted.
 */
export function boatTurnBlocked(
  world: RAPIER.World,
  rapier: typeof RAPIER,
  input: {
    x: number;
    z: number;
    fromYaw: number;
    toYaw: number;
    exclude: RAPIER.RigidBody;
  },
): boolean {
  const { x, z, fromYaw, toYaw, exclude } = input;
  if (![x, z, fromYaw, toYaw].every(Number.isFinite)) return true;
  const delta = Math.atan2(
    Math.sin(toYaw - fromYaw),
    Math.cos(toYaw - fromYaw),
  );
  if (delta === 0) return false;
  const steps = Math.ceil(Math.abs(delta) / TURN_STEP);
  const step = delta / steps;
  const padding = 2 * HULL_RADIUS * Math.sin(Math.abs(step) / 4);
  const shape = new rapier.Cuboid(
    HALF_EXTENTS.x + padding,
    HALF_EXTENTS.y,
    HALF_EXTENTS.z + padding,
  );
  for (let i = 0; i < steps; i++) {
    const yaw = fromYaw + (i + 0.5) * step;
    if (
      world.intersectionWithShape(
        {
          x: x + Math.sin(yaw) * CENTRE_FORWARD,
          y: CENTRE_Y,
          z: z + Math.cos(yaw) * CENTRE_FORWARD,
        },
        { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
        shape,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        exclude,
      )
    )
      return true;
  }
  return false;
}

/**
 * Whether the driven hull at pivot (x, z) facing yaw would hit a solid collider
 * (dock, piling, terrain) moving by (dx, dz) this frame. The driver's own body
 * (`exclude`) and sensors never block.
 */
export function boatHullBlocked(
  world: RAPIER.World,
  rapier: typeof RAPIER,
  input: {
    x: number;
    z: number;
    yaw: number;
    dx: number;
    dz: number;
    exclude: RAPIER.RigidBody;
  },
): boolean {
  const { x, z, yaw, dx, dz, exclude } = input;
  const distance = Math.hypot(dx, dz);
  if (!(distance > 1e-6) || ![x, z, yaw].every(Number.isFinite)) return false;
  const forwardX = Math.sin(yaw),
    forwardZ = Math.cos(yaw);
  const hit = world.castShape(
    {
      x: x + forwardX * CENTRE_FORWARD,
      y: CENTRE_Y,
      z: z + forwardZ * CENTRE_FORWARD,
    },
    { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    { x: dx / distance, y: 0, z: dz / distance },
    new rapier.Cuboid(HALF_EXTENTS.x, HALF_EXTENTS.y, HALF_EXTENTS.z),
    0,
    distance + LOOK_AHEAD,
    false,
    rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    undefined,
    undefined,
    exclude,
  );
  return hit !== null;
}
