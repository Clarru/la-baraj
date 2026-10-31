import { test, after } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Document, NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS, EXTTextureWebP } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import sharp from "sharp";
import { projectReport } from "../report.mjs";
import {
  ROOT,
  TOOL,
  profile,
  validateSpec,
  initProject,
  loadProject,
  inputFingerprint,
  lintModel,
  writeJson,
  fileHash,
  artifactDigest,
  checkProject,
  reviewProject,
  packProject,
  run,
  imagegenRequest,
} from "../core.mjs";
const execute = promisify(execFile),
  base = await fs.mkdtemp(path.join(os.tmpdir(), "asset-forge-unit-"));
after(() => fs.rm(base, { recursive: true, force: true }));
await MeshoptDecoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ "meshopt.decoder": MeshoptDecoder });
const golden = await io.read(
  path.join(ROOT, "experiments/asset-skill-lab/crate/final/Lab_Crate.glb"),
);
const sourceMaterial = golden.getRoot().listMaterials()[0],
  style = await profile();
async function cube(
  file,
  { missingNormal = false, badUV = false, unknownMaterial = false } = {},
) {
  const d = new Document();
  d.createExtension(EXTTextureWebP).setRequired(true);
  const buffer = d.createBuffer();
  const pos = [],
    normals = [],
    uv = [],
    indices = [];
  const faces = [
    [
      [0, 0, 1],
      [
        [-0.5, 0, 0.5],
        [0.5, 0, 0.5],
        [0.5, 1, 0.5],
        [-0.5, 1, 0.5],
      ],
    ],
    [
      [0, 0, -1],
      [
        [0.5, 0, -0.5],
        [-0.5, 0, -0.5],
        [-0.5, 1, -0.5],
        [0.5, 1, -0.5],
      ],
    ],
    [
      [1, 0, 0],
      [
        [0.5, 0, 0.5],
        [0.5, 0, -0.5],
        [0.5, 1, -0.5],
        [0.5, 1, 0.5],
      ],
    ],
    [
      [-1, 0, 0],
      [
        [-0.5, 0, -0.5],
        [-0.5, 0, 0.5],
        [-0.5, 1, 0.5],
        [-0.5, 1, -0.5],
      ],
    ],
    [
      [0, 1, 0],
      [
        [-0.5, 1, 0.5],
        [0.5, 1, 0.5],
        [0.5, 1, -0.5],
        [-0.5, 1, -0.5],
      ],
    ],
    [
      [0, -1, 0],
      [
        [-0.5, 0, -0.5],
        [0.5, 0, -0.5],
        [0.5, 0, 0.5],
        [-0.5, 0, 0.5],
      ],
    ],
  ];
  for (const [normal, vertices] of faces) {
    const start = pos.length / 3;
    for (const v of vertices) {
      pos.push(...v);
      normals.push(...normal);
    }
    uv.push(badUV ? 0 : 0.51, 0.01, 0.74, 0.01, 0.74, 0.99, 0.51, 0.99);
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3);
  }
  const accessor = (type, array) =>
    d.createAccessor().setType(type).setArray(array).setBuffer(buffer);
  const m = d
    .createMaterial(unknownMaterial ? "Mystery plastic" : "LaBaraj timber")
    .setBaseColorFactor([0.8, 0.8, 0.8, 1])
    .setMetallicFactor(1)
    .setRoughnessFactor(1);
  const texture = (t) =>
    d
      .createTexture(t.getName())
      .setImage(t.getImage())
      .setMimeType(t.getMimeType());
  m.setBaseColorTexture(texture(sourceMaterial.getBaseColorTexture()));
  if (!missingNormal)
    m.setNormalTexture(texture(sourceMaterial.getNormalTexture()));
  m.setMetallicRoughnessTexture(
    texture(sourceMaterial.getMetallicRoughnessTexture()),
  );
  const primitive = d
    .createPrimitive()
    .setAttribute("POSITION", accessor("VEC3", new Float32Array(pos)))
    .setAttribute("NORMAL", accessor("VEC3", new Float32Array(normals)))
    .setAttribute("TEXCOORD_0", accessor("VEC2", new Float32Array(uv)))
    .setIndices(accessor("SCALAR", new Uint16Array(indices)))
    .setMaterial(m);
  const scene = d
    .createScene()
    .addChild(d.createNode().setMesh(d.createMesh().addPrimitive(primitive)));
  d.getRoot().setDefaultScene(scene);
  await io.write(file, d);
}
async function fixture() {
  const dir = path.join(base, "job-" + randomUUID());
  const initialized = await initProject(dir, "custom");
  initialized.spec.dimensions = [1, 1, 1];
  await writeJson(path.join(dir, "asset.json"), initialized.spec);
  const p = await loadProject(dir),
    fingerprint = await inputFingerprint(p),
    name = "run-" + randomUUID(),
    out = path.join(dir, ".forge", name);
  await fs.mkdir(out, { recursive: true });
  await cube(path.join(out, "model.glb"));
  const sockets = { sockets: {} };
  await writeJson(path.join(out, "sockets.json"), sockets);
  await fs.writeFile(
    path.join(out, "source.blend"),
    "unit fixture; actual Blender is exercised separately",
  );
  for (const [folder, views] of [
    [
      "qa",
      [
        "front",
        "side",
        "rear",
        "three-quarter",
        "diagnostic-clay",
        "diagnostic-unlit",
      ],
    ],
    ["qa-light-90", ["three-quarter"]],
  ]) {
    await fs.mkdir(path.join(out, folder));
    for (const view of views)
      await sharp({
        create: { width: 512, height: 512, channels: 4, background: "#777777" },
      })
        .png()
        .toFile(path.join(out, folder, view + ".png"));
  }
  const report = await lintModel(
    path.join(out, "model.glb"),
    p.spec,
    p.style,
    sockets,
  );
  assert.equal(report.technicalPass, true, report.errors.join(";"));
  await writeJson(path.join(out, "validation.json"), report);
  const manifest = {
    version: 1,
    id: p.spec.id,
    style: p.style.id,
    styleVersion: p.style.version,
    units: "metres",
    up: "+Y",
    forward: "+Z",
    pivot: "floor-center",
    inputHash: fingerprint.hash,
    modelHash: await fileHash(path.join(out, "model.glb")),
    report,
    resolution: 512,
    draft: false,
    collision: { type: "none" },
    lods: [],
  };
  await writeJson(path.join(out, "manifest.json"), manifest);
  await writeJson(path.join(dir, ".forge/current.json"), {
    run: name,
    artifactHash: await artifactDigest(out),
  });
  return { dir, out, p, report, manifest };
}
test("schema rejects accidental unknown fields, invalid dimensions, budget increases and invalid seed", async () => {
  const f = await fixture();
  for (const change of [
    { oops: true },
    { dimensions: [1, 0, 1] },
    { budgets: { ...f.p.spec.budgets, bytes: 9999999 } },
    { seed: -1 },
    { requiredJoints: undefined },
    { requiredJoints: ["Same", "Same"] },
  ])
    assert.throws(() => validateSpec({ ...f.p.spec, ...change }, style));
});
test("init never overwrites a directory or puts authoring jobs in public game assets", async () => {
  const dir = path.join(base, "existing");
  await fs.mkdir(dir);
  await fs.writeFile(path.join(dir, "keep"), "preserved");
  await assert.rejects(initProject(dir, "crate"));
  assert.equal(await fs.readFile(path.join(dir, "keep"), "utf8"), "preserved");
  await assert.rejects(
    initProject(path.join(ROOT, "apps/web/public/assets/blocked-job"), "crate"),
  );
});
test("a valid model is checked from actual GLB data and physical file size", async () => {
  const f = await fixture();
  const report = (await checkProject(f.dir)).report;
  assert.equal(report.triangles, 12);
  assert.deepEqual(report.dimensions, [1, 1, 1]);
  assert.equal(
    report.bytes,
    (await fs.stat(path.join(f.out, "model.glb"))).size,
  );
});
test("lint rejects dropped normal maps and material strip leakage", async () => {
  const f = await fixture();
  for (const [name, options, message] of [
    ["no-normal", { missingNormal: true }, "normal atlas"],
    ["uv", { badUV: true }, "UV crosses"],
  ]) {
    const file = path.join(base, name + ".glb");
    await cube(file, options);
    const r = await lintModel(file, f.p.spec, style);
    assert.equal(r.technicalPass, false);
    assert(
      r.errors.some((e) => e.includes(message)),
      r.errors.join(";"),
    );
  }
});
test("lint rejects unapproved materials, wrong dimensions and actual byte/triangle overruns", async () => {
  const f = await fixture(),
    file = path.join(base, "unknown.glb");
  await cube(file, { unknownMaterial: true });
  assert.equal((await lintModel(file, f.p.spec, style)).technicalPass, false);
  const r = await lintModel(
    path.join(f.out, "model.glb"),
    {
      ...f.p.spec,
      dimensions: [2, 1, 1],
      budgets: { ...f.p.spec.budgets, triangles: 1, bytes: 1 },
    },
    style,
  );
  assert(r.errors.some((e) => e.includes("Dimensions")));
  assert(r.errors.includes("triangles budget exceeded"));
  assert(r.errors.includes("bytes budget exceeded"));
});
test("lint requires declared sockets with finite coordinates", async () => {
  const f = await fixture();
  const r = await lintModel(
    path.join(f.out, "model.glb"),
    { ...f.p.spec, requiredSockets: ["Grip"] },
    style,
    { sockets: { Bad: [NaN, 1, 0] } },
  );
  assert(r.errors.includes("Missing socket Grip"));
  assert(r.errors.includes("Invalid socket Bad"));
});
test("brief/recipe edits invalidate an old build, while JSON key order alone does not", async () => {
  const f = await fixture();
  const reversed = Object.fromEntries(Object.entries(f.p.spec).reverse());
  await writeJson(path.join(f.dir, "asset.json"), reversed);
  await checkProject(f.dir);
  await fs.appendFile(path.join(f.dir, "recipe.py"), "\n# revised geometry\n");
  await assert.rejects(checkProject(f.dir), (e) => e.code === "stale-build");
});
test("changed model or QA image cannot retain a reviewable build", async () => {
  for (const name of ["model.glb", "qa/front.png"]) {
    const f = await fixture();
    await fs.appendFile(path.join(f.out, name), "changed");
    await assert.rejects(checkProject(f.dir), (e) => e.code === "stale-build");
  }
});
test("pack refuses a missing review and review requires concrete notes", async () => {
  const f = await fixture();
  await assert.rejects(
    packProject(f.dir, path.join(base, "unreviewed")),
    (e) => e.code === "review-required",
  );
  await assert.rejects(reviewProject(f.dir, "ok"));
});
test("current reviewed assets package with truthful runtime metadata and no local input paths", async () => {
  const f = await fixture();
  await reviewProject(
    f.dir,
    "Unit protocol check; visual fixture is intentionally synthetic.",
  );
  assert.equal((await checkProject(f.dir)).reviewStatus, "accepted");
  const target = path.join(base, "package-" + randomUUID());
  await packProject(f.dir, target);
  const manifest = JSON.parse(
    await fs.readFile(path.join(target, "manifest.json"), "utf8"),
  );
  assert.equal(
    manifest.modelHash,
    await fileHash(path.join(target, "model.glb")),
  );
  assert.equal(manifest.report.triangles, 12);
  assert.equal(manifest.inputs, undefined);
  assert.equal(manifest.gameIntegrationReviewRequired, true);
  await assert.rejects(packProject(f.dir, target));
});
test("changing metadata after a review is detected before pack", async () => {
  const f = await fixture();
  await reviewProject(
    f.dir,
    "Protocol fixture review for stale metadata test.",
  );
  await writeJson(path.join(f.out, "manifest.json"), {
    ...f.manifest,
    report: { ...f.report, triangles: 1 },
  });
  await assert.rejects(
    packProject(f.dir, path.join(base, "stale")),
    (e) => e.code === "stale-build",
  );
});
test("draft records cannot be approved even if the images are full resolution", async () => {
  const f = await fixture();
  f.manifest.draft = true;
  f.manifest.resolution = 256;
  await writeJson(path.join(f.out, "manifest.json"), f.manifest);
  await writeJson(path.join(f.dir, ".forge/current.json"), {
    run: path.basename(f.out),
    artifactHash: await artifactDigest(f.out),
  });
  await assert.rejects(
    reviewProject(f.dir, "Do not approve this draft fixture."),
  );
});
test("runner propagates child failures and CLI provides structured failures", async () => {
  await assert.rejects(
    run(
      process.execPath,
      ["-e", "process.exit(7)"],
      path.join(base, "failure.log"),
    ),
    (e) => e.code === "process-failed",
  );
  try {
    await execute(process.execPath, [
      path.join(TOOL, "cli.mjs"),
      "unknown",
      "somewhere",
    ]);
  } catch (e) {
    assert.equal(e.code, 2);
    assert.equal(JSON.parse(e.stderr).error.code, "invalid-input");
    return;
  }
  assert.fail("CLI should reject unknown command");
});

