import fs from "node:fs/promises";
import path from "node:path";
import { loadProject, checkProject, ForgeError } from "./core.mjs";

async function readRecord(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return null;
    if (error instanceof SyntaxError) return { unreadable: error.message };
    throw error;
  }
}

const evidenceNames = [
  "source.blend",
  "model.glb",
  "validation.json",
  "review.json",
  "sockets.json",
  "qa/front.png",
  "qa/side.png",
  "qa/rear.png",
  "qa/three-quarter.png",
  "qa/diagnostic-clay.png",
  "qa/diagnostic-overlaps.png",
  "qa/diagnostic-overlaps-rear.png",
  "qa/diagnostic-unlit.png",
  "qa-light-90/three-quarter.png",
  "comparison/concept-comparison.webp",
  "comparison/turnaround-comparison.webp",
];

async function describeAttempt(directory, run) {
  const [manifest, validation, review, stat, files] = await Promise.all([
    readRecord(path.join(directory, "manifest.json")),
    readRecord(path.join(directory, "validation.json")),
    readRecord(path.join(directory, "review.json")),
    fs.stat(directory),
    fs.readdir(directory),
  ]);
  const artifacts = {};
  for (const name of evidenceNames) {
    const file = path.join(directory, name);
    if (
      await fs.stat(file).then(
        (s) => s.isFile(),
        () => false,
      )
    )
      artifacts[name] = file;
  }
  const unreadable = [manifest, validation, review].some((r) => r?.unreadable);
  const recordedStatus = unreadable
    ? "unreadable"
    : validation?.technicalPass === false
      ? "technical-rejected"
      : review?.status === "rejected"
        ? "visual-rejected"
        : !manifest
          ? "incomplete"
          : review?.status === "accepted"
            ? "accepted"
            : "pending-review";
  const diagnostic = validation?.overlapDiagnostics;
  return {
    run,
    directory,
    createdAt: new Date(stat.birthtimeMs || stat.ctimeMs).toISOString(),
    recordedStatus,
    triangles: validation?.triangles,
    bytes: validation?.bytes,
    errors: validation?.errors ?? [],
    warnings: validation?.warnings ?? [],
    overlapFindings: diagnostic?.findings.length ?? null,
    overlapAnalysisComplete: diagnostic?.complete ?? null,
    reviewNote: review?.note ?? null,
    stages: manifest?.stages ?? [],
    artifacts,
    logs: files
      .filter((f) => f.endsWith(".log"))
      .sort()
      .map((f) => path.join(directory, f)),
    evidenceScope:
      "Historical records, not a fresh validity/visual acceptance check.",
  };
}

export async function projectReport(directory, output) {
  const project = await loadProject(directory),
    cache = path.join(project.dir, ".forge");
  let current;
  try {
    const checked = await checkProject(project.dir);
    current = {
      valid: checked.report.technicalPass,
      directory: checked.directory,
      reviewStatus: checked.reviewStatus,
      technicalPass: checked.report.technicalPass,
      draft: checked.manifest.draft,
      triangles: checked.report.triangles,
      bytes: checked.report.bytes,
      dimensions: checked.report.dimensions,
      expectedDimensions: project.spec.dimensions,
      budgets: project.spec.budgets,
      primitives: checked.report.primitives,
      textureSizes: checked.report.textures.map((texture) => texture.size),
      joints: Object.keys(checked.report.jointResults).length,
      passedProbes: checked.report.surfaceResults.filter((probe) => probe.pass)
        .length,
      totalProbes: checked.report.surfaceResults.length,
      warnings: checked.report.warnings,
      errors: checked.report.errors,
      overlapFindings: checked.report.overlapDiagnostics.findings.length,
      overlapAnalysisComplete: checked.report.overlapDiagnostics.complete,
      inputHash: checked.manifest.inputHash,
      modelHash: checked.manifest.modelHash,
    };
  } catch (error) {
    if (
      !(error instanceof ForgeError) &&
      error.code !== "ENOENT" &&
      !(error instanceof SyntaxError)
    )
      throw error;
    current = {
      valid: false,
      code: error.code ?? "invalid-record",
      message: error.message,
    };
  }
  let entries;
  try {
    entries = await fs.readdir(cache, { withFileTypes: true });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    entries = [];
  }
  const attempts = [];
  for (const entry of entries)
    if (entry.isDirectory() && /^run-[a-f0-9-]{36}$/.test(entry.name))
      attempts.push(
        await describeAttempt(path.join(cache, entry.name), entry.name),
      );
  attempts.sort(
    (a, b) =>
      a.createdAt.localeCompare(b.createdAt) || a.run.localeCompare(b.run),
  );
  const readiness = !current.valid
    ? (current.code ?? "technical-failure")
    : current.draft
      ? "draft"
      : current.reviewStatus === "accepted"
        ? "reviewed"
        : current.reviewStatus === "rejected"
          ? "visual-rejected"
          : "needs-review";
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    id: project.spec.id,
    readiness,
    current,
    attempts,
    inputs: {
      brief: path.join(project.dir, "brief.md"),
      spec: path.join(project.dir, "asset.json"),
      recipe:
        project.spec.recipe === "custom"
          ? path.join(project.dir, "recipe.py")
          : null,
      concept: project.concept,
      reference: project.reference,
    },
    limits: [
      "Historical acceptance does not validate a stale current build.",
      "Coplanar findings are advisory and limited to exposed axis-aligned co-facing surfaces.",
      "Review notes are recorded judgments; this report does not inspect images or certify style.",
      "Game placement, collision behavior, day/night appearance and performance require integration checks.",
    ],
  };
  if (output) {
    const target = path.resolve(output);
    await fs.mkdir(path.dirname(target), { recursive: true });
    try {
      await fs.writeFile(target, markdownReport(report), { flag: "wx" });
    } catch (error) {
      if (error.code === "EEXIST")
        throw new ForgeError("Report destination exists; choose a new path.");
      throw error;
    }
    report.markdown = target;
  }
  return report;
}

