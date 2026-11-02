/** Freeze only additive clothing QA files; all canonical shared paths remain baseline-owned. */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, ".."),
  build = path.join(root, ".impeccable/review/clothing-fit/build");
const git = (...args) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
if (git("status", "--porcelain"))
  throw Error("Freeze requires a clean committed source tree");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const safe = (p) =>
  !p.startsWith("/") &&
  !p.split("/").includes("..") &&
  /^[a-zA-Z0-9_./-]+$/.test(p);
const packet = {
  schemaVersion: 1,
  head: git("rev-parse", "HEAD"),
  base: "580db17be6692edaff36c9498c0f0eda9e896bc6",
  source: root,
  build,
  entries: ["__clothing-fit-qa.html", "__clothing-fit-game-qa.html"],
  isolation:
    "Five changed GLBs use content-named /assets/clothing-fit-qa/ URLs through a QA-only catalogue alias. Production catalogue selection is reused. All other clothing/hats and canonical GLB URLs are reused unchanged.",
  payload: [],
  sharedDependencies: [],
  workers: [],
  bytes: 0,
};
const files = [...packet.entries];
async function generated(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await generated(full);
      continue;
    }
    const relative = path.relative(build, full);
    if (
      relative.startsWith("assets/clothing-fit-qa/") ||
      /\.(js|css)$/.test(e.name)
    )
      files.push(relative);
  }
}
await generated(path.join(build, "assets"));
for (const relative of [...new Set(files)].sort()) {
  if (!safe(relative)) throw Error("Unsafe payload path: " + relative);
  const body = await fs.readFile(path.join(build, relative));
  packet.payload.push({
    path: relative,
    bytes: body.length,
    sha256: sha(body),
  });
  packet.bytes += body.length;
  if (/^assets\/clothing-fit-qa-.*\.js$/.test(relative))
    packet.workers.push(relative);
}
if (packet.workers.length === 0) throw Error("Missing isolated QA worker");
const privateAssets = packet.payload.filter((a) =>
  a.path.startsWith("assets/clothing-fit-qa/") && a.path.endsWith(".glb"),
);
if (privateAssets.length !== 5)
  throw Error("Expected exactly five isolated clothing GLBs");
const excluded = new Set(
  [
    "manifest.json",
    "ATTRIBUTION.md",
    "female-brunette-tailored.glb",
    "male-custom-top-skin.glb",
    "top-trail-overshirt.glb",
    "top-weekend-knit.glb",
    "shoes-canvas-low.glb",
  ].map((p) => "assets/avatars/wardrobe/" + p),
);
async function dependencies(dir) {
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith(".")) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      await dependencies(full);
      continue;
    }
    const relative = path.relative(path.join(root, "apps/web/public"), full);
    if (excluded.has(relative)) continue;
    const body = await fs.readFile(full);
    const baseline = execFileSync(
      "git",
      ["show", packet.base + ":apps/web/public/" + relative],
      { cwd: root, maxBuffer: 32 * 1024 * 1024 },
    );
    if (sha(body) !== sha(baseline))
      throw Error("Shared dependency changed: " + relative);
    packet.sharedDependencies.push({
      path: relative,
      bytes: body.length,
      sha256: sha(body),
      publication: "Reuse baseline; never copy or replace",
    });
  }
}
await dependencies(path.join(root, "apps/web/public"));
const js = (
  await Promise.all(
    packet.payload
      .filter((f) => f.path.endsWith(".js"))
      .map((f) => fs.readFile(path.join(build, f.path), "utf8")),
  )
).join("\n");
if (!js.includes("/assets/clothing-fit-qa/"))
  throw Error("QA asset URL isolation missing from bundle");
packet.disk = {
  free: (await fs.statfs(root)).bavail * (await fs.statfs(root)).bsize,
  reserve: 4 * 1024 ** 3,
  publicationRequired: packet.bytes + 128 * 1024 ** 2,
};
await fs.writeFile(
  path.join(root, ".impeccable/review/clothing-fit/packet.json"),
  JSON.stringify(packet, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    head: packet.head,
    files: packet.payload.length,
    bytes: packet.bytes,
    workers: packet.workers,
    sharedDependencies: packet.sharedDependencies.length,
  }),
);
