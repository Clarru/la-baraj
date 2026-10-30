# 2048 extension documentation review

This is the fresh in-thread documenter pass required by Impeccable. The named documenter subagent was unavailable, so the degraded documenter contract was executed inline. The pass records the shipped extension and preserves the incumbent global system; it does not make new product or design decisions.

## Scope and source of truth

The requested ordinary extension is the original La Baraj 2048 cabinet: an upright timber/iron/forest-green PBR prop with a real mesh screen, a playable 4×4 board, a personal persistent game per cabin owner, and a derived global top-ten board. The direction and acceptance contract is [`arcade2048.md`](../../.impeccable/briefs/arcade2048.md). The finalized local extension is summarized in [`arcade/README.md`](../../experiments/asset-skill-lab/arcade/README.md), and the reusable transfer lessons are in [`interactive-props.md`](../../.agents/skills/la-baraj-3d-assets/references/interactive-props.md).

Ground truth was read from the implementation, not inferred from the brief or images:

- [`Arcade2048.tsx`](../../apps/web/src/Arcade2048.tsx) owns the GLB, named moving nodes, runtime CanvasTexture, pointer UV mapping, accessibility controls, focus behavior and local avatar visibility.
- [`arcade2048-screen.ts`](../../apps/web/src/arcade2048-screen.ts) owns the 512×640 logical screen, color/font treatment, hit regions, 150 ms tile animation and terminal overlays.
- [`use-arcade2048.ts`](../../apps/web/src/use-arcade2048.ts) owns resume, move throttling, pending/error state and action precedence.
- [`arcade2048.ts`](../../apps/server/arcade2048.ts) owns server-side rules, random spawns, best-score persistence, request de-duplication and revision serialization.
- [`index.ts`](../../apps/server/index.ts) loads the housing-epoch-prefixed records and disables arcade capability for that Worker wake if storage initialization fails. [`room-core.ts`](../../apps/server/room-core.ts), [`protocol.ts`](../../packages/shared/protocol.ts), [`multiplayer.ts`](../../apps/web/src/multiplayer.ts) and [`Game.tsx`](../../apps/web/src/Game.tsx) keep the transport, capability snapshot, distance/vehicle/seat gates, focus camera and additive multiplayer integration scoped.
- [`arcade2048-asset.test.ts`](../../apps/web/src/arcade2048-asset.test.ts), [`arcade2048-screen.test.ts`](../../apps/web/src/arcade2048-screen.test.ts), [`use-arcade2048.test.tsx`](../../apps/web/src/use-arcade2048.test.tsx), [`tests/arcade2048.test.ts`](../../tests/arcade2048.test.ts), [`tests/arcade2048-worker.test.ts`](../../tests/arcade2048-worker.test.ts) and [`tests/protocol.test.ts`](../../tests/protocol.test.ts) were checked for the documented contracts.

The existing [`PRODUCT.md`](../../PRODUCT.md), [`DESIGN.md`](../../DESIGN.md), [`docs/art-direction/ui/README.md`](../../docs/art-direction/ui/README.md), asset contract, optimization record and provenance record were also checked. No global design file, product file, protocol file or source file was edited in this documentation pass.

## Finalized extension

The runtime asset is an original, authored cabinet rather than a reconstructed source mesh. The decoded measurements are approximately 0.760 × 0.724 × 1.913 m; the nominal contract is 0.76 × 0.72 × 1.92 m. The shipping GLB is 245,604 bytes, 7,082 triangles, five mesh objects and 13 primitives. Its four embedded PBR maps are no larger than 512×512. `Screen`, `Joystick`, `ButtonNew` and `ButtonScores` remain semantic runtime nodes. The screen UV uses the verified top-left origin; Three's `CanvasTexture` uses `flipY=false`, and pointer UVs are mapped directly to the logical canvas.

The screen is drawn by the runtime [`drawArcadeScreen`](../../apps/web/src/arcade2048-screen.ts) function onto a 768×960 canvas whose logical coordinate system is 512×640. It uses Bree Serif for the display/title voice and Alegreya Sans for utility labels, with warm paper, forest green, ochre/gold, terracotta and deep forest ink. The physical screen and the hidden semantic HTML controls use the same action set. There is no Undo control or parser action.

The interaction contract is:

- Walk to the east-edge station at x=12, z=70.3753; E or click opens the cabinet.
- Arrow/WASD input and screen/joystick swipes submit directions; N opens New game; L opens records; Escape backs out of a page or leaves from the board.
- New game confirms before discarding a run. The cancel copy is **Keep this game**.
- An uncontinued win has precedence over a no-moves state. Both the canvas hit-test and the controller choose **Keep going** first, even when the winning board is full; only a continued blocked board falls back to **New game**. The assistive action list carries the same precedence.
- Production records are private per home owner. The Worker generates spawns and scores, commits the row before acknowledging a changed move, rejects stale revisions, strips forged board/score fields at protocol parsing, and derives public top-ten rows without home credentials. Local SharedWorker practice is explicitly unranked and local-only.
- The server advertises `features.arcade2048`; the frontend sends no arcade action to a Worker that does not advertise the capability. Distance, vehicle, seat and stunned-state gates stay on the server.

The prop loads under its own Suspense boundary once the player is within 65 m. The focused camera blends over 0.5 s and becomes immediate under `prefers-reduced-motion: reduce`. Tile slide/merge and hardware feedback use 150 ms; screen texture uploads happen only while dirty or animating and are capped at 30 Hz. Scoped material clones consume the cached lake reflection environment without changing global material policy. The focused avatar is hidden only locally; remote players retain their normal view.

