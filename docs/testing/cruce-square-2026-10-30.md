# Cruce furniture and square UI · 30 October 2026

Candidate: `07359d0`, PR36. Existing canonical4173 listener only. The release owner published the candidate under internal QA fixture routes while keeping the root game unchanged; no additional game/backend listener was started. The root/public rollout belongs to the release owner.

## Actual browser evidence

Captures remain in `.impeccable/review/cruce-square/`:

- `world-table-front.jpg`: same Quaternius timber/metal furniture family as Planes and dock bench;1.6m square top, four independent matching benches, grounded signpost.
- `world-four-seated.jpg`: four protocol participants seated at the new shared anchors, held card fans visible.
- `world-playing-panel.jpg`: real cut, auction, accepted card and subsequent completed four-card trick. The actual1280×720 CSS viewport has a280×280 square felt and a593px panel without internal overflow; the physical table and characters remain visible.
- `world-standing.jpg`: completed stand and test peer release, followed by successful F rejoin.
- `ui-lobby-short.jpg`:300px square lobby at1280×720, host settings and ready/seat controls reachable through normal internal scroll.
- `ui-duel-391.jpg`:391×844 component, eight-card hand on one horizontal scroll row (476px content,379px visible). Document width391, no horizontal page overflow; bidding controls fit. The overall game remains desktop gated.

F was exercised for authoritative sitting, active-match cancel, confirmed stand, and rejoin after the650ms stand animation. All four actual participants fit the separate benches. QA peers were explicitly released and the temporary world tab closed. The earlier missing Runabout asset in the fixture was resolved by copying the already-reviewed main assets; there were no further errors during the loaded-world test. Browser viewport overrides were restored.

The viewport provider uses0.75 device scale: a requested960×540 yields actual1280×720 CSS;293×633 yields391×844. Evidence reports measured CSS sizes, not requested sizes. Native captures include provider padding outside the actual viewport.

## Source and automated checks

-308 frontend tests and116 protocol/server tests pass; both TypeScript checks and production build pass. Targeted furniture, seat and board checks pass after the final1.46m bench-radius adjustment.
- New export checks compare dimensions against the shared seat contract, floor origin, exact original texture bytes and triangle counts.
- All four root positions clear a standing30cm capsule from the tabletop edge by more than2.5cm.
- Mechanical design scan:82 advisories,0 non-advisory findings. Advisories are the retained Cruce paper/felt palette, type sizes and local radii against the historical global DESIGN.md. No global theme drift was repaired as a side effect.
- Independent layout/source assessment and final actual-capture review: **SHIP**. No further visual refinement requested.

Original Table_Large/Bench assets remain unchanged. New runtime exports total277,680bytes, with all source hashes and exact dimensions in `docs/art-direction/cruce/furniture.json`; generator authority is `scripts/build-cruce-furniture.mjs`. The code-native derivative is the editable source, so no competing Blender file is introduced. The existing generated felt is retained; no new bitmap generation is needed to match the source furniture.

The shared seat radius changes from1.6m to1.46m; release must pair the frontend and Worker. Seat IDs, capacity, protocol schema, world identity, housing epoch and card rules are retained.
