/** Extract compatible authored action clips, without shipping the 35 MB source model. */
import fs from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import { createSeatScootClips } from "./seat-scoot-clips.mjs";
import { createFireLightingClip } from "./fire-lighting-clip.mjs";

export async function loadRig(path) {
  const bytes = fs.readFileSync(path);
  const size = bytes.readUInt32LE(12);
  const doc = JSON.parse(bytes.subarray(20, 20 + size));
  doc.materials = [];
  doc.textures = [];
  doc.images = [];
  doc.extensionsRequired = [];
  for (const mesh of doc.meshes)
    for (const primitive of mesh.primitives) delete primitive.material;
  const json = Buffer.from(JSON.stringify(doc));
  const data = Buffer.concat([
    json,
    Buffer.alloc((4 - (json.length % 4)) % 4, 32),
  ]);
  const binary = bytes.subarray(20 + size);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + data.length + binary.length, 8);
  header.writeUInt32LE(data.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const glb = Buffer.concat([header, data, binary]);
  return new GLTFLoader().parseAsync(
    glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength),
    "",
  );
}

async function main() {
  const source = await loadRig("assets/character-source/human_male.glb");
  const wanted = {
    Sitting_Enter: "Activity_SitDown",
    Sitting_Idle_Loop: "Activity_Sit",
    Sitting_Exit: "Activity_StandUp",
    OverhandThrow: "Activity_Cast",
    Pistol_Aim_Neutral: "Activity_HoldRod",
    PickUp_Table: "Activity_Catch",
  };
  const clips = source.animations
    .filter((clip) => wanted[clip.name])
    .map((clip) => {
      const result = clip.clone();
      result.name = wanted[clip.name];
      // Imported translation / scale tracks are bind constants except pelvis/root.
      // Preserve those moving roots and every quaternion, including authored fingers.
      result.tracks = result.tracks.filter(
        (track) =>
          track.name.endsWith(".quaternion") ||
          /^(root|pelvis)\./.test(track.name),
      );
      result.optimize();
      return THREE.AnimationClip.toJSON(result);
    });
  const sitting = source.animations.find(
    (clip) => clip.name === "Sitting_Idle_Loop",
  );
  const scoots = createSeatScootClips(source.scene, sitting);
  // Match the six retained clips' compatible track set and serialization.
  for (const clip of scoots) {
    clip.tracks = clip.tracks.filter(
      (track) =>
        track.name.endsWith(".quaternion") ||
        /^(root|pelvis)\./.test(track.name),
    );
    clips.push(THREE.AnimationClip.toJSON(clip));
  }
  clips.push(
    THREE.AnimationClip.toJSON(
      createFireLightingClip(
        source.scene,
        source.animations.find((clip) => clip.name === "Fixing_Kneeling"),
        source.animations.find((clip) => clip.name === "Idle_Loop"),
      ),
    ),
  );
  fs.mkdirSync("apps/web/public/assets/animations", { recursive: true });
  const serialized = JSON.stringify(
    { source: "human_male.glb", clips },
    (_, value) =>
      typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value,
  );
  fs.writeFileSync(
    "apps/web/public/assets/animations/character-actions.json",
    serialized,
  );
  console.log(
    clips.map((clip) => ({
      name: clip.name,
      duration: clip.duration,
      tracks: clip.tracks.length,
    })),
  );
  console.log(`${serialized.length} bytes`);
}
if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? ""))
  await main();
