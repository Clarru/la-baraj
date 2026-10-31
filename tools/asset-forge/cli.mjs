#!/usr/bin/env node
import { parseArgs } from "node:util";
import {
  ForgeError,
  initProject,
  buildProject,
  checkProject,
  reviewProject,
  packProject,
  doctor,
} from "./core.mjs";
const help = {
  tool: "La Baraj Asset Forge",
  usage: "npm run asset -- <command> [project] [options]",
  commands: {
    doctor: "Check local Blender/profile availability.",
    init: "Create a new job: init <directory> --recipe lantern|crate|custom",
    build:
      "Build, lint and render: build <project> [--blender <executable>] [--draft]",
    check: "Recompute technical checks: check <project>",
    status: "Read the current checked build: status <project>",
    review:
      "After viewing QA images: review <project> --note <specific findings>",
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
  if (Number(process.versions.node.split(".")[0]) !== 24)
    throw new ForgeError("Node 24 is required.");
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    options: {
      recipe: { type: "string" },
      blender: { type: "string" },
      note: { type: "string" },
      out: { type: "string" },
      draft: { type: "boolean" },
      force: { type: "boolean" },
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
    else if (command === "build") result = await buildProject(project, values);
    else if (command === "check" || command === "status") {
      result = await checkProject(project);
      if (!result.report.technicalPass) process.exitCode = 1;
    } else if (command === "review")
      result = await reviewProject(project, values.note);
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
        error: { code: error.code ?? "tool-error", message: error.message },
      },
      null,
      2,
    ) + "\n",
  );
  process.exitCode = error.exitCode ?? 1;
}
