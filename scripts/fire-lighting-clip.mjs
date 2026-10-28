import * as THREE from "three";

export const fireLightingDuration = 3;
export const fireIgnitionTime = 1.3;

/** Keep the authored kneel/reach/rise and its fingers, retimed to three seconds. */
export function createFireLightingClip(scene, fixing, idle) {
  const duration = fireLightingDuration;
  // Keep authored bind translations as well as quaternions: the optimized
  // walking/idle clips carry those same tracks, giving exact standing endpoints.
  const compatible = fixing.tracks;
  const bindings = compatible.map((track) => ({
    track,
    sample: track.createInterpolant(),
    idle: idle.tracks
      .find((candidate) => candidate.name === track.name)
      ?.createInterpolant(),
    bone: scene.getObjectByName(track.name.split(".")[0]),
    property: track.name.split(".")[1],
    values: [],
  }));
  const times = Array.from(
    { length: 91 },
    (_, index) => (duration * index) / 90,
  );
  const smooth = (value) => {
    const t = THREE.MathUtils.clamp(value, 0, 1);
    return t * t * (3 - 2 * t);
  };
  const q = new THREE.Quaternion(),
    world = new THREE.Quaternion(),
    parent = new THREE.Quaternion();
  const axis = new THREE.Vector3(1, 0, 0);
  for (const time of times) {
    const sourceTime = (time / duration) * fixing.duration;
    const idleBlend =
      1 - Math.min(smooth(time / 0.18), smooth((duration - time) / 0.18));
    for (const binding of bindings) {
      const value = binding.sample.evaluate(sourceTime);
      const transform = binding.bone?.[binding.property];
      if (!transform) continue;
      transform.fromArray(value);
      if (binding.idle && idleBlend > 0) {
        const standing = binding.idle.evaluate(0);
        if (binding.property === "quaternion")
          transform.slerp(q.fromArray(standing), idleBlend);
        else transform.lerp(new THREE.Vector3().fromArray(standing), idleBlend);
      }
    }
    scene.updateMatrixWorld(true);
    // Keep the authored kneel, opening the working arm slightly so its lighter
    // reaches the near log edge rather than pointing between the actor's knees.
    const envelope = Math.min(
      smooth(time / 0.6),
      smooth((duration - time) / 0.6),
    );
    for (const [name, angle] of [
      ["spine_01", 0.035],
      ["upperarm_r", -0.16],
      ["lowerarm_r", -0.06],
    ]) {
      const bone = scene.getObjectByName(name);
      if (!envelope) continue;
      bone.getWorldQuaternion(world);
      bone.parent.getWorldQuaternion(parent);
      bone.quaternion
        .copy(parent.invert())
        .multiply(q.setFromAxisAngle(axis, angle * envelope))
        .multiply(world)
        .normalize();
      bone.updateWorldMatrix(false, true);
    }
    for (const binding of bindings) {
      const transform = binding.bone?.[binding.property];
      const sample = transform
        ? transform.toArray()
        : Array.from(binding.sample.evaluate(sourceTime));
      binding.values.push(...sample);
    }
  }
  return new THREE.AnimationClip(
    "Activity_LightFire",
    duration,
    bindings.map((binding) => {
      const track = binding.track.clone();
      track.times = new Float32Array(times);
      track.values = new Float32Array(binding.values);
      return track;
    }),
  ).optimize();
}
