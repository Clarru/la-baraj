import { Vector3 } from "three";
/** Pull back along the current sight line, then let normal walking follow the player. */
export function arcadeExitCamera(
  position: Vector3,
  target: Vector3,
  player: Vector3,
) {
  const direction = position.clone().sub(target),
    distance = Math.max(4.8, direction.length());
  if (direction.lengthSq() < 1e-8) direction.set(0, 0.139, 0.99);
  direction.normalize();
  const nextTarget = player.clone().add(new Vector3(0, 0.65, 0));
  return {
    position: nextTarget.clone().addScaledVector(direction, distance),
    target: nextTarget,
  };
}
