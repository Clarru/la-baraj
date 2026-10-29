import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  SOCIAL_WAVE_CLIP_NAME,
  SOCIAL_WAVE_COOLDOWN_MS,
  SOCIAL_WAVE_DURATION,
  createSocialWaveClip,
  requestSocialWave,
  socialWaveFinished,
} from "./social-wave";

const { loadRig } = (await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
)) as { loadRig: (path: string) => Promise<GLTF> };

const rigPath = new URL(
  "../public/assets/optimized/Lakeside_Man.glb",
  import.meta.url,
).pathname;

describe("social hello wave", () => {
  it("uses eligibility, cooldown and duration without hidden timers", () => {
    expect(requestSocialWave(10000, 9000, false)).toBeNull();
    expect(requestSocialWave(10000, 9500)).toBeNull();
    expect(requestSocialWave(10000, 10000 - SOCIAL_WAVE_COOLDOWN_MS)).toEqual({
      startedAt: 10000,
    });
    expect(requestSocialWave(NaN)).toBeNull();
    const state = requestSocialWave(10000)!;
    expect(socialWaveFinished(state, 10001)).toBe(false);
    expect(socialWaveFinished(state, 10000 + SOCIAL_WAVE_DURATION * 1000)).toBe(
      true,
    );
  });

  it("is a named additive clip with identity entry and exit", () => {
    const clip = createSocialWaveClip();
    expect(clip.name).toBe(SOCIAL_WAVE_CLIP_NAME);
    expect(clip.duration).toBeCloseTo(SOCIAL_WAVE_DURATION);
    expect(clip.blendMode).toBe(THREE.AdditiveAnimationBlendMode);
    const names = clip.tracks.map((track) => track.name);
    expect(names.slice(0, 4)).toEqual([
      "clavicle_r.quaternion",
      "upperarm_r.quaternion",
      "lowerarm_r.quaternion",
      "hand_r.quaternion",
    ]);
    for (const finger of ["index", "middle", "ring", "pinky"])
      for (const joint of ["01", "02", "03"])
        expect(names).toContain(`${finger}_${joint}_r.quaternion`);
    for (const joint of ["01", "02", "03"])
      expect(names).toContain(`thumb_${joint}_r.quaternion`);
    for (const track of clip.tracks) {
      const size = track.getValueSize();
      expect(Array.from(track.values.slice(0, size)).map(Math.abs)).toEqual([
        0, 0, 0, 1,
      ]);
      expect(Array.from(track.values.slice(-size)).map(Math.abs)).toEqual([
        0, 0, 0, 1,
      ]);
      expect(Array.from(track.values).every(Number.isFinite)).toBe(true);
    }
  });

  it("raises the real Lakeside_Man hand above its shoulder and keeps all bones finite", async () => {
    const { scene, animations } = await loadRig(rigPath);
    const idle = animations.find((clip) => clip.name === "Idle_Neutral")!;
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(idle).play();
    const wave = mixer
      .clipAction(createSocialWaveClip())
      .setLoop(THREE.LoopOnce, 1);
    wave.clampWhenFinished = true;
    wave.play();

    let peakHandAboveShoulder = -Infinity;
    let peakHandDistanceToHead = Infinity;
    let peakForearmX = Infinity;
    let peakForearmY = -Infinity;
    let handMinX = Infinity;
    let handMaxX = -Infinity;
    let peakFingerDistance = -Infinity;
    for (let frame = 0; frame <= 96; frame++) {
      mixer.setTime((SOCIAL_WAVE_DURATION * frame) / 96);
      scene.updateMatrixWorld(true);
      const elbow = scene
        .getObjectByName("lowerarm_r")!
        .getWorldPosition(new THREE.Vector3());
      const shoulder = scene
        .getObjectByName("clavicle_r")!
        .getWorldPosition(new THREE.Vector3());
      const hand = scene
        .getObjectByName("hand_r")!
        .getWorldPosition(new THREE.Vector3());
      const head = scene
        .getObjectByName("Head")!
        .getWorldPosition(new THREE.Vector3());
      peakHandAboveShoulder = Math.max(
        peakHandAboveShoulder,
        hand.y - shoulder.y,
      );
      peakHandDistanceToHead = Math.min(
        peakHandDistanceToHead,
        hand.distanceTo(head),
      );
      const forearm = hand.clone().sub(elbow);
      if (hand.y - shoulder.y === peakHandAboveShoulder) {
        peakForearmX = Math.abs(forearm.x);
        peakForearmY = forearm.y;
      }
      handMinX = Math.min(handMinX, hand.x);
      handMaxX = Math.max(handMaxX, hand.x);
      for (const finger of ["index", "middle", "ring", "pinky"])
        peakFingerDistance = Math.max(
          peakFingerDistance,
          hand.distanceTo(
            scene
              .getObjectByName(`${finger}_04_leaf_r`)!
              .getWorldPosition(new THREE.Vector3()),
          ),
        );
      scene.traverse((object) => {
        if (!(object instanceof THREE.Bone)) return;
        expect(object.quaternion.length()).toBeCloseTo(1, 4);
        expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true);
      });
    }
    expect(peakHandAboveShoulder).toBeGreaterThan(0.12);
    expect(peakHandDistanceToHead).toBeLessThan(0.55);
    expect(peakForearmY).toBeGreaterThan(0.12);
    expect(peakForearmX).toBeLessThan(peakForearmY * 0.75);
    expect(handMaxX - handMinX).toBeGreaterThan(0.08);
    expect(peakFingerDistance).toBeGreaterThan(0.11);
  });

  it("restores the authored pose after the additive layer ends", async () => {
    const baseline = await loadRig(rigPath);
    const baselineMixer = new THREE.AnimationMixer(baseline.scene);
    baselineMixer
      .clipAction(
        baseline.animations.find((clip) => clip.name === "Idle_Neutral")!,
      )
      .play();
    baselineMixer.setTime(SOCIAL_WAVE_DURATION);
    baseline.scene.updateMatrixWorld(true);

    const animated = await loadRig(rigPath);
    const mixer = new THREE.AnimationMixer(animated.scene);
    mixer
      .clipAction(
        animated.animations.find((clip) => clip.name === "Idle_Neutral")!,
      )
      .play();
    const wave = mixer
      .clipAction(createSocialWaveClip())
      .setLoop(THREE.LoopOnce, 1);
    wave.clampWhenFinished = true;
    wave.play();
    mixer.setTime(SOCIAL_WAVE_DURATION);
    animated.scene.updateMatrixWorld(true);

    animated.scene.traverse((object) => {
      if (!(object instanceof THREE.Bone)) return;
      const source = baseline.scene.getObjectByName(object.name);
      expect(source).toBeTruthy();
      expect(object.quaternion.angleTo(source!.quaternion)).toBeLessThan(0.001);
      expect(object.position.distanceTo(source!.position)).toBeLessThan(0.001);
    });
  });

  it("does not accumulate a raised pose when retriggered repeatedly", async () => {
    const { scene, animations } = await loadRig(rigPath);
    const mixer = new THREE.AnimationMixer(scene);
    mixer
      .clipAction(animations.find((clip) => clip.name === "Idle_Neutral")!)
      .play();
    const wave = mixer
      .clipAction(createSocialWaveClip())
      .setLoop(THREE.LoopOnce, 1);
    wave.clampWhenFinished = true;

    for (let cycle = 0; cycle < 12; cycle++) {
      wave.reset().play();
      mixer.setTime(SOCIAL_WAVE_DURATION * (cycle + 1));
      scene.updateMatrixWorld(true);
      expect(scene.getObjectByName("hand_r")!.quaternion.length()).toBeCloseTo(
        1,
        4,
      );
      expect(
        scene.getObjectByName("hand_r")!.getWorldPosition(new THREE.Vector3())
          .y,
      ).toBeLessThan(1.25);
    }
  });
});
