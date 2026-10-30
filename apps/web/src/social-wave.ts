import * as THREE from "three";
import baked from "./social-wave.json";

/** The dedicated one-shot layer, distinct from the source rig's conversational `Wave` clip. */
export const SOCIAL_WAVE_CLIP_NAME = "Social_Wave";
export const SOCIAL_WAVE_DURATION = 1.6;
export const SOCIAL_WAVE_FADE_SECONDS = 0.24;
export const SOCIAL_WAVE_COOLDOWN_MS = 700;

/** The player owns cancellation by clearing this state and fading the action. */
export type SocialWaveState = Readonly<{ startedAt: number }>;

export function requestSocialWave(
  now: number,
  lastStartedAt = -Infinity,
  eligible = true,
): SocialWaveState | null {
  return eligible &&
    Number.isFinite(now) &&
    now - lastStartedAt >= SOCIAL_WAVE_COOLDOWN_MS
    ? { startedAt: now }
    : null;
}

export function socialWaveFinished(state: SocialWaveState, now: number) {
  return now - state.startedAt >= SOCIAL_WAVE_DURATION * 1000;
}

/** Offline baked on the shipped rig: supported elbow, neutral wrist, authored open fingers. */
export function createSocialWaveClip() {
  return THREE.AnimationClip.parse({
    ...baked.clip,
    blendMode: THREE.AdditiveAnimationBlendMode,
  });
}
