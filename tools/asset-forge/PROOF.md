# Asset Forge v1 proof

31 October 2026. Developer tooling only: no game runtime assets, server, shared preview or production world changed.

## Actual local authoring pipeline

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
