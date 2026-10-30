/** Record actual deformed support patches, excluding feet/thumbs and unrelated minima. */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { build } from "esbuild";
import * as T from "three";
import { loadRig } from "./extract-activity-clips.mjs";
import {
  CRUCE_TABLE,
  cruceSeatPose,
} from "../packages/shared/cruce-station.ts";
const out = ".impeccable/review/cruce-hands";
await fs.mkdir(out, { recursive: true });
const runtime = path.resolve(out, "measure-runtime.mjs");
await build({
  entryPoints: ["apps/web/src/cruce-character.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["three"],
  outfile: runtime,
  logLevel: "silent",
});
const { createCruceCharacterRig } = await import(runtime + "?measure");
const rigPath = "apps/web/public/assets/optimized/Lakeside_Man.glb";
const { scene } = await loadRig(rigPath),
  actions = JSON.parse(
    await fs.readFile(
      "apps/web/public/assets/animations/character-actions.json",
      "utf8",
    ),
  );
const mixer = new T.AnimationMixer(scene);
mixer
  .clipAction(
    T.AnimationClip.parse(actions.clips.find((c) => c.name === "Activity_Sit")),
  )
  .play();
mixer.setTime(0.4);
const pose = cruceSeatPose(0);
scene.position.fromArray(pose.position);
scene.rotation.y = pose.yaw;
const rig = createCruceCharacterRig(scene);
rig.update(
  {
    round: 1,
    you: 0,
    hand: [0, 1, 2, 3, 4, 5],
    handCounts: [6, 6, 6, 6],
    trick: [],
  },
  0,
  1000,
);
scene.updateMatrixWorld(true);
const mesh = scene.getObjectByName("Male_Peasant_Legs");
mesh.skeleton.update();
const point = (m, i) =>
  m.getVertexPosition(i, new T.Vector3()).applyMatrix4(m.matrixWorld);
function patch(points) {
  points.sort((a, b) => a.position[1] - b.position[1]);
  const seen = new Set();
  return points
    .filter((p) => {
      const key = p.position.map((v) => v.toFixed(5)).join(":");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}
const hips = { left: [], right: [] };
for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
  const world = point(mesh, i),
    local = scene.worldToLocal(world.clone());
  if (
    Math.abs(local.x) < 0.065 ||
    Math.abs(local.x) > 0.19 ||
    local.z < -0.36 ||
    local.z > -0.28 ||
    local.y < 0.35 ||
    local.y > 0.55
  )
    continue;
  hips[local.x > 0 ? "left" : "right"].push({
    index: i,
    position: world.toArray(),
  });
}
const hand = scene.getObjectByName("Male_Peasant_Arms_2");
hand.skeleton.update();
const si = hand.geometry.attributes.skinIndex,
  sw = hand.geometry.attributes.skinWeight;
const digits = {};
for (const digit of ["index", "middle", "ring"]) {
  const bone = hand.skeleton.bones.findIndex((b) => b.name === `${digit}_03_r`),
    points = [];
  for (let i = 0; i < si.count; i++) {
    let weight = 0;
    for (const component of ["X", "Y", "Z", "W"])
      if (si["get" + component](i) === bone) weight += sw["get" + component](i);
    if (weight < 0.4) continue;
    const v = point(hand, i);
    if (
      Math.abs(v.x - CRUCE_TABLE.x) > CRUCE_TABLE.halfWidth ||
      Math.abs(v.z - CRUCE_TABLE.z) > CRUCE_TABLE.halfWidth
    )
      continue;
    points.push({ index: i, position: v.toArray() });
  }
  if (!points.length) throw Error("No tabletop finger pad " + digit);
  digits[digit] = patch(points);
}
const thumbId = hand.skeleton.bones.findIndex((b) => b.name === "thumb_03_l"),
  thumb = [];
for (let i = 0; i < si.count; i++) {
  let weight = 0;
  for (const c of ["X", "Y", "Z", "W"])
    if (si["get" + c](i) === thumbId) weight += sw["get" + c](i);
  if (weight < 0.5) continue;
  const local = rig.fan.worldToLocal(point(hand, i));
  if (local.y > -0.008 && local.y < 0.04 && Math.abs(local.x) < 0.04)
    thumb.push({ index: i, position: local.toArray() });
}
thumb.sort((a, b) => Math.abs(a.position[2]) - Math.abs(b.position[2]));
const support = {
  targetSha256: crypto
    .createHash("sha256")
    .update(await fs.readFile(rigPath))
    .digest("hex"),
  source:
    "scripts/measure-cruce-contacts.mjs; actual retained skinned Activity_Sit plus Cruce hand pose",
  gripThumb: {
    mesh: hand.name,
    points: thumb.slice(0, 3),
    region:
      "Distal holding thumb in the card fan contact region; actual skin vertices",
  },
  hip: {
    mesh: mesh.name,
    regions:
      "Under left/right hip: abs(localX)0.065..0.19, localZ -0.36..-0.28; excludes global feet/cloth minima",
    left: patch(hips.left),
    right: patch(hips.right),
  },
  tableHand: {
    mesh: hand.name,
    regions:
      "Distal index/middle/ring pads with bone weight>=0.4, inside tabletop footprint; thumb excluded",
    digits,
  },
};
await fs.writeFile(
  "docs/art-direction/cruce/character-contact-probes.json",
  JSON.stringify(support, null, 2) + "\n",
);
console.log(
  "Hip gaps",
  Object.fromEntries(
    ["left", "right"].map((s) => [
      s,
      support.hip[s].map(
        (p) => p.position[1] - (CRUCE_TABLE.ground + CRUCE_TABLE.seatSurface),
      ),
    ]),
  ),
);
console.log(
  "Finger gaps",
  Object.fromEntries(
    Object.entries(digits).map(([s, points]) => [
      s,
      points.map(
        (p) => p.position[1] - (CRUCE_TABLE.ground + CRUCE_TABLE.woodSurface),
      ),
    ]),
  ),
);
rig.dispose();
await fs.unlink(runtime);
