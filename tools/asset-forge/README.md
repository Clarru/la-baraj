# La Baraj Asset Forge

Build and check static 3D props through one developer CLI. Use the measured timber/iron family, enforce resource and material rules, render the actual exported GLB, record a visual review, then package it. The tool starts no server and never installs assets into the game automatically.

This is executable tooling, not a prompt or another skill. The existing [asset skill](../../.agents/skills/la-baraj-3d-assets/SKILL.md), [two-prop results](../../experiments/asset-skill-lab/RESULTS.md) and [surface study](../../experiments/asset-skill-lab/material-study/RESULTS.md) supply the baseline. Their hashes participate in build validity.

## How agents find and use it

The repository's [AGENTS.md](../../AGENTS.md) directs coding agents to this CLI whenever a task involves creating/reconstructing a static prop or changing its geometry/materials. The user can ask naturally: “Build a wooden tackle box in the existing La Baraj style.” The agent handles the job, reference preparation, recipe, build, visual iteration and packaging. The user does not need to run commands or operate a Blender panel.

This is instruction-based routing, not an installed background trigger. An agent must read the repository instructions and have terminal access. If its client does not automatically load `AGENTS.md`, start with: “Read AGENTS.md and use Asset Forge for this prop.” The Node/Blender/Python pipeline is independent of the chat client. Image generation is a separate optional capability: `prompt` prepares a portable request with reference paths; the agent must actually supply those images to its available generator, or reuse an approved concept and explain the limitation.

The tool automates repeatable construction setup, export, validation and evidence. The agent still authors a new item's recipe and judges the actual renders. Required gates execute on Forge builds/checks/reviews/packages. `test:assets` runs retained regression tests in CI; it does not discover and certify arbitrary new GLBs added elsewhere in the repository. A client ignoring the instructions can bypass this authoring path, so do not describe the routing as a universal enforcement hook.

These instructions and the CLI must exist in the agent's checkout. While the feature is in a draft PR, it is available on `codex/asset-forge`; other worktrees receive it after the release owner integrates it and those worktrees synchronize normally. Do not copy another chat's working files over an occupied checkout.

### Claude Code and other image-generation clients

