# 2048 extension documentation review

This is a fresh independent documentation-subagent pass required by Impeccable. The named documenter role was unavailable, so Impeccable's degraded/fallback documenter contract was used for this pass. It records the shipped extension and preserves the incumbent global system; it does not make new product or design decisions.

## Scope and source of truth

The requested ordinary extension is the original La Baraj 2048 cabinet: an upright timber/iron/forest-green PBR prop with a real mesh screen, a playable 4×4 board, a personal persistent game per cabin owner, and a derived global top-ten board. The direction and acceptance contract is [`arcade2048.md`](../briefs/arcade2048.md). The finalized local extension is summarized in [`arcade/README.md`](../../experiments/asset-skill-lab/arcade/README.md), and the reusable transfer lessons are in [`interactive-props.md`](../../.agents/skills/la-baraj-3d-assets/references/interactive-props.md).

Ground truth was read from the implementation, not inferred from the brief or images:

- [`Arcade2048.tsx`](../../apps/web/src/Arcade2048.tsx) owns the GLB, named moving nodes, runtime CanvasTexture, pointer UV mapping, accessibility controls, focus behavior and local avatar visibility. The semantic `Joystick` node is now an exported parent hinge at y=0.967 m; its `JoystickHandle` child retains the mesh after quantization.
- [`arcade2048-screen.ts`](../../apps/web/src/arcade2048-screen.ts) owns the 512×640 logical screen, color/font treatment, hit regions, 150 ms tile animation and terminal overlays.
- [`use-arcade2048.ts`](../../apps/web/src/use-arcade2048.ts) owns resume, move throttling, pending/error state and action precedence.
- [`arcade2048.ts`](../../apps/server/arcade2048.ts) owns server-side rules, random spawns, best-score persistence, request de-duplication and revision serialization.
- [`index.ts`](../../apps/server/index.ts) loads the housing-epoch-prefixed records and disables arcade capability for that Worker wake if storage initialization fails. [`room-core.ts`](../../apps/server/room-core.ts), [`protocol.ts`](../../packages/shared/protocol.ts), [`multiplayer.ts`](../../apps/web/src/multiplayer.ts) and [`Game.tsx`](../../apps/web/src/Game.tsx) keep the transport, capability snapshot, distance/vehicle/seat gates, focus camera and additive multiplayer integration scoped.
- [`arcade2048-asset.test.ts`](../../apps/web/src/arcade2048-asset.test.ts), [`arcade2048-screen.test.ts`](../../apps/web/src/arcade2048-screen.test.ts), [`use-arcade2048.test.tsx`](../../apps/web/src/use-arcade2048.test.tsx), [`tests/arcade2048.test.ts`](../../tests/arcade2048.test.ts), [`tests/arcade2048-worker.test.ts`](../../tests/arcade2048-worker.test.ts) and [`tests/protocol.test.ts`](../../tests/protocol.test.ts) were checked for the documented contracts.

The existing [`PRODUCT.md`](../../PRODUCT.md), [`DESIGN.md`](../../DESIGN.md), [`docs/art-direction/ui/README.md`](../../docs/art-direction/ui/README.md), asset contract, optimization record and provenance record were also checked. No global design file, product file, protocol file or source file was edited in this documentation pass.

The final browser-acceptance record is [`arcade2048-2026-10-30.md`](../../docs/testing/arcade2048-2026-10-30.md), with observations in [`browser-observations.json`](../../docs/testing/captures/arcade2048/browser-observations.json) and exact restoration proof in [`restoration.json`](../../docs/testing/captures/arcade2048/restoration.json). The accepted candidate was `9ab4427fd97336ab2aadb9308d357a39fcaaabd4`, including released main `85184dbcfded16fc6b1a3142afadf3bf179a58bd`; the tested keyboard route was from `ac5b9e8`. The sole preview owner granted an additive slot on the existing 4173 listener, both browser clients were closed, 251 baseline files were restored byte-for-byte, and ownership returned at 18:39:05 Europe/Bucharest. No production Worker deployment or merge occurred.

The backend resource correction is recorded in [`arcade2048-write-budget.md`](../../docs/testing/arcade2048-write-budget.md) and the current service in [`apps/server/arcade2048.ts`](../../apps/server/arcade2048.ts). The ranked service now enforces a default **50,000 successful logical saves per UTC day** across ranked owners. An optional per-owner `{ day, count }` meter is persisted in the same owner row as board, best and request history, only after the owner save succeeds; there is no separate counter write. Reads, no-op/unchanged moves and resumes, already-continued wins, duplicate requests and failed writes are free. Local unranked practice bypasses the meter. Legacy rows remain valid, restart reloads the meter, UTC rollover resets only the meter, and the cap returns **“Saving is paused for today. Your board is safe.”** without changing the accepted board, best, revision or request history. The backend correction covers legacy/restart/rollover/last-slot, failure/retry, rename/continue, no-op/read/dedup and local-bypass cases; an actual Worker test also proves fire still writes while arcade saving is capped. This is an application logical-save guard, not a total Cloudflare or provider billing guarantee.

