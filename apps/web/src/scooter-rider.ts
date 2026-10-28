import * as THREE from "three";
import { SCOOTER_METRICS, scooterGripPosition } from "./scooter-geometry";

type BonePose = {
  bone: THREE.Object3D;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  scale: THREE.Vector3;
};

export type ScooterRiderFrame = {
  speed: number;
  /** Actual visible handlebar rotation in radians (ScooterHandle.steeringAngle). */
  steer: number;
};

/** Both character and scooter use the same floor origin and face local +Z. */
export const SCOOTER_RIDER_VISUAL_OFFSET = 0;
/** Soft knees keep the rider stable above the deck rather than standing rigidly. */
export const SCOOTER_RIDER_PELVIS_HEIGHT = 0.99;

/**
 * Apply after AnimationMixer.update. Every frame starts from a saved authored pose,
 * including constant tracks, so IK never compounds the preceding frame's rotations.
 * Pass Idle_Neutral from the retained character's own animation library.
 * Call reset once on dismount, before updating the walking animation mixer.
 */
export function createScooterRiderRig(
  object: THREE.Object3D,
  idleClip?: THREE.AnimationClip,
) {
  const saved: BonePose[] = [];
  object.traverse((bone) => {
    if (bone instanceof THREE.Bone)
      saved.push({
        bone,
        position: bone.position.clone(),
        quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone(),
      });
  });
  const standing = saved.map((pose) => ({
    ...pose,
    position: pose.position.clone(),
    quaternion: pose.quaternion.clone(),
    scale: pose.scale.clone(),
  }));
  const byName = new Map(standing.map((pose) => [pose.bone.name, pose]));
  for (const track of idleClip?.tracks ?? []) {
    const [name, property] = track.name.split(".");
    const pose = byName.get(name);
    if (!pose) continue;
    if (property === "quaternion")
      pose.quaternion.fromArray(track.values).normalize();
    // Source-library constant translations differ slightly from the retained
    // mesh's bind lengths. Preserve its proportions and only move authored roots.
    else if (property === "position" && (name === "root" || name === "pelvis"))
      pose.position.fromArray(track.values);
  }
  const restore = (poses: BonePose[]) => {
    for (const pose of poses) {
      pose.bone.position.copy(pose.position);
      pose.bone.quaternion.copy(pose.quaternion);
      pose.bone.scale.copy(pose.scale);
    }
    object.updateWorldMatrix(true, true);
  };
  const bone = (name: string) => object.getObjectByName(name);
  const pelvis = bone("pelvis");
  const spine1 = bone("spine_01"),
    spine2 = bone("spine_02");
  const objectRotation = new THREE.Quaternion();
  const inverseRotation = new THREE.Quaternion();
  object.updateWorldMatrix(true, true);
  object.getWorldQuaternion(inverseRotation).invert();

  const limbs = (["l", "r"] as const).map((suffix) => {
    const upperArm = bone(`upperarm_${suffix}`);
    const lowerArm = bone(`lowerarm_${suffix}`);
    const hand = bone(`hand_${suffix}`);
    const thigh = bone(`thigh_${suffix}`);
    const calf = bone(`calf_${suffix}`);
    const foot = bone(`foot_${suffix}`);
    const ball = bone(`ball_${suffix}`);
    if (!upperArm || !lowerArm || !hand || !thigh || !calf || !foot || !ball)
      return null;
    // This source rig names its +X limbs "left". Match physical sides, so the
    // character's arms and legs never cross to satisfy scooter-side naming.
    const footLocal = object.worldToLocal(
      foot.getWorldPosition(new THREE.Vector3()),
    );
    const side: "left" | "right" = footLocal.x < 0 ? "left" : "right";
    const footRotation = inverseRotation
      .clone()
      .multiply(foot.getWorldQuaternion(new THREE.Quaternion()));
    const ballOffset = object
      .worldToLocal(ball.getWorldPosition(new THREE.Vector3()))
      .sub(footLocal);
    const handRotation = inverseRotation
      .clone()
      .multiply(hand.getWorldQuaternion(new THREE.Quaternion()));
    const fingerDirection = new THREE.Vector3(0, 1, 0).applyQuaternion(
      handRotation,
    );
    handRotation.premultiply(
      new THREE.Quaternion().setFromUnitVectors(
        fingerDirection.normalize(),
        new THREE.Vector3(0, 0, 1),
      ),
    );
    return {
      upperArm,
      lowerArm,
      hand,
      thigh,
      calf,
      foot,
      side,
      footRotation,
      handRotation,
      ballOffset,
    };
  });
  const available = Boolean(pelvis && spine1 && spine2 && limbs.every(Boolean));

  // All IK scratch storage belongs to this rider, not to individual frames.
  const start = new THREE.Vector3(),
    middle = new THREE.Vector3(),
    end = new THREE.Vector3();
  const direction = new THREE.Vector3(),
    poleDirection = new THREE.Vector3();
  const bend = new THREE.Vector3(),
    reachable = new THREE.Vector3();
  const from = new THREE.Vector3(),
    to = new THREE.Vector3();
  const target = new THREE.Vector3(),
    pole = new THREE.Vector3();
  const delta = new THREE.Quaternion(),
    worldRotation = new THREE.Quaternion();
  const parentRotation = new THREE.Quaternion();
  const steeringRotation = new THREE.Quaternion();
  const steeringAxis = new THREE.Vector3(...SCOOTER_METRICS.steeringTop)
    .sub(new THREE.Vector3(...SCOOTER_METRICS.steeringPivot))
    .normalize();
  const wristOffset = new THREE.Vector3();

  const setWorldRotation = (
    joint: THREE.Object3D,
    rotation: THREE.Quaternion,
  ) => {
    if (joint.parent) {
      joint.parent.getWorldQuaternion(parentRotation).invert();
      joint.quaternion.copy(parentRotation).multiply(rotation).normalize();
    } else joint.quaternion.copy(rotation).normalize();
    joint.updateWorldMatrix(false, true);
  };
  const aim = (
    joint: THREE.Object3D,
    child: THREE.Object3D,
    point: THREE.Vector3,
  ) => {
    joint.getWorldPosition(start);
    child.getWorldPosition(end);
    from.copy(end).sub(start).normalize();
    to.copy(point).sub(start).normalize();
    delta.setFromUnitVectors(from, to);
    joint.getWorldQuaternion(worldRotation).premultiply(delta);
    setWorldRotation(joint, worldRotation);
  };
  const solve = (
    upper: THREE.Object3D,
    lower: THREE.Object3D,
    endpoint: THREE.Object3D,
  ) => {
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
  };
  let active = false;
  // IK depends on local rig proportions, speed and steering, not world travel.
  // Restore the solved local pose after the mixer when those inputs are unchanged.
  const posed = standing.map((pose) => ({
    ...pose,
    position: pose.position.clone(),
    quaternion: pose.quaternion.clone(),
    scale: pose.scale.clone(),
  }));
  let solvedSteer = NaN,
    solvedEffort = NaN;
  return {
    available,
    update({ speed, steer }: ScooterRiderFrame) {
      if (!available || !pelvis || !spine1 || !spine2) return;
      active = true;
      const steeringAngle = Number.isFinite(steer)
        ? THREE.MathUtils.clamp(
            steer,
            -SCOOTER_METRICS.maxSteeringAngle,
            SCOOTER_METRICS.maxSteeringAngle,
          )
        : 0;
      const effort = Number.isFinite(speed)
        ? THREE.MathUtils.clamp(Math.abs(speed) / 12, 0, 1)
        : 0;
      if (steeringAngle === solvedSteer && effort === solvedEffort) {
        restore(posed);
        return;
      }
      restore(standing);
      target.set(
        steeringAngle * -0.025 * effort,
        SCOOTER_RIDER_PELVIS_HEIGHT - effort * 0.025,
        -0.07,
      );
      object.localToWorld(target);
      pelvis.parent!.worldToLocal(target);
      pelvis.position.copy(target);
      spine1.rotateX(0.29 + effort * 0.045);
      spine2.rotateX(0.1);
      spine1.rotateZ(steeringAngle * effort * 0.12);
      object.updateWorldMatrix(true, true);
      object.getWorldQuaternion(objectRotation);
      steeringRotation.setFromAxisAngle(steeringAxis, steeringAngle);
      wristOffset.set(0, 0, 0.045).applyQuaternion(steeringRotation);
      for (const limb of limbs) {
        if (!limb) continue;
        const sign = limb.side === "left" ? -1 : 1;
        target.fromArray(scooterGripPosition(limb.side, steeringAngle));
        // Grip contact lies a few centimetres forward of the wrist joint.
        target.sub(wristOffset);
        object.localToWorld(target);
        pole.set(sign * 0.42, 1.16, 0.06);
        object.localToWorld(pole);
        solve(limb.upperArm, limb.lowerArm, limb.hand);
        worldRotation
          .copy(objectRotation)
          .multiply(steeringRotation)
          .multiply(limb.handRotation);
        setWorldRotation(limb.hand, worldRotation);

        target.fromArray(SCOOTER_METRICS.feet[limb.side]);
        // Forefoot contact fixes each shoe to its own staggered deck position.
        target.sub(limb.ballOffset);
        object.localToWorld(target);
        pole.set(sign * 0.12, 0.63, 0.36);
        object.localToWorld(pole);
        solve(limb.thigh, limb.calf, limb.foot);
        worldRotation.copy(objectRotation).multiply(limb.footRotation);
        setWorldRotation(limb.foot, worldRotation);
      }
      object.updateWorldMatrix(true, true);
      for (const pose of posed) {
        pose.position.copy(pose.bone.position);
        pose.quaternion.copy(pose.bone.quaternion);
        pose.scale.copy(pose.bone.scale);
      }
      solvedSteer = steeringAngle;
      solvedEffort = effort;
    },
    reset() {
      if (!active) return;
      restore(saved);
      active = false;
    },
    dispose() {
      if (active) restore(saved);
      active = false;
    },
  };
}
