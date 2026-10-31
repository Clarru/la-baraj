import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash, randomUUID } from "node:crypto";
import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import sharp from "sharp";
import { NodeIO } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";
import { Ray, Vector3 } from "three";
import { getBounds } from "@gltf-transform/functions";
import { worldTriangles, coplanarOverlaps } from "./geometry.mjs";

export const ROOT = path.resolve(import.meta.dirname, "../..");
export const TOOL = import.meta.dirname;
const STYLE = path.join(TOOL, "styles/timber-iron-v1");
const GUIDES = [
  ".agents/skills/la-baraj-3d-assets/SKILL.md",
  ".agents/skills/la-baraj-3d-assets/references/surfaces.md",
  "experiments/asset-skill-lab/RESULTS.md",
  "experiments/asset-skill-lab/material-study/RESULTS.md",
];
export class ForgeError extends Error {
  constructor(message, code = "invalid-input", exitCode = 2) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
  }
}
const stable = (value) =>
  Array.isArray(value)
    ? value.map(stable)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((k) => [k, stable(value[k])]),
        )
      : value;
const execute = promisify(execFile);
export const digest = (data) => createHash("sha256").update(data).digest("hex");
export const fileHash = async (file) => digest(await fs.readFile(file));
const json = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
export const writeJson = async (file, data) =>
  fs.writeFile(file, JSON.stringify(data, null, 2) + "\n");
const exists = async (file) =>
  fs.stat(file).then(
    () => true,
    () => false,
  );
