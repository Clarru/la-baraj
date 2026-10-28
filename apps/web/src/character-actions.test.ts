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
  fireLightingDuration,
  fireIgnitionTime,
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

  it("returns both scoot clips to the exact seated pose and preserves fingers", () => {
    const sitting = clips.find((clip) => clip.name === "Activity_Sit")!;
    for (const [kind, name] of [
      ["scoot-left", "Activity_ScootLeft"],
      ["scoot-right", "Activity_ScootRight"],
    ] as const) {
      const clip = clips.find((clip) => clip.name === name)!;
      expect(activityAnimation(kind)).toEqual({
        name,
        duration: 0.6,
        loop: false,
      });
      expect(clip.duration).toBeCloseTo(0.6);
      expect(clip.tracks.length).toBe(sitting.tracks.length);
      for (const track of clip.tracks) {
        const source = sitting.tracks.find(
          (source) => source.name === track.name,
        )!;
        const size = track.getValueSize();
        const start = Array.from(source.values.slice(0, size));
        expect(Array.from(track.values.slice(0, size))).toEqual(start);
        expect(Array.from(track.values.slice(-size))).toEqual(start);
        if (/thumb|index|middle|ring|pinky/.test(track.name)) {
          for (let index = 0; index < track.values.length; index++)
            expect(track.values[index]).toBe(start[index % size]);
        }
      }
    }
  });

  it("scoots with bounded hip/trunk motion and alternating lifted feet", async () => {
    const { scene } = await loadRig(
      new URL("../public/assets/optimized/Lakeside_Man.glb", import.meta.url)
        .pathname,
    );
    const mixer = new THREE.AnimationMixer(scene);
    const sample = (clip: THREE.AnimationClip, time: number) => {
      mixer.stopAllAction();
      const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      mixer.setTime(time);
      scene.updateMatrixWorld(true);
      return Object.fromEntries(
        ["pelvis", "spine_03", "foot_l", "foot_r", "hand_l", "hand_r"].map(
          (name) => {
            const bone = scene.getObjectByName(name)!;
            return [
              name,
              {
                position: bone.getWorldPosition(new THREE.Vector3()),
                quaternion: bone.getWorldQuaternion(new THREE.Quaternion()),
              },
            ];
          },
        ),
      );
    };
    const baseline = sample(
      clips.find((clip) => clip.name === "Activity_Sit")!,
      0,
    );
    for (const [direction, name] of [
      [1, "Activity_ScootLeft"],
      [-1, "Activity_ScootRight"],
    ] as const) {
      const clip = clips.find((clip) => clip.name === name)!;
      for (let frame = 0; frame <= 36; frame++) {
        const pose = sample(clip, frame / 60);
        expect(
          pose.pelvis.position.distanceTo(baseline.pelvis.position),
        ).toBeLessThan(0.017);
        expect(
          pose.pelvis.quaternion.angleTo(baseline.pelvis.quaternion),
        ).toBeLessThan(0.05);
        expect(
          pose.spine_03.quaternion.angleTo(baseline.spine_03.quaternion),
        ).toBeLessThan(0.14);
        for (const foot of ["foot_l", "foot_r"]) {
          const height = pose[foot].position.y - baseline[foot].position.y;
          expect(height).toBeGreaterThan(-0.015);
          expect(height).toBeLessThan(0.075);
        }
      }
      const middle = sample(clip, 0.3);
      expect(
        direction * (middle.spine_03.position.x - baseline.spine_03.position.x),
      ).toBeGreaterThan(0.03);
      expect(
        Math.min(
          middle.hand_l.position.y - baseline.hand_l.position.y,
          middle.hand_r.position.y - baseline.hand_r.position.y,
        ),
      ).toBeLessThan(-0.05);
      const early = sample(clip, 0.15),
        late = sample(clip, 0.45);
      const leading = direction === 1 ? "foot_l" : "foot_r",
        trailing = direction === 1 ? "foot_r" : "foot_l";
      expect(
        early[leading].position.y - early[trailing].position.y,
      ).toBeGreaterThan(0.025);
      expect(
        late[trailing].position.y - late[leading].position.y,
      ).toBeGreaterThan(0.035);
    }
  });

  it("keeps the seated height baseline through scoots with a small hip lift", () => {
    const sitting: ActivityPose = {
      kind: "sit",
      startedAt: 0,
      anchor: [0, 8, 0],
      seatHeight: 8.55,
    };
    const baseline = activitySeatLift(sitting, 0);
    for (const kind of ["scoot-left", "scoot-right"] as const) {
      const pose: ActivityPose = { ...sitting, kind, shiftDuration: 0.6 };
      expect(activitySeatLift(pose, 0)).toBeCloseTo(baseline);
      expect(activitySeatLift(pose, 0.3)).toBeCloseTo(baseline + 0.025);
      expect(activitySeatLift(pose, 0.6)).toBeCloseTo(baseline);
      expect(activitySeatLift(pose, 1)).toBeCloseTo(baseline);
      expect(
        activitySeatLift({ ...pose, shiftDuration: 0.8 }, 0.4),
      ).toBeCloseTo(baseline + 0.025);
      for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY])
        expect(
          activitySeatLift({ ...pose, shiftDuration: invalid }, 0),
        ).toBeCloseTo(baseline);
    }
  });

  it("kneels to light the near log edge and returns exactly to standing", async () => {
    const { scene, animations } = await loadRig(
      new URL("../public/assets/optimized/Lakeside_Man.glb", import.meta.url)
        .pathname,
    );
    const mixer = new THREE.AnimationMixer(scene);
    const fire = clips.find((clip) => clip.name === "Activity_LightFire")!;
    const idle = animations.find((clip) => clip.name === "Idle_Neutral")!;
    const sample = (clip: THREE.AnimationClip, time: number) => {
      mixer.stopAllAction();
      const action = mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
      action.play();
      mixer.setTime(time);
      scene.updateMatrixWorld(true);
      const bones = new Map<
        string,
        { position: THREE.Vector3; quaternion: THREE.Quaternion }
      >();
      scene.traverse((bone) => {
        if (bone instanceof THREE.Bone)
          bones.set(bone.name, {
            position: bone.getWorldPosition(new THREE.Vector3()),
            quaternion: bone.getWorldQuaternion(new THREE.Quaternion()),
          });
      });
      return bones;
    };
    const standing = sample(idle, 0);
    for (const time of [0, fireLightingDuration]) {
      const endpoint = sample(fire, time);
      for (const [name, baseline] of standing) {
        expect(
          endpoint.get(name)!.position.distanceTo(baseline.position),
        ).toBeLessThan(0.00002);
        expect(
          endpoint
            .get(name)!
            .quaternion.clone()
            .normalize()
            .angleTo(baseline.quaternion.clone().normalize()),
        ).toBeLessThan(0.00002);
      }
    }
    expect(fire.duration).toBe(fireLightingDuration);
    expect(fireLightingDuration).toBe(3);
    expect(fireIgnitionTime).toBe(1.3);
    expect(activityAnimation("light-fire")).toEqual({
      name: "Activity_LightFire",
      duration: fireLightingDuration,
      loop: false,
    });
    expect(activityAnimation("fire-approach")?.name).toBe("Walk");
    expect(activityAnimation("fire-approach")?.duration).toBeCloseTo(
      animations.find((clip) => clip.name === "Walk")!.duration,
      5,
    );
    const contact = sample(fire, fireIgnitionTime);
    expect(contact.get("pelvis")!.position.y).toBeGreaterThan(0.35);
    expect(contact.get("pelvis")!.position.y).toBeLessThan(0.46);
    const hand = scene.getObjectByName("hand_r")!;
    const flame = hand.localToWorld(new THREE.Vector3(0, 0.168, 0.015));
    expect(flame.y).toBeGreaterThan(0.18);
    expect(flame.y).toBeLessThan(0.25);
    expect(flame.z).toBeGreaterThan(0.6);
    expect(flame.z).toBeLessThan(0.7);
    expect(Math.hypot(flame.x, 1.65 - flame.z)).toBeGreaterThan(0.95);
    expect(Math.hypot(flame.x, 1.65 - flame.z)).toBeLessThan(1.1);
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
    rig.update({ kind: "light-fire", startedAt: 0 }, fireIgnitionTime);
    expect(scene.getObjectByName("Activity fire lighter")?.visible).toBe(true);
    expect(scene.getObjectByName("Activity lighter flame")?.visible).toBe(true);
    rig.update({ kind: "light-fire", startedAt: 0 }, 2.5);
    expect(scene.getObjectByName("Activity fire lighter")?.visible).toBe(false);
    expect(scene.getObjectByName("Activity lighter flame")?.visible).toBe(
      false,
    );
    rig.update({ kind: "light-fire", startedAt: 0 }, fireIgnitionTime);
    rig.update({ kind: "none", startedAt: 0 }, 0);
    expect(scene.getObjectByName("Activity fire lighter")?.visible).toBe(false);
    rig.dispose();
    expect(scene.getObjectByName("Activity fire lighter")).toBeUndefined();
    expect(scene.getObjectByName("Activity lighter flame")).toBeUndefined();
    expect(scene.getObjectByName("Activity fishing rod")).toBeUndefined();
    expect(scene.getObjectByName("Activity caught perch")).toBeUndefined();
    expect(scene.getObjectByName("Activity fishing line")).toBeUndefined();
  });
});
