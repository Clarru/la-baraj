# Appearance extension — UI review handoff

## Scope and disposition

This records the finished UI scope of the additive Menu → Appearance extension. A fresh independent fallback reviewer returned **ship** for this scope across all five contract sections: persistence, fidelity/established-world adaptation, finish ceiling reached, no material fixes indicated, and the Apply/Cancel/reset/error workflow. The fallback was used because the named shipped reviewer role was unavailable; this is not a human-review claim and does not claim that the named role reviewed the work.

The verdict is deliberately bounded to this dialog and its local/remote appearance workflow. It is not a declaration that every exported model, animation/action, or the whole game is finished. Full GLB combination/closeup/action acceptance and production integration acceptance remain with the parent work.

## Evidence checked

- Frozen QA head: `c60c06703f9d00bd533237c713a15de0e7fecf1c`.
- Chromium and WebKit both have valid loaded captures for desktop (`1440×1000`), phone portrait (`393×852`), and phone landscape (`852×393`), including default, female, paired-female, and configured states. Both reports have `errors: []`, `sockets: []`, and `external: []`.
- The desktop, portrait, and landscape checks all report `cancel: true`, `apply: true`, `twoClientAgreement: true`, `restoreSelection: true`, and `reset: true`; each reports horizontal overflow as `false`.
- The extended Chromium pass recorded asset-failure retention with Retry recovery, last-selection-wins ordering under delayed downloads, every modeled option, all nine trouser/shoe fits, cream classic-trouser dye, mouse rotation, stopped idle-preview rendering, and release of preview contexts after repeated close. `idlePreviewClears` is `0`; the post-menu main canvas recorded 39,762 triangles, 21 draw calls, 14 textures, and a 16.86 ms mean frame in the captured desktop fixture.
- The screenshots show the loaded Bree Serif/Alegreya Sans treatment, parchment-and-timber frame, real character preview, selected forest controls, category focus, independent controls scrolling, and Apply/Cancel/reset affordances. The reports’ requested asset lists identify the hashed wardrobe GLBs used by the fixture.

Evidence files: `.impeccable/review/wardrobe/captures/chromium/report.json`, `.impeccable/review/wardrobe/captures/chromium/extended-report.json`, `.impeccable/review/wardrobe/captures/webkit/report.json`, and their sibling screenshots.

## Established-world system preserved

The extension inherits the current public shell in `apps/web/src/game-art.css`: `--paper: #f3e5c9`, `--ink: #263b30`, `--muted: #58604b`, `--line: #c8b996`, `--accent: #355e46`, warm sign text, and the `parchment-panel.webp` / `sign-plaque.webp` artwork. Bree Serif remains the heading face; Alegreya Sans remains the body/control face with self-hosted Latin and Latin Extended 400/700 faces. The dialog keeps the existing nine-slice paper/timber frame, square silhouette, and restrained drop shadow; the appearance page adds no new identity, concept, or world surface.

The extension-local values in `apps/web/src/appearance.css` are component treatment, not a replacement token system: warm preview surface `#e6dfcd`; cream controls `#faf4e5` and `#f8f1df`; forest selected/primary state `#2e4938` with `#fff5dc` text; ink `#263b30`; quiet borders `#a5ac92`; category selection as a forest underline; small 5px control corners and an 8px preview corner. Focus remains a native visible outline, with the inherited paper/timber vocabulary around it. Native buttons, `aria-pressed` selection, touch manipulation, and keyboard focus behavior stay intact.

The responsive composition is an extension of the same dialog: a large real preview and grouped choices on desktop, a stacked preview/control flow in portrait, and a compact two-column landscape arrangement. The outer dialog uses a max `940px × 690px` frame with safe-area-aware viewport bounds; the controls pane scrolls independently with contained overscroll. The source’s short-height rules tighten the heading, dialog padding, rows, and footer rather than introducing a second mobile interface. Chromium/WebKit portrait and landscape captures verified the resulting bounds without horizontal overflow.

## Functional and resource boundaries

`AppearanceDialog.tsx` stages a draft, preserves the previous applied look until Apply succeeds, supports Male/Female, category focus (Hair, Hats, Tops, Bottoms, Shoes), modeled choices and swatches, full-look/reset-view controls, Reset look, Cancel, and Apply look. Loading or preview failure disables Apply and exposes Retry; failed saves remain visible as an error, and unavailable network state reports that the look must be saved after reconnecting. The real `Canvas` uses demand rendering, DPR `[1, 1.5]`, low-power WebGL, and orbit rotation with pan/zoom disabled; category focus changes the camera target/distance.

The wire format is bounded to normalized cosmetic IDs in `packages/shared/appearance.ts`; no asset paths or material values cross the wire. `wardrobe-catalog.ts` allowlists hashed GLB URLs and loads only selected replacements (the approved original look requests no extra wardrobe files). `avatar-wardrobe.ts` de-duplicates in-flight asset loads, shares approved textures, guards stale selections, swaps parts only after all requested pieces bind, and disposes actor-owned parts/materials on teardown. This is an on-demand, allowlisted resource boundary—not a claim of a general LRU/eviction policy. The extended report’s repeated-close check confirms preview contexts are released.

The local preference path normalizes and safely stores only the bounded appearance record. `MultiplayerRoom` includes that record in hello, accepts the authoritative snapshot, sends Apply through the room, confirms the latest request, and updates remote players with normalized data. The paired fixture’s `twoClientAgreement` and `restoreSelection` checks passed. The frozen preflight also confirms an additive QA entry, reuse of the existing `Lakeside_Man`/animation/UI dependencies, no replacement of the normal index/editor/default avatar, and no backend listener, production socket, Worker deployment, or live-world write.

## Guardrails and remaining scope

**Preserve the paper-and-timber shell.** Keep the current warm paper, forest ink, Bree/Alegreya pairing, nine-slice panel, native controls, and selected forest fill for future appearance surfaces.

**Keep the preview real and bounded.** Preserve the demand-rendered rotatable model, category focus, selected-only wardrobe loads, stale-request protection, Retry recovery, and cleanup behavior.

**Keep the world unchanged.** This is a precise settings extension of Menu; it does not redesign the HUD, world, movement, multiplayer lifecycle, or asset provenance system.

**Do not canonize unfinished model acceptance.** The wardrobe authoring contract still requires all minimum combinations plus closeup and action-pose checks, and the project status keeps those visual/model gates and production integration acceptance pending. Those are intentionally outside this UI disposition.

`DESIGN.md` and `docs/art-direction/ui/menu-preview.png` remain authoritative and unchanged. No token drift, pre-existing model drift, or production-integration gap was repaired or redefined by this UI handoff.
