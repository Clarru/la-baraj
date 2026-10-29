import * as THREE from "three";

export const CROUCH_POSE_CLIP_NAME = "Crouch_Pose";
export const PRONE_IDLE_CLIP_NAME = "Prone_Idle";
export const PRONE_CRAWL_CLIP_NAME = "Prone_Crawl";
export const CROUCH_POSE_DURATION = 1;
export const PRONE_IDLE_DURATION = 1.2;

function axisQuaternion(axis: "x" | "y" | "z", angle: number) {
  const vector = new THREE.Vector3(
    axis === "x" ? 1 : 0,
    axis === "y" ? 1 : 0,
    axis === "z" ? 1 : 0,
  );
  return new THREE.Quaternion().setFromAxisAngle(vector, angle);
}

function staticQuaternionTrack(
  bone: string,
  axis: "x" | "y" | "z",
  angle: number,
  duration: number,
) {
  const q = axisQuaternion(axis, angle);
  return new THREE.QuaternionKeyframeTrack(
    `${bone}.quaternion`,
    [0, duration],
    [...q.toArray(), ...q.toArray()],
  );
}

/**
 * Additive crouch pose for the approved rig. The pelvis translation is local
 * Z because the retained armature's root rotates local Y into world -Z; this
 * is what actually lowers the hips instead of only rotating the torso.
 */
export function createCrouchPoseClip() {
  const duration = CROUCH_POSE_DURATION;
  const tracks: THREE.KeyframeTrack[] = [
    new THREE.VectorKeyframeTrack(
      "pelvis.position",
      [0, duration],
      [0, 0, -0.2, 0, 0, -0.2],
    ),
    staticQuaternionTrack("thigh_l", "x", 0.6, duration),
    staticQuaternionTrack("thigh_r", "x", 0.6, duration),
    staticQuaternionTrack("calf_l", "x", -1.2, duration),
    staticQuaternionTrack("calf_r", "x", -1.2, duration),
    staticQuaternionTrack("foot_l", "x", 0.4, duration),
    staticQuaternionTrack("foot_r", "x", 0.4, duration),
    staticQuaternionTrack("spine_01", "x", 0.2, duration),
    staticQuaternionTrack("spine_02", "x", 0.2, duration),
    staticQuaternionTrack("spine_03", "x", 0.2, duration),
  ];
  const clip = new THREE.AnimationClip(CROUCH_POSE_CLIP_NAME, duration, tracks);
  clip.blendMode = THREE.AdditiveAnimationBlendMode;
  return clip;
}

function sampledTrack(
  source: THREE.KeyframeTrack,
  sourceTime: number,
  duration: number,
) {
  const interpolant = source.InterpolantFactoryMethodLinear();
  const value = Array.from(interpolant.evaluate(sourceTime));
  const track = source.clone();
  track.times = new Float32Array([0, duration]);
  track.values = new Float32Array([...value, ...value]);
  return track;
}

/** Keep swimming's horizontal torso while making land contact arms support the chest. */
function correctProneSupportTracks(
  tracks: THREE.KeyframeTrack[],
  duration: number,
) {
  const corrections: Record<string, THREE.Quaternion> = {
    // Mirrored local Z signs lower both palms toward the ground during the
    // forward stroke instead of leaving the elbows/forearms hovering.
    lowerarm_l: axisQuaternion("z", -0.72),
    lowerarm_r: axisQuaternion("z", 0.72),
  };
  return tracks.map((source) => {
    const bone = source.name.split(".")[0];
    const correction = corrections[bone];
    if (!correction || !source.name.endsWith(".quaternion")) return source;
    const track = source.clone();
    const size = track.getValueSize();
    const values = Array.from(track.values);
    for (let index = 0; index < values.length; index += size) {
      const q = new THREE.Quaternion().fromArray(values, index);
      q.multiply(correction).normalize();
      q.toArray(values, index);
    }
    track.values = new Float32Array(values);
    // Keep the argument part of the helper's contract explicit: callers may
    // pass source tracks with a different duration without mutating timing.
    if (track.times.length === 0) track.times = new Float32Array([0, duration]);
    return track;
  });
}

/**
 * Derive land-specific prone clips from authored Swim_Forward only. Swim_Idle
 * is intentionally not accepted: its upright treading pose is not a prone
 * stance. The static idle sample is the first grounded-looking support phase;
 * crawl retains the authored stroke timing with mirrored forearm corrections.
 */
export function createProneClips(swimForward?: THREE.AnimationClip) {
  if (!swimForward) return [];
  const idle = new THREE.AnimationClip(
    PRONE_IDLE_CLIP_NAME,
    PRONE_IDLE_DURATION,
    swimForward.tracks.map((track) =>
      sampledTrack(track, 0, PRONE_IDLE_DURATION),
    ),
  );
  const crawl = new THREE.AnimationClip(
    PRONE_CRAWL_CLIP_NAME,
    swimForward.duration,
    correctProneSupportTracks(
      swimForward.tracks.map((track) => track.clone()),
      swimForward.duration,
    ),
  );
  return [idle, crawl];
}

/** Convenience for resource caches: crouch plus land-specific prone clips. */
export function createStanceClips(swimForward?: THREE.AnimationClip) {
  return [createCrouchPoseClip(), ...createProneClips(swimForward)];
}