export function markdownReport(report) {
  const cell = (value) => String(value ?? "—").replace(/[|\r\n]/g, " ");
  const lines = [
    `# Asset Forge report: ${cell(report.id)}`,
    "",
    `Generated: ${report.generatedAt}`,
    "",
    `Current readiness: **${cell(report.readiness)}**`,
    "",
    report.current.valid
      ? `Current export: ${report.current.triangles} triangles, ${report.current.bytes} bytes. Review: ${report.current.reviewStatus}.`
      : `Current validation unavailable: ${report.current.message}`,
    "",
    "## Recorded attempts",
    "",
    "| Attempt | Recorded status | Triangles | Bytes | Overlap findings |",
    "| --- | --- | ---: | ---: | ---: |",
  ];
  if (report.current.valid) {
    const current = report.current;
    const metrics = [
      "",
      "Current contract:",
      "",
      "| Measure | Export |",
      "| --- | --- |",
      `| Dimensions, metres [width,height,depth] | ${current.dimensions.map((n) => n.toFixed(6)).join(" × ")} |`,
      `| Expected dimensions | ${current.expectedDimensions.join(" × ")} |`,
      `| Triangle / byte ceilings | ${current.budgets.triangles} / ${current.budgets.bytes} |`,
      `| Primitive groups | ${current.primitives} |`,
      `| Texture sizes | ${current.textureSizes.map((size) => size.join("×")).join(", ")} |`,
      `| Joint probes | ${current.passedProbes}/${current.totalProbes}, across ${current.joints} joints |`,
      `| Coplanar diagnostic | ${current.overlapFindings} retained findings; complete: ${current.overlapAnalysisComplete} |`,
    ];
    const position = lines.indexOf("## Recorded attempts");
    lines.splice(position, 0, ...metrics, "");
  }
  for (const attempt of report.attempts)
    lines.push(
      `| ${attempt.run} | ${attempt.recordedStatus} | ${cell(attempt.triangles)} | ${cell(attempt.bytes)} | ${cell(attempt.overlapFindings)} |`,
    );
  for (const attempt of report.attempts) {
    lines.push(
      "",
      `## ${attempt.run}`,
      "",
      `Recorded status: ${attempt.recordedStatus}. ${attempt.evidenceScope}`,
    );
    for (const error of attempt.errors) lines.push("", `Error: ${error}`);
    for (const warning of attempt.warnings)
      lines.push("", `Diagnostic: ${warning}`);
    if (attempt.reviewNote)
      lines.push(
        "",
        "Recorded reviewer judgment:",
        "",
        ...attempt.reviewNote.split("\n").map((line) => "> " + line),
      );
    for (const [name, file] of Object.entries(attempt.artifacts))
      lines.push("", `- [${name}](<${file}>)`);
    if (attempt.logs.length)
      lines.push(
        "",
        "Stage logs:",
        "",
        ...attempt.logs.map((file) => `- [${path.basename(file)}](<${file}>)`),
      );
  }
  lines.push(
    "",
    "## Limits",
    "",
    ...report.limits.map((limit) => "- " + limit),
    "",
  );
  return lines.join("\n");
}