## Evidence checked

The evidence bundle at [`experiments/asset-skill-lab/arcade/`](../../experiments/asset-skill-lab/arcade/) contains:

- [`screen-preview.png`](../../experiments/asset-skill-lab/arcade/screen-preview.png), [`screen-leaders.png`](../../experiments/asset-skill-lab/arcade/screen-leaders.png) and [`screen-confirm.png`](../../experiments/asset-skill-lab/arcade/screen-confirm.png): actual Canvas draw output from `render_screen.mjs`, not browser screenshots.
- [`qa-final/`](../../experiments/asset-skill-lab/arcade/qa-final/): decoded shipping geometry and the actual Canvas snapshot re-imported into Blender for fixed-neutral-light front/side/three-quarter studies. Its QA GLB includes a screen image and is therefore not the shipping byte-count evidence.
- [`focus/`](../../experiments/asset-skill-lab/arcade/focus/): runtime camera-FOV/distance projection studies at 1440×900 and 390×844. These test framing only.
- [`contract.json`](../../experiments/asset-skill-lab/arcade/contract.json), [`optimization.json`](../../experiments/asset-skill-lab/arcade/optimization.json) and [`provenance.json`](../../experiments/asset-skill-lab/arcade/provenance.json): measured dimensions, limits, Meshopt/data preservation and provenance.

The reproducible asset path is [`reproduce.sh`](../../experiments/asset-skill-lab/arcade/reproduce.sh) from the repository root with `ASSET_LAB_BLENDER` and `ARCADE_QA_CANVAS_MODULE` supplied. It renders the Canvas output, builds the source cabinet, applies the paint material, optimizes and copies the GLB, re-imports a QA clone, creates projection studies and runs the focused asset/screen checks. It does not start a web or server process.

This reviewer reran:

- the three focused frontend files: 7 tests passed;
- `npm run test:protocol -- --run`: 10 files, 136 tests passed;
- `npx tsc --noEmit`: passed;
- `npm run server:check`: passed.

No browser gameplay pass, keyboard/mouse acceptance against shared `http://127.0.0.1:4173/`, paired-player ranking check, FPS measurement, publication or deployment was run here. The shared preview remains owned by another chat. The images above must not be described as browser acceptance.

## Reusable transfer lessons

1. Keep static shell, screen, joystick and buttons as separately named runtime parts. A blanket join destroys interaction semantics and pivots.
2. Reuse accepted trim/PBR data selectively. A small original painted-timber map solved the mottled green-iron failure while retaining shared normal and packed reflection information.
3. Validate the exported glTF material and re-import it. Blender MixRGB intent is not proof of the runtime color factor.
4. Test focused-camera clearance from the player's eye, including narrow aspect projections. The first joystick and marquee studies exposed visible overlaps that the orthographic turnaround alone did not catch.
5. Treat live display evidence and prop evidence as separate gates. A generated concept is not a playable screen; a Canvas capture is not browser input or network evidence.
6. For Meshopt index validation, compare cyclic rotations lexicographically rather than using `indexOf(min)` or sorting triangle vertices. Preserve exact decoded attributes, winding and map pixels.
7. Keep prop-only material clones and cache the material list; do not mutate the scene environment or global loader policy.
8. Define terminal-state precedence in the shared interaction contract, then test every input path. The win-before-no-moves rule now exists in the canvas hit regions, React controller and assistive action surface.

## System consistency outcome

This is an ordinary extension of the accepted timber/iron prop family, not a new global visual world. The cabinet's warm paper, forest, ochre and terracotta display treatment is a local screen surface that uses the existing Bree Serif/Alegreya Sans public UI family described in [`docs/art-direction/ui/README.md`](../../docs/art-direction/ui/README.md). It does not authorize changing the global `DESIGN.md`, `.impeccable/design.json`, `PRODUCT.md`, HUD, minimap, world materials or other games.

Known pre-existing documentation drift was left in place by request: [`DESIGN.md`](../../DESIGN.md) and [`.impeccable/design.json`](../design.json) still describe the earlier cool-paper/slate Barlow survey HUD and its provisional feasibility framing, while the later public UI reference and this arcade surface use the Bree/Alegreya timber-sign family. The documents also carry parallel historical statements about minimap treatment. This pass reports the drift rather than repairing or reconciling global files, because the brief explicitly requires preserving them.

## Five-line system summary

- **Palette:** Warm paper and deep forest ink, with forest-green controls, ochre/gold identity and terracotta secondary action; tile colors rise through cream, ochre, terracotta and forest.
- **Type ramp:** Bree Serif carries the 2048 display and titles; Alegreya Sans carries score labels, controls, status and accessible copy; live labels remain text, never baked into the prop.
- **Shape and depth:** A tactile upright shell uses accepted timber/iron PBR materials, a real screen bezel, semantic moving controls, flat color blocks and restrained physical feedback.
- **Named rules:** Keep the screen live; keep interactive nodes separate; verify exported glTF; preserve direct UV orientation; prioritize uncontinued win before no-moves; never add Undo.
- **Evidence rule:** Blender/decoded-GLB, Canvas, focused projection and tests are bounded evidence; browser interaction, shared-preview acceptance, FPS, ranking with another player, deployment and publication remain unresolved.

## Unresolved facts

Browser acceptance and release-worker deployment are still pending. No claim is made that the sole shared preview was run for this extension, that a paired-player leaderboard was exercised, or that the measured bytes imply decoded GPU memory or an FPS result. The existing global design-document drift remains intentionally unrepaired.
