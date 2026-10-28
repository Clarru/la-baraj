import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { SCOOTER_METRICS, scooterGripPosition } from "./scooter-geometry";
import { createScooterRiderRig } from "./scooter-rider";

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
const position = (scene: THREE.Object3D, name: string) =>
  scene.worldToLocal(
    scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3()),
  );

describe("QuickVolt9 scooter rider", () => {
  it("preserves solved grip and foot contacts after mixer writes, world travel, turning and remounting", async () => {
    const { scene, animations } = await load();
    const parent = new THREE.Group();
    parent.add(scene);
    const rig = createScooterRiderRig(
      scene,
      animations.find((c) => c.name === "Idle_Neutral"),
    );
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(animations.find((c) => c.name === "Walk")!).play();
    for (let frame = 0; frame < 120; frame++) {
      parent.position.set(frame * 0.1, 3, 10);
      parent.rotation.y = frame * 0.03;
      mixer.update(1 / 60);
      if (frame === 60) rig.reset();
      rig.update({ speed: 4, steer: 0 });
      for (const [suffix, side] of [
        ["l", "right"],
        ["r", "left"],
      ] as const) {
        const wrist = new THREE.Vector3(...scooterGripPosition(side, 0)).sub(
          new THREE.Vector3(0, 0, 0.045),
        );
        expect(
          position(scene, `hand_${suffix}`).distanceTo(wrist),
        ).toBeLessThan(0.001);
        expect(
          position(scene, `ball_${suffix}`).distanceTo(
            new THREE.Vector3(...SCOOTER_METRICS.feet[side]),
          ),
        ).toBeLessThan(0.001);
      }
    }
    rig.dispose();
    mixer.stopAllAction();
  });
  it("stands with soft knees and staggered feet while following the steered bars", async () => {
    const { scene, animations } = await load();
    const parent = new THREE.Group();
    parent.position.set(16, 8, -32);
    parent.rotation.y = 1.2;
    parent.add(scene);
    const rig = createScooterRiderRig(
      scene,
      animations.find((clip) => clip.name === "Idle_Neutral"),
    );
    const axis = new THREE.Vector3(...SCOOTER_METRICS.steeringTop)
      .sub(new THREE.Vector3(...SCOOTER_METRICS.steeringPivot))
      .normalize();
    expect(rig.available).toBe(true);
    for (const speed of [0, 4, 12])
      for (const steer of [-0.35, 0, 0.35]) {
        rig.update({ speed, steer });
        const wristOffset = new THREE.Vector3(0, 0, 0.045).applyAxisAngle(
          axis,
          steer,
        );
        const pelvis = position(scene, "pelvis");
        expect(pelvis.y).toBeGreaterThan(0.95);
        expect(pelvis.y).toBeLessThan(1.02);
        expect(position(scene, "neck_01").z - pelvis.z).toBeGreaterThan(0.15);
        for (const [suffix, side] of [
          ["l", "right"],
          ["r", "left"],
        ] as const) {
          const wrist = new THREE.Vector3(
            ...scooterGripPosition(side, steer),
          ).sub(wristOffset);
          expect(
            position(scene, `hand_${suffix}`).distanceTo(wrist),
            JSON.stringify({
              speed,
              steer,
              suffix,
              hand: position(scene, `hand_${suffix}`).toArray(),
              wrist: wrist.toArray(),
            }),
          ).toBeLessThan(0.001);
          const contact = new THREE.Vector3(...SCOOTER_METRICS.feet[side]);
          expect(
            position(scene, `ball_${suffix}`).distanceTo(contact),
          ).toBeLessThan(0.001);
          expect(position(scene, `calf_${suffix}`).z).toBeGreaterThan(pelvis.z);
        }
      }
  });

  it("holds idle and stays finite and bounded for 6000 frames without mixer resets", async () => {
    const { scene, animations } = await load();
    const rig = createScooterRiderRig(
      scene,
      animations.find((clip) => clip.name === "Idle_Neutral"),
    );
    const quaternions = () => {
      const values: number[] = [];
      scene.traverse((bone) => {
        if (bone instanceof THREE.Bone)
          values.push(...bone.quaternion.toArray());
      });
      return values;
    };
    rig.update({ speed: 0, steer: 0 });
    const idle = quaternions();
    for (let frame = 0; frame < 120; frame++)
      rig.update({ speed: 0, steer: 0 });
    expect(quaternions()).toEqual(idle);
    for (let frame = 0; frame < 6000; frame++) {
      rig.update({
        speed: 7 + Math.sin(frame * 0.04) * 5,
        steer: Math.sin(frame * 0.03) * 0.35,
      });
      const foot = scene.getObjectByName("foot_l")!;
      expect(foot.quaternion.length()).toBeCloseTo(1, 5);
      expect(foot.matrixWorld.elements.every(Number.isFinite)).toBe(true);
    }
    rig.update({ speed: 0, steer: 0 });
    expect(quaternions()).toEqual(idle);
    rig.update({ speed: Infinity, steer: NaN });
    expect(quaternions().every(Number.isFinite)).toBe(true);
  });

  it("preserves finger shapes and restores every original bone transform on dismount", async () => {
    const { scene, animations } = await load();
    const idle = animations.find((clip) => clip.name === "Idle_Neutral")!;
    const bones: THREE.Bone[] = [];
    scene.traverse((bone) => {
      if (bone instanceof THREE.Bone) bones.push(bone);
    });
    const snapshot = () =>
      bones.map((bone) => [
        ...bone.position.toArray(),
        ...bone.quaternion.toArray(),
        ...bone.scale.toArray(),
      ]);
    const original = snapshot();
    const rig = createScooterRiderRig(scene, idle);
    rig.update({ speed: 10, steer: 0.3 });
    expect(snapshot()).not.toEqual(original);
    for (const name of ["index_01_l", "middle_01_r", "thumb_01_l"]) {
      const finger = scene.getObjectByName(name)!;
      const track = idle.tracks.find(
        (track) => track.name === `${name}.quaternion`,
      )!;
      expect(
        finger.quaternion.angleTo(
          new THREE.Quaternion().fromArray(track.values).normalize(),
        ),
      ).toBeLessThan(0.00001);
    }
    rig.reset();
    expect(snapshot()).toEqual(original);
    rig.update({ speed: 2, steer: -0.2 });
    rig.dispose();
    expect(snapshot()).toEqual(original);
    bones[0].quaternion.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, 0.1);
    const walking = snapshot();
    rig.reset();
    expect(snapshot()).toEqual(walking);
  });

  it("fails closed on an unrelated model without touching its transforms", () => {
    const scene = new THREE.Group();
    const rig = createScooterRiderRig(scene);
    expect(rig.available).toBe(false);
    rig.update({ speed: 4, steer: 0.2 });
    rig.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
