import { describe, expect, it } from "vitest";
import fs from "node:fs";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
const { loadRig } = (await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
)) as { loadRig: (path: string) => Promise<GLTF> };
import {
  activityAnimation,
  activityElapsed,
  activitySeatLift,
  createCharacterActivityRig,
  createFishingGestureClips,
  localFacing,
} from "./character-actions";
import type { ActivityPose } from "./activity-state";

const clips = JSON.parse(
  fs.readFileSync(
    new URL(
      "../public/assets/animations/character-actions.json",
      import.meta.url,
    ),
    "utf8",
  ),
).clips.map((clip: Parameters<typeof THREE.AnimationClip.parse>[0]) =>
  THREE.AnimationClip.parse(clip),
) as THREE.AnimationClip[];

describe("character activities", () => {
  it("aligns every authored track to the retained rig and samples finite poses", async () => {
    const rig = await loadRig(
      new URL("../public/assets/optimized/Lakeside_Man.glb", import.meta.url)
        .pathname,
    );
    const mixer = new THREE.AnimationMixer(rig.scene);
    for (const clip of clips) {
      mixer.stopAllAction();
      for (const track of clip.tracks)
        expect(
          rig.scene.getObjectByName(track.name.split(".")[0]),
        ).toBeTruthy();
      const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      for (let step = 0; step <= 10; step++) {
        mixer.setTime((clip.duration * step) / 10);
        rig.scene.updateMatrixWorld(true);
        rig.scene.traverse((bone: THREE.Object3D) => {
          if (!(bone instanceof THREE.Bone)) return;
          expect(bone.quaternion.length()).toBeCloseTo(1, 4);
          expect(bone.matrixWorld.elements.every(Number.isFinite)).toBe(true);
        });
      }
    }
  });

  it("matches seated entry, idle, and exit contact without rebuilding the rig", async () => {
    const { scene } = await loadRig(
      new URL("../public/assets/optimized/Lakeside_Man.glb", import.meta.url)
        .pathname,
    );
    const mixer = new THREE.AnimationMixer(scene);
    const pelvis = scene.getObjectByName("pelvis")!;
    const sample = (name: string, end = false) => {
      mixer.stopAllAction();
      const clip = clips.find((c) => c.name === name)!;
      const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      mixer.setTime(end ? clip.duration - 0.001 : 0);
      scene.updateMatrixWorld(true);
      return pelvis.getWorldPosition(new THREE.Vector3());
    };
    const idle = sample("Activity_Sit");
    expect(sample("Activity_SitDown", true).distanceTo(idle)).toBeLessThan(
      0.005,
    );
    expect(sample("Activity_StandUp").distanceTo(idle)).toBeLessThan(0.005);
    expect(idle.y).toBeCloseTo(0.542, 2);
    expect(idle.z).toBeCloseTo(-0.331, 2);
  });

  it("keeps reel offsets bounded across long waits and restores the base pose", () => {
    const scene = new THREE.Group();
    for (const name of ["lowerarm_l", "upperarm_r", "spine_03"]) {
      const bone = new THREE.Bone();
      bone.name = name;
      scene.add(bone);
    }
    const base = new THREE.AnimationClip(
      "base",
      1,
      scene.children.map(
        (bone) =>
          new THREE.QuaternionKeyframeTrack(
            `${bone.name}.quaternion`,
            [0, 1],
            [0, 0, 0, 1, 0, 0, 0, 1],
          ),
      ),
    );
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(base).play();
    const reel = mixer.clipAction(createFishingGestureClips()[1]).play();
    for (let frame = 0; frame < 6000; frame++) {
      mixer.update(1 / 60);
      for (const bone of scene.children)
        expect(bone.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(
          0.17,
        );
    }
    reel.stop();
    mixer.update(1 / 60);
    for (const bone of scene.children)
      expect(bone.quaternion.angleTo(new THREE.Quaternion())).toBeLessThan(
        0.00001,
      );
  });

  it("uses world-facing once even under a rotated controller", () => {
    for (const parentYaw of [0, 0.7, -2, Math.PI]) {
      const parent = new THREE.Quaternion().setFromAxisAngle(
        THREE.Object3D.DEFAULT_UP,
        parentYaw,
      );
      const local = localFacing(Math.PI, parent, new THREE.Quaternion());
      const world = parent.clone().multiply(local);
      const direction = new THREE.Vector3(0, 0, 1).applyQuaternion(world);
      expect(direction.distanceTo(new THREE.Vector3(0, 0, -1))).toBeLessThan(
        0.000001,
      );
    }
  });

  it("blends bench-height adjustment continuously across transitions", () => {
    const pose: ActivityPose = {
      kind: "sit-down",
      startedAt: 100,
      anchor: [0, 8, 0],
      seatHeight: 8.55,
    };
    expect(activityElapsed(pose, 50)).toBe(0);
    expect(activitySeatLift(pose, 0)).toBe(0);
    const seated = activitySeatLift({ ...pose, kind: "sit" }, 0);
    expect(seated).toBeCloseTo(0.1);
    expect(activitySeatLift(pose, 0.7)).toBeCloseTo(seated);
    expect(activitySeatLift({ ...pose, kind: "stand-up" }, 0)).toBeCloseTo(
      seated,
    );
    expect(activitySeatLift({ ...pose, kind: "stand-up" }, 0.65)).toBe(0);
    expect(activitySeatLift({ ...pose, kind: "none" }, 0)).toBe(0);
    expect(activityAnimation("none")).toBeNull();
  });

  it("attaches hand props, toggles catch, and cleans every owned object", () => {
    const scene = new THREE.Group();
    for (const name of ["hand_r", "hand_l"]) {
      const bone = new THREE.Bone();
      bone.name = name;
      scene.add(bone);
    }
    const rig = createCharacterActivityRig(scene);
    rig.update({ kind: "catch", startedAt: 0, lineTarget: [0, 0, -6] }, 0.5);
    expect(scene.getObjectByName("Activity fishing rod")?.visible).toBe(true);
    expect(scene.getObjectByName("Activity caught perch")?.visible).toBe(true);
    rig.update({ kind: "none", startedAt: 0 }, 0);
    expect(scene.getObjectByName("Activity fishing rod")?.visible).toBe(false);
    expect(scene.getObjectByName("Activity caught perch")?.visible).toBe(false);
    rig.dispose();
    expect(scene.getObjectByName("Activity fishing rod")).toBeUndefined();
    expect(scene.getObjectByName("Activity caught perch")).toBeUndefined();
    expect(scene.getObjectByName("Activity fishing line")).toBeUndefined();
  });
});
