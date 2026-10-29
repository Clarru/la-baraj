import type {
  Collider,
  RigidBody,
  Shape,
  World,
} from "@dimforge/rapier3d-compat";
import {
  STANCE_METRICS,
  stanceCandidateY,
  stanceColliderRotation,
  stanceExpansionAllowed,
  type Stance,
} from "./stance-motion";

type StanceRapier = {
  Capsule: new (halfHeight: number, radius: number) => Shape;
  QueryFilterFlags: { EXCLUDE_SENSORS: number };
};

/**
 * Resize the player's actual Rapier collider while keeping its bottom in
 * place. The expansion query uses the complete target capsule, excludes
 * sensors and this body, and therefore catches low ceilings as well as walls.
 */
export function resizeStanceCollider(input: {
  current: Stance;
  next: Stance;
  body: RigidBody;
  collider: Pick<Collider, "isValid" | "setShape" | "setRotation">;
  world: Pick<World, "intersectionWithShape">;
  rapier: StanceRapier;
  yaw?: number;
  checkHeadroom?: boolean;
}) {
  const { current, next, body, collider, world, rapier } = input;
  if (current === next || !collider.isValid()) return true;
  const to = STANCE_METRICS[next];
  const position = body.translation();
  const candidate = {
    x: position.x,
    y: stanceCandidateY(position.y, current, next),
    z: position.z,
  };
  const targetShape = new rapier.Capsule(
    to.capsuleHalfHeight,
    to.capsuleRadius,
  );
  const targetRotation = stanceColliderRotation(next, input.yaw ?? 0);
  const intersects =
    (input.checkHeadroom ?? true) &&
    Boolean(
      world.intersectionWithShape(
        candidate,
        targetRotation,
        targetShape,
        rapier.QueryFilterFlags.EXCLUDE_SENSORS,
        undefined,
        undefined,
        body,
      ),
    );
  if (!stanceExpansionAllowed(current, next, intersects)) return false;
  collider.setShape(targetShape);
  collider.setRotation(targetRotation);
  body.setTranslation(candidate, true);
  body.wakeUp();
  return true;
}

/** Rotate a prone footprint only when the complete target shape remains clear. */
export function rotateProneCollider(input: {
  body: RigidBody;
  collider: Pick<Collider, "shape" | "setRotation">;
  world: Pick<World, "intersectionWithShape">;
  rapier: Pick<StanceRapier, "QueryFilterFlags">;
  yaw: number;
}) {
  const rotation = stanceColliderRotation("prone", input.yaw);
  const blocked = input.world.intersectionWithShape(
    input.body.translation(),
    rotation,
    input.collider.shape,
    input.rapier.QueryFilterFlags.EXCLUDE_SENSORS,
    undefined,
    undefined,
    input.body,
  );
  if (blocked) return false;
  input.collider.setRotation(rotation);
  return true;
}
