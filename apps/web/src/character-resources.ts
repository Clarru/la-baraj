import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { createStanceClips } from "./stance-clips";
import { createSocialWaveClip } from "./social-wave";
import { createRunJumpClips } from "./run-jump-clips";
import { createFishingGestureClips } from "./character-actions";

/** Share immutable clips; every character still owns its mixer and animated bones. */
const clipCache = new WeakMap<
  THREE.AnimationClip[],
  { source: string; clips: THREE.AnimationClip[] }
>();
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
    ...createStanceClips(
      authored.find((clip) => clip.name === "Swim_Forward"),
    ).filter((clip) => clip.name !== "Crouch_Pose"),
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
  const skeletons: THREE.Skeleton[] = [];
  object.traverse((node) => {
    if (node instanceof THREE.Mesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
    if (!(node instanceof THREE.SkinnedMesh)) return;
    // Geometry bounds describe the standing bind pose. Hair, eyes and clothing
    // can leave those bounds during prone/swim poses; whole avatars already
    // have distance culling, so retain every animated part of a visible rig.
    node.frustumCulled = false;
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
