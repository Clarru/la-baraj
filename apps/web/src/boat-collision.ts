import type RAPIER from "@dimforge/rapier3d-compat";
import {
  BOAT_HULL,
  boatHullPoints,
  resolveBoatWallImpact,
  type BoatPose,
  type Vec2,
} from "../../../packages/shared/boats";
import { LAKE_LEVEL } from "./swim-motion";
import { applyBoatImpact, type BoatMotionState } from "./boat-motion";
const CENTRE_Y = LAKE_LEVEL + 0.4,
  LOOK_AHEAD = 0.06,
  TURN_STEP = 0.02;
const RADIUS = Math.max(...BOAT_HULL.map((p) => Math.hypot(...p)));
const worldObstacle = (c: RAPIER.Collider) =>
  !(c.parent()?.userData as { remoteBoat?: boolean } | undefined)?.remoteBoat;
/** Triangulated convex prism; explicit indices avoid rebuilding a convex hull per query. */
export function boatPrism(padding = 0, centreY = 0) {
  const points = boatHullPoints({ position: [0, 0], yaw: 0 }, padding),
    n = points.length;
  const vertices = new Float32Array(n * 6),
    indices: number[] = [];
  for (let layer = 0; layer < 2; layer++)
    for (let i = 0; i < n; i++)
      vertices.set(
        [points[i][0], centreY + (layer === 0 ? -0.35 : 0.35), points[i][1]],
        (layer * n + i) * 3,
      );
  for (let i = 1; i < n - 1; i++)
    indices.push(0, i, i + 1, n, n + i + 1, n + i);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    indices.push(i, n + i, j, n + i, n + j, j);
  }
  return { vertices, indices: new Uint32Array(indices) };
}
export const PARKED_BOAT_VERTICES = boatPrism(0, 0.4).vertices;
/** Disabled remote bodies can retain Rapier contact candidates. Mask the hull
 * explicitly so occupied boats receive only the server's boat response. */
export function setRemoteBoatCollision(
  body: RAPIER.RigidBody,
  enabled: boolean,
) {
  for (let i = 0; i < body.numColliders(); i++)
    body.collider(i).setCollisionGroups(enabled ? 0xffffffff : 0);
  body.setEnabled(enabled);
}
const base = boatPrism();
const shapes = new WeakMap<object, Map<number, RAPIER.ConvexPolyhedron>>();
function hull(rapier: typeof RAPIER, padding = 0) {
  const key = Math.ceil(padding / 0.002) * 0.002; // round upward: still conservative
  let cache = shapes.get(rapier);
  if (!cache) {
    cache = new Map();
    shapes.set(rapier, cache);
  }
  let shape = cache.get(key);
  if (!shape) {
    const p = key ? boatPrism(key) : base;
    shape = new rapier.ConvexPolyhedron(p.vertices, p.indices);
    cache.set(key, shape);
  }
  return shape;
}
type Query = {
  x: number;
  z: number;
  yaw: number;
  dx: number;
  dz: number;
  exclude: RAPIER.RigidBody;
};
export function boatHullHit(
  world: RAPIER.World,
  rapier: typeof RAPIER,
  input: Query,
) {
  const { x, z, yaw, dx, dz, exclude } = input,
    distance = Math.hypot(dx, dz);
  if (!(distance > 1e-6) || ![x, z, yaw].every(Number.isFinite)) return null;
  const hit = world.castShape(
    { x, y: CENTRE_Y, z },
    { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
    { x: dx / distance, y: 0, z: dz / distance },
    hull(rapier),
    0,
    distance + LOOK_AHEAD,
    false,
    rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    undefined,
    undefined,
    exclude,
    worldObstacle,
  );
  if (!hit) return null;
  const length = Math.hypot(hit.normal1.x, hit.normal1.z);
  return {
    collider: hit.collider,
    point: [hit.witness1.x, hit.witness1.z] as Vec2,
    normal:
      length > 0.1
        ? ([-hit.normal1.x / length, -hit.normal1.z / length] as Vec2)
        : null,
    distance: hit.time_of_impact,
  };
}
export function boatHullBlocked(
  world: RAPIER.World,
  rapier: typeof RAPIER,
  input: Query,
) {
  return boatHullHit(world, rapier, input) !== null;
}
/** Full angular sweep: padded midpoint hulls conservatively cover every interval. */
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
) {
  const { x, z, fromYaw, toYaw, exclude } = input;
  if (![x, z, fromYaw, toYaw].every(Number.isFinite)) return true;
  const delta = Math.atan2(
    Math.sin(toYaw - fromYaw),
    Math.cos(toYaw - fromYaw),
  );
  if (delta === 0) return false;
  const steps = Math.ceil(Math.abs(delta) / TURN_STEP),
    step = delta / steps,
    padding = 2 * RADIUS * Math.sin(Math.abs(step) / 4),
    shape = hull(rapier, padding);
  for (let i = 0; i < steps; i++) {
    const yaw = fromYaw + (i + 0.5) * step;
    if (
      world.intersectionWithShape(
        { x, y: CENTRE_Y, z },
        { x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) },
        shape,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        exclude,
        worldObstacle,
      )
    )
      return true;
  }
  return false;
}
/** Same contact-point response against a dock/piling, with no vertical impulse. */
export function applyBoatWorldImpact(
  motion: BoatMotionState,
  position: Vec2,
  point: Vec2,
  normal: Vec2,
) {
  const result = resolveBoatWallImpact(
    {
      position,
      yaw: motion.yaw,
      velocity: [
        Math.sin(motion.yaw) * motion.speed + motion.driftX,
        Math.cos(motion.yaw) * motion.speed + motion.driftZ,
      ],
      angularVelocity: motion.turnRate,
      rudder: motion.steer,
      moored: false,
    },
    point,
    normal,
  );
  applyBoatImpact(motion, result);
}
/** Physical server correction; shore geometry wins and y/vertical speed are preserved. */
export function applyBoatBodyImpact(
  world: RAPIER.World,
  rapier: typeof RAPIER,
  body: RAPIER.RigidBody,
  motion: BoatMotionState,
  boat: BoatPose,
) {
  const p = body.translation(),
    [x, z] = boat.position;
  const blocked = boatHullBlocked(world, rapier, {
    x: p.x,
    z: p.z,
    yaw: motion.yaw,
    dx: x - p.x,
    dz: z - p.z,
    exclude: body,
  });
  if (!blocked) body.setTranslation({ x, y: p.y, z }, true);
  const at = body.translation(),
    blockedTurn = boatTurnBlocked(world, rapier, {
      x: at.x,
      z: at.z,
      fromYaw: motion.yaw,
      toYaw: boat.yaw,
      exclude: body,
    });
  applyBoatImpact(motion, {
    ...boat,
    yaw: blockedTurn ? motion.yaw : boat.yaw,
    angularVelocity: blockedTurn ? 0 : boat.angularVelocity,
  });
  const v = body.linvel();
  body.setLinvel(
    {
      x: Math.sin(motion.yaw) * motion.speed + motion.driftX,
      y: v.y,
      z: Math.cos(motion.yaw) * motion.speed + motion.driftZ,
    },
    true,
  );
  return !blocked;
}
