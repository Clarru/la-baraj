# Improvements learned from the fresh-agent trial

31 October 2026. These are developer controls, not game-installed assets or universal style/geometry acceptance.

| Retained export | What it establishes |
| --- | --- |
| `rejected.glb` / `rejected.png` | The trial's broad coplanar corner/lid patches passed the old 33 joint checks. The new advisory retains 100 findings and explicitly marks its analysis bounded; some overlap areas exceed 0.001 square metres. |
| `accepted.glb` / `accepted.png` | The visually accepted original remains an honest control with 19 smaller findings: one hinge end and 18 underside intersections. The diagnostic was not tuned to pretend it was clean. |
| `refined.glb` / `refined.png` | A separate authored refinement lengthens the hinge barrel by 2mm to avoid coincident cap/leaf end planes and recesses the internal backer bottom by 1mm above the corner feet. It has zero findings within this diagnostic's limited scope; all 33 joint samples still pass. |

The refined source and contract are canonical in [examples/tackle-box.py](../../examples/tackle-box.py) and [examples/tackle-box.json](../../examples/tackle-box.json). The original fresh-agent trial and editable sources remain untouched in the ignored authoring directory.

- [Marked front view](diagnostic-overlaps.png) and [marked rear view](diagnostic-overlaps-rear.png) show advisory positions on the original export. Orange spheres are render-only debug objects, removed before masks and absent from runtime geometry.
- [Refined model](refined.png) is an actual re-imported GLB render.
- [Generated report](generated-report.md) demonstrates the new `report --out` command. Its absolute links refer to this machine's retained job; regenerate a report for another checkout.
- [Results and measured timings](results.json) record the tested counts: 2,356 triangles, 144,596 GLB bytes, 33 passing joint samples. Warm checked reuse was 223ms and report generation 27ms inside one running Node process; neither is a general hardware/FPS claim.
- [Actual wrong-runtime response](runtime-mismatch.json) was generated under Node 20.17.0 and parsed as JSON. Selecting Node 24 restores normal operation; no runtime was downloaded or installed.

Thirty-eight offline tool tests pass, including shared-edge/opposing-face exclusions, separated and occluded surfaces, adjacent plane buckets, analysis limits, all three retained tackle-box controls, four pre-existing clean prop controls, reports of stale/rejected/unbuilt/unreadable attempts, exclusive report output and compact CLI handoff. The normal application suite's 507 tests and TypeScript check also pass.

Coplanar findings are advisory: only co-facing axis-aligned pairs, with declared tolerances and bounded pair/finding counts, are analyzed. Visibility is sampled along a face normal. Angled geometry, other intersection types, materials, UVs, unsampled regions and art quality still require inspection. Zero findings means this detector found none; it is not a topology or visual-quality certificate.
