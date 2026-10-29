import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  SOCIAL_WAVE_CLIP_NAME,
  SOCIAL_WAVE_COOLDOWN_MS,
  SOCIAL_WAVE_DURATION,
  SOCIAL_WAVE_DURATION_MS,
  canStartSocialWave,
  cancelSocialWave,
  createSocialWaveClip,
  createSocialWaveClips,
  requestSocialWave,
  socialWaveCooldownReady,
  socialWaveElapsed,
  socialWaveFinished,
  socialWaveProgress,
  startSocialWave,
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
  it("has a cancellable, clamped one-shot state", () => {
    const state = startSocialWave(1000);
    expect(socialWaveElapsed(state, 900)).toBe(0);
    expect(socialWaveProgress(state, 1000)).toBe(0);
    expect(socialWaveProgress(state, 1000 + SOCIAL_WAVE_DURATION_MS / 2)).toBe(
      0.5,
    );
    expect(socialWaveProgress(state, Infinity)).toBe(1);
    expect(socialWaveFinished(state, 1000 + SOCIAL_WAVE_DURATION_MS)).toBe(
      true,
    );

    const cancelled = cancelSocialWave(state);
    expect(cancelled.cancelled).toBe(true);
    expect(socialWaveFinished(cancelled, 1001)).toBe(true);
    expect(cancelSocialWave(cancelled)).toBe(cancelled);
  });

  it("shares eligibility and cooldown rules between key and menu requests", () => {
    expect(socialWaveCooldownReady(10_000)).toBe(true);
    expect(
      socialWaveCooldownReady(10_000, 10_000 - SOCIAL_WAVE_COOLDOWN_MS + 1),
    ).toBe(false);
    expect(canStartSocialWave(10_000, 9_000, false)).toBe(false);
    expect(requestSocialWave(10_000, 9_000, true)).toMatchObject({
      startedAt: 10_000,
      cancelled: false,
    });
    expect(requestSocialWave(10_000, 9_500, true)).toBeNull();
  });

  it("is a named additive clip with identity entry and exit", () => {
    const clip = createSocialWaveClip();
    expect(clip.name).toBe(SOCIAL_WAVE_CLIP_NAME);
    expect(clip.duration).toBeCloseTo(SOCIAL_WAVE_DURATION);
    expect(clip.blendMode).toBe(THREE.AdditiveAnimationBlendMode);
    expect(createSocialWaveClips()[0].blendMode).toBe(
      THREE.AdditiveAnimationBlendMode,
    );
    expect(clip.tracks.map((track) => track.name)).toEqual([
      "clavicle_r.quaternion",
      "upperarm_r.quaternion",
      "lowerarm_r.quaternion",
      "hand_r.quaternion",
    ]);
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
      .clipAction(createSocialWaveClips()[0])
      .setLoop(THREE.LoopOnce, 1);
    wave.clampWhenFinished = true;
    wave.play();

    let peakHandAboveShoulder = -Infinity;
    for (let frame = 0; frame <= 96; frame++) {
      mixer.setTime((SOCIAL_WAVE_DURATION * frame) / 96);
      scene.updateMatrixWorld(true);
      const shoulder = scene
        .getObjectByName("clavicle_r")!
        .getWorldPosition(new THREE.Vector3());
      const hand = scene
        .getObjectByName("hand_r")!
        .getWorldPosition(new THREE.Vector3());
      peakHandAboveShoulder = Math.max(
        peakHandAboveShoulder,
        hand.y - shoulder.y,
      );
      scene.traverse((object) => {
        if (!(object instanceof THREE.Bone)) return;
        expect(object.quaternion.length()).toBeCloseTo(1, 4);
        expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true);
      });
    }
    expect(peakHandAboveShoulder).toBeGreaterThan(0.12);
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
      .clipAction(createSocialWaveClips()[0])
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
      .clipAction(createSocialWaveClips()[0])
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
