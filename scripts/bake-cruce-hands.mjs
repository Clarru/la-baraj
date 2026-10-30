/** Author finger articulation on the shipped rig, starting from the source open hand. */
import fs from "node:fs";
import crypto from "node:crypto";
import * as T from "three";
import { loadRig } from "./extract-activity-clips.mjs";
import { solveTwoBoneIK } from "../apps/web/src/limb-ik.ts";
const sourcePath = process.argv[2] ?? "assets/character-source/human_male.glb";
const targetPath = "apps/web/public/assets/optimized/Lakeside_Man.glb";
const source = await loadRig(sourcePath),
  target = await loadRig(targetPath);
const mixer = new T.AnimationMixer(source.scene);
const clip = source.animations.find((c) => c.name === "A_TPose");
if (!clip) throw Error("Missing authored open hand");
mixer.clipAction(clip).play();
mixer.setTime(0);
const names = ["l", "r"].flatMap((side) =>
  ["index", "middle", "ring", "pinky", "thumb"].flatMap((f) =>
    ["01", "02", "03"].map((j) => `${f}_${j}_${side}`),
  ),
);
const open = new Map(
  names.map((n) => [n, source.scene.getObjectByName(n).quaternion.clone()]),
);
const poses = {};
for (const mode of ["rest", "pinch"]) {
  for (const n of names)
    target.scene.getObjectByName(n).quaternion.copy(open.get(n));
  for (const side of ["l", "r"]) {
    for (const f of ["index", "middle", "ring", "pinky"]) {
      const curls =
        mode === "rest"
          ? [0.045, f === "ring" ? 0.18 : f === "middle" ? 0.145 : 0.12, 0.06]
          : {
              index: [0.15, 0.28, 0.12],
              middle: [0.14, 0.25, 0.12],
              ring: [0.18, 0.28, 0.14],
              pinky: [0.2, 0.3, 0.15],
            }[f];
      ["01", "02", "03"].forEach((j, i) =>
        target.scene
          .getObjectByName(`${f}_${j}_${side}`)
          .quaternion.multiply(
            new T.Quaternion().setFromAxisAngle(
              new T.Vector3(1, 0, 0),
              curls[i],
            ),
          ),
      );
    }
    target.scene.updateMatrixWorld(true);
    if (mode === "pinch") {
      const hand = target.scene.getObjectByName(`hand_${side}`),
        sign = side === "l" ? 1 : -1;
      const goal = hand.localToWorld(new T.Vector3(sign * 0.046, 0.123, 0.025));
      const pole = hand.localToWorld(new T.Vector3(sign * 0.09, 0.07, 0.085));
      solveTwoBoneIK(
        target.scene.getObjectByName(`thumb_01_${side}`),
        target.scene.getObjectByName(`thumb_02_${side}`),
        target.scene.getObjectByName(`thumb_04_leaf_${side}`),
        goal,
        pole,
      );
    }
  }
  poses[mode] = Object.fromEntries(
    names.map((n) => [n, target.scene.getObjectByName(n).quaternion.toArray()]),
  );
}
fs.writeFileSync(
  "apps/web/src/cruce-hand-poses.json",
  JSON.stringify({
    source:
      "human_male.glb A_TPose; bounded relaxed finger curl and thumb contact authored on retained rig",
    targetSha256: crypto
      .createHash("sha256")
      .update(fs.readFileSync(targetPath))
      .digest("hex"),
    poses,
  }) + "\n",
);
