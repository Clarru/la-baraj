import * as THREE from "three";

/** Reuse one authored running stride as a bound, rather than cycling the legs in air.
 * The front foot reaches forward while the push-off leg stays behind. Physics owns
 * world translation; these clips retain the source rig's in-place root tracks. */
export function createRunJumpClips(run?: THREE.AnimationClip) {
  if (!run) return [];
  const segments = [
    { name: "Jump_RunStart", duration: 0.2, from: 0.15, to: 0.375 },
    { name: "Jump_RunAir", duration: 0.65, from: 0.375, to: 0.465 },
    { name: "Jump_RunLand", duration: 0.16, from: 0.465, to: 0.64 },
  ];
  return segments.map(({ name, duration, from, to }) => {
    const times = Array.from({ length: 13 }, (_, i) => (i / 12) * duration);
    const tracks = run.tracks.map((source) => {
      const interpolant = source.InterpolantFactoryMethodLinear();
      const values = times.flatMap((time) =>
        Array.from(
          interpolant.evaluate(
            THREE.MathUtils.lerp(from, to, time / duration) * run.duration,
          ),
        ),
      );
      const track = source.clone();
      track.times = new Float32Array(times);
      track.values = new Float32Array(values);
      return track;
    });
    return new THREE.AnimationClip(name, duration, tracks).optimize();
  });
}
