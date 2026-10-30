/** Offline-only greeting bake. Source hand articulation, target-rig arm IK; no runtime IK. */
import fs from "node:fs";
import crypto from "node:crypto";
import * as T from "three";
import { loadRig } from "./extract-activity-clips.mjs";
const sourcePath = process.argv[2] ?? "assets/character-source/human_male.glb";
const targetPath = "apps/web/public/assets/optimized/Lakeside_Man.glb";
const source = await loadRig(sourcePath),
  target = await loadRig(targetPath);
const names = [
  "clavicle_r",
  "upperarm_r",
  "lowerarm_r",
  "hand_r",
  ...["index", "middle", "ring", "pinky", "thumb"].flatMap((f) =>
    ["01", "02", "03"].map((j) => `${f}_${j}_r`),
  ),
];
const sourceMixer = new T.AnimationMixer(source.scene);
sourceMixer
  .clipAction(
    source.animations.find((c) => c.name === "Idle_TalkingPhone_Loop"),
  )
  .play();
sourceMixer.setTime(0.4);
source.scene.updateMatrixWorld(true);
const open = new Map(
  names
    .slice(4)
    .map((n) => [n, source.scene.getObjectByName(n).quaternion.clone()]),
);
// The authored T pose supplies the relaxed, splayed thumb rather than a phone grip.
sourceMixer.stopAllAction();
sourceMixer
  .clipAction(source.animations.find((c) => c.name === "A_TPose"))
  .play();
sourceMixer.setTime(0);
source.scene.updateMatrixWorld(true);
for (const n of names.filter((n) => n.startsWith("thumb_")))
  open.set(n, source.scene.getObjectByName(n).quaternion.clone());
const mixer = new T.AnimationMixer(target.scene),
  idle = target.animations.find((c) => c.name === "Idle_Neutral");
mixer.clipAction(idle).play();
const worldPos = (b) => b.getWorldPosition(new T.Vector3());
function worldRotation(b, q) {
  b.quaternion
    .copy(b.parent.getWorldQuaternion(new T.Quaternion()).invert().multiply(q))
    .normalize();
  target.scene.updateMatrixWorld(true);
}
function aim(b, child, p) {
  const origin = worldPos(b),
    delta = new T.Quaternion().setFromUnitVectors(
      worldPos(child).sub(origin).normalize(),
      p.clone().sub(origin).normalize(),
    );
  worldRotation(b, b.getWorldQuaternion(new T.Quaternion()).premultiply(delta));
}
function solve(upper, lower, hand, goal, pole) {
  const start = worldPos(upper),
    mid = worldPos(lower),
    end = worldPos(hand),
    a = start.distanceTo(mid),
    b = mid.distanceTo(end),
    direction = goal.clone().sub(start),
    d = T.MathUtils.clamp(
      direction.length(),
      Math.abs(a - b) + 1e-5,
      a + b - 1e-5,
    );
  direction.normalize();
  const side = pole.clone().sub(start);
  side.addScaledVector(direction, -side.dot(direction)).normalize();
  const along = (a * a - b * b + d * d) / (2 * d),
    bend = start
      .clone()
      .addScaledVector(direction, along)
      .addScaledVector(side, Math.sqrt(Math.max(0, a * a - along * along)));
  aim(upper, lower, bend);
  aim(lower, hand, start.clone().addScaledVector(direction, d));
}
const duration = 1.6,
  times = Array.from({ length: 49 }, (_, i) => (duration * i) / 48),
  values = new Map(names.map((n) => [n, []]));
const smooth = (x) => {
  x = T.MathUtils.clamp(x, 0, 1);
  return x * x * (3 - 2 * x);
};
for (const time of times) {
  mixer.setTime(time);
  target.scene.updateMatrixWorld(true);
  const base = new Map(
    names.map((n) => [n, target.scene.getObjectByName(n).quaternion.clone()]),
  );
  const envelope = Math.min(
    smooth(time / 0.32),
    smooth((duration - time) / 0.32),
  );
  const upper = target.scene.getObjectByName("upperarm_r"),
    lower = target.scene.getObjectByName("lowerarm_r"),
    hand = target.scene.getObjectByName("hand_r");

  const shoulder = worldPos(upper),
    sweep = Math.sin(((time - 0.32) / 0.96) * Math.PI * 4) * 0.045;
  const goal = new T.Vector3(
    shoulder.x - 0.3 + sweep,
    shoulder.y + 0.32,
    shoulder.z + 0.13,
  );
  solve(
    upper,
    lower,
    hand,
    goal,
    new T.Vector3(shoulder.x - 0.48, shoulder.y - 0.08, shoulder.z + 0.05),
  );
  const upperGoal = upper.quaternion.clone(),
    lowerGoal = lower.quaternion.clone();
  upper.quaternion.copy(base.get("upperarm_r")).slerp(upperGoal, envelope);
  lower.quaternion.copy(base.get("lowerarm_r")).slerp(lowerGoal, envelope);
  target.scene.updateMatrixWorld(true);
  // Fingers follow the forearm shaft. The palm faces forward without a bent wrist.
  const y = worldPos(hand).sub(worldPos(lower)).normalize(),
    z = new T.Vector3(1, 0, 0);
  z.addScaledVector(y, -z.dot(y)).normalize();
  const x = y.clone().cross(z).normalize();
  z.crossVectors(x, y).normalize();
  const raised = new T.Quaternion().setFromRotationMatrix(
    new T.Matrix4().makeBasis(x, y, z),
  );
  worldRotation(
    hand,
    hand.getWorldQuaternion(new T.Quaternion()).slerp(raised, envelope),
  );
  for (const [n, q] of open)
    target.scene
      .getObjectByName(n)
      .quaternion.copy(base.get(n))
      .slerp(q, envelope);
  for (const n of names) {
    const q = base
      .get(n)
      .clone()
      .invert()
      .multiply(target.scene.getObjectByName(n).quaternion)
      .normalize();
    if (time < 1e-8 || time > duration - 1e-8) q.identity();
    const v = values.get(n);
    if (v.length && q.dot(new T.Quaternion().fromArray(v, v.length - 4)) < 0)
      q.set(-q.x, -q.y, -q.z, -q.w);
    v.push(...q.toArray());
  }
}
const clip = new T.AnimationClip(
  "Social_Wave",
  duration,
  names.map(
    (n) =>
      new T.QuaternionKeyframeTrack(n + ".quaternion", times, values.get(n)),
  ),
);
clip.blendMode = T.AdditiveAnimationBlendMode;
const data = T.AnimationClip.toJSON(clip);
data.uuid = "d6143bdd-2b5f-48b8-b372-71980450cbbe";
fs.writeFileSync(
  "apps/web/src/social-wave.json",
  JSON.stringify({
    targetSha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(targetPath))
      .digest("hex"),
    source:
      "human_male.glb: Idle_TalkingPhone_Loop fingers / A_TPose thumb; target-rig two-bone arm bake",
    clip: data,
  }) + "\n",
);
console.log(
  "Wrote target-rig Social_Wave",
  fs.statSync("apps/web/src/social-wave.json").size,
  "bytes",
);
