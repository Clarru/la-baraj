import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { createRunJumpClips } from "./run-jump-clips";

const { loadRig } = (await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
)) as { loadRig(path: string): Promise<GLTF> };

describe("running jump stride", () => {
  it("extends one forward stride throughout flight without another leg cycle or root motion", async () => {
    const { scene, animations } = await loadRig(
      new URL("../public/assets/optimized/Lakeside_Man.glb", import.meta.url)
        .pathname,
    );
    const run = animations.find((clip) => clip.name === "Run")!;
    const original = THREE.AnimationClip.toJSON(run);
    const clips = createRunJumpClips(run);
    const mixer = new THREE.AnimationMixer(scene);
    const air = clips.find((clip) => clip.name === "Jump_RunAir")!;
    mixer.clipAction(air).setLoop(THREE.LoopOnce, 1).play();
    for (const time of [0, 0.2, 0.4, 0.64]) {
      mixer.setTime(time);
      scene.updateMatrixWorld(true);
      const foot = (name: string) =>
        scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
      expect(foot("foot_r").z).toBeGreaterThan(0.25);
      expect(foot("foot_l").z).toBeLessThan(-0.45);
      expect(foot("foot_r").distanceTo(foot("foot_l"))).toBeGreaterThan(0.8);
      expect(foot("root").length()).toBeLessThan(0.001);
    }
    // Reused samples meet exactly at the phase boundaries.
    for (let i = 0; i < clips.length - 1; i++) {
      clips[i].tracks.forEach((track, index) => {
        const size = track.getValueSize();
        expect(Array.from(track.values.slice(-size))).toEqual(
          Array.from(clips[i + 1].tracks[index].values.slice(0, size)),
        );
      });
    }
    expect(THREE.AnimationClip.toJSON(run)).toEqual(original);
  });
});
