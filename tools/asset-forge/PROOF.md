# Asset Forge v1 proof

31 October 2026. Developer tooling only: no game runtime assets, server, shared preview or production world changed.

## Resumed construction and joint checks

The results below supersede the original crate's joint acceptance. Its retained old export is now a failing regression case; an earlier technical pass did not establish that its seams were correct.

| Current exported prototype | GLB bytes | Triangles | Surface/joint checks |
| --- | ---: | ---: | --- |
| Original field radio | 155,296 | 2,778 | 36 probes across 8 metal wraps and 4 housing joins pass |
| Closed recessed crate | 124,376 | 1,440 | All 72 panel-depth probes pass |
| Workbench with shallow leg tenons | 108,840 | 604 | 12 probes across 4 leg contacts pass |

Node 24.22.1 and Blender 5.2.3 LTS. Four 512px views, clay/unlit diagnostics and a second key-light direction were rendered from each actual optimized GLB. The radio also has its original ImageGen concept and exact fixed-kit generation request retained. These are construction prototypes with explicit residual differences, not production-installed assets or exact Quaternius matches.

- [Radio before/after join close-up](proof/original-radio/joint-closeup.webp)
- [Radio full before/after view](proof/original-radio/joint-comparison.webp)
- [Radio concept versus actual exported views](proof/original-radio/concept-comparison.webp)
- [Crate matched reference turnaround](proof/crate-seams/turnaround-comparison.webp)
- [Workbench contact example](proof/workbench-joints/three-quarter.png)

The same 36 radio probes fail against the actual previous export, and all pass against the continuous corner-wrap/housing export. The old crate fails 24 of 72 probes. Both old models remain in the offline regression tests. A real headless multi-part build with no declared joints was also attempted and correctly rejected before export; see [missing-joints-check.json](proof/missing-joints-check.json).

Twenty-five offline Forge tests pass, including the actual retained before/after GLBs, mandatory declared joints, fixed style-kit stability across two different briefs, concept invalidation, diagnostic-artifact validity and visual rejection blocking packaging. The existing repository's 85 test files / 502 tests pass, and `tsc --noEmit` passes. Python sources compile. The real build/check/review/pack sequence completed for all three current prototypes.

Repeated unchanged checked builds returned `cached:true` without geometry/render stages: 215ms for radio, 207ms for crate and 199ms for workbench, measured inside the already-running Node process on this machine. This excludes Node startup and ImageGen, and is not a general hardware or game FPS benchmark. Actual per-stage measurements are in [resumed-results.json](proof/resumed-results.json). Stage-level restart/caching is not yet implemented.

Source recipes, contracts, original fixed style kit, prompts, comparisons and failure lessons are retained in this tool. Local editable .blend files and full logs are additionally preserved under this worktree's ignored `.forge/retained-joint-proof-20261031/`; the recipes regenerate them. See [LESSONS.md](LESSONS.md) for the observed failure/correction chain.

## Actual local authoring pipeline

Historical first pass follows; its reviews predate the stricter joint checks above.

Node 24.22.2, Blender 5.2.3 LTS, Pillow 12.1.1. Actual Blender exports were decoded and linted, then re-imported for four 512px Cycles/AgX views at 24 samples with four CPU threads. Both reference props were rendered at matched normalized framing, including a second key-light azimuth for candidate and reference. The custom workbench demonstrates the same pipeline with a new recipe rather than a third hard-coded golden prop.

| Recipe | GLB bytes | Triangles | Result |
| --- | ---: | ---: | --- |
| Measured crate | 121,916 | 1,328 | Technical checks, visual record and package pass |
| Measured lantern | 141,416 | 2,490 | Technical checks, visual record and package pass |
| Custom workbench | 108,704 | 604 | Technical checks, visual record and package pass |

Literal counts/hashes and review status are in [proof/results.json](proof/results.json). Per-item folders retain actual GLBs, validation and runtime manifests, review notes, default/alternate lighting and reference turnarounds where applicable.

- [Crate matched turnaround](proof/crate/turnaround-comparison.webp)
- [Lantern matched turnaround](proof/lantern/turnaround-comparison.webp)
- [Custom workbench](proof/workbench/three-quarter.png)

The frame/body models remain close reconstruction prototypes, with the previously documented differences in grain, cap details, lantern chain contours, pointed ends and cage shoulders. The custom example has no claimed reference identity. The review record accepts their stated prototype/example scope; it does not make them exact matches or install them in the world.

## Tool behavior

Seventeen offline Node tests pass. They exercise real GLB decoding with synthetic geometry/approved texture payloads, schema failures, budget overruns, missing maps/sockets, UV strip leakage, material drift, stale input/artifact rejection, review/package gates, destination concurrency and cached reuse. These protocol fixtures are not visual quality evidence.

A second unchanged crate call returned `cached:true` and the same run without geometry/render steps. Actual review and pack commands completed for all three outputs. Runtime manifests omit authoring input paths, retain content/style identifiers and mark integration review required.

The first build attempts caught Blender import-context failures (`parts` path and missing `Matrix` import). The runner now declares its module path and forces Blender Python exceptions to produce a nonzero exit code, preventing a failed build from being accepted as success. The repeated authoring/export/comparison steps are pinned in the executable pipeline; the retained study/skill sources were not rewritten.

Clean-source archive replay and final repository integration checks will be recorded after the feature source is frozen. No new in-game performance, cross-GLB GPU sharing, generated LOD, collision playtest, or universal visual-quality claim is made.
