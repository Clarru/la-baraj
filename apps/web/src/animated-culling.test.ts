import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { characterClips, cloneCharacter } from "./character-resources";

const { loadRig } = await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
);

const rigPath = new URL(
  "../public/assets/optimized/Lakeside_Man.glb",
  import.meta.url,
).pathname;
const sourcePath = new URL(
  "../public/assets/animations/character-actions.json",
  import.meta.url,
).pathname;
const envelopeCenter = new THREE.Vector3(0, 0.8, 0);
const envelopeRadius = 2.5;
const sampleCount = 24;

function skinnedMeshes(object: THREE.Object3D) {
  const meshes: THREE.SkinnedMesh[] = [];
  object.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) meshes.push(node);
  });
  return meshes;
}

function sampledRadius(scene: THREE.Object3D, clips: THREE.AnimationClip[]) {
  const mixer = new THREE.AnimationMixer(scene),
    meshes = skinnedMeshes(scene),
    rootToWorld = scene.matrixWorld.clone(),
    worldToRoot = rootToWorld.clone().invert(),
    local = new THREE.Vector3(),
    world = new THREE.Vector3(),
    root = new THREE.Vector3();
  let max = 0;
  for (const clip of clips) {
    mixer.stopAllAction();
    mixer.clipAction(clip).setLoop(THREE.LoopOnce, 1).play();
    let clipMax = 0;
    for (let frame = 0; frame <= sampleCount; frame++) {
      mixer.setTime((clip.duration * frame) / sampleCount);
      scene.updateMatrixWorld(true);
      for (const mesh of meshes) {
        const positions = mesh.geometry.getAttribute("position");
        for (let index = 0; index < positions.count; index++) {
          mesh.getVertexPosition(index, local);
          world.copy(local).applyMatrix4(mesh.matrixWorld);
          root.copy(world).applyMatrix4(worldToRoot);
          clipMax = Math.max(clipMax, root.distanceTo(envelopeCenter));
        }
      }
    }
    max = Math.max(max, clipMax);
  }
  return max;
}

describe("animated character frustum bounds", () => {
  it("contains every generated clip pose and still culls a rig behind the camera", async () => {
    const { scene, animations } = await loadRig(rigPath);
    const clips = characterClips(animations, readFileSync(sourcePath, "utf8"));
    const sampled = sampledRadius(scene, clips);
    expect(sampled).toBeLessThan(envelopeRadius - 0.1);

    const bounded = cloneCharacter(scene),
      meshes = skinnedMeshes(bounded);
    expect(meshes.length).toBeGreaterThan(0);
    for (const mesh of meshes) {
      expect(mesh.frustumCulled).toBe(true);
      expect(mesh.boundingSphere).toBeTruthy();
      expect(mesh.boundingSphere!.radius).toBe(envelopeRadius);
      expect(mesh.boundingSphere!.center).toEqual(envelopeCenter);
    }

    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100),
      projection = new THREE.Matrix4(),
      frustum = new THREE.Frustum();
    camera.position.set(0, 0.8, 10);
    camera.lookAt(0, 0.8, 11);
    camera.updateMatrixWorld(true);
    projection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(projection);
    expect(meshes.some((mesh) => frustum.intersectsObject(mesh))).toBe(false);

    camera.lookAt(0, 0.8, 0);
    camera.updateMatrixWorld(true);
    projection.multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse,
    );
    frustum.setFromProjectionMatrix(projection);
    expect(meshes.some((mesh) => frustum.intersectsObject(mesh))).toBe(true);
  });
});
