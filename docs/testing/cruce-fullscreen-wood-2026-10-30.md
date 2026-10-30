# Cruce fullscreen and timber revision · 30 October 2026

The owner rejected the compact side panel and the resized furniture's wood finish after the earlier square-table review. This revision supersedes that visual acceptance. The green felt was explicitly approved and remains unchanged.

## Actual browser evidence

Existing4173 listener only. Release owner published internal component/world fixtures while preserving the normal root and other chats' studies. Captures are in `.impeccable/review/cruce-fullscreen/`:

- `playing-final-1280.jpg`: actual1280×720 CSS viewport; full720px board without internal page overflow,393.5px square felt,96px private cards,18px body and20px player names. Header, score/turn and hand stay visible. The first360px-square pass was corrected through header/tray spacing; card size was retained.
- `playing-final-1440.jpg`: actual1440×900;531.7px square table,112px private cards,78px public cards. A real fixture card action updated trump, turn, own hand and public trick.
- Rules toggle hides the interactive workspace and shows a full-width independently scrolling20px reading surface with header actions retained. Hidden controls are excluded from the existing focus trap.
- `exchange-ten-1280.jpg`: real three-player talon setup through configure/ready/cut/auction/trump. Ten cards are76px wide in a single row (866px scroll extent/860px client), with recipient selection visible. Both give actions succeeded and reduced the hand to eight.
- `wood-world-first.jpg` and `wood-world-final.jpg`: real Game scene with original new3D joinery, per-timber longitudinal grain, all four occupied benches/held cards, retained green felt and grounded timber sign. Existing furniture remains beside it for comparison.
- Actual Game F entry, fullscreen open/back, leave and movement away from the new bench passed. Browser error log was empty. A hand left idle during visual inspection timed out as designed; this was not reported as a completed new full-hand run.

The supplemental391×844 component had no horizontal document overflow and kept the eight-card hand in its own scroller. Its pre-correction capture showed a side badge overlapping center copy; source then moved side badges to22% height and narrowed the center text region. Desktop is accepted; no mobile-game acceptance claim is made because the overall game is desktop-gated.

Native capture provider padding lies outside the measured CSS viewport. QA controls were hidden through an authored visible button for clean final evidence. The world test tab was closed, its peers released through the existing cleanup, and viewport overrides restored.

## Assets and implementation

- Editable geometry authority: `scripts/build-cruce-furniture.mjs`. Original beveled rails/planks, four braced table legs, two bench trestles, stretcher and dark iron coach bolts. The neighboring Quaternius props are style references; no copied mesh is in the new exports.
- `Cruce_Table_Wood.glb`:3584triangles,350216bytes. `Cruce_Bench_Wood.glb`:1316triangles,248280bytes. One table plus four benches:8848triangles,15 material primitives before shadow passes.
-1024px ImageGen wood albedo: `apps/web/public/assets/cruce/wood-grain-v2.webp`. Exact built-in prompt/master/conversion: `docs/art-direction/cruce/wood-prompt.json`. Project master is preserved under ignored `generated/`; runtime material is embedded in the GLBs and used by the sign/UI frame.
- Existing1.28m green felt,24 card faces and card-holding animation remain unchanged. Shared1.6m table,1.12m benches and1.46m seat-radius contract retained from the preceding candidate. Client and Worker still need paired release for that radius change.
- Old resize-only Cruce_Table/Cruce_Bench derivatives are removed from the proposed runtime; previous internal fixture assets remain preserved by the release owner for their old immutable chunks.

## Checks

317 frontend tests pass. Target furniture/geometry/board tests pass after the new meshes. Export checks verify actual bounds/floor, real wood image bytes, complete finite normal/UV data and bounded triangle counts. TypeScript and normal production build pass; normal chunks exclude QA toolbar strings. The preceding116 protocol tests remain applicable: this revision changes no engine/server rules or wire schema.

Mechanical scan:84 advisories,0 non-advisory. Retained Cruce materials/type values intentionally differ from the historical global design document; no unrelated theme repair was attempted. Independent final desktop visual/source review: **SHIP**. Supplemental mobile advisory remains outside desktop acceptance.

## Coordinated canonical preview publication

After merging release main `e78265b13298ec11a364e02c9042246c20e0663d`, the release owner delegated the single-preview publication slot. Current integrated checks pass:318 frontend tests,116 server/protocol tests, both TypeScript checks and combined normal production build. Root4173 was published without starting or stopping a listener. It loads normally without QA controls or browser errors.

Published runtime source: `44e3fb1` (current-main merge after fullscreen/timber head4461668). Entry `index-CB3gyjpx.js`, Game `Game-DH7JgdSB.js`; root index SHA256 `c3607cb00750220acfeab41382857edf34700b0c6431c8a76771f4afe59d5c0d`. Previous root is recoverable at `/tmp/la-baraj-before-cruce-fullscreen-2fbvodef/dist`.

The exact approved local rock (`cd3bd08c5ee24e159777f0608cd38af00981613a27c618d89cc53ba658971c7e`), shrub (`2e6ef4136e3cd3cf1ffb6f9097a0d92161303c519d23bfcf7c8dcf56ead6f490`), localhost opt-in query/scale, default foliage, existing internal pages and older immutable chunks were retained. Temporary study source edits were restored; feature tree remained clean. Current character-actions data is byte-equal the merged main source, retaining the latest prone/wave fixes. The root smoke tab was closed. Preview ownership was returned to the release owner; production/main/Worker publication remains theirs.
