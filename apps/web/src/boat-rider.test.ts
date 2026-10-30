import { describe, expect, it } from "vitest";
import fs from "node:fs";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  BOAT_DRIVER_OFFSET,
  setBoatWheelAngle,
  type BoatRig,
  type BoatSide,
} from "./boat-geometry";
import { cloneBoatRig } from "./boat-resources";
import {
  BOAT_RIDER_REACH_MARGIN,
  BOAT_RIDER_WRIST_OFFSET,
  createBoatRiderRig,
  type BoatRiderFrame,
} from "./boat-rider";
import { loadRunabout } from "./runabout-test-model";

const { loadRig } = (await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
)) as { loadRig(path: string): Promise<GLTF> };
const load = () =>
  loadRig(
    new URL("../public/assets/optimized/Lakeside_Man.glb", import.meta.url)
      .pathname,
  );
const sit = (
  JSON.parse(
    fs.readFileSync(
      new URL(
        "../public/assets/animations/character-actions.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ).clips as Parameters<typeof THREE.AnimationClip.parse>[0][]
)
  .map((clip) => THREE.AnimationClip.parse(clip))
  .find((clip) => clip.name === "Activity_Sit")!;
const armBones = [
  "upperarm_l",
  "upperarm_r",
  "lowerarm_l",
  "lowerarm_r",
  "hand_l",
  "hand_r",
];

const runabout = await loadRunabout("Lake_Runabout");

/**
 * Seated character at the runabout's driver seat; the boat sits inside a
 * moved, tilted parent unless `atOrigin`.
 */
async function seated({ atOrigin = false } = {}) {
  const { scene } = await load();
  const boat = cloneBoatRig(runabout);
  const parent = new THREE.Group();
  if (!atOrigin) {
    parent.position.set(12, 0.4, -30);
    parent.rotation.set(0.05, 1.1, -0.08);
  }
  parent.add(boat.group);
  boat.group.add(scene);
  parent.updateMatrixWorld(true);
  boat.group.worldToLocal(boat.driverSeat.getWorldPosition(scene.position));
  scene.position.add(new THREE.Vector3(...BOAT_DRIVER_OFFSET));
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(sit).play();
  mixer.update(1 / 60);
  parent.updateMatrixWorld(true);
  return { scene, mixer, boat };
}
/** Turns the wheel and reads the rider frame the way BoatHandle does. */
function wheelFrame(boat: BoatRig, angle: number) {
  setBoatWheelAngle(boat, angle);
  boat.group.updateMatrixWorld(true);
  const world = (node: THREE.Object3D) =>
    node.getWorldPosition(new THREE.Vector3());
  return {
    left: world(boat.grips.left),
    right: world(boat.grips.right),
    wheelNormal: new THREE.Vector3(0, 0, -1).transformDirection(
      boat.wheel.matrixWorld,
    ),
    hub: world(boat.wheel),
  };
}
const RIM_RADIUS = 0.2;
const bonePosition = (scene: THREE.Object3D, name: string) =>
  scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
/** Whether this hand's wrist target behind its grip is within the arm's reach. */
function gripReachable(
  scene: THREE.Object3D,
  suffix: "l" | "r",
  grip: THREE.Vector3,
  frame: BoatRiderFrame,
) {
  const shoulder = bonePosition(scene, `upperarm_${suffix}`),
    elbow = bonePosition(scene, `lowerarm_${suffix}`),
    wrist = bonePosition(scene, `hand_${suffix}`);
  const reach =
    shoulder.distanceTo(elbow) +
    elbow.distanceTo(wrist) -
    BOAT_RIDER_REACH_MARGIN;
  return (
    grip
      .clone()
      .addScaledVector(frame.wheelNormal, BOAT_RIDER_WRIST_OFFSET)
      .distanceTo(shoulder) <= reach
  );
}
/**
 * The hand holds its own grip when that grip is in reach; otherwise it holds
 * the rim: 0.2 ± 0.05 m from the hub in the wheel plane, at most 0.05 m off it.
 */
function expectOnWheel(
  scene: THREE.Object3D,
  suffix: "l" | "r",
  grip: THREE.Vector3,
  frame: BoatRiderFrame,
  label: string,
) {
  const hand = bonePosition(scene, `hand_${suffix}`);
  if (gripReachable(scene, suffix, grip, frame)) {
    expect(hand.distanceTo(grip), label).toBeLessThan(0.05);
    return "grip";
  }
  const offset = hand.sub(frame.hub);
  const outOfPlane = offset.dot(frame.wheelNormal);
  offset.addScaledVector(frame.wheelNormal, -outOfPlane);
  expect(Math.abs(offset.length() - RIM_RADIUS), label).toBeLessThan(0.05);
  expect(Math.abs(outOfPlane), label).toBeLessThan(0.05);
  return "rim";
}
/** Physical side of a bone: a +Z-facing character's left hand is at object +X. */
const physicalSide = (scene: THREE.Object3D, suffix: "l" | "r"): BoatSide =>
  scene.worldToLocal(
    scene
      .getObjectByName(`hand_${suffix}`)!
      .getWorldPosition(new THREE.Vector3()),
  ).x > 0
    ? "left"
    : "right";
describe("boat driver", () => {
  it("hands stay on the runabout grips from the driver seat", async () => {
    const { scene, mixer, boat } = await seated({ atOrigin: true });
    const sides = {
      l: physicalSide(scene, "l"),
      r: physicalSide(scene, "r"),
    };
    expect(sides).toEqual({ l: "left", r: "right" });
    const rig = createBoatRiderRig(scene);
    const held: string[] = [];
    for (const angle of [0, 1.2, -2.4]) {
      mixer.update(1 / 60);
      const frame = wheelFrame(boat, angle);
      rig.update(frame);
      for (const suffix of ["l", "r"] as const) {
        const label = JSON.stringify({ angle, suffix });
        // Straight ahead, both hands hold their own grips, whatever the reach model says.
        if (angle === 0)
          expect(
            bonePosition(scene, `hand_${suffix}`).distanceTo(
              frame[sides[suffix]],
            ),
            label,
          ).toBeLessThan(0.05);
        held.push(
          expectOnWheel(scene, suffix, frame[sides[suffix]], frame, label),
        );
      }
    }
    expect(held.slice(0, 2)).toEqual(["grip", "grip"]);
    rig.dispose();
  });

  it("seats the driver's hips over DriverSeat, on the cushion", async () => {
    const { scene, boat } = await seated({ atOrigin: true });
    const seat = boat.driverSeat.getWorldPosition(new THREE.Vector3());
    const pelvis = bonePosition(scene, "pelvis");
    expect(Math.hypot(pelvis.x - seat.x, pelvis.z - seat.z)).toBeLessThan(0.05);
    // Cushion top under the hips, read from the GLB's own meshes (not the rider's).
    const isRider = (node: THREE.Object3D | null): boolean =>
      node !== null && (node === scene || isRider(node.parent));
    const cushion = new THREE.Raycaster(
      new THREE.Vector3(seat.x, 2, seat.z),
      new THREE.Vector3(0, -1, 0),
    )
      .intersectObject(boat.group, true)
      .find((hit) => !isRider(hit.object))!.point.y;
    expect(cushion - seat.y).toBeGreaterThan(0.3);
    // Activity_Sit seats the hips on a chair 0.45 m above the character root
    // (activitySeatLift); the pelvis must clear the cushion by the same height.
    const clipClearance = scene.worldToLocal(pelvis.clone()).y - 0.45;
    expect(Math.abs(pelvis.y - cushion - clipClearance)).toBeLessThan(0.05);
  });

  it("keeps both hands on the wheel grips as it turns", async () => {
    const { scene, mixer, boat } = await seated();
    const sides = {
      l: physicalSide(scene, "l"),
      r: physicalSide(scene, "r"),
    };
    expect(new Set(Object.values(sides)).size).toBe(2);
    const rig = createBoatRiderRig(scene);
    for (const angle of [0, 1.2, -2.4, 2.4]) {
      mixer.update(1 / 60);
      const frame = wheelFrame(boat, angle);
      rig.update(frame);
      for (const suffix of ["l", "r"] as const) {
        const hand = scene.getObjectByName(`hand_${suffix}`)!;
        expectOnWheel(
          scene,
          suffix,
          frame[sides[suffix]],
          frame,
          JSON.stringify({ angle, suffix }),
        );
        // Fingers reach forward through the wheel plane, away from the driver.
        const fingers = new THREE.Vector3(0, 1, 0).transformDirection(
          hand.matrixWorld,
        );
        expect(fingers.dot(frame.wheelNormal)).toBeLessThan(-0.9);
      }
    }
    rig.dispose();
  });

  it("stays finite over 6000 frames of changing wheel angles", async () => {
    const { scene, mixer, boat } = await seated();
    const rig = createBoatRiderRig(scene);
    const bones: THREE.Bone[] = [];
    scene.traverse((bone) => {
      if (bone instanceof THREE.Bone) bones.push(bone);
    });
    let seed = 7,
      angle = 0,
      worst = 0;
    for (let frame = 0; frame < 6000; frame++) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      angle = THREE.MathUtils.clamp(
        angle + (seed / 2 ** 32 - 0.5) * 0.3,
        -2.4,
        2.4,
      );
      mixer.update(1 / 60);
      rig.update(wheelFrame(boat, angle));
      for (const bone of bones) {
        const q = bone.quaternion;
        const error = Math.abs(q.length() - 1);
        worst = Number.isFinite(error) ? Math.max(worst, error) : Infinity;
      }
    }
    expect(worst).toBeLessThan(1e-6);
    rig.update({
      ...wheelFrame(boat, angle),
      left: new THREE.Vector3(NaN, 0, 0),
    });
    rig.update({
      ...wheelFrame(boat, angle),
      wheelNormal: new THREE.Vector3(0, NaN, 0),
    });
    rig.update({
      ...wheelFrame(boat, angle),
      hub: new THREE.Vector3(NaN, 0, 0),
    });
    expect(bones.every((bone) => Number.isFinite(bone.quaternion.w))).toBe(
      true,
    );
    rig.dispose();
  });

  it("restores every arm bone on reset", async () => {
    const { scene, mixer, boat } = await seated();
    const arms = armBones.map((name) => scene.getObjectByName(name)!);
    const snapshot = () =>
      arms.flatMap((bone) => [
        ...bone.position.toArray(),
        ...bone.quaternion.toArray(),
        ...bone.scale.toArray(),
      ]);
    const rig = createBoatRiderRig(scene);
    const before = snapshot();
    for (const angle of [0.4, -1.5, 2.2]) {
      mixer.update(1 / 60);
      rig.update(wheelFrame(boat, angle));
    }
    expect(snapshot()).not.toEqual(before);
    rig.reset();
    const restored = snapshot();
    restored.forEach((value, index) =>
      expect(value).toBeCloseTo(before[index], 6),
    );
    arms[0].rotateX(0.2);
    const moved = snapshot();
    rig.reset();
    expect(snapshot()).toEqual(moved);
  });

  it("fails closed on an unrelated model", () => {
    const scene = new THREE.Group();
    scene.position.set(1, 2, 3);
    const rig = createBoatRiderRig(scene);
    rig.update({
      left: new THREE.Vector3(-0.32, 0.7, 0.8),
      right: new THREE.Vector3(-0.72, 0.7, 0.8),
      wheelNormal: new THREE.Vector3(0, 0.52, -0.85),
      hub: new THREE.Vector3(-0.52, 0.7, 0.8),
    });
    rig.reset();
    rig.dispose();
    expect(scene.children).toHaveLength(0);
    expect(scene.position.toArray()).toEqual([1, 2, 3]);
    expect(scene.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  });
});
