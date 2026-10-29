import {
  STANCE_METRICS,
  stanceCandidateY,
  stanceColliderRotation,
  stanceExpansionAllowed,
  type Stance,
} from "./stance-motion";

/**
 * Resize the player's actual Rapier collider while keeping its bottom in
 * place. The expansion query uses the complete target capsule, excludes
 * sensors and this body, and therefore catches low ceilings as well as walls.
 */
export function resizeStanceCollider(input: {
  current: Stance;
  next: Stance;
  body: {
    translation: () => { x: number; y: number; z: number };
    rotation: () => unknown;
    setTranslation: (
      position: { x: number; y: number; z: number },
      wake: boolean,
    ) => void;
    wakeUp: () => void;
  };
  collider: {
    isValid: () => boolean;
    setShape: (shape: any) => void;
    setRotation: (rotation: {
      x: number;
      y: number;
      z: number;
      w: number;
    }) => void;
  };
  world: {
    intersectionWithShape: (...args: any[]) => unknown;
  };
  rapier: {
    Capsule: new (halfHeight: number, radius: number) => unknown;
    QueryFilterFlags: { EXCLUDE_SENSORS: number };
  };
  yaw?: number;
  checkHeadroom?: boolean;
}) {
  const { current, next, body, collider, world, rapier } = input;
  if (current === next || !collider.isValid()) return true;
  const from = STANCE_METRICS[current];
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
