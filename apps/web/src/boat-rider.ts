import * as THREE from "three";
import { setWorldRotation, solveTwoBoneIK } from "./limb-ik";

export type BoatRiderFrame = {
  /** World-space grip on the driver's left, boat +X (BoatHandle.gripWorldPosition("left")). */
  left: THREE.Vector3;
  /** World-space grip on the driver's right, boat −X (BoatHandle.gripWorldPosition("right")). */
  right: THREE.Vector3;
  /** World-space unit normal of the wheel face, toward the driver (BoatHandle.wheelNormalWorld). */
  wheelNormal: THREE.Vector3;
  /** World-space wheel hub, the rim's centre (BoatHandle.wheelHubWorld). */
  hub: THREE.Vector3;
};

/** Wrist joint sits this far behind the rim contact, toward the driver. */
export const BOAT_RIDER_WRIST_OFFSET = 0.04;
/**
 * A wrist target counts as reachable up to this far beyond the stretched arm:
 * the hand then stops at most 0.05 m from the grip (with the wrist offset),
 * still on the rim.
 */
export const BOAT_RIDER_REACH_SLACK = 0.01;
/** Rim search step when a grip is out of reach: 2° each way, up to half a turn. */
const RIM_STEP = Math.PI / 90;

const target = new THREE.Vector3(),
  pole = new THREE.Vector3();
const across = new THREE.Vector3(),
  facing = new THREE.Vector3();
const radial = new THREE.Vector3(),
  forward = new THREE.Vector3(),
  width = new THREE.Vector3();
const shoulder = new THREE.Vector3(),
  spoke = new THREE.Vector3(),
  tangent = new THREE.Vector3(),
  candidate = new THREE.Vector3();
const basis = new THREE.Matrix4();
const gripRotation = new THREE.Quaternion(),
  worldRotation = new THREE.Quaternion();

/**
 * Apply after AnimationMixer.update while Activity_Sit plays. Only the six arm
 * bones move, so the hands hold the wheel grips; call reset once on dismount.
 * A grip turned beyond the arm's reach is not chased off the wheel: the hand
 * slides along the rim (same hub, plane and radius) to the nearest reachable
 * point, or to the rim point closest to the shoulder if none is reachable.
 */
export function createBoatRiderRig(object: THREE.Object3D) {
  object.updateWorldMatrix(true, true);
  const inverseRotation = object
    .getWorldQuaternion(new THREE.Quaternion())
    .invert();
  const arms = (["l", "r"] as const).map((suffix) => {
    const upperArm = object.getObjectByName(`upperarm_${suffix}`);
    const lowerArm = object.getObjectByName(`lowerarm_${suffix}`);
    const hand = object.getObjectByName(`hand_${suffix}`);
    if (!upperArm || !lowerArm || !hand) return null;
    // The character faces +Z, so its physical left hand is at object +X and
    // takes the driver's-left grip. Sides come from the bind pose, not bone names.
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
    const reach =
      upperArm
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(lowerArm.getWorldPosition(new THREE.Vector3())) +
      lowerArm
        .getWorldPosition(new THREE.Vector3())
        .distanceTo(hand.getWorldPosition(new THREE.Vector3())) +
      BOAT_RIDER_REACH_SLACK;
    return { upperArm, lowerArm, hand, sign, handRotation, saved, reach };
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
    update({ left, right, wheelNormal, hub }: BoatRiderFrame) {
      if (!available) return;
      if (
        ![left, right, wheelNormal, hub].every(
          (v) =>
            Number.isFinite(v.x) &&
            Number.isFinite(v.y) &&
            Number.isFinite(v.z),
        )
      )
        return;
      // Grip axis toward the driver's left (+X hand side).
      across.copy(left).sub(right);
      if (across.lengthSq() < 1e-8) return;
      across.normalize();
      object.updateWorldMatrix(true, true);
      // Wheel-plane normal toward the driver, kept square to the grip axis.
      facing.copy(wheelNormal);
      facing.addScaledVector(across, -facing.dot(across));
      if (facing.lengthSq() < 1e-8) return;
      facing.normalize();
      forward.copy(facing).negate();
      active = true;
      for (const arm of found) {
        // Spoke from the hub to this hand's grip, in the wheel plane.
        spoke.copy(arm.sign > 0 ? left : right).sub(hub);
        spoke.addScaledVector(facing, -spoke.dot(facing));
        const radius = spoke.length();
        if (radius < 1e-4) radial.copy(across).multiplyScalar(arm.sign);
        else radial.copy(spoke).divideScalar(radius);
        tangent.crossVectors(facing, radial);
        arm.upperArm.getWorldPosition(shoulder);
        rimWrist(hub, radial, tangent, radius, 0, target);
        if (target.distanceTo(shoulder) > arm.reach) {
          // Out of reach: try rim points ever further round, either way.
          let best = target.distanceTo(shoulder),
            bestAngle = 0,
            reached = false;
          for (let step = 1; step <= 90 && !reached; step++)
            for (const angle of [step * RIM_STEP, -step * RIM_STEP]) {
              const d = rimWrist(
                hub,
                radial,
                tangent,
                radius,
                angle,
                candidate,
              ).distanceTo(shoulder);
              if (d <= arm.reach) {
                bestAngle = angle;
                reached = true;
                break;
              }
              if (d < best) {
                best = d;
                bestAngle = angle;
              }
            }
          rimWrist(hub, radial, tangent, radius, bestAngle, target);
          radial
            .multiplyScalar(Math.cos(bestAngle))
            .addScaledVector(tangent, Math.sin(bestAngle))
            .normalize();
        }
        // Grip frame: fingers forward through the rim, back of hand outward.
        width.crossVectors(radial, forward);
        basis.makeBasis(width, radial, forward);
        gripRotation.setFromRotationMatrix(basis);
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

/** Wrist target behind the rim point `angle` round from `radial` toward `tangent`. */
function rimWrist(
  hub: THREE.Vector3,
  radial: THREE.Vector3,
  tangent: THREE.Vector3,
  radius: number,
  angle: number,
  out: THREE.Vector3,
): THREE.Vector3 {
  return out
    .copy(hub)
    .addScaledVector(radial, radius * Math.cos(angle))
    .addScaledVector(tangent, radius * Math.sin(angle))
    .addScaledVector(facing, BOAT_RIDER_WRIST_OFFSET);
}
