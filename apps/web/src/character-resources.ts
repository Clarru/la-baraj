import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createSocialWaveClip } from "./social-wave";
import { createRunJumpClips } from "./run-jump-clips";
import { createFishingGestureClips } from "./character-actions";

/** Share immutable clips; every character still owns its mixer and animated bones. */
const clipCache = new WeakMap<
  THREE.AnimationClip[],
  { source: string; clips: THREE.AnimationClip[] }
>();
const characterCullCenter = new THREE.Vector3(0, 0.8, 0);
const characterCullRadius = 2.5;
export function characterClips(
  animations: THREE.AnimationClip[],
  source: string,
) {
  const saved = clipCache.get(animations);
  if (saved?.source === source) return saved.clips;
  const data = JSON.parse(source) as {
    clips: Parameters<typeof THREE.AnimationClip.parse>[0][];
  };
  const authored = data.clips.map((c) => THREE.AnimationClip.parse(c));
  const clips = [
    ...animations,
    ...createRunJumpClips(animations.find((c) => c.name === "Run")),
    ...authored,
    ...createFishingGestureClips(),
    createSocialWaveClip(),
  ];
  clipCache.set(animations, { source, clips });
  return clips;
}

/** The approved model binds all ten clothing/body meshes to identical bones.
 * SkeletonUtils clones a skeleton per mesh; coalesce only EXACT equivalent binds
 * within this character, avoiding nine redundant bone uploads per avatar.
 */
export function cloneCharacter(source: THREE.Object3D) {
  const object = clone(source);
  object.updateWorldMatrix(true, true);
  const rootToWorld = object.matrixWorld.clone();
  const skeletons: THREE.Skeleton[] = [];
  object.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
    if (!(node instanceof THREE.SkinnedMesh)) return;
    // SkinnedMesh owns the sphere used by Three's frustum test. Geometry-only
    // bounds are ignored for skins and would leave hair on stale bind bounds.
    const rootToNode = node.matrixWorld.clone().invert().multiply(rootToWorld);
    node.boundingSphere = new THREE.Sphere(
      characterCullCenter.clone().applyMatrix4(rootToNode),
      characterCullRadius * rootToNode.getMaxScaleOnAxis(),
    );
    node.frustumCulled = true;
    const skeleton = node.skeleton;
    const shared = skeletons.find(
      (s) =>
        s.bones.length === skeleton.bones.length &&
        s.bones.every(
          (bone, i) =>
            bone === skeleton.bones[i] &&
            s.boneInverses[i].equals(skeleton.boneInverses[i]),
        ),
    );
    if (shared) node.skeleton = shared;
    else skeletons.push(skeleton);
  });
  return object;
}

export function disposeCharacterSkeletons(object: THREE.Object3D) {
  const skeletons = new Set<THREE.Skeleton>();
  object.traverse((node) => {
    if (node instanceof THREE.SkinnedMesh) skeletons.add(node.skeleton);
  });
  skeletons.forEach((s) => s.dispose());
}
