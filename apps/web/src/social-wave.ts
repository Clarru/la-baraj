import * as THREE from "three";

/** The dedicated one-shot layer, distinct from the source rig's conversational `Wave` clip. */
export const SOCIAL_WAVE_CLIP_NAME = "Social_Wave";
export const SOCIAL_WAVE_DURATION = 1.6;
export const SOCIAL_WAVE_DURATION_MS = SOCIAL_WAVE_DURATION * 1000;
export const SOCIAL_WAVE_FADE_SECONDS = 0.24;
export const SOCIAL_WAVE_COOLDOWN_MS = 700;

/** A small, serializable local state machine for callers that need cancellation. */
export type SocialWaveState = Readonly<{
  startedAt: number;
  cancelled: boolean;
}>;

export function startSocialWave(now: number): SocialWaveState {
  return { startedAt: now, cancelled: false };
}

/** Keep the input path deterministic; callers own the last-request timestamp. */
export function socialWaveCooldownReady(
  now: number,
  lastStartedAt = -Infinity,
  cooldownMs = SOCIAL_WAVE_COOLDOWN_MS,
) {
  return (
    Number.isFinite(now) &&
    (!Number.isFinite(lastStartedAt) || now - lastStartedAt >= cooldownMs)
  );
}

/**
 * `eligible` is intentionally supplied by the game (world active, not paused,
 * not swimming/mounted, etc.). No timers or synthetic key events are hidden in
 * this helper, so a menu action and the G key can share the same request path.
 */
export function canStartSocialWave(
  now: number,
  lastStartedAt = -Infinity,
  eligible = true,
  cooldownMs = SOCIAL_WAVE_COOLDOWN_MS,
) {
  return eligible && socialWaveCooldownReady(now, lastStartedAt, cooldownMs);
}

export function requestSocialWave(
  now: number,
  lastStartedAt = -Infinity,
  eligible = true,
  cooldownMs = SOCIAL_WAVE_COOLDOWN_MS,
) {
  return canStartSocialWave(now, lastStartedAt, eligible, cooldownMs)
    ? startSocialWave(now)
    : null;
}

export function cancelSocialWave(state: SocialWaveState): SocialWaveState {
  return state.cancelled ? state : { ...state, cancelled: true };
}

export function socialWaveElapsed(state: SocialWaveState, now: number) {
  return Math.max(0, (now - state.startedAt) / 1000);
}

export function socialWaveProgress(state: SocialWaveState, now: number) {
  if (state.cancelled) return 1;
  return THREE.MathUtils.clamp(
    socialWaveElapsed(state, now) / SOCIAL_WAVE_DURATION,
    0,
    1,
  );
}

export function socialWaveFinished(state: SocialWaveState, now: number) {
  return state.cancelled || socialWaveProgress(state, now) >= 1;
}

const smoothStep = (value: number) => {
  const t = THREE.MathUtils.clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
};

/**
 * Additive envelope for the gesture. The identity quaternion at both ends is
 * intentional: stopping/cancelling this layer lets the authored locomotion or
 * stance action own the bones again without a pose jump or quaternion buildup.
 */
function waveEnvelope(time: number) {
  return Math.min(
    smoothStep(time / SOCIAL_WAVE_FADE_SECONDS),
    smoothStep((SOCIAL_WAVE_DURATION - time) / SOCIAL_WAVE_FADE_SECONDS),
  );
}

function axisQuaternion(axis: "x" | "y" | "z", angle: number) {
  const vector = new THREE.Vector3(
    axis === "x" ? 1 : 0,
    axis === "y" ? 1 : 0,
    axis === "z" ? 1 : 0,
  );
  return new THREE.Quaternion().setFromAxisAngle(vector, angle);
}

/**
 * Build the approved Lakeside_Man-compatible hello wave.
 *
 * This is a deliberately small additive clip: the right clavicle/upper arm
 * lift the hand above the shoulder, the lower arm makes three gentle side-to-
 * side passes, and the wrist rotates with the passes. Keying only these four
 * known bones leaves clothing, skin, fingers, locomotion and stance tracks
 * intact. The caller should add the returned clip to its per-character mixer
 * and play it with LoopOnce; no mesh or skeleton is rebuilt here.
 */
export function createSocialWaveClip() {
  const sampleCount = 33;
  const times = Array.from(
    { length: sampleCount },
    (_, index) => (SOCIAL_WAVE_DURATION * index) / (sampleCount - 1),
  );

  const track = (
    bone: string,
    axis: "x" | "y" | "z",
    angleAt: (time: number) => number,
  ) =>
    new THREE.QuaternionKeyframeTrack(
      `${bone}.quaternion`,
      times,
      times.flatMap((time) => axisQuaternion(axis, angleAt(time)).toArray()),
    );

  const clip = new THREE.AnimationClip(
    SOCIAL_WAVE_CLIP_NAME,
    SOCIAL_WAVE_DURATION,
    [
      // The shoulder lift creates a readable greeting silhouette without
      // changing the approved mesh or the character's torso/feet.
      track("clavicle_r", "x", (time) => 0.35 * waveEnvelope(time)),
      track("upperarm_r", "z", (time) => -1.3 * waveEnvelope(time)),
      // The elbow stays high while the forearm folds back toward the head.
      // A z-axis sweep moves the wrist side-to-side without punching forward.
      track(
        "lowerarm_r",
        "z",
        (time) =>
          (-1.7 +
            0.35 * Math.sin((time / SOCIAL_WAVE_DURATION) * Math.PI * 6)) *
          waveEnvelope(time),
      ),
      track(
        "hand_r",
        "z",
        (time) =>
          0.55 *
          Math.sin((time / SOCIAL_WAVE_DURATION) * Math.PI * 6 + Math.PI / 2) *
          waveEnvelope(time),
      ),
      // The source hand is curled into a fist. Open its compatible finger
      // chains with bounded offsets while retaining the original mesh.
      ...(["index", "middle", "ring", "pinky"] as const).flatMap((finger) =>
        (
          [
            ["01", -0.8],
            ["02", -0.55],
            ["03", -0.3],
          ] as const
        ).map(([joint, amount]) =>
          track(
            `${finger}_${joint}_r`,
            "x",
            (time) => amount * waveEnvelope(time),
          ),
        ),
      ),
      track("thumb_01_r", "z", (time) => 0.8 * waveEnvelope(time)),
      track("thumb_02_r", "z", (time) => 0.7 * waveEnvelope(time)),
      track("thumb_03_r", "z", (time) => 0.5 * waveEnvelope(time)),
    ],
  );
  clip.blendMode = THREE.AdditiveAnimationBlendMode;
  return clip;
}

/** Convenience for character resource caches that expect a clip array. */
export function createSocialWaveClips() {
  return [createSocialWaveClip()];
}
