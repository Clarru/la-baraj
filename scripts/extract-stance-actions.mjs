/** Add compatible crouch clips without replacing the established activity library. */
import fs from "node:fs";
import * as THREE from "three";
import { loadRig } from "./extract-activity-clips.mjs";

const input = process.argv[2] ?? "assets/character-source/human_male.glb";
const output = "apps/web/public/assets/animations/character-actions.json";
const library = JSON.parse(fs.readFileSync(output, "utf8"));
const source = await loadRig(input);
const wanted = {
  Crouch_Idle_Loop: "Crouch_Idle",
  Crouch_Fwd_Loop: "Crouch_Walk",
};
const names = new Set(Object.values(wanted));
const extracted = Object.entries(wanted).map(([name, target]) => {
  const original = source.animations.find((clip) => clip.name === name);
  if (!original) throw new Error(`Missing source clip ${name}`);
  const clip = original.clone();
  clip.name = target;
  clip.tracks = clip.tracks.filter(
    (track) =>
      track.name.endsWith(".quaternion") || /^(root|pelvis)\./.test(track.name),
  );
  clip.optimize();
  return THREE.AnimationClip.toJSON(clip);
});
library.clips = [
  ...library.clips.filter((clip) => !names.has(clip.name)),
  ...extracted,
];
fs.writeFileSync(
  output,
  JSON.stringify(library, (_, value) =>
    typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value,
  ),
);
console.log(
  extracted.map((clip) => ({
    name: clip.name,
    duration: clip.duration,
    tracks: clip.tracks.length,
  })),
);
