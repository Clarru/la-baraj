import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import {
  characterClips,
  cloneCharacter,
  disposeCharacterSkeletons,
} from "./character-resources";
const { loadRig } = await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
);

describe("approved character resource reuse", () => {
  it("plays both source swim clips on the approved character skeleton", async () => {
    const { scene, animations } = await loadRig(
      new URL("../public/assets/optimized/Lakeside_Man.glb", import.meta.url)
        .pathname,
    );
    const json = readFileSync(
      new URL(
        "../public/assets/animations/character-actions.json",
        import.meta.url,
      ),
      "utf8",
    );
    const clips = characterClips(animations, json);
    for (const name of ["Swim_Forward", "Swim_Idle"]) {
      const clip = clips.find((value) => value.name === name);
      expect(clip, name).toBeDefined();
      expect(clip!.duration).toBeGreaterThan(1);
      for (const track of clip!.tracks) {
        expect(
          scene.getObjectByName(track.name.split(".")[0]),
          `${name}: ${track.name}`,
        ).toBeDefined();
      }
      const mixer = new THREE.AnimationMixer(scene);
      mixer.clipAction(clip!).play();
      mixer.update(0.4);
      scene.updateMatrixWorld(true);
      const head = scene
        .getObjectByName("Head")!
        .getWorldPosition(new THREE.Vector3());
      expect(head.toArray().every(Number.isFinite)).toBe(true);
      mixer.stopAllAction();
    }
  });
  it("loads authored crouch poses with lowered hips and grounded feet", async () => {
    const { scene, animations } = await loadRig(
      new URL("../public/assets/optimized/Lakeside_Man.glb", import.meta.url)
        .pathname,
    );
    const json = readFileSync(
      new URL(
        "../public/assets/animations/character-actions.json",
        import.meta.url,
      ),
      "utf8",
    );
    const clips = characterClips(animations, json);
    expect(clips.find((clip) => clip.name === "Crouch_Idle")).toBeDefined();
    expect(clips.find((clip) => clip.name === "Crouch_Walk")).toBeDefined();
    const mixer = new THREE.AnimationMixer(scene);
    const idle = mixer.clipAction(
      clips.find((clip) => clip.name === "Idle_Neutral")!,
    );
    idle.play();
    mixer.setTime(0.5);
    scene.updateMatrixWorld(true);
    const standingHip = scene
      .getObjectByName("pelvis")!
      .getWorldPosition(new THREE.Vector3()).y;
    mixer.stopAllAction();
    mixer.clipAction(clips.find((clip) => clip.name === "Crouch_Idle")!).play();
    mixer.setTime(0.5);
    scene.updateMatrixWorld(true);
    expect(
      scene.getObjectByName("pelvis")!.getWorldPosition(new THREE.Vector3()).y,
    ).toBeLessThan(standingHip - 0.2);
    // One authored heel lifts while the toe stays planted. Foot-joint height
    // isn't the sole height; inspect the actual deformed boot/body vertices.
    let lowestVertex = Infinity;
    const vertex = new THREE.Vector3();
    scene.traverse((node: THREE.Object3D) => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      node.skeleton.update();
      for (let i = 0; i < node.geometry.getAttribute("position").count; i++) {
        node.getVertexPosition(i, vertex).applyMatrix4(node.matrixWorld);
        lowestVertex = Math.min(lowestVertex, vertex.y);
      }
    });
    expect(lowestVertex).toBeGreaterThan(-0.015);
    expect(lowestVertex).toBeLessThan(0.015);
    mixer.stopAllAction();
    expect(clips.find((clip) => clip.name === "Prone_Idle")).toBeDefined();
    expect(clips.find((clip) => clip.name === "Prone_Crawl")?.duration).toBe(
      clips.find((clip) => clip.name === "Swim_Forward")?.duration,
    );
  });
  it("shares equivalent skeletons within one avatar, never between players, preserving bind and animated vertices", async () => {
    const { scene, animations } = await loadRig(
      new URL("../public/assets/optimized/Lakeside_Man.glb", import.meta.url)
        .pathname,
    );
    const a = cloneCharacter(scene),
      b = cloneCharacter(scene);
    const meshes = (object: THREE.Object3D) => {
      const result: THREE.SkinnedMesh[] = [];
      object.traverse((n) => {
        if (n instanceof THREE.SkinnedMesh) result.push(n);
      });
      return result;
    };
    const original = meshes(scene),
      first = meshes(a),
      second = meshes(b);
    expect(first).toHaveLength(original.length);
    expect(new Set(first.map((n) => n.skeleton)).size).toBe(1);
    expect(first[0].skeleton).not.toBe(second[0].skeleton);
    expect(first[0].skeleton.bones[0]).not.toBe(second[0].skeleton.bones[0]);
    const mixers = [scene, a].map((object) => new THREE.AnimationMixer(object));
    for (const animation of ["Idle_Neutral", "Walk", "Run"]) {
      mixers.forEach((m) => {
        m.stopAllAction();
        m.clipAction(
          animations.find((c: THREE.AnimationClip) => c.name === animation)!,
        ).play();
        m.update(0.23);
      });
      scene.updateMatrixWorld(true);
      a.updateMatrixWorld(true);
      for (let i = 0; i < first.length; i++) {
        first[i].skeleton.update();
        original[i].skeleton.update();
        expect(first[i].geometry).toBe(original[i].geometry);
        expect(first[i].material).toBe(original[i].material);
        for (const v of [
          0,
          Math.floor(first[i].geometry.getAttribute("position").count / 2),
        ]) {
          expect(
            first[i]
              .getVertexPosition(v, new THREE.Vector3())
              .distanceTo(
                original[i].getVertexPosition(v, new THREE.Vector3()),
              ),
          ).toBeLessThan(1e-6);
        }
      }
    }
    disposeCharacterSkeletons(a);
    expect(second[0].skeleton.bones).toHaveLength(65);
    mixers.forEach((m) => m.stopAllAction());
    disposeCharacterSkeletons(b);
  });
});
