import * as THREE from "three";

/** Build short seated motions on the source rig's authored sitting pose.
 * The local root translation belongs to the activity anchor; these clips only
 * shift weight, plant the hands and pick up each foot as the anchor advances. */
export function createSeatScootClips(scene, sitting) {
  const mixer = new THREE.AnimationMixer(scene);
  mixer.clipAction(sitting).play();
  mixer.update(0);
  scene.updateMatrixWorld(true);
  const bones = new Map();
  scene.traverse((bone) => {
    if (bone.isBone)
      bones.set(bone.name, {
        bone,
        position: bone.position.clone(),
        quaternion: bone.quaternion.clone(),
        scale: bone.scale.clone(),
      });
  });
  const xAxis = new THREE.Vector3(1, 0, 0),
    zAxis = new THREE.Vector3(0, 0, 1);
  const world = new THREE.Quaternion(),
    parent = new THREE.Quaternion(),
    offset = new THREE.Quaternion();
  const turnWorld = (name, axis, angle) => {
    const bone = bones.get(name)?.bone;
    if (!bone || !angle) return;
    bone.getWorldQuaternion(world);
    bone.parent.getWorldQuaternion(parent);
    bone.quaternion
      .copy(parent.invert())
      .multiply(offset.setFromAxisAngle(axis, angle))
      .multiply(world)
      .normalize();
    bone.updateWorldMatrix(false, true);
  };
  const pulse = (progress, start, end) => {
    if (progress <= start || progress >= end) return 0;
    return Math.sin((Math.PI * (progress - start)) / (end - start)) ** 2;
  };
  const duration = 0.6;
  const times = Array.from(
    { length: 25 },
    (_, index) => (duration * index) / 24,
  );
  const generated = [1, -1].map((direction) => {
    const values = sitting.tracks.map(() => []);
    for (let frame = 0; frame < times.length; frame++) {
      const progress = frame / (times.length - 1);
      const envelope =
        frame === 0 || frame === times.length - 1
          ? 0
          : Math.sin(Math.PI * progress) ** 2;
      for (const { bone, position, quaternion, scale } of bones.values()) {
        bone.position.copy(position);
        bone.quaternion.copy(quaternion);
        bone.scale.copy(scale);
      }
      scene.updateMatrixWorld(true);
      const pelvis = bones.get("pelvis").bone;
      pelvis.position.x +=
        direction * 0.025 * Math.sin(2 * Math.PI * progress) * envelope;
      pelvis.updateWorldMatrix(false, true);
      turnWorld("pelvis", zAxis, -direction * 0.045 * envelope);
      turnWorld("spine_01", zAxis, -direction * 0.075 * envelope);
      turnWorld("spine_03", xAxis, -0.035 * envelope);
      for (const [side, suffix] of [
        [1, "l"],
        [-1, "r"],
      ]) {
        const leading = side === direction;
        const step = leading
          ? pulse(progress, 0, 0.7)
          : pulse(progress, 0.25, 1);
        turnWorld(`thigh_${suffix}`, xAxis, -0.12 * step);
        turnWorld(`calf_${suffix}`, xAxis, 0.075 * step);
        turnWorld(`foot_${suffix}`, xAxis, 0.035 * step);
        const push = envelope * (leading ? 0.75 : 1);
        turnWorld(`upperarm_${suffix}`, zAxis, side * 0.16 * push);
        turnWorld(`lowerarm_${suffix}`, xAxis, 0.42 * push);
        turnWorld(`hand_${suffix}`, xAxis, -0.08 * push);
      }
      for (let index = 0; index < sitting.tracks.length; index++) {
        const track = sitting.tracks[index];
        const [name, property] = track.name.split(".");
        const transform = bones.get(name)?.bone[property];
        // Every track keeps its authored first value at both ends; untouched
        // finger tracks remain constant throughout the movement.
        const sample =
          envelope === 0 || !transform
            ? Array.from(track.values.slice(0, track.getValueSize()))
            : transform.toArray();
        values[index].push(...sample);
      }
    }
    const tracks = sitting.tracks.map((track, index) => {
      const result = track.clone();
      result.times = new Float32Array(times);
      result.values = new Float32Array(values[index]);
      return result;
    });
    return new THREE.AnimationClip(
      direction === 1 ? "Activity_ScootLeft" : "Activity_ScootRight",
      duration,
      tracks,
    ).optimize();
  });
  mixer.stopAllAction();
  return generated;
}
