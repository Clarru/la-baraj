/** Freeze only additive hat QA files; canonical clothing remains baseline-owned. */
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
const root = path.resolve(import.meta.dirname, ".."),
  build = path.join(root, ".impeccable/review/female-coverage/build");
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
  base: "d4643f85a209c5f6a2bff8e1a4b75ce27dedf031",
  source: root,
  build,
  entries: ["__female-coverage-qa.html", "__female-coverage-game-qa.html"],
  isolation:
    "One changed GLB use content-named /assets/female-coverage-qa/ URLs through a QA-only catalogue alias. Production catalogue selection is reused. All other clothing/hats and canonical GLB URLs are reused unchanged.",
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
      relative.startsWith("assets/female-coverage-qa/") ||
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
  if (/^assets\/female-coverage-qa-.*\.js$/.test(relative))
    packet.workers.push(relative);
}
if (packet.workers.length === 0) throw Error("Missing isolated QA worker");
const privateAssets = packet.payload.filter((a) =>
  a.path.startsWith("assets/female-coverage-qa/"),
);
if (privateAssets.length !== 1)
  throw Error("Expected exactly one isolated female GLB");
const excluded = new Set(
  ["manifest.json", "female-brunette-tailored.glb"].map(
    (p) => "assets/avatars/wardrobe/" + p,
  ),
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
if (!js.includes("/assets/female-coverage-qa/"))
  throw Error("QA asset URL isolation missing from bundle");
packet.disk = {
  free: (await fs.statfs(root)).bavail * (await fs.statfs(root)).bsize,
  reserve: 4 * 1024 ** 3,
  publicationRequired: packet.bytes + 128 * 1024 ** 2,
};
await fs.writeFile(
  path.join(root, ".impeccable/review/female-coverage/packet.json"),
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