test("concurrent init reserves exactly one authoring directory", async () => {
  const target = path.join(base, "same-job");
  const results = await Promise.allSettled([
    initProject(target, "crate"),
    initProject(target, "crate"),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    JSON.parse(await fs.readFile(path.join(target, "asset.json"))).recipe,
    "crate",
  );
});
test("concurrent packs cannot replace an existing destination", async () => {
  const f = await fixture();
  await reviewProject(
    f.dir,
    "Synthetic protocol fixture for concurrent packaging.",
  );
  const target = path.join(base, "same-pack"),
    r = await Promise.allSettled([
      packProject(f.dir, target),
      packProject(f.dir, target),
    ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    await fileHash(path.join(target, "model.glb")),
    f.manifest.modelHash,
  );
});
test("unchanged builds reuse checked artifacts before starting Blender geometry or renders", async () => {
  const f = await fixture(),
    fake = path.join(base, "fake-blender");
  await fs.writeFile(fake, '#!/bin/sh\nprintf "Blender cache-fixture\\n"\n', {
    mode: 0o755,
  });
  f.manifest.blenderVersion = "Blender cache-fixture";
  f.manifest.nodeVersion = process.version;
  await writeJson(path.join(f.out, "manifest.json"), f.manifest);
  await writeJson(path.join(f.dir, ".forge/current.json"), {
    run: path.basename(f.out),
    artifactHash: await artifactDigest(f.out),
  });
  const { buildProject } = await import("../core.mjs");
  const result = await buildProject(f.dir, { blender: fake });
  assert.equal(result.cached, true);
  assert.equal(result.directory, await fs.realpath(f.out));
  assert.equal(
    (await fs.readdir(path.join(f.dir, ".forge"))).filter((x) =>
      x.startsWith("run-"),
    ).length,
    1,
  );
});

test("golden recipes reject silently ignored shape parameters", async () => {
  const dir = path.join(base, "fixed-recipe");
  const r = await initProject(dir, "crate");
  assert.throws(
    () => validateSpec({ ...r.spec, parameters: { width: 4 } }, style),
    /fixed geometry/,
  );
});

test("different original item briefs retain exactly the same ordered style images and template", async () => {
  const requests = [];
  for (const [id, brief] of [
    ["radio", "Timber field radio with a speaker and knobs."],
    ["tackle", "Timber fishing tackle box with divided compartments."],
  ]) {
    const dir = path.join(base, id);
    await initProject(dir, "custom");
    assert.equal((await imagegenRequest(dir)).readyForGeneration, false);
    await fs.writeFile(path.join(dir, "brief.md"), brief);
    requests.push(await imagegenRequest(dir));
  }
  assert(requests.every((r) => r.readyForGeneration));
  assert.equal(requests[0].fixedTemplateHash, requests[1].fixedTemplateHash);
  assert.deepEqual(requests[0].referenceImages, requests[1].referenceImages);
  assert.equal(requests[0].referenceImages.length, 3);
  assert.notEqual(requests[0].prompt, requests[1].prompt);
  for (const image of requests[0].referenceImages)
    assert.equal(await fileHash(image.path), image.sha256);
});

test("selected concepts and their exact generation records invalidate earlier builds", async () => {
  for (const name of ["concept.png", "concept-request.json"]) {
    const f = await fixture();
    await fs.writeFile(path.join(f.dir, name), "new design reference");
    await assert.rejects(checkProject(f.dir), (e) => e.code === "stale-build");
  }
});

test("a visually rejected technically valid build cannot be packaged", async () => {
  const f = await fixture();
  const review = await reviewProject(
    f.dir,
    "Reject: wrong proportions despite passing size limits.",
    false,
  );
  assert.equal(review.status, "rejected");
  assert.equal((await checkProject(f.dir)).reviewStatus, "rejected");
  await assert.rejects(
    packProject(f.dir, path.join(base, "rejected-package")),
    (e) => e.code === "review-rejected",
  );
});

test("diagnostic renders are required and cannot be changed after review", async () => {
  const f = await fixture();
  await reviewProject(f.dir, "Synthetic diagnostic artifact binding check.");
  await fs.unlink(path.join(f.out, "qa/diagnostic-clay.png"));
  await assert.rejects(checkProject(f.dir), (e) => e.code === "stale-build");
});

test("surface depth probes distinguish opaque faces from open gaps and reject absent probes", async () => {
  const f = await fixture();
  const probeStyle = structuredClone(style);
  probeStyle.recipes.custom.surfaceProbeCount = 1;
  const probe = {
    name: "FrontJoint",
    origin: [0, 0.5, 0.51],
    direction: [0, 0, -1],
    maxDistance: 0.02,
  };
  const check = (probes) =>
    lintModel(path.join(f.out, "model.glb"), f.p.spec, probeStyle, {
      sockets: {},
      surfaceProbes: probes,
    });
  assert.equal((await check([probe])).technicalPass, true);
  const gap = await check([{ ...probe, origin: [2, 0.5, 0.51] }]);
  assert.equal(gap.technicalPass, false);
  assert.equal(gap.surfaceResults[0].pass, false);
  assert(
    (await check([])).errors.includes(
      "Required sealed-surface probes missing.",
    ),
  );
  assert(
    (await check([{ ...probe, direction: [0, 0, 0] }])).errors.includes(
      "Invalid probe direction.",
    ),
  );
});

test("declared assembly joints cannot be omitted from export metadata", async () => {
  const f = await fixture();
  const result = await lintModel(
    path.join(f.out, "model.glb"),
    { ...f.p.spec, requiredJoints: ["LidCorner"] },
    style,
    { sockets: {} },
  );
  assert.equal(result.technicalPass, false);
  assert(
    result.errors.includes("Missing three-direction joint contract: LidCorner"),
  );
  assert.equal(result.jointResults.LidCorner.pass, false);
});

test("real radio regression: old disconnected fittings/housing fail; continuous export passes all 36 joint probes", async () => {
  const directory = path.join(TOOL, "proof/original-radio");
  const spec = JSON.parse(
    await fs.readFile(path.join(directory, "asset.json")),
  );
  const sockets = JSON.parse(
    await fs.readFile(path.join(directory, "sockets.json")),
  );
  const before = await lintModel(
    path.join(directory, "before-joints.glb"),
    spec,
    style,
    sockets,
  );
  assert.equal(before.technicalPass, false);
  assert.equal(before.surfaceResults.filter((p) => !p.pass).length, 36);
  const after = await lintModel(
    path.join(directory, "model.glb"),
    spec,
    style,
    sockets,
  );
  assert.equal(after.technicalPass, true, after.errors.join("; "));
  assert.equal(after.surfaceResults.length, 36);
  assert.equal(Object.keys(after.jointResults).length, 12);
  assert(Object.values(after.jointResults).every((j) => j.pass));
});

test("real crate regression: old open seams fail depth checks; recessed closed panels pass", async () => {
  const directory = path.join(TOOL, "proof/crate-seams");
  const spec = JSON.parse(
    await fs.readFile(path.join(directory, "asset.json")),
  );
  const sockets = JSON.parse(
    await fs.readFile(path.join(directory, "sockets.json")),
  );
  const before = await lintModel(
    path.join(TOOL, "proof/crate/model.glb"),
    spec,
    style,
    sockets,
  );
  assert.equal(before.technicalPass, false);
  assert.equal(before.surfaceResults.filter((p) => !p.pass).length, 24);
  const after = await lintModel(
    path.join(directory, "model.glb"),
    spec,
    style,
    sockets,
  );
  assert.equal(after.technicalPass, true, after.errors.join("; "));
  assert.equal(after.surfaceResults.length, 72);
});

test("report distinguishes current reviewed validity from historical failures and evidence", async () => {
  const f = await fixture();
  await reviewProject(
    f.dir,
    "Synthetic report fixture; no real visual quality claim.",
  );
  const failedRun = "run-" + randomUUID(),
    failed = path.join(f.dir, ".forge", failedRun);
  await fs.mkdir(failed);
  await writeJson(path.join(failed, "validation.json"), {
    technicalPass: false,
    errors: ["Dimensions differ"],
    triangles: 12,
    bytes: 400,
  });
  await fs.writeFile(path.join(failed, "build.log"), "retained stage output");
  const report = await projectReport(f.dir);
  assert.equal(report.readiness, "reviewed");
  assert.equal(report.current.technicalPass, true);
  const attempt = report.attempts.find((a) => a.run === failedRun);
  assert.equal(attempt.recordedStatus, "technical-rejected");
  assert.deepEqual(attempt.errors, ["Dimensions differ"]);
  assert.equal(attempt.logs.length, 1);
  assert(report.attempts.some((a) => a.artifacts["qa/diagnostic-clay.png"]));
});

test("report never calls an old accepted build current after its recipe changes", async () => {
  const f = await fixture();
  await reviewProject(
    f.dir,
    "Accepted synthetic fixture for stale report verification.",
  );
  await fs.appendFile(path.join(f.dir, "recipe.py"), "\n# changed assembly\n");
  const report = await projectReport(f.dir);
  assert.equal(report.readiness, "stale-build");
  assert.equal(report.current.valid, false);
  assert.equal(report.attempts[0].recordedStatus, "accepted");
});

test("report handles an initialized but unbuilt job and refuses output overwrite", async () => {
  const dir = path.join(base, "unbuilt-report");
  await initProject(dir, "custom");
  const output = path.join(base, "new-report.md");
  const report = await projectReport(dir, output);
  assert.equal(report.readiness, "not-built");
  assert.deepEqual(report.attempts, []);
  const text = await fs.readFile(output, "utf8");
  assert.match(text, /not-built/);
  await assert.rejects(projectReport(dir, output), /destination exists/);
  assert.equal(await fs.readFile(output, "utf8"), text);
});

test("report exposes a recorded visual rejection and unreadable historical metadata", async () => {
  const f = await fixture();
  await reviewProject(
    f.dir,
    "Reject this synthetic geometry for report testing.",
    false,
  );
  const dir = path.join(f.dir, ".forge", "run-" + randomUUID());
  await fs.mkdir(dir);
  await fs.writeFile(path.join(dir, "manifest.json"), "broken json");
  const report = await projectReport(f.dir);
  assert.equal(report.readiness, "visual-rejected");
  assert(report.attempts.some((a) => a.recordedStatus === "unreadable"));
});

test("coplanar diagnostics remain an explicit advisory, including on technically passing rejected art", async () => {
  const directory = path.join(TOOL, "proof/overlap-trial");
  const spec = JSON.parse(
    await fs.readFile(path.join(directory, "asset.json")),
  );
  const sockets = JSON.parse(
    await fs.readFile(path.join(directory, "sockets.json")),
  );
  const report = await lintModel(
    path.join(directory, "rejected.glb"),
    spec,
    style,
    sockets,
  );
  assert.equal(report.technicalPass, true, report.errors.join(";"));
  assert.equal(report.surfaceResults.length, 33);
  assert(report.warnings.some((w) => w.includes("coplanar")));
  assert(report.overlapDiagnostics.findings.length > 0);
});

test("CLI report writes full evidence to disk and returns a compact machine summary", async () => {
  const f = await fixture(),
    output = path.join(f.dir, "handoff.md");
  const { stdout } = await execute(process.execPath, [
    path.join(TOOL, "cli.mjs"),
    "report",
    f.dir,
    "--out",
    output,
  ]);
  const report = JSON.parse(stdout).result;
  assert.equal(report.markdown, output);
  assert.equal(report.readiness, "needs-review");
  assert.equal(report.attempts[0].artifacts, undefined);
  assert.match(await fs.readFile(output, "utf8"), /diagnostic-clay/);
});