## Finalized extension

The runtime asset is an original, authored cabinet rather than a reconstructed source mesh. The decoded measurements are approximately 0.760 × 0.724 × 1.913 m; the nominal contract is 0.76 × 0.72 × 1.92 m. The shipping GLB is 245,680 bytes, 7,082 triangles, five mesh objects and 13 primitives. Its four embedded PBR maps are no larger than 512×512. `Screen`, `Joystick`, `ButtonNew` and `ButtonScores` remain semantic runtime nodes. `Joystick` is the parent hinge with decoded translation y=0.967 m, while `JoystickHandle` is its mesh child; this preserves the intended pivot after quantization. The screen UV uses the verified top-left origin; Three's `CanvasTexture` uses `flipY=false`, and pointer UVs are mapped directly to the logical canvas.

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

The final export correction added 76 bytes to the shipping GLB (245,604 → 245,680) while retaining 7,082 triangles and the same static projection pixels. The independent decoded asset test now asserts the semantic `Joystick` parent translation at y=0.967 m and requires a mesh-bearing `JoystickHandle` child. The QA re-import remains a separate asset-evidence file with its QA-only screen image.

Every relative link in this report was resolved from `.impeccable/review`: the sibling brief uses `../briefs/...`, while repository-root targets correctly use `../../...`.

### Actual browser acceptance

The bounded browser pass loaded the actual Game, physics controller, cabinet, Canvas screen and local SharedWorker authority through an additive slot on the sole 4173 preview; it did not use a standalone prop viewer or synthetic screen app. The following actual-world routes passed: walk to the station and E entry; focus camera with lake/world continuity and local avatar hiding; arrows/WASD legal moves; drag across the real mesh screen; measured pointer Scores/cancel/Leave; N followed by Enter or Space to confirm New game; ordinary-board Enter inert; Escape cancel from confirmation, return from records and leave the cabinet; two real players with independent homes, boards and bests; shared **Local records**; exact personal resume; and settled full reload with all 16 cells and score/best 220/220 restored.

The browser captures inspected for this recheck are [`desktop-reload-resumed.jpg`](../../docs/testing/captures/arcade2048/desktop-reload-resumed.jpg), [`paired-records.jpg`](../../docs/testing/captures/arcade2048/paired-records.jpg) and [`narrow-desktop.jpg`](../../docs/testing/captures/arcade2048/narrow-desktop.jpg). The reload capture shows the resumed 220/220 board in the real lake/world; the paired-records capture shows two local entries (44 and 4) and the correct **Local records** label; the narrow capture shows the board, New game, Scores and Leave visible. The narrow CSS viewport was 390×844 with a fine pointer, not mobile-UA or touch emulation; the existing minimap overlaps the lower hint/control-deck area, and the main accepted that scope without a layout repair. Actual Game framing uses 48° FOV; the earlier 50° Blender focus studies remain projection evidence.

The combined candidate record reports **401 frontend tests in 75 files**, **148 protocol/backend tests in 11 files**, frontend/server TypeScript and production build passing. The single earlier UI detector pass returned no findings. This documentation recheck did not rerun broad tests. Browser limits remain: no genuine mobile-UA/touch behavior, reduced-motion media emulation, browser-reached 2048 win, same-owner stale-tab race or storage-failure injection. The corresponding DOM, hook and actual-Worker logic is covered by tests where applicable; the device gate was unchanged.

The reproducible asset path is [`reproduce.sh`](../../experiments/asset-skill-lab/arcade/reproduce.sh) from the repository root with `ASSET_LAB_BLENDER` and `ARCADE_QA_CANVAS_MODULE` supplied. It renders the Canvas output, builds the source cabinet, applies the paint material, optimizes and copies the GLB, re-imports a QA clone, creates projection studies and runs the focused asset/screen checks. It does not start a web or server process.

The previous documentation pass reran:

- the three focused frontend files: 7 tests passed;
- `npm run test:protocol -- --run`: 10 files, 136 tests passed;
- `npx tsc --noEmit`: passed;
- `npm run server:check`: passed.

The latest merged revision (`93e883b`, including export correction `32a179f`) additionally reports 393 frontend tests and 145 protocol tests, with both typechecks and the production build passing. The later browser candidate record reports 401 frontend tests in 75 files and 148 protocol/backend tests in 11 files, with both typechecks and the production build passing. The subsequent backend resource correction reports 159 full backend tests passing; the final frontend rerun also completed with 401 tests passing. This fresh documentation recheck did not rerun tests; it validated the browser record, named captures, restoration facts, write-budget record, current backend semantics, changed export facts and report links only.

