#!/usr/bin/env node
import { parseArgs } from "node:util";
const help = {
  tool: "La Baraj Asset Forge",
  usage: "npm run asset -- <command> [project] [options]",
  commands: {
    doctor: "Check local Blender/profile availability.",
    init: "Create a new job: init <directory> --recipe lantern|crate|custom",
    build:
      "Build, lint and render: build <project> [--blender <executable>] [--draft]",
    prompt:
      "Assemble the fixed style kit and variable brief for ImageGen: prompt <project>",
    check: "Recompute technical checks: check <project>",
    status: "Read the current checked build: status <project>",
    report:
      "Summarize current validity, failed attempts and evidence: report <project> [--out <new.md>]",
    review:
      "After viewing QA images: review <project> [--reject] --note <specific findings>",
    pack: "Package a current reviewed result: pack <project> --out <new directory>",
  },
  notes: [
    "Developer-only; custom recipes execute trusted local Python.",
    "No server, network generation, automatic installation or game-asset overwrite.",
    "Technical checks do not certify visual similarity or game FPS.",
  ],
  exitCodes: {
    0: "success",
    1: "build/check failure",
    2: "invalid input or stale build",
    3: "visual review required/stale",
  },
};
try {
  if (Number(process.versions.node.split(".")[0]) !== 24) {
    const error = new Error(
      "Node 24 is required; this command is running " + process.version + ".",
    );
    error.code = "runtime-mismatch";
    error.exitCode = 2;
    error.details = {
      requiredMajor: 24,
      actualVersion: process.version,
      executable: process.execPath,
      remedy:
        "Select an installed Node 24 executable (project version is in .nvmrc), then run: /absolute/path/to/node24/bin/node tools/asset-forge/cli.mjs doctor. The CLI does not install runtimes.",
    };
    throw error;
  }
  const {
    ForgeError,
    initProject,
    buildProject,
    checkProject,
    reviewProject,
    packProject,
    doctor,
    imagegenRequest,
  } = await import("./core.mjs");
  const { projectReport } = await import("./report.mjs");
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      recipe: { type: "string" },
      blender: { type: "string" },
      note: { type: "string" },
      out: { type: "string" },
      draft: { type: "boolean" },
      force: { type: "boolean" },
      reject: { type: "boolean" },
      help: { type: "boolean" },
      json: { type: "boolean" },
    },
  });
  const [command, project, ...extra] = positionals;
  if (extra.length) throw new ForgeError("Too many positional arguments.");
  let result;
  if (!command || values.help) result = help;
  else if (command === "doctor") result = await doctor(values.blender);
  else {
    if (!project) throw new ForgeError("A project directory is required.");
    if (command === "init") result = await initProject(project, values.recipe);
    else if (command === "prompt") result = await imagegenRequest(project);
    else if (command === "report") {
      const report = await projectReport(project, values.out);
      result = values.out
        ? {
            id: report.id,
            readiness: report.readiness,
            current: report.current,
            attempts: report.attempts.map(
              ({
                run,
                recordedStatus,
                triangles,
                bytes,
                errors,
                overlapFindings,
              }) => ({
                run,
                recordedStatus,
                triangles,
                bytes,
                errors,
                overlapFindings,
              }),
            ),
            markdown: report.markdown,
            limits: report.limits,
          }
        : report;
    } else if (command === "build")
      result = await buildProject(project, values);
    else if (command === "check" || command === "status") {
      result = await checkProject(project);
      if (!result.report.technicalPass) process.exitCode = 1;
    } else if (command === "review")
      result = await reviewProject(project, values.note, !values.reject);
    else if (command === "pack") {
      if (!values.out)
        throw new ForgeError("--out must name a new package directory.");
      result = await packProject(project, values.out);
    } else throw new ForgeError("Unknown command: " + command);
  }
  process.stdout.write(
    JSON.stringify({ ok: process.exitCode !== 1, result }, null, 2) + "\n",
  );
} catch (error) {
  process.stderr.write(
    JSON.stringify(
      {
        ok: false,
        error: {
          code: error.code ?? "tool-error",
          message: error.message,
          details: error.details,
        },
      },
      null,
      2,
    ) + "\n",
  );
  process.exitCode = error.exitCode ?? 1;
}