const inside = (root, file) => {
  const relative = path.relative(root, file);
  return (
    relative !== "" &&
    !relative.startsWith(".." + path.sep) &&
    !path.isAbsolute(relative)
  );
};
async function loadReferenceKit(style) {
  const directory = path.join(TOOL, "references/v1"),
    file = path.join(directory, "manifest.json");
  if ((await fileHash(file)) !== style.referenceKit.manifestHash)
    throw new ForgeError(
      "Reference-kit manifest changed; create/review a new kit version.",
      "style-mismatch",
    );
  const kit = await json(file);
  const images = [];
  for (const image of kit.images) {
    const file = path.join(directory, image.file);
    if (!inside(directory, file) || (await fileHash(file)) !== image.sha256)
      throw new ForgeError(
        "Fixed reference image changed: " + image.file,
        "style-mismatch",
      );
    images.push({ ...image, path: file });
  }
  return { ...kit, images };
}
export async function profile() {
  return json(path.join(STYLE, "profile.json"));
}
export function validateSpec(spec, style) {
  const keys = [
    "version",
    "id",
    "profile",
    "recipe",
    "dimensions",
    "budgets",
    "parameters",
    "requiredSockets",
    "requiredJoints",
    "collision",
    "reference",
    "seed",
  ];
  if (
    !spec ||
    typeof spec !== "object" ||
    Array.isArray(spec) ||
    Object.keys(spec).some((k) => !keys.includes(k))
  )
    throw new ForgeError("Unknown asset.json field or invalid object.");
  if (
    spec.version !== 1 ||
    !/^[a-z][a-z0-9-]{1,63}$/.test(spec.id) ||
    spec.profile !== style.id ||
    !Object.hasOwn(style.recipes, spec.recipe)
  )
    throw new ForgeError("Invalid version, asset id, style profile or recipe.");
  if (
    !Array.isArray(spec.dimensions) ||
    spec.dimensions.length !== 3 ||
    spec.dimensions.some((n) => !Number.isFinite(n) || n < 0.01 || n > 20)
  )
    throw new ForgeError(
      "dimensions must be [width,height,depth] in metres, each0.01–20.",
    );
  if (
    !Number.isSafeInteger(spec.seed) ||
    spec.seed < 0 ||
    spec.seed > 2147483647
  )
    throw new ForgeError("seed must be an integer from0 to2147483647.");
  const limits = style.recipes[spec.recipe].budgets;
  if (
    !spec.budgets ||
    Object.keys(spec.budgets).length !== Object.keys(limits).length ||
    Object.entries(limits).some(
      ([k, max]) =>
        !Number.isSafeInteger(spec.budgets[k]) ||
        spec.budgets[k] <= 0 ||
        spec.budgets[k] > max,
    )
  )
    throw new ForgeError(
      "Budgets must be positive integers within the approved recipe/profile limits.",
    );
  if (
    !Array.isArray(spec.requiredSockets) ||
    new Set(spec.requiredSockets).size !== spec.requiredSockets.length ||
    spec.requiredSockets.some(
      (s) => typeof s !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,47}$/.test(s),
    )
  )
    throw new ForgeError("Invalid requiredSockets list.");
  if (
    (spec.recipe === "custom" || spec.requiredJoints !== undefined) &&
    (!Array.isArray(spec.requiredJoints) ||
      spec.requiredJoints.length > 64 ||
      new Set(spec.requiredJoints).size !== spec.requiredJoints.length ||
      spec.requiredJoints.some(
        (name) =>
          typeof name !== "string" ||
          !/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(name),
      ))
  )
    throw new ForgeError(
      "Custom jobs must declare requiredJoints (use [] only when no joined assembly needs checking).",
    );
  if (
    !["box", "none"].includes(spec.collision) ||
    !spec.parameters ||
    typeof spec.parameters !== "object" ||
    Array.isArray(spec.parameters) ||
    !(spec.reference === null || typeof spec.reference === "string")
  )
    throw new ForgeError("Invalid collision, parameters or reference.");
  if (spec.recipe !== "custom" && Object.keys(spec.parameters).length)
    throw new ForgeError(
      "Golden recipes have fixed geometry; use a custom recipe for parameters.",
    );
  return spec;
}
export async function imagegenRequest(directory) {
  const project = await loadProject(directory),
    kit = project.kit,
    template = await fs.readFile(
      path.join(TOOL, "prompts/asset-reference-v1.txt"),
      "utf8",
    );
  const images = kit.images;
  const brief = await fs.readFile(path.join(project.dir, "brief.md"), "utf8");
  const request = {
    version: 1,
    kit: kit.id,
    kitVersion: kit.version,
    fixedTemplateHash: digest(template),
    readyForGeneration: !brief.includes("Describe the silhouette, components"),
    referenceImages: images,
    prompt:
      template +
      "\nOBJECT BRIEF (variable):\n" +
      brief +
      "\nIntended dimensions [width,height,depth] metres: " +
      JSON.stringify(project.spec.dimensions) +
      "\nStatic prop; geometry triangle ceiling: " +
      project.spec.budgets.triangles +
      ". Preserve clear component separation for later Blender reconstruction.",
    generation:
      "Call the built-in image_gen tool with this prompt and these ordered local paths. This CLI does not invoke a paid provider or turn the image into a mesh.",
  };
  await writeJson(path.join(project.dir, "imagegen-request.json"), request);
  return request;
}
export async function initProject(directory, recipe = "custom") {
  const dir = path.resolve(directory),
    style = await profile();
  if (!Object.hasOwn(style.recipes, recipe))
    throw new ForgeError("Recipe must be lantern, crate or custom.");
  if (
    inside(path.join(ROOT, "apps/web/public"), dir) ||
    dir === ROOT ||
    (await exists(dir))
  )
    throw new ForgeError(
      "Choose a new authoring directory outside the game public assets; existing directories are never overwritten.",
    );
  const id = path.basename(dir);
  const preset = style.recipes[recipe];
  const spec = validateSpec(
    {
      version: 1,
      id,
      profile: style.id,
      recipe,
      dimensions: preset.dimensions,
      budgets: preset.budgets,
      seed: 0,
      parameters: {},
      requiredSockets: preset.requiredSockets,
      requiredJoints: [],
      collision: preset.collision,
      reference: preset.reference ? "repo:" + preset.reference : null,
    },
    style,
  );
  await fs.mkdir(path.dirname(dir), { recursive: true });
  await fs.mkdir(dir);
  await writeJson(path.join(dir, "asset.json"), spec);
  await fs.writeFile(
    path.join(dir, "brief.md"),
    "# " +
      id +
      "\n\nDescribe the silhouette, components, material regions and intended gameplay scale.\nRecord reference provenance and specific visual defects after each iteration.\n",
  );
  if (recipe === "custom")
    await fs.copyFile(
      path.join(TOOL, "blender/custom-template.py"),
      path.join(dir, "recipe.py"),
    );
  await imagegenRequest(dir);
  return {
    project: dir,
    spec,
    imagegenRequest: path.join(dir, "imagegen-request.json"),
    commands: ["prompt", "build", "check", "review", "pack"],
  };
}
export async function loadProject(directory) {
  const dir = await fs.realpath(path.resolve(directory)),
    style = await profile(),
    spec = validateSpec(await json(path.join(dir, "asset.json")), style);
  if (spec.recipe === "custom" && !(await exists(path.join(dir, "recipe.py"))))
    throw new ForgeError(
      "Custom assets require a trusted local recipe.py implementing build(context).",
    );
  for (const [name, hash] of Object.entries(style.sourceTextures))
    if ((await fileHash(path.join(STYLE, name))) !== hash)
      throw new ForgeError(
        "Approved style source changed: " + name,
        "style-mismatch",
      );
  let reference = null;
  if (spec.reference) {
    reference = spec.reference.startsWith("repo:")
      ? path.resolve(ROOT, spec.reference.slice(5))
      : path.resolve(dir, spec.reference);
    if (spec.reference.startsWith("repo:") && !inside(ROOT, reference))
      throw new ForgeError("Reference escapes the repository.");
  }
  const kit = await loadReferenceKit(style);
  const concept = (await exists(path.join(dir, "concept.png")))
    ? path.join(dir, "concept.png")
    : null;
  return { dir, style, spec, reference, kit, concept };
}
export async function inputFingerprint(project) {
  const { spec } = project;
  const files = [
    "core.mjs",
    "geometry.mjs",
    "cli.mjs",
    "blender/build.py",
    "blender/parts.py",
    "blender/golden.py",
    "blender/render.py",
    "blender/compare.py",
    "blender/concept_compare.py",
    "styles/timber-iron-v1/profile.json",
    ...Object.keys(project.style.sourceTextures).map(
      (f) => "styles/timber-iron-v1/" + f,
    ),
  ];
  files.push("prompts/asset-reference-v1.txt", "references/v1/manifest.json");
  const kit = await json(path.join(TOOL, "references/v1/manifest.json"));
  for (const image of kit.images) files.push("references/v1/" + image.file);
  const inputs = { spec, files: {} };
  for (const file of files)
    inputs.files["tool/" + file] = await fileHash(path.join(TOOL, file));
  for (const file of [
    ...GUIDES,
    ".agents/skills/la-baraj-3d-assets/scripts/optimize_asset.mjs",
    "package-lock.json",
  ])
    inputs.files[file] = await fileHash(path.join(ROOT, file));
  if (spec.recipe === "custom")
    inputs.files["recipe.py"] = await fileHash(
      path.join(project.dir, "recipe.py"),
    );
  inputs.files["brief.md"] = await fileHash(path.join(project.dir, "brief.md"));
  if (project.reference)
    inputs.files.reference = await fileHash(project.reference);
  if (project.concept)
    inputs.files["concept.png"] = await fileHash(project.concept);
  if (await exists(path.join(project.dir, "concept-request.json")))
    inputs.files["concept-request.json"] = await fileHash(
      path.join(project.dir, "concept-request.json"),
    );
  return { hash: digest(JSON.stringify(stable(inputs))), inputs };
}
export async function blenderPath(explicit) {
  const candidates = [
    explicit,
    process.env.ASSET_FORGE_BLENDER,
    process.env.ASSET_LAB_BLENDER,
    "/Applications/Blender.app/Contents/MacOS/Blender",
    path.join(
      os.homedir(),
      "Library/Application Support/Steam/steamapps/common/Blender/blender.app/Contents/MacOS/Blender",
    ),
  ].filter(Boolean);
  for (const file of candidates)
    if (
      await fs.stat(file).then(
        (s) => s.isFile(),
        () => false,
      )
    ) {
      try {
        await fs.access(file, 1);
        return file;
      } catch {}
    }
  throw new ForgeError(
    "Set ASSET_FORGE_BLENDER or pass --blender /path/to/Blender. No software is installed by this tool.",
    "missing-blender",
  );
}
export async function run(program, args, log, timeout = 900000) {
  await fs.mkdir(path.dirname(log), { recursive: true });
  const handle = await fs.open(log, "w");
  try {
    await new Promise((resolve, reject) => {
      const child = spawn(program, args, {
        stdio: ["ignore", handle.fd, handle.fd],
        shell: false,
      });
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeout);
      child.on("error", (e) => {
        clearTimeout(timer);
        reject(new ForgeError(e.message, "process-failed", 1));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code !== 0 || timedOut)
          reject(
            new ForgeError(
              `${path.basename(program)} ${timedOut ? "timed out" : "failed with code " + code}. See ${log}`,
              "process-failed",
              1,
            ),
          );
        else resolve();
      });
    });
  } finally {
    await handle.close();
  }
}
export async function lintModel(file, spec, style, sockets = { sockets: {} }) {
  await MeshoptDecoder.ready;
  const doc = await new NodeIO()
      .registerExtensions(ALL_EXTENSIONS)
      .registerDependencies({ "meshopt.decoder": MeshoptDecoder })
      .read(file),
    root = doc.getRoot(),
    errors = [];
  const scenes = root.listScenes();
  if (scenes.length !== 1) errors.push("Exactly one scene is required.");
  let triangles = 0,
    primitives = 0;
  for (const mesh of root.listMeshes())
    for (const primitive of mesh.listPrimitives()) {
      primitives++;
      const p = primitive.getAttribute("POSITION");
      if (!p) {
        errors.push("Missing POSITION");
        continue;
      }
      for (const semantic of primitive.listSemantics()) {
        const a = primitive.getAttribute(semantic);
        if (
          a.getCount() !== p.getCount() ||
          !a.getArray().every(Number.isFinite)
        )
          errors.push("Invalid attribute " + semantic);
      }
      const index = primitive.getIndices(),
        count = index?.getCount() ?? p.getCount();
      if (
        count % 3 !== 0 ||
        (index && !index.getArray().every((i) => i >= 0 && i < p.getCount()))
      )
        errors.push("Invalid triangle indices");
      triangles += count / 3;
      if (primitive.getMode() !== 4)
        errors.push("Only triangle meshes are supported.");
      const uv = primitive.getAttribute("TEXCOORD_0"),
        normal = primitive.getAttribute("NORMAL");
      if (
        !uv ||
        uv.getElementSize() !== 2 ||
        !normal ||
        normal.getElementSize() !== 3
      )
        errors.push("Mapped PBR geometry requires UV0 and normals.");
      if (
        uv &&
        primitive.getMaterial()?.getName() !== "LaBaraj speaker cloth"
      ) {
        const values = [];
        const timber = primitive.getMaterial()?.getName() === "LaBaraj timber";
        for (let i = 0; i < uv.getCount(); i++) {
          uv.getElement(i, values);
          if (
            values[0] < (timber ? 0.5 : 0) - 0.002 ||
            values[0] > (timber ? 1 : 0.5) + 0.002 ||
            values[1] < -0.002 ||
            values[1] > 1.002
          ) {
            errors.push("UV crosses the approved material strip.");
            break;
          }
        }
      }
    }
  if (root.listSkins().length || root.listAnimations().length)
    errors.push("This profile supports static props only.");
  const bounds = scenes[0]
      ? getBounds(scenes[0])
      : { min: [0, 0, 0], max: [0, 0, 0] },
    dimensions = bounds.max.map((v, i) => v - bounds.min[i]);
  if ([...bounds.min, ...bounds.max].some((n) => !Number.isFinite(n)))
    errors.push("Non-finite bounds");
  if (
    dimensions.some(
      (v, i) =>
        Math.abs(v / spec.dimensions[i] - 1) > style.dimensionsTolerance,
    )
  )
    errors.push("Dimensions differ from the brief by more than1%.");
  if (
    Math.abs(bounds.min[1]) > 0.002 ||
    Math.abs((bounds.min[0] + bounds.max[0]) / 2) > 0.002 ||
    Math.abs((bounds.min[2] + bounds.max[2]) / 2) > 0.002
  )
    errors.push("Pivot must be floor-centred in metres/+Y up.");
  const bytes = (await fs.stat(file)).size,
    textures = root.listTextures().map((t) => ({
      name: t.getName(),
      size: t.getSize(),
      sha256: digest(t.getImage()),
      bytes: t.getImage().byteLength,
    }));
  for (const [key, value] of Object.entries({
    triangles,
    bytes,
    primitives,
    textures: textures.length,
  }))
    if (value > spec.budgets[key]) errors.push(key + " budget exceeded");
  for (const t of textures)
    if (!t.size || t.size.some((n) => n <= 0 || n > spec.budgets.textureEdge))
      errors.push("Texture dimensions exceed profile: " + t.name);
  const materials = [];
  for (const m of root.listMaterials()) {
    const expected = style.materialFactors[m.getName()];
    if (!expected) errors.push("Unapproved material " + m.getName());
    if (
      expected &&
      m.getBaseColorFactor().some((n, i) => Math.abs(n - expected[i]) > 1e-6)
    )
      errors.push("Material tint drift: " + m.getName());
    if (m.getAlphaMode() !== "OPAQUE")
      errors.push("Transparent materials are outside this static profile.");
    const settings = style.materialSettings?.[m.getName()];
    if (
      m.getMetallicFactor() !== (settings?.metallic ?? 1) ||
      m.getRoughnessFactor() !== (settings?.roughness ?? 1) ||
      m.getNormalScale() !== 1
    )
      errors.push("PBR factor drift: " + m.getName());
    const expectedMaps = settings?.maps ?? style.runtimeTextureHashes;
    for (const [role, texture] of [
      ["baseColor", m.getBaseColorTexture()],
      ["normal", m.getNormalTexture()],
      ["metallicRoughness", m.getMetallicRoughnessTexture()],
    ]) {
      if (expectedMaps[role]) {
        if (!texture || digest(texture.getImage()) !== expectedMaps[role])
          errors.push(
            "Missing or unapproved " + role + " atlas: " + m.getName(),
          );
      } else if (texture)
        errors.push("Unexpected map for material: " + m.getName() + "/" + role);
    }
    materials.push({
      name: m.getName(),
      baseColor: m.getBaseColorFactor(),
      normal: !!m.getNormalTexture(),
      metallicRoughness: !!m.getMetallicRoughnessTexture(),
    });
  }
  if (!materials.length || !triangles) errors.push("Empty geometry/materials.");
  for (const name of spec.requiredSockets)
    if (!sockets.sockets?.[name]) errors.push("Missing socket " + name);
  for (const [name, p] of Object.entries(sockets.sockets ?? {}))
    if (
      !Array.isArray(p) ||
      p.length !== 3 ||
      p.some((n) => !Number.isFinite(n))
    )
      errors.push("Invalid socket " + name);
  const surfaces = sockets.surfaceProbes ?? [],
    required = style.recipes[spec.recipe]?.surfaceProbeCount ?? 0,
    joints = sockets.joints ?? {};
  if (required && surfaces.length !== required)
    errors.push("Required sealed-surface probes missing.");
  for (const name of spec.requiredJoints ?? [])
    if (!Array.isArray(joints[name]) || joints[name].length !== 3)
      errors.push("Missing three-direction joint contract: " + name);
  for (const name of Object.keys(joints))
    if (!(spec.requiredJoints ?? []).includes(name))
      errors.push("Undeclared joint contract: " + name);
  const probes = [
    ...surfaces,
    ...Object.entries(joints).flatMap(([joint, checks]) =>
      Array.isArray(checks)
        ? checks.map((probe) => ({ ...probe, name: joint + "/" + probe?.name }))
        : [],
    ),
  ];
  const surfaceResults = [];
  const geometry = worldTriangles(doc);
  const overlapDiagnostics = coplanarOverlaps(geometry);
  const warnings = [];
  if (overlapDiagnostics.findings.length)
    warnings.push(
      `${overlapDiagnostics.findings.length} retained exposed coplanar triangle overlaps require visual inspection${overlapDiagnostics.complete ? "." : " (bounded analysis)."}`,
    );
  if (!overlapDiagnostics.complete)
    warnings.push(
      "Coplanar analysis is incomplete: " + overlapDiagnostics.reason,
    );
  if (
    probes.length > 256 ||
    new Set(probes.map((p) => p?.name)).size !== probes.length
  )
    errors.push("Invalid or duplicate sealed-surface probe list.");
  if (probes.length) {
    const hit = new Vector3();
    for (const probe of probes.slice(0, 256)) {
      if (
        !probe ||
        typeof probe.name !== "string" ||
        !Array.isArray(probe.origin) ||
        !Array.isArray(probe.direction) ||
        probe.origin.length !== 3 ||
        probe.direction.length !== 3 ||
        [...probe.origin, ...probe.direction].some(
          (n) => !Number.isFinite(n),
        ) ||
        !Number.isFinite(probe.maxDistance) ||
        probe.maxDistance <= 0 ||
        probe.maxDistance > 0.5
      ) {
        errors.push("Invalid sealed-surface probe.");
        continue;
      }
      const origin = new Vector3(...probe.origin),
        direction = new Vector3(...probe.direction);
      if (direction.lengthSq() < 1e-10) {
        errors.push("Invalid probe direction.");
        continue;
      }
      const ray = new Ray(origin, direction.normalize());
      let distance = Infinity;
      for (const t of geometry)
        if (ray.intersectTriangle(...t.points, false, hit))
          distance = Math.min(distance, hit.distanceTo(origin));
      const pass = distance <= probe.maxDistance;
      surfaceResults.push({
        name: probe.name,
        pass,
        distance: Number.isFinite(distance) ? distance : null,
      });
      if (!pass)
        errors.push("Open/recessed surface exceeds solid depth: " + probe.name);
    }
  }
  return {
    technicalPass: errors.length === 0,
    errors,
    warnings,
    overlapDiagnostics,
    surfaceResults,
    jointResults: Object.fromEntries(
      (spec.requiredJoints ?? []).map((name) => [
        name,
        {
          pass:
            Array.isArray(joints[name]) &&
            joints[name].length === 3 &&
            surfaceResults.filter((r) => r.name.startsWith(name + "/"))
              .length === 3 &&
            surfaceResults
              .filter((r) => r.name.startsWith(name + "/"))
              .every((r) => r.pass),
        },
      ]),
    ),
    triangles,
    bytes,
    primitives,
    dimensions,
    bounds,
    textures,
    materials,
    sockets: sockets.sockets ?? {},
    runtimePerformance: "Not benchmarked; these are resource budgets, not FPS.",
  };
}
async function currentRun(project) {
  const pointer = await json(
    path.join(project.dir, ".forge/current.json"),
  ).catch(() => {
    throw new ForgeError("No successful build. Run build first.", "not-built");
  });
  if (!/^run-[a-f0-9-]{36}$/.test(pointer.run))
    throw new ForgeError("Invalid build pointer.");
  const directory = await fs.realpath(
    path.join(project.dir, ".forge", pointer.run),
  );
  if (!inside(path.join(project.dir, ".forge"), directory))
    throw new ForgeError("Build path escapes project.");
  const fingerprint = await inputFingerprint(project),
    manifest = await json(path.join(directory, "manifest.json"));
  if (manifest.inputHash !== fingerprint.hash)
    throw new ForgeError(
      "Brief, recipe, style or toolchain changed. Rebuild before using this result.",
      "stale-build",
    );
  if (
    manifest.modelHash !== (await fileHash(path.join(directory, "model.glb")))
  )
    throw new ForgeError("Model changed after build. Rebuild.", "stale-build");
  if (pointer.artifactHash !== (await artifactDigest(directory)))
    throw new ForgeError(
      "Build artifacts changed. Rebuild before review/pack.",
      "stale-build",
    );
  return { directory, manifest };
}
export async function checkProject(directory) {
  const project = await loadProject(directory),
    run = await currentRun(project),
    sockets = await json(path.join(run.directory, "sockets.json")),
    report = await lintModel(
      path.join(run.directory, "model.glb"),
      project.spec,
      project.style,
      sockets,
    );
  if (
    run.manifest.version !== 1 ||
    run.manifest.id !== project.spec.id ||
    run.manifest.style !== project.style.id ||
    run.manifest.up !== "+Y" ||
    run.manifest.pivot !== "floor-center" ||
    JSON.stringify(report) !== JSON.stringify(run.manifest.report)
  )
    throw new ForgeError(
      "Build metadata no longer matches the actual asset. Rebuild.",
      "stale-build",
    );
  const resolution = run.manifest.draft ? 256 : project.style.qaResolution;
  if (run.manifest.resolution !== resolution)
    throw new ForgeError(
      "Render resolution metadata changed. Rebuild.",
      "stale-build",
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
        ...(report.overlapDiagnostics.findings.length
          ? ["diagnostic-overlaps", "diagnostic-overlaps-rear"]
          : []),
      ],
    ],
    ["qa-light-90", ["three-quarter"]],
  ])
    for (const view of views) {
      const image = await sharp(
        path.join(run.directory, folder, view + ".png"),
      ).metadata();
      if (image.width !== resolution || image.height !== resolution)
        throw new ForgeError(
          "QA image dimensions do not match the build.",
          "stale-build",
        );
    }
  let reviewStatus = "pending";
  if (await exists(path.join(run.directory, "review.json"))) {
    const review = await json(path.join(run.directory, "review.json"));
    reviewStatus =
      review.artifactHash === (await artifactDigest(run.directory))
        ? (review.status ?? "accepted")
        : "stale";
  }
  return { ...run, report, reviewStatus };
}
export async function buildProject(directory, options = {}) {
  const project = await loadProject(directory),
    fingerprint = await inputFingerprint(project),
    blender = await blenderPath(options.blender),
    runId = "run-" + randomUUID(),
    out = path.join(project.dir, ".forge", runId);
  await fs.mkdir(out, { recursive: true });
  const config = {
    spec: project.spec,
    style: STYLE,
    output: out,
    project: project.dir,
  };
  await writeJson(path.join(out, "job.json"), config);
  const version = await execute(blender, ["--version"], {
    timeout: 10000,
    maxBuffer: 16384,
  });
  if (!options.force) {
    try {
      const previous = await checkProject(directory);
      if (
        previous.report.technicalPass &&
        (!previous.manifest.draft || options.draft) &&
        previous.manifest.blenderVersion === version.stdout.split("\n")[0] &&
        previous.manifest.nodeVersion === process.version
      ) {
        await fs.rm(out, { recursive: true, force: true });
        return { ...previous, cached: true };
      }
    } catch (error) {
      if (
        !(error instanceof ForgeError) &&
        error.code !== "ENOENT" &&
        !(error instanceof SyntaxError)
      )
        throw error;
    }
  }
  const stages = [];
  const step = async (name, program, args) => {
    process.stderr.write(`[asset-forge] ${name}\n`);
    const start = performance.now();
    await run(program, args, path.join(out, name + ".log"));
    stages.push({ name, milliseconds: Math.round(performance.now() - start) });
  };
  await step("build", blender, [
    "--background",
    "--threads",
    "4",
    "--python-exit-code",
    "1",
    "--python",
    path.join(TOOL, "blender/build.py"),
    "--",
    path.join(out, "job.json"),
  ]);
  await step("optimize", process.execPath, [
    path.join(
      ROOT,
      ".agents/skills/la-baraj-3d-assets/scripts/optimize_asset.mjs",
    ),
    path.join(out, "source-raw.glb"),
    path.join(out, "model.glb"),
    "1",
    "quantize",
    "0.8",
    "meshopt",
  ]);
  const sockets = await json(path.join(out, "source-sockets.json"));
  await writeJson(path.join(out, "sockets.json"), sockets);
  const report = await lintModel(
    path.join(out, "model.glb"),
    project.spec,
    project.style,
    sockets,
  );
  await writeJson(path.join(out, "validation.json"), report);
  if (!report.technicalPass) {
    const error = new ForgeError(
      "Asset rejected: " + report.errors.join("; "),
      "asset-rejected",
      1,
    );
    error.details = {
      directory: out,
      validation: path.join(out, "validation.json"),
      errors: report.errors,
    };
    throw error;
  }
  const resolution = options.draft ? 256 : project.style.qaResolution,
    framing = {
      framing: {
        center: [0, 0, project.spec.dimensions[1] / 2],
        span: Math.max(...project.spec.dimensions) * 1.52,
        floor: 0,
        resolution,
      },
    };
  await writeJson(path.join(out, "framing.json"), framing);
  const render = async (
    file,
    target,
    angle = "0",
    views = "front,side,rear,three-quarter",
  ) =>
    step("render-" + path.basename(target), blender, [
      "--background",
      "--threads",
      "4",
      "--python-exit-code",
      "1",
      "--python",
      path.join(TOOL, "blender/render.py"),
      "--",
      file,
      target,
      "--framing",
      path.join(out, "framing.json"),
      "--key-angle",
      angle,
      "--views",
      views,
      "--masks",
      ...(target === path.join(out, "qa")
        ? ["--diagnostics", "--overlap-file", path.join(out, "validation.json")]
        : []),
    ]);
  await render(path.join(out, "model.glb"), path.join(out, "qa"));
  await render(
    path.join(out, "model.glb"),
    path.join(out, "qa-light-90"),
    "90",
    "three-quarter",
  );
  if (project.reference) {
    await render(project.reference, path.join(out, "reference"));
    await render(
      project.reference,
      path.join(out, "reference-light-90"),
      "90",
      "three-quarter",
    );
    await step("compare", "python3", [
      path.join(TOOL, "blender/compare.py"),
      path.join(out, "reference"),
      path.join(out, "qa"),
      path.join(out, "comparison"),
    ]);
  }
  if (project.concept) {
    await fs.copyFile(project.concept, path.join(out, "reference-concept.png"));
    await step("concept-compare", "python3", [
      path.join(TOOL, "blender/concept_compare.py"),
      path.join(out, "reference-concept.png"),
      path.join(out, "qa"),
      path.join(out, "comparison"),
    ]);
  }

  const manifest = {
    blenderVersion: version.stdout.split("\n")[0],
    nodeVersion: process.version,
    version: 1,
    id: project.spec.id,
    style: project.style.id,
    styleVersion: project.style.version,
    referenceKit: {
      id: project.kit.id,
      version: project.kit.version,
      manifestHash: project.style.referenceKit.manifestHash,
    },
    units: "metres",
    up: "+Y",
    forward: "+Z",
    pivot: "floor-center",
    inputHash: fingerprint.hash,
    inputs: fingerprint.inputs,
    stages,
    modelHash: await fileHash(path.join(out, "model.glb")),
    report,
    collision:
      project.spec.collision === "box"
        ? {
            type: "box",
            center: report.bounds.max.map(
              (v, i) => (v + report.bounds.min[i]) / 2,
            ),
            size: report.dimensions,
            reviewRequired: true,
          }
        : { type: "none" },
    lods: [],
    reviewRequired: true,
    resolution,
    draft: !!options.draft,
    blenderVersionLog: "build.log",
  };
  await writeJson(path.join(out, "manifest.json"), manifest);
  await writeJson(path.join(project.dir, ".forge/current.json"), {
    run: runId,
    artifactHash: await artifactDigest(out),
  });
  return { directory: out, manifest };
}
export async function artifactDigest(directory) {
  const names = [
    "model.glb",
    "manifest.json",
    "sockets.json",
    "validation.json",
    "source.blend",
  ];
  if (await exists(path.join(directory, "reference-concept.png")))
    names.push("reference-concept.png");
  for (const dir of [
    "qa",
    "qa-light-90",
    "reference",
    "reference-light-90",
    "comparison",
  ])
    if (await exists(path.join(directory, dir)))
      for (const file of (await fs.readdir(path.join(directory, dir))).sort())
        if (/\.(png|webp|json)$/.test(file)) names.push(dir + "/" + file);
  const hashes = {};
  for (const name of names)
    hashes[name] = await fileHash(path.join(directory, name));
  return digest(JSON.stringify(hashes));
}
export async function reviewProject(directory, note, accepted = true) {
  if (typeof note !== "string" || note.trim().length < 12)
    throw new ForgeError(
      "Record a concrete visual-review note (at least12 characters).",
    );
  const checked = await checkProject(directory);
  if (!checked.report.technicalPass)
    throw new ForgeError("Technical checks fail.", "asset-rejected", 1);
  if (accepted && checked.manifest.draft)
    throw new ForgeError(
      "Draft renders cannot be approved. Build without --draft.",
      "draft-build",
    );
  const review = {
    artifactHash: await artifactDigest(checked.directory),
    note: note.trim(),
    status: accepted ? "accepted" : "rejected",
    overlapDiagnostics: {
      findings: checked.report.overlapDiagnostics.findings.length,
      complete: checked.report.overlapDiagnostics.complete,
      scope: checked.report.overlapDiagnostics.scope,
    },
    reviewedAt: new Date().toISOString(),
    scope:
      "Visual review of retained views; collision and actual game performance still require integration checks.",
  };
  await writeJson(path.join(checked.directory, "review.json"), review);
  return review;
}
export async function packProject(directory, destination) {
  const checked = await checkProject(directory);
  if (!checked.report.technicalPass)
    throw new ForgeError("Technical checks fail.", "asset-rejected", 1);
  const review = await json(path.join(checked.directory, "review.json")).catch(
    () => {
      throw new ForgeError(
        "Inspect the QA views and record review --note before packaging.",
        "review-required",
        3,
      );
    },
  );
  if (review.status !== "accepted")
    throw new ForgeError(
      "Visual review rejected this asset; revise and rebuild.",
      "review-rejected",
      3,
    );
  if (
    checked.manifest.draft ||
    review.artifactHash !== (await artifactDigest(checked.directory))
  )
    throw new ForgeError(
      "Visual review is stale; inspect and review the current artifacts.",
      "stale-review",
      3,
    );
  const target = path.resolve(destination);
  if (await exists(target))
    throw new ForgeError(
      "Package destination already exists. Nothing overwritten.",
    );
  const temp = target + ".tmp-" + randomUUID();
  await fs.mkdir(temp, { recursive: true });
  try {
    for (const file of [
      "model.glb",
      "manifest.json",
      "sockets.json",
      "validation.json",
      "review.json",
    ])
      await fs.copyFile(
        path.join(checked.directory, file),
        path.join(temp, file),
      );
    const m = checked.manifest;
    await writeJson(path.join(temp, "manifest.json"), {
      version: 1,
      id: m.id,
      style: m.style,
      styleVersion: m.styleVersion,
      referenceKit: m.referenceKit,
      styleHash: digest(
        JSON.stringify(stable((await loadProject(directory)).style)),
      ),
      model: "model.glb",
      modelHash: m.modelHash,
      buildHash: m.inputHash,
      units: m.units,
      up: m.up,
      forward: m.forward,
      pivot: m.pivot,
      report: checked.report,
      sockets: checked.report.sockets,
      collision: m.collision,
      lods: m.lods,
      visualReview: review,
      gameIntegrationReviewRequired: true,
    });
    // Reserve the new destination atomically, so concurrent packs cannot replace it.
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.mkdir(target);
    for (const file of await fs.readdir(temp))
      await fs.copyFile(path.join(temp, file), path.join(target, file), 1);
    await fs.rm(temp, { recursive: true, force: true });
  } catch (e) {
    await fs.rm(temp, { recursive: true, force: true });
    throw e;
  }
  return { package: target, modelHash: checked.manifest.modelHash, review };
}
export async function doctor(explicit) {
  const style = await profile(),
    blender = await blenderPath(explicit),
    version = await execute(blender, ["--version"], {
      timeout: 10000,
      maxBuffer: 16384,
    }),
    python = await execute(
      "python3",
      ["-c", "import PIL; print(PIL.__version__)"],
      { timeout: 10000, maxBuffer: 1024 },
    );
  return {
    node: process.version,
    nodeSupported: Number(process.versions.node.split(".")[0]) === 24,
    blender,
    blenderVersion: version.stdout.split("\n")[0],
    pillow: python.stdout.trim(),
    profile: style.id,
    recipes: Object.keys(style.recipes),
    networkRequired: false,
  };
}
