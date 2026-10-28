import * as THREE from "three";
type Reaction = { kind: "point" | "hit" | "win" | "lose"; startedAt: number };
/** Small additive upper-body reactions. Sit/stand and the accepted mesh stay untouched. */
export function createTableReactionRig(object: THREE.Object3D) {
  const names = ["upperarm_r", "lowerarm_r", "upperarm_l", "spine_01"];
  const bones = names.map((name) => object.getObjectByName(name));
  const applied = bones.map(() => new THREE.Quaternion());
  const delta = new THREE.Quaternion(),
    euler = new THREE.Euler();
  const beginFrame = () => {
    bones.forEach((bone, i) => {
      if (bone) bone.quaternion.multiply(applied[i].invert());
      applied[i].identity();
    });
  };
  return {
    beginFrame,
    dispose: beginFrame,
    update(reaction: Reaction | null, now: number) {
      if (!reaction) return;
      const t = (now - reaction.startedAt) / 1000;
      if (t < 0 || t > 1.4) return;
      const envelope = Math.sin(Math.PI * Math.min(1, t / 0.9)) ** 2;
      const values =
        reaction.kind === "point"
          ? [
              [-0.16, 0, -0.18],
              [-0.2, 0, 0],
              [0, 0, 0],
              [0.06, 0, 0],
            ]
          : reaction.kind === "win"
            ? [
                [-0.45, 0, -0.3],
                [-0.55, 0, 0],
                [-0.15, 0, 0.18],
                [-0.035, 0, 0],
              ]
            : reaction.kind === "hit"
              ? [
                  [0.04, 0, 0.08],
                  [0, 0, 0],
                  [0.04, 0, -0.08],
                  [-0.1, 0, 0.025],
                ]
              : [
                  [0.08, 0, 0.12],
                  [0.1, 0, 0],
                  [0.08, 0, -0.12],
                  [0.085, 0, 0],
                ];
      bones.forEach((bone, i) => {
        if (!bone) return;
        const v = values[i];
        euler.set(v[0] * envelope, v[1] * envelope, v[2] * envelope);
        delta.setFromEuler(euler);
        bone.quaternion.multiply(delta);
        applied[i].copy(delta);
      });
    },
  };
}
