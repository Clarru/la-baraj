# Cap construction reset

The user's priority is a realistic shape and anatomical fit with stylised game
shading. The previous procedural/GUI-edited cap and subsequent seam-only changes
were rejected. They remain research controls, not accepted runtime assets.

See CAP_APPROACHES.md for the five construction methods compared. The selected
study uses the approved head as a fitting surface, samples a clean quad cage,
relaxes the cage, and derives the visor's sewn root from the actual lower opening.
The head mesh, rig and animations are preserved. Under-cap hair follows the scalp
with a small offset; percentage shrinking was rejected because it exposed skin.

Current experimental builder: scripts/prototype-cap-scalp.py.
Current editable source: assets/source-models/wardrobe/cap-anatomical-study.blend.
Current export: assets/source-models/wardrobe/build/hat-panel-cap.glb.
The user approved this anatomical cap on November 2, 2026 and requested the same
fit-first process for the other hats, plus colour controls. Shared-world/release
verification remains separate from that visual approval.
The older build-wardrobe-hats.py cap snapshot must not overwrite this study.

The offscreen renderer uses actual wardrobe loading, exported GLBs, Appearance
lights and retained poses. It starts no server and performs no HTTP requests.
It is not evidence of shared-world or device performance acceptance.

Display copies belong in the chat's registered visualization directory. Old chat
image links into the separate Git worktree produced user-reported Bad Request
responses; that cause remains a hypothesis until the display-copy test is confirmed.