The root `CLAUDE.md` is a thin `@AGENTS.md` import. It shares one canonical instruction set and supports Claude Code sessions that do not load AGENTS directly. Current Claude Code can read AGENTS natively under documented version/settings conditions; the import is also an officially supported compatibility path. Use `/memory` or `/context` in Claude Code to confirm project instructions are loaded. See [Anthropic's instruction-file documentation](https://code.claude.com/docs/en/memory#share-one-file-with-other-coding-tools).

Claude's image-understanding capability is separate from image generation. A Claude Code client can run this Node/Blender pipeline and inspect its render images, but a concept generator must be supplied by an available tool, script/API or MCP integration. `claude mcp list` and `/mcp` show configured MCP servers; other plugins or local scripts may supply generation too. The CLI cannot discover another person's client configuration or assume a provider/model. See [Anthropic's image capability explanation](https://support.claude.com/en/articles/9002504-can-claude-produce-images) and [MCP documentation](https://code.claude.com/docs/en/mcp).

`prompt` is provider-neutral: use its exact text and all three actual reference images, not just their paths pasted into a text-only request. Preserve the fixed kit and inspect the result when changing providers; identical prompts/references do not establish identical style quality across models. Record the actual integration/provider/model in the retained concept request when available, or `unknown` if the tool does not expose it. Keep credentials out of provenance files.

With no image generator, reuse an approved concept/model or a checked recipe and the existing style boards. No `concept.png` is required by build/check/render/review/pack. For a genuinely new design lacking an approved concept, report that the concept stage is unavailable and identify the result as a construction study; do not invent a generated sheet or claim a concept match. Any new generation integration needs its own configuration and verification; adding it is not part of this compatibility shim.

## Quick start

Use Node 24 and the repository's `npm ci`. Install Blender separately if it is unavailable; the tool does not download software. Comparison sheets use Python 3 with Pillow.

Check `node --version` against `.nvmrc` first. If the shell selects another version, use an already installed Node 24 executable or its bin directory in `PATH`. A runtime mismatch now reports the actual version/executable and remedy before importing the tool's dependencies, so the error remains parseable JSON even when authoring dependencies are not loaded.

```sh
npm run asset -- doctor
npm run asset -- init assets/authoring/supply-crate --recipe crate
npm run asset -- build assets/authoring/supply-crate
npm run asset -- check assets/authoring/supply-crate
```

Blender is discovered from `ASSET_FORGE_BLENDER`, the retained `ASSET_LAB_BLENDER` setting, or the installed macOS application paths. Pass `--blender /absolute/path/to/Blender` explicitly on other systems. The tested authoring version is Blender 5.2.3; its actual version is recorded with every build. Headless rendering uses four CPU threads.

`build` creates geometry, saves editable Blender source, exports and optimizes a GLB, checks it, renders front/side/rear/three-quarter views and a second lighting angle, and renders/composes a matched reference comparison when a reference GLB is supplied. No ImageGen or paid service is called. Existing validated artwork is reused.

The default view set also contains `diagnostic-clay.png` (shape/contact lighting without textures) and `diagnostic-unlit.png` (base color without surface lighting). These are renders of the exported mesh, not generated paintovers. Stage timings and logs help distinguish geometry/export work from rendering cost.

The validator also emits an **advisory** for exposed, co-facing, axis-aligned coplanar triangle overlaps. It lists world-space positions/normals and areas in `validation.json`; when findings exist, `qa/diagnostic-overlaps.png` and `qa/diagnostic-overlaps-rear.png` mark them in orange on the actual exported model. These markers are debug geometry in the render process only. They are removed before masks and are never exported into the asset. Interpret findings alongside clay/unlit views: underside contact or deliberately layered parts can require judgment. This is not a universal intersection detector, topology certificate or automatic visual rejection.

Read the returned JSON's `directory` and inspect its `qa/`, `qa-light-90/`, and `comparison/` images. Compare silhouette, components, negative space, grain direction, edge finish and lighting response. For example:

```sh
npm run asset -- review assets/authoring/supply-crate \
  --note "Inspected all views and second light; framing, grain and metal edges fit the family. Remaining differences: ..."
npm run asset -- pack assets/authoring/supply-crate --out /tmp/supply-crate-package
```

A developer or coding agent can make that review; the command is a recorded assertion, not proof that a human looked, and does not require asking the user for approval. It cannot automatically certify visual quality. A truthful review should name remaining differences.

## Commands

| Command | Result |
| --- | --- |
| `doctor` | Local runtime, Blender, Pillow and available recipe information |
| `init <new-directory> --recipe crate\|lantern\|custom` | `asset.json`, `brief.md`, and a custom recipe scaffold when needed |
| `prompt <project>` | Fixed ordered style images, pinned template and the variable brief assembled into `imagegen-request.json` |
| `build <project> [--draft] [--force]` | Isolated build, lints, normalized export, views, reference comparisons and manifest |
| `check <project>` / `status <project>` | Recompute model checks; reject stale inputs or changed artifacts |
| `report <project> [--out <new.md>]` | Current validity, historical attempts, failures, review notes, timings and evidence; optional exclusive Markdown handoff |
| `review <project> --note ...` | Bind visual findings to the current full-resolution artifacts |
| `review <project> --reject --note ...` | Record a visual rejection; packaging remains blocked |
| `pack <project> --out <new-directory>` | New runtime package; refuses missing/stale review and existing destinations |

All results are JSON. Progress goes to stderr; detailed process output stays in per-stage log files. Exit codes are 0 success, 1 process/asset failure, 2 invalid or stale input, and 3 missing/stale visual review. `--json` is accepted for agent callers; JSON is already the default. There are no prompts or TTY requirements.

Unchanged checked builds are reused without running Blender geometry or rendering. Changed briefs, recipes, reference files, style data, relevant instructions or the toolchain invalidate that reuse. `--force` creates a fresh run. A full-resolution cache can satisfy a draft request; draft renders cannot be approved or packaged.

After a failure or at handoff, use `npm run asset -- report <project> --out <new-report.md>`. It produces the repeatable audit from existing records; the agent supplies its visual judgment through `review --note`. With `--out`, stdout is a compact JSON summary and the full evidence links stay in the Markdown file. Without it, stdout contains the detailed JSON report. Existing reports are never overwritten. An old accepted run can appear in the history while current readiness is correctly `stale-build`; incomplete/unreadable attempts are labelled rather than invented as passes. Reports do not reconstruct shell history, inspect images, run a new build or replace validation.

## Make a new shape

The two golden recipes reproduce the measured lantern and crate. They are fixed geometry baselines, not arbitrary text-to-3D generation.

`examples/tackle-box.py` and its JSON contract retain the separately refined result of the fresh-agent trial, including its closed L-section corners, backed lid seam and corrected hinge/underside surfaces. Reuse this checked construction when suitable; it is a fixed authored example, so dimension changes may require geometry edits. The original trial's failures and the new diagnostic controls are retained in [proof/overlap-trial/](proof/overlap-trial/README.md).

```sh
npm run asset -- init assets/authoring/workbench --recipe custom
cp tools/asset-forge/examples/workbench.py assets/authoring/workbench/recipe.py
cp tools/asset-forge/examples/workbench.json assets/authoring/workbench/asset.json
npm run asset -- build assets/authoring/workbench
```

Edit the brief, expected `[width,height,depth]` dimensions in metres, required sockets and parameters in `asset.json`. The example workbench follows those dimensions and accepts a `planks` parameter. Keep changes within the profile's resource ceilings. New families or larger asset classes need an explicit new validated style/profile rather than silently loosening the current limits.

Implement `build(context)` in `recipe.py`:

- `context.parts` supplies measured boxes, beams, bolts, profile extrusions, bands and chain links.
- `context.material` supplies the approved mapped material; parts choose timber/metal regions through their strip argument.
- `context.spec`, `context.parameters` and a seeded `context.random` expose the job contract.
- `context.joints[name]` records three surface-depth probes for each critical connection declared in `asset.json`'s `requiredJoints`. Each probe has a unique `name`, `origin`, `direction` and `maxDistance` in metres/Blender coordinates. Multi-part custom assemblies without declared joints fail the build. The radio and workbench examples demonstrate the contract.
- Author in metres, Blender +Z up, with the intended front along -Y. Return named socket positions in that same space. The tool converts the output to glTF +Y up/+Z front and centres the pivot on the floor.

Custom recipes are **trusted local Python**, not sandboxed uploads. Keep them self-contained and deterministic. This tool must not be exposed to players or used as a public generation endpoint. ImageGen references or new geometry reasoning remain authoring work for the developer/agent; the tool automates the repeated construction setup, surface rules, export, checks and evidence.

## Enforced checks

- Actual GLB triangles, primitive groups, texture count/resolution and filesystem bytes.
- Expected dimensions and floor-centred pivot; finite attributes, valid triangle indices, UV0 and normals.
- Required named sockets and finite coordinates.
- Approved material names/factors, opaque static surfaces, preserved normal/metallic-roughness maps and exact approved texture payloads.
- Timber/metal UVs staying within their own atlas regions.
- Static geometry only: skins and animations fail this profile.
- Matching input and artifact hashes before review and packaging; QA images at the declared resolution.
- Exclusive new job/package paths, with no overwrite of an existing destination.
- Required joint contracts, three probes per joint, checked by ray intersections against the actual decoded optimized geometry. Missing, duplicate or failed probes block technical acceptance. The measured crate additionally requires 72 panel-depth probes.
- Bounded coplanar-overlap diagnostics, with explicit scope/completeness and marked renders. These produce warnings for inspection, not a technical pass/fail rule. Review records retain the diagnostic count and completeness.

Joint checks cover declared contact locations and allowable recess depth; they do not infer every intended connection or certify arbitrary mesh topology. Choose probes that cross each likely seam, keep intentional plank recesses within their declared tolerance, and inspect the rendered joins. The corner-wrap and enclosure helpers independently assert closed manifold construction before bevel/export. Combining disconnected pieces into one Blender object is insufficient.

The same three boards under `references/v1/` are supplied for every new item's concept request. They transfer the family, finish and contact contrast rather than the requested object's silhouette. `prompt` only prepares the request; the coding agent uses an available generator separately with those exact image inputs. Changing the fixed kit requires an explicit new version and profile update. A placeholder brief is marked `readyForGeneration:false`.

For an original prop, save the selected sheet as `<project>/concept.png` and its exact generation record as `concept-request.json`. They participate in build validity. The tool creates `comparison/concept-comparison.webp`, visibly distinguishing the generated concept from the real exported model. Its cameras may differ, so it produces no numerical style/similarity score.

The source atlas files live under `styles/`; they are authoring inputs and are not part of the game's public downloads. Golden geometry and construction helpers are pinned, attributed snapshots of our own retained study; the original experiments/skill scripts are untouched.

## Outputs and integration

Builds live in `<project>/.forge/run-<uuid>/`. A failed build retains its logs and does not replace the last successful pointer. The editable `source.blend`, source export, images and logs remain authoring evidence; commit your brief/recipe and retain desired evidence deliberately. `.forge/` is ignored.

The package includes `model.glb`, `manifest.json`, sockets, validation and review records. The runtime manifest contains content/style identifiers, metres/axes/pivot, real resource counts, bounds and collision metadata. It omits local authoring input paths. A generated box collider is a proposal marked for integration review; the wall lantern defaults to no collider.

La Baraj can integrate the packaged GLB and manifest through an ordinary feature change. Runtime integration must preserve the profile's PBR maps/factors and test day/night reflections, collisions and interaction sockets. Do not remove global material clamps as a side effect of importing one prop.

The three atlas images are identical across assets, but each GLB embeds them. Shared content identifiers support a future engine-side texture cache; this tool does **not** claim automatic cross-GLB GPU sharing, generated LODs, actual game FPS, visual 1:1 identity, or support for characters/vegetation/buildings. Those require their own validated profiles and scene tests.

The radio also uses one original 64×64 matte speaker-cloth map (222 encoded bytes). Its distinct material rules are pinned separately; timber and iron retain their normal/roughness maps and original texture hashes. Authoring references and proof images are not game downloads.

## Tests

```sh
npm run test:assets
```

These are offline Node tests with synthetic geometry and the retained approved texture payloads. They check protocol/lint/staleness/concurrency behavior without installing or invoking Blender. Real Blender reconstruction and render evidence is recorded separately in [PROOF.md](PROOF.md).
