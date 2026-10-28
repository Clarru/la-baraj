import * as THREE from "three";
import type { ActivityKind, ActivityPose } from "./activity-state";

export const fireLightingDuration = 3;
export const fireIgnitionTime = 1.3;

/** Authored clip durations are retimed to the local activity controller. */
export function activityAnimation(kind: ActivityKind) {
  switch (kind) {
    case "fire-approach":
      return { name: "Walk", duration: 1.333333, loop: true };
    case "light-fire":
      return {
        name: "Activity_LightFire",
        duration: fireLightingDuration,
        loop: false,
      };
    case "sit-down":
      return { name: "Activity_SitDown", duration: 0.7, loop: false };
    case "sit":
      return { name: "Activity_Sit", duration: 1.666667, loop: true };
    case "scoot-left":
      return { name: "Activity_ScootLeft", duration: 0.6, loop: false };
    case "scoot-right":
      return { name: "Activity_ScootRight", duration: 0.6, loop: false };
    case "stand-up":
      return { name: "Activity_StandUp", duration: 0.65, loop: false };
    case "cast":
      return { name: "Activity_Cast", duration: 0.85, loop: false };
    case "fish-wait":
    case "bite":
    case "reel":
      return { name: "Activity_HoldRod", duration: 1, loop: true };
    case "catch":
      return { name: "Activity_Catch", duration: 1.4, loop: false };
    default:
      return null;
  }
}
export function activityElapsed(pose: Readonly<ActivityPose>, now: number) {
  return Math.max(0, (now - pose.startedAt) / 1000);
}
const smooth = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};
/** The library's sitting contact is 0.45m above its floor origin. */
export function activitySeatLift(
  pose: Readonly<ActivityPose>,
  elapsed: number,
) {
  if (!pose.anchor || pose.seatHeight === undefined) return 0;
  const lift = THREE.MathUtils.clamp(
    pose.seatHeight - pose.anchor[1] - 0.45,
    -0.15,
    0.25,
  );
  if (pose.kind === "sit-down") return lift * smooth(elapsed / 0.7);
  if (pose.kind === "stand-up") return lift * (1 - smooth(elapsed / 0.65));
  if (pose.kind === "scoot-left" || pose.kind === "scoot-right") {
    const duration = pose.shiftDuration ?? 0.6;
    const progress =
      Number.isFinite(duration) && duration > 0
        ? THREE.MathUtils.clamp(elapsed / duration, 0, 1)
        : 1;
    return lift + 0.025 * Math.sin(Math.PI * progress) ** 2;
  }
  return pose.kind === "sit" ? lift : 0;
}
export function isFishing(kind: ActivityKind) {
  return ["cast", "fish-wait", "bite", "reel", "catch"].includes(kind);
}
/** Compensate the controller's parent rotation once, keeping the requested world yaw. */
export function localFacing(
  worldYaw: number,
  parent: THREE.Quaternion,
  target: THREE.Quaternion,
) {
  target.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, worldYaw);
  return target.premultiply(parent.clone().invert());
}

/** Bounded additive quaternion clips let the mixer restore the authored base pose.
 * Mutating constant-track bones after mixer.update would accumulate over time. */
export function createFishingGestureClips() {
  const axisX = new THREE.Vector3(1, 0, 0),
    axisZ = new THREE.Vector3(0, 0, 1);
  return [false, true].map((reeling) => {
    const duration = reeling ? Math.PI / 8 : (Math.PI * 2) / 9;
    const times = Array.from(
      { length: 25 },
      (_, index) => (duration * index) / 24,
    );
    const track = (
      bone: string,
      axis: THREE.Vector3,
      offset: number,
      amplitude: number,
    ) => {
      const values = times.flatMap((time) =>
        new THREE.Quaternion()
          .setFromAxisAngle(
            axis,
            offset + amplitude * Math.sin((time / duration) * Math.PI * 2),
          )
          .toArray(),
      );
      return new THREE.QuaternionKeyframeTrack(
        `${bone}.quaternion`,
        times,
        values,
      );
    };
    const amount = reeling ? 0.16 : 0.055;
    return new THREE.AnimationClip(
      reeling ? "Activity_ReelGesture" : "Activity_BiteGesture",
      duration,
      [
        track("lowerarm_l", axisX, 0, amount),
        track("upperarm_r", axisX, -0.1, amount * 0.35),
        track("spine_03", axisZ, 0, amount * 0.16),
      ],
      THREE.AdditiveAnimationBlendMode,
    );
  });
}

