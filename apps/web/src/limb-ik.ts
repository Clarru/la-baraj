import * as THREE from "three";

// Shared scratch storage; the solver is synchronous and never re-entered.
const start = new THREE.Vector3(),
  middle = new THREE.Vector3(),
  end = new THREE.Vector3();
const direction = new THREE.Vector3(),
  poleDirection = new THREE.Vector3();
const bend = new THREE.Vector3(),
  reachable = new THREE.Vector3();
const from = new THREE.Vector3(),
  to = new THREE.Vector3();
const delta = new THREE.Quaternion(),
  worldRotation = new THREE.Quaternion();
const parentRotation = new THREE.Quaternion();

/** Sets a joint's local quaternion so its world rotation equals `rotation`. */
export function setWorldRotation(
  joint: THREE.Object3D,
  rotation: THREE.Quaternion,
): void {
  if (joint.parent) {
    joint.parent.getWorldQuaternion(parentRotation).invert();
    joint.quaternion.copy(parentRotation).multiply(rotation).normalize();
  } else joint.quaternion.copy(rotation).normalize();
  joint.updateWorldMatrix(false, true);
}

function aim(
  joint: THREE.Object3D,
  child: THREE.Object3D,
  point: THREE.Vector3,
) {
  joint.getWorldPosition(start);
  child.getWorldPosition(end);
  from.copy(end).sub(start).normalize();
  to.copy(point).sub(start).normalize();
  delta.setFromUnitVectors(from, to);
  joint.getWorldQuaternion(worldRotation).premultiply(delta);
  setWorldRotation(joint, worldRotation);
}

/** Bends upper/lower so `end` reaches world `target` (clamped), elbow toward world `pole`. */
export function solveTwoBoneIK(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  endpoint: THREE.Object3D,
  target: THREE.Vector3,
  pole: THREE.Vector3,
): void {
  upper.getWorldPosition(start);
  lower.getWorldPosition(middle);
  endpoint.getWorldPosition(end);
  const a = start.distanceTo(middle),
    b = middle.distanceTo(end);
  direction.copy(target).sub(start);
  const distance = THREE.MathUtils.clamp(
    direction.length(),
    Math.abs(a - b) + 0.00001,
    a + b - 0.00001,
  );
  direction.normalize();
  reachable.copy(start).addScaledVector(direction, distance);
  poleDirection.copy(pole).sub(start);
  poleDirection.addScaledVector(direction, -poleDirection.dot(direction));
  if (poleDirection.lengthSq() < 1e-10) {
    poleDirection.set(1, 0, 0).cross(direction);
    if (poleDirection.lengthSq() < 1e-10)
      poleDirection.set(0, 1, 0).cross(direction);
  }
  poleDirection.normalize();
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  bend
    .copy(start)
    .addScaledVector(direction, along)
    .addScaledVector(poleDirection, height);
  aim(upper, lower, bend);
  aim(lower, endpoint, reachable);
}