The bounded browser acceptance is complete for local SharedWorker practice, and the backend write-budget correction is independently scoped as ship. Production/global ranking deployment and compatible Worker release remain pending. No production Worker deployment, publication, FPS certification or total provider-billing guarantee is claimed. The browser pass did not exercise mobile-UA/touch, reduced-motion media, a browser-reached win, same-owner stale-tab racing or storage-failure injection; these remain explicit limits rather than failed acceptance cases.

## Reusable transfer lessons

1. Keep static shell, screen, joystick and buttons as separately named runtime parts. A blanket join destroys interaction semantics and pivots.
2. Reuse accepted trim/PBR data selectively. A small original painted-timber map solved the mottled green-iron failure while retaining shared normal and packed reflection information.
3. Validate the exported glTF material and re-import it. Blender MixRGB intent is not proof of the runtime color factor.
4. Test focused-camera clearance from the player's eye, including narrow aspect projections. The first joystick and marquee studies exposed visible overlaps that the orthographic turnaround alone did not catch. Preserve mechanism pivots as explicit semantic parent nodes when an optimizer or quantizer can recenter mesh nodes.
5. Treat live display evidence, prop evidence and browser evidence as separate gates. A generated concept is not a playable screen; a Canvas capture is not browser input or network evidence; the actual-world browser record is needed for route, framing, input and persistence claims.
6. For Meshopt index validation, compare cyclic rotations lexicographically rather than using `indexOf(min)` or sorting triangle vertices. Preserve exact decoded attributes, winding and map pixels.
7. Keep prop-only material clones and cache the material list; do not mutate the scene environment or global loader policy.
8. Define terminal-state precedence in the shared interaction contract, then test every input path. The win-before-no-moves rule now exists in the canvas hit regions, React controller and assistive action surface.
9. Keep application save budgets attached to the logical owner write: count only after successful persistence, keep legacy rows readable, preserve board/best/request history at the cap, and never describe the meter as a total provider-billing guarantee.

## System consistency outcome

This is an ordinary extension of the accepted timber/iron prop family, not a new global visual world. The cabinet's warm paper, forest, ochre and terracotta display treatment is a local screen surface that uses the existing Bree Serif/Alegreya Sans public UI family described in [`docs/art-direction/ui/README.md`](../../docs/art-direction/ui/README.md). The bounded browser pass confirms the local route in the actual Game without changing the global system. It does not authorize changing the global `DESIGN.md`, `.impeccable/design.json`, `PRODUCT.md`, HUD, minimap, world materials or other games.

Known pre-existing documentation drift was left in place by request: [`DESIGN.md`](../../DESIGN.md) and [`.impeccable/design.json`](../design.json) still describe the earlier cool-paper/slate Barlow survey HUD and its provisional feasibility framing, while the later public UI reference and this arcade surface use the Bree/Alegreya timber-sign family. The documents also carry parallel historical statements about minimap treatment. This pass reports the drift rather than repairing or reconciling global files, because the brief explicitly requires preserving them.

## Five-line system summary

- **Palette:** Warm paper and deep forest ink, with forest-green controls, ochre/gold identity and terracotta secondary action; tile colors rise through cream, ochre, terracotta and forest.
- **Type ramp:** Bree Serif carries the 2048 display and titles; Alegreya Sans carries score labels, controls, status and accessible copy; live labels remain text, never baked into the prop.
- **Shape and depth:** A tactile upright shell uses accepted timber/iron PBR materials, a real screen bezel, semantic moving controls, flat color blocks and restrained physical feedback.
- **Named rules:** Keep the screen live; keep interactive nodes separate; verify exported glTF; preserve direct UV orientation; prioritize uncontinued win before no-moves; never add Undo.
- **Evidence rule:** Blender/decoded-GLB, Canvas, focused projection, tests, the bounded local browser pass and the backend resource review each prove only their stated scope; production/global ranking, FPS certification, compatible Worker release, deployment, publication and total provider billing remain unresolved.

## Unresolved facts

The bounded local browser acceptance is complete, including two private local boards, Local records, exact personal resume and settled 220/220 reload. The backend logical-save correction is documented and independently scoped as ship, with the actual Worker fire-continuity check recorded. Production/global ranking and compatible Worker release/deployment remain pending. Genuine mobile-UA/touch, reduced-motion media, browser-reached win, same-owner stale-tab racing and storage-failure injection remain unrun in the browser. The 50,000-save meter must not be read as a total provider-billing guarantee. The existing global design-document drift remains intentionally unrepaired.