/** Hand props share the retained rig; no rest transforms or finger bones are changed. */
export function createCharacterActivityRig(object: THREE.Object3D) {
  const right = object.getObjectByName("hand_r");
  const left = object.getObjectByName("hand_l");
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const material = (color: string, metalness = 0) => {
    const m = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.55,
      metalness,
    });
    materials.push(m);
    return m;
  };
  const mesh = (
    geometry: THREE.BufferGeometry,
    m: THREE.Material,
    parent: THREE.Object3D,
  ) => {
    geometries.push(geometry);
    const item = new THREE.Mesh(geometry, m);
    item.castShadow = true;
    parent.add(item);
    return item;
  };
  const rod = new THREE.Group();
  rod.name = "Activity fishing rod";
  rod.position.set(0, 0.075, 0.015);
  rod.rotation.x = 0.25;
  const graphite = material("#303c3a", 0.3),
    cork = material("#a77a43"),
    reelMaterial = material("#859b9d", 0.75);
  const shaft = mesh(
    new THREE.CylinderGeometry(0.006, 0.014, 2, 6),
    graphite,
    rod,
  );
  shaft.position.y = 0.85;
  mesh(new THREE.CylinderGeometry(0.024, 0.022, 0.25, 8), cork, rod);
  const reel = mesh(
    new THREE.CylinderGeometry(0.047, 0.047, 0.055, 10),
    reelMaterial,
    rod,
  );
  reel.rotation.z = Math.PI / 2;
  reel.position.set(0.045, 0.02, 0);
  right?.add(rod);
  const fish = new THREE.Group();
  fish.name = "Activity caught perch";
  fish.position.set(0, 0.095, 0.015);
  const silver = material("#8ea99c", 0.3),
    finMaterial = material("#ae763f");
  const body = mesh(new THREE.SphereGeometry(1, 12, 8), silver, fish);
  body.position.y = -0.19;
  body.scale.set(0.075, 0.19, 0.045);
  const tail = mesh(new THREE.ConeGeometry(0.085, 0.12, 3), finMaterial, fish);
  tail.position.y = -0.4;
  tail.scale.z = 0.35;
  const eye = mesh(
    new THREE.SphereGeometry(0.009, 6, 4),
    material("#182a27"),
    fish,
  );
  eye.position.set(-0.038, -0.07, 0.036);
  left?.add(fish);
  const lighter = new THREE.Group();
  lighter.name = "Activity fire lighter";
  lighter.position.set(0, 0.08, 0.015);
  const lighterBody = mesh(
    new THREE.BoxGeometry(0.033, 0.06, 0.022),
    material("#a14727", 0.25),
    lighter,
  );
  lighterBody.position.y = 0.025;
  const lighterCap = mesh(
    new THREE.BoxGeometry(0.033, 0.014, 0.024),
    material("#bbc3b9", 0.7),
    lighter,
  );
  lighterCap.position.y = 0.062;
  const sparkMaterial = new THREE.MeshBasicMaterial({
    color: "#ffe7a0",
    toneMapped: false,
  });
  materials.push(sparkMaterial);
  const lighterFlame = mesh(
    new THREE.SphereGeometry(1, 6, 5),
    sparkMaterial,
    lighter,
  );
  lighterFlame.name = "Activity lighter flame";
  lighterFlame.position.y = 0.088;
  lighterFlame.scale.set(0.009, 0.025, 0.009);
  right?.add(lighter);
  lighter.visible = lighterFlame.visible = false;
  rod.visible = fish.visible = false;
  const delta = new THREE.Quaternion(),
    world = new THREE.Quaternion();
  const axisZ = new THREE.Vector3(0, 0, 1);
  const lineGeometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(),
  ]);
  geometries.push(lineGeometry);
  const lineMaterial = new THREE.LineBasicMaterial({
    color: "#b8c5bc",
    transparent: true,
    opacity: 0.65,
  });
  materials.push(lineMaterial);
  const line = new THREE.Line(lineGeometry, lineMaterial);
  line.name = "Activity fishing line";
  line.frustumCulled = false;
  line.visible = false;
  object.add(line);
  const tip = new THREE.Vector3(),
    destination = new THREE.Vector3();
  return {
    update(pose: Readonly<ActivityPose>, elapsed: number) {
      lighter.visible =
        pose.kind === "light-fire" && elapsed > 0.25 && elapsed < 2.45;
      lighterFlame.visible =
        lighter.visible && elapsed >= 1.05 && elapsed < 1.7;
      if (lighterFlame.visible) {
        lighter.getWorldQuaternion(world);
        lighterFlame.quaternion.copy(world.invert());
      }
      rod.visible = isFishing(pose.kind);
      fish.visible = pose.kind === "catch" && elapsed > 0.25;
      line.visible =
        rod.visible &&
        pose.lineTarget !== undefined &&
        (pose.kind !== "cast" || elapsed > 0.32);
      if (line.visible && pose.lineTarget) {
        object.updateWorldMatrix(true, true);
        tip.set(0, 1.85, 0);
        rod.localToWorld(tip);
        object.worldToLocal(tip);
        destination.fromArray(pose.lineTarget);
        object.worldToLocal(destination);
        const positions = lineGeometry.getAttribute(
          "position",
        ) as THREE.BufferAttribute;
        positions.setXYZ(0, tip.x, tip.y, tip.z);
        positions.setXYZ(1, destination.x, destination.y, destination.z);
        positions.needsUpdate = true;
      }
      if (fish.visible && left) {
        left.getWorldQuaternion(world);
        fish.quaternion
          .copy(world.invert())
          .multiply(
            delta.setFromAxisAngle(axisZ, 0.14 * Math.sin(elapsed * 12)),
          );
      }
    },
    dispose() {
      lighter.removeFromParent();
      rod.removeFromParent();
      fish.removeFromParent();
      line.removeFromParent();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}
