import { describe, expect, it } from "vitest";
import fs from "node:fs";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { BOAT_METRICS, boatGripPosition, type BoatSide } from "./boat-geometry";
import { createBoatRiderRig } from "./boat-rider";

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

/** Seated character whose object space doubles as boat space, inside a moved parent. */
async function seated() {
  const { scene } = await load();
  const parent = new THREE.Group();
  parent.position.set(12, 0.4, -30);
  parent.rotation.set(0.05, 1.1, -0.08);
  parent.add(scene);
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(sit).play();
  mixer.update(1 / 60);
  scene.updateMatrixWorld(true);
  return { scene, mixer };
}
const grip = (
  scene: THREE.Object3D,
  side: BoatSide,
  angle: number,
  target: THREE.Vector3,
) => scene.localToWorld(target.fromArray(boatGripPosition(side, angle)));
/** Physical side of a bone: the source rig names its +X limbs "left". */
const physicalSide = (scene: THREE.Object3D, suffix: "l" | "r"): BoatSide =>
  scene.worldToLocal(
    scene
      .getObjectByName(`hand_${suffix}`)!
      .getWorldPosition(new THREE.Vector3()),
  ).x < 0
    ? "left"
    : "right";

describe("boat driver", () => {
  it("keeps both hands on the wheel grips as it turns", async () => {
    const { scene, mixer } = await seated();
    const sides = {
      l: physicalSide(scene, "l"),
      r: physicalSide(scene, "r"),
    };
    expect(new Set(Object.values(sides)).size).toBe(2);
    const rig = createBoatRiderRig(scene);
    const left = new THREE.Vector3(),
      right = new THREE.Vector3();
    const towardDriver = new THREE.Vector3(
      0,
      Math.sin(BOAT_METRICS.wheelTilt),
      -Math.cos(BOAT_METRICS.wheelTilt),
    ).transformDirection(scene.matrixWorld);
    for (const angle of [0, 1.2, -2.4, 2.4]) {
      mixer.update(1 / 60);
      grip(scene, "left", angle, left);
      grip(scene, "right", angle, right);
      rig.update({ left, right });
      for (const suffix of ["l", "r"] as const) {
        const hand = scene.getObjectByName(`hand_${suffix}`)!;
        const target = sides[suffix] === "left" ? left : right;
        expect(
          hand.getWorldPosition(new THREE.Vector3()).distanceTo(target),
          JSON.stringify({ angle, suffix }),
        ).toBeLessThan(0.05);
        // Fingers reach forward through the wheel plane, away from the driver.
        const fingers = new THREE.Vector3(0, 1, 0).transformDirection(
          hand.matrixWorld,
        );
        expect(fingers.dot(towardDriver)).toBeLessThan(-0.9);
      }
    }
    rig.dispose();
  });

  it("stays finite over 6000 frames of changing wheel angles", async () => {
    const { scene, mixer } = await seated();
    const rig = createBoatRiderRig(scene);
    const bones: THREE.Bone[] = [];
    scene.traverse((bone) => {
      if (bone instanceof THREE.Bone) bones.push(bone);
    });
    const left = new THREE.Vector3(),
      right = new THREE.Vector3();
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
      rig.update({
        left: grip(scene, "left", angle, left),
        right: grip(scene, "right", angle, right),
      });
      for (const bone of bones) {
        const q = bone.quaternion;
        const error = Math.abs(q.length() - 1);
        worst = Number.isFinite(error) ? Math.max(worst, error) : Infinity;
      }
    }
    expect(worst).toBeLessThan(1e-6);
    rig.update({ left: new THREE.Vector3(NaN, 0, 0), right });
    expect(bones.every((bone) => Number.isFinite(bone.quaternion.w))).toBe(
      true,
    );
    rig.dispose();
  });

  it("restores every arm bone on reset", async () => {
    const { scene, mixer } = await seated();
    const arms = armBones.map((name) => scene.getObjectByName(name)!);
    const snapshot = () =>
      arms.flatMap((bone) => [
        ...bone.position.toArray(),
        ...bone.quaternion.toArray(),
        ...bone.scale.toArray(),
      ]);
    const rig = createBoatRiderRig(scene);
    const before = snapshot();
    const left = new THREE.Vector3(),
      right = new THREE.Vector3();
    for (const angle of [0.4, -1.5, 2.2]) {
      mixer.update(1 / 60);
      rig.update({
        left: grip(scene, "left", angle, left),
        right: grip(scene, "right", angle, right),
      });
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
      left: new THREE.Vector3(-0.19, 0.95, 0.05),
      right: new THREE.Vector3(0.19, 0.95, 0.05),
    });
    rig.reset();
    rig.dispose();
    expect(scene.children).toHaveLength(0);
    expect(scene.position.toArray()).toEqual([1, 2, 3]);
    expect(scene.quaternion.toArray()).toEqual([0, 0, 0, 1]);
  });
});
