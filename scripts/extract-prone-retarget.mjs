import { build } from "esbuild";
import { mkdir, unlink, writeFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import * as THREE from "three";
import { loadRig } from "./extract-activity-clips.mjs";

const sourcePath = process.argv[2] ?? "assets/character-source/human_male.glb";
const targetPath =
  process.argv[3] ?? "apps/web/public/assets/optimized/Lakeside_Man.glb";
const outPath = resolve("assets/character-source/prone-retarget.json");
const tempModule = resolve(".tmp-prone-retarget-extract.mjs");
await build({
  entryPoints: [resolve("scripts/prone-retarget.ts")],
  bundle: true,
  write: true,
  outfile: tempModule,
  format: "esm",
  platform: "node",
  target: "es2022",
  external: ["three"],
});
const { createBellyProneClip, createBellyProneCrawlClip } = await import(
  `${pathToFileURL(tempModule).href}?t=${Date.now()}`
);
await unlink(tempModule);
const source = await loadRig(sourcePath);
const target = await loadRig(targetPath);
const layToIdle = source.animations.find((clip) => clip.name === "LayToIdle");
if (!layToIdle) throw new Error("LayToIdle was not found in the source rig");
const idle = createBellyProneClip(target.scene, layToIdle, {
  sampleTime: 0,
  groundLift: 0.46,
});
const crawl = createBellyProneCrawlClip(target.scene, idle, 2);
await mkdir(resolve("assets/character-source"), { recursive: true });
await writeFile(
  outPath,
  JSON.stringify(
    {
      source: "human_male.glb",
      sourceClip: "LayToIdle@0",
      target: "Lakeside_Man.glb",
      targetSha256: createHash("sha256")
        .update(await readFile(targetPath))
        .digest("hex"),
      roll: "180deg around sampled world longitudinal axis, converted into root parent space",
      groundLift: 0.46,
      clips: [
        THREE.AnimationClip.toJSON(idle),
        THREE.AnimationClip.toJSON(crawl),
      ],
    },
    (_, value) =>
      typeof value === "number" ? Math.round(value * 1e6) / 1e6 : value,
  ),
);
console.log(outPath);

const baked = JSON.parse(await readFile(outPath, "utf8"));
const runtimePath = "apps/web/public/assets/animations/character-actions.json";
const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
const clips = baked.clips.map((clip) => ({
  ...clip,
  name: clip.name.replace("Prone_Belly_", "Prone_"),
}));
const names = new Set(clips.map((clip) => clip.name));
runtime.clips = [
  ...runtime.clips.filter((clip) => !names.has(clip.name)),
  ...clips,
];
await writeFile(runtimePath, JSON.stringify(runtime));
