import * as THREE from "three";

export const CROUCH_POSE_CLIP_NAME = "Crouch_Pose";
export const PRONE_IDLE_CLIP_NAME = "Prone_Idle";
export const PRONE_CRAWL_CLIP_NAME = "Prone_Crawl";
export const CROUCH_POSE_DURATION = 1;
export const PRONE_IDLE_DURATION = 1.2;

// Solved once against the approved Lakeside_Man rig: both feet sit behind the
// hips with a shallow forward knee pole, rather than inheriting the swimmer's
// alternating kick. The constants are local bone quaternions, so every
// character instance still gets its own mixer/skeleton.
const proneLegPose: Record<string, [number, number, number, number]> = {
  thigh_l: [0.980815207, 0.084038041, -0.116767628, -0.131546414],
  calf_l: [-0.269278073, -0.397650515, 0.387575323, 0.786860061],
  foot_l: [0.025990361, -0.341747915, 0.358598163, -0.868297312],
  thigh_r: [0.97979773, -0.088387491, 0.120773185, -0.132657067],
  calf_r: [-0.267756075, 0.401556297, -0.390945489, 0.783722431],
  foot_r: [0.030994802, 0.346852421, -0.356582849, -0.86693794],
};

const proneArmTimes = [0, 0.333333, 0.666667, 1, 1.333333];
const proneArmFrames: Record<string, [number, number, number, number][]> = {
  upperarm_l: [
    [0.018402, -0.802667, -0.078375, -0.590969],
    [-0.414357, 0.364375, 0.216699, 0.805345],
    [-0.248881, 0.526086, 0.054271, 0.811386],
    [-0.171758, -0.732156, -0.241758, -0.613188],
    [0.018402, -0.802667, -0.078375, -0.590969],
  ],
  lowerarm_l: [
    [-0.979294, -0.00608, -0.169515, -0.1105],
    [0.866116, -0.06434, 0.494072, 0.039955],
    [0.999273, 0.032325, -0.000833, 0.020187],
    [0.98351, 0.003068, -0.025663, 0.178999],
    [-0.979294, -0.00608, -0.169515, -0.1105],
  ],
  hand_l: [
    [-0.160988, 0.390382, 0.14068, -0.895485],
    [-0.088614, -0.268659, 0.061935, 0.957149],
    [0.114793, 0.221504, -0.062443, 0.966364],
    [-0.01395, -0.172995, 0.116893, -0.977862],
    [-0.160988, 0.390382, 0.14068, -0.895485],
  ],
  upperarm_r: [
    [-0.020532, -0.812679, -0.078937, 0.576975],
    [-0.267802, -0.396684, -0.21994, 0.850029],
    [-0.24846, -0.524381, -0.057103, 0.812423],
    [0.375228, -0.640736, -0.065386, 0.666623],
    [-0.020532, -0.812679, -0.078937, 0.576975],
  ],
  lowerarm_r: [
    [0.984907, 0.001954, -0.132881, 0.110889],
    [-0.013487, 0.230594, -0.958271, -0.168405],
    [0.999217, -0.032696, -0.010117, 0.019844],
    [0.841974, 0.08325, -0.37765, 0.376204],
    [0.984907, 0.001954, -0.132881, 0.110889],
  ],
  hand_r: [
    [-0.060109, -0.478697, -0.125507, -0.866882],
    [0.031705, 0.231797, -0.134327, 0.962923],
    [0.082117, -0.233816, -0.001369, 0.968806],
    [0.014457, -0.174292, 0.118076, 0.977482],
    [-0.060109, -0.478697, -0.125507, -0.866882],
  ],
};

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
  crawling = false,
) {
  const corrections: Record<string, THREE.Quaternion> = {
    // Mirrored local Z signs lower both palms toward the ground during the
    // forward stroke instead of leaving the elbows/forearms hovering.
    lowerarm_l: axisQuaternion("z", -0.35),
    lowerarm_r: axisQuaternion("z", 0.35),
  };
  return tracks.map((source) => {
    const bone = source.name.split(".")[0];
    if (bone === "pelvis" && source.name.endsWith(".position")) {
      const track = source.clone();
      const size = track.getValueSize();
      const values = Array.from(track.values);
      for (let index = 0; index < values.length; index += size) {
        // Measured against skinned vertices with the parent stance's +0.46m
        // lift: the authored swim pelvis needs a small contact trim.
        values[index + 2] += -0.24 + (crawling ? 0.026 : 0);
      }
      track.values = new Float32Array(values);
      return track;
    }
    const armFrames = proneArmFrames[bone];
    if (armFrames && source.name.endsWith(".quaternion")) {
      const track = source.clone();
      const frames = armFrames.map((frame) => {
        const q = new THREE.Quaternion().fromArray(frame);
        // Preserve the finger direction while turning the palm normal toward
        // world down for a supported belly-down contact.
        if (bone.startsWith("hand_"))
          q.multiply(axisQuaternion("y", Math.PI)).normalize();
        return q.toArray();
      });
      if (crawling) {
        track.times = new Float32Array(proneArmTimes);
        track.values = new Float32Array(frames.flat());
      } else {
        const size = track.getValueSize();
        const values = Array.from(track.values);
        for (let index = 0; index < values.length; index += size)
          values.splice(index, size, ...frames[0]);
        track.values = new Float32Array(values);
      }
      return track;
    }
    const legPose = proneLegPose[bone];
    if (legPose && source.name.endsWith(".quaternion")) {
      const track = source.clone();
      const size = track.getValueSize();
      const values = Array.from(track.values);
      for (let index = 0; index < values.length; index += size)
        values.splice(index, size, ...legPose);
      track.values = new Float32Array(values);
      return track;
    }
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
    correctProneSupportTracks(
      swimForward.tracks.map((track) =>
        sampledTrack(track, 0, PRONE_IDLE_DURATION),
      ),
      PRONE_IDLE_DURATION,
    ),
  );
  const crawl = new THREE.AnimationClip(
    PRONE_CRAWL_CLIP_NAME,
    swimForward.duration,
    correctProneSupportTracks(
      swimForward.tracks.map((track) => track.clone()),
      swimForward.duration,
      true,
    ),
  );
  return [idle, crawl];
}

/** Convenience for resource caches: crouch plus land-specific prone clips. */
export function createStanceClips(swimForward?: THREE.AnimationClip) {
  return [createCrouchPoseClip(), ...createProneClips(swimForward)];
}
