import * as THREE from "three";
import { BOAT_METRICS } from "./boat-geometry";
import { setWorldRotation, solveTwoBoneIK } from "./limb-ik";

export type BoatRiderFrame = {
  /** World-space −X grip (BoatHandle.gripWorldPosition("left")). */
  left: THREE.Vector3;
  /** World-space +X grip (BoatHandle.gripWorldPosition("right")). */
  right: THREE.Vector3;
};

/** Wrist joint sits this far behind the rim contact, toward the driver. */
export const BOAT_RIDER_WRIST_OFFSET = 0.04;

// Wheel face toward the seated driver, in character (= boat) object space.
const wheelFacing = new THREE.Vector3(
  0,
  Math.sin(BOAT_METRICS.wheelTilt),
  -Math.cos(BOAT_METRICS.wheelTilt),
);
const target = new THREE.Vector3(),
  pole = new THREE.Vector3();
const across = new THREE.Vector3(),
  facing = new THREE.Vector3();
const radial = new THREE.Vector3(),
  forward = new THREE.Vector3(),
  width = new THREE.Vector3();
const basis = new THREE.Matrix4();
const gripRotation = new THREE.Quaternion(),
  worldRotation = new THREE.Quaternion();
const objectRotation = new THREE.Quaternion();

/**
 * Apply after AnimationMixer.update while Activity_Sit plays. Only the six arm
 * bones move, so the hands hold the wheel grips; call reset once on dismount.
 */
export function createBoatRiderRig(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  object.getWorldQuaternion(objectRotation);
  const inverseRotation = objectRotation.clone().invert();
  const arms = (["l", "r"] as const).map((suffix) => {
    const upperArm = object.getObjectByName(`upperarm_${suffix}`);
    const lowerArm = object.getObjectByName(`lowerarm_${suffix}`);
    const hand = object.getObjectByName(`hand_${suffix}`);
    if (!upperArm || !lowerArm || !hand) return null;
    // This source rig names its +X limbs "left"; match physical sides instead.
    const sign =
      object.worldToLocal(hand.getWorldPosition(new THREE.Vector3())).x < 0
        ? -1
        : 1;
    // Rest hand rotation re-expressed so its fingers point along grip-frame +Z.
    const handRotation = inverseRotation
      .clone()
      .multiply(hand.getWorldQuaternion(new THREE.Quaternion()));
    const fingers = new THREE.Vector3(0, 1, 0).applyQuaternion(handRotation);
    handRotation.premultiply(
      new THREE.Quaternion().setFromUnitVectors(
        fingers.normalize(),
        new THREE.Vector3(0, 0, 1),
      ),
    );
    const saved = [upperArm, lowerArm, hand].map((bone) => ({
      bone,
      position: bone.position.clone(),
      quaternion: bone.quaternion.clone(),
      scale: bone.scale.clone(),
    }));
    return { upperArm, lowerArm, hand, sign, handRotation, saved };
  });
  const found = arms.filter((arm) => arm !== null);
  // Both physical sides are required, or the rig leaves the model untouched.
  const available = found.length === 2 && found[0].sign !== found[1].sign;
  let active = false;
  const reset = () => {
    if (!active || !available) return;
    for (const arm of found)
      for (const pose of arm.saved) {
        pose.bone.position.copy(pose.position);
        pose.bone.quaternion.copy(pose.quaternion);
        pose.bone.scale.copy(pose.scale);
      }
    object.updateWorldMatrix(true, true);
    active = false;
  };

  return {
    update({ left, right }: BoatRiderFrame) {
      if (!available) return;
      if (
        ![left.x, left.y, left.z, right.x, right.y, right.z].every(
          Number.isFinite,
        )
      )
        return;
      across.copy(right).sub(left);
      if (across.lengthSq() < 1e-8) return;
      across.normalize();
      object.updateWorldMatrix(true, true);
      object.getWorldQuaternion(objectRotation);
      // Wheel-plane normal: the boat's tilted face, kept square to the grip axis.
      facing.copy(wheelFacing).applyQuaternion(objectRotation);
      facing.addScaledVector(across, -facing.dot(across));
      if (facing.lengthSq() < 1e-8) return;
      facing.normalize();
      forward.copy(facing).negate();
      active = true;
      for (const arm of found) {
        // Grip frame: fingers forward through the rim, back of hand outward.
        radial.copy(across).multiplyScalar(arm.sign);
        width.crossVectors(radial, forward);
        basis.makeBasis(width, radial, forward);
        gripRotation.setFromRotationMatrix(basis);
        target
          .copy(arm.sign < 0 ? left : right)
          .addScaledVector(facing, BOAT_RIDER_WRIST_OFFSET);
        pole.set(arm.sign * 0.35, 0.55, 0.15);
        object.localToWorld(pole);
        solveTwoBoneIK(arm.upperArm, arm.lowerArm, arm.hand, target, pole);
        worldRotation.copy(gripRotation).multiply(arm.handRotation);
        setWorldRotation(arm.hand, worldRotation);
      }
    },
    reset,
    dispose: reset,
  };
}
