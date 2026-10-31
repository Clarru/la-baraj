# La Baraj Asset Forge

Build and check static 3D props through one developer CLI. Use the measured timber/iron family, enforce resource and material rules, render the actual exported GLB, record a visual review, then package it. The tool starts no server and never installs assets into the game automatically.

This is executable tooling, not a prompt or another skill. The existing [asset skill](../../.agents/skills/la-baraj-3d-assets/SKILL.md), [two-prop results](../../experiments/asset-skill-lab/RESULTS.md) and [surface study](../../experiments/asset-skill-lab/material-study/RESULTS.md) supply the baseline. Their hashes participate in build validity.

## Quick start

Use Node 24 and the repository's `npm ci`. Install Blender separately if it is unavailable; the tool does not download software. Comparison sheets use Python 3 with Pillow.

```sh
npm run asset -- doctor
npm run asset -- init assets/authoring/supply-crate --recipe crate
npm run asset -- build assets/authoring/supply-crate
npm run asset -- check assets/authoring/supply-crate
```

Blender is discovered from `ASSET_FORGE_BLENDER`, the retained `ASSET_LAB_BLENDER` setting, or the installed macOS application paths. Pass `--blender /absolute/path/to/Blender` explicitly on other systems. The tested authoring version is Blender 5.2.3; its actual version is recorded with every build. Headless rendering uses four CPU threads.

`build` creates geometry, saves editable Blender source, exports and optimizes a GLB, checks it, renders front/side/rear/three-quarter views and a second lighting angle, and renders/composes a matched reference comparison when a reference GLB is supplied. No ImageGen or paid service is called. Existing validated artwork is reused.

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
| `build <project> [--draft] [--force]` | Isolated build, lints, normalized export, views, reference comparisons and manifest |
| `check <project>` / `status <project>` | Recompute model checks; reject stale inputs or changed artifacts |
| `review <project> --note ...` | Bind visual findings to the current full-resolution artifacts |
| `pack <project> --out <new-directory>` | New runtime package; refuses missing/stale review and existing destinations |

All results are JSON. Progress goes to stderr; detailed process output stays in per-stage log files. Exit codes are 0 success, 1 process/asset failure, 2 invalid or stale input, and 3 missing/stale visual review. `--json` is accepted for agent callers; JSON is already the default. There are no prompts or TTY requirements.

Unchanged checked builds are reused without running Blender geometry or rendering. Changed briefs, recipes, reference files, style data, relevant instructions or the toolchain invalidate that reuse. `--force` creates a fresh run. A full-resolution cache can satisfy a draft request; draft renders cannot be approved or packaged.

## Make a new shape

The two golden recipes reproduce the measured lantern and crate. They are fixed geometry baselines, not arbitrary text-to-3D generation.

```sh
npm run asset -- init assets/authoring/workbench --recipe custom
cp tools/asset-forge/examples/workbench.py assets/authoring/workbench/recipe.py
npm run asset -- build assets/authoring/workbench
```

Edit the brief, expected `[width,height,depth]` dimensions in metres, required sockets and parameters in `asset.json`. The example workbench follows those dimensions and accepts a `planks` parameter. Keep changes within the profile's resource ceilings. New families or larger asset classes need an explicit new validated style/profile rather than silently loosening the current limits.

Implement `build(context)` in `recipe.py`:

- `context.parts` supplies measured boxes, beams, bolts, profile extrusions, bands and chain links.
- `context.material` supplies the approved mapped material; parts choose timber/metal regions through their strip argument.
- `context.spec`, `context.parameters` and a seeded `context.random` expose the job contract.
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

The source atlas files live under `styles/`; they are authoring inputs and are not part of the game's public downloads. Golden geometry and construction helpers are pinned, attributed snapshots of our own retained study; the original experiments/skill scripts are untouched.

## Outputs and integration

Builds live in `<project>/.forge/run-<uuid>/`. A failed build retains its logs and does not replace the last successful pointer. The editable `source.blend`, source export, images and logs remain authoring evidence; commit your brief/recipe and retain desired evidence deliberately. `.forge/` is ignored.

The package includes `model.glb`, `manifest.json`, sockets, validation and review records. The runtime manifest contains content/style identifiers, metres/axes/pivot, real resource counts, bounds and collision metadata. It omits local authoring input paths. A generated box collider is a proposal marked for integration review; the wall lantern defaults to no collider.

La Baraj can integrate the packaged GLB and manifest through an ordinary feature change. Runtime integration must preserve the profile's PBR maps/factors and test day/night reflections, collisions and interaction sockets. Do not remove global material clamps as a side effect of importing one prop.

The three atlas images are identical across assets, but each GLB embeds them. Shared content identifiers support a future engine-side texture cache; this tool does **not** claim automatic cross-GLB GPU sharing, generated LODs, actual game FPS, visual 1:1 identity, or support for characters/vegetation/buildings. Those require their own validated profiles and scene tests.

## Tests

```sh
npm run test:assets
```

These are offline Node tests with synthetic geometry and the retained approved texture payloads. They check protocol/lint/staleness/concurrency behavior without installing or invoking Blender. Real Blender reconstruction and render evidence is recorded separately in [PROOF.md](PROOF.md).
