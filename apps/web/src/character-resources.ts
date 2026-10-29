import * as THREE from "three";
import { clone } from "three/examples/jsm/utils/SkeletonUtils.js";
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
    createCrouchPoseClip(),
  ];
  // Swimming is already a strong, fully authored prone body pose on this rig.
  // Alias it instead of flattening the mesh or inventing an unconvincing
  // all-bone pose; the movement controller supplies the land collision shape.
  const swimIdle = authored.find((clip) => clip.name === "Swim_Idle");
  const swimForward = authored.find((clip) => clip.name === "Swim_Forward");
  if (swimIdle) {
    const prone = swimIdle.clone();
    prone.name = "Prone_Idle";
    clips.push(prone);
  }
  if (swimForward) {
    const prone = swimForward.clone();
    prone.name = "Prone_Crawl";
    clips.push(prone);
  }
  clipCache.set(animations, { source, clips });
  return clips;
}

/**
 * A small additive lower-body/torso pose keeps the approved walk/run clips
 * intact while giving crouch a readable silhouette. Prone uses the authored
 * swim clips above, which include the complete hand/foot timing.
 */
export function createCrouchPoseClip() {
  const duration = 1;
  const offsets: Record<string, number> = {
    pelvis: 0.18,
    spine_01: -0.12,
    spine_02: -0.12,
    spine_03: -0.15,
    neck_01: 0.1,
    Head: 0.15,
    thigh_l: 0.35,
    thigh_r: 0.35,
    calf_l: -0.8,
    calf_r: -0.8,
    foot_l: 0.35,
    foot_r: 0.35,
  };
  const tracks = Object.entries(offsets).map(([bone, angle]) => {
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(angle, 0, 0));
    return new THREE.QuaternionKeyframeTrack(
      `${bone}.quaternion`,
      [0, duration],
      [q.x, q.y, q.z, q.w, q.x, q.y, q.z, q.w],
    );
  });
  return new THREE.AnimationClip(
    "Crouch_Pose",
    duration,
    tracks,
    THREE.AdditiveAnimationBlendMode,
  );
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
