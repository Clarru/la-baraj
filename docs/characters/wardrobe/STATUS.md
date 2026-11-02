# Wardrobe implementation status

The optional wardrobe is implemented on `codex/appearance-wardrobe` and remains
unreleased. The approved male GLB is unchanged (SHA256
`1c89c5710998736679a7a10403e89f998a912624c1fe674959668364bd2ba520`).
Production integration and release belong to Main orchestrator.

## Implemented scope

The men's catalogue has three modeled hairstyles, three modeled hats plus None,
three tops, three bottoms and three shoes. Short beard and moustache supplement
the existing full beard and clean-shaven option. Hair and cloth palettes are
bounded choices. Tall/ankle/low footwear fit variants preserve covered skin and
trouser boundaries. Classic trouser dye uses its own neutral albedo UV set while
retaining the approved normal/roughness atlas.

The selectable female preset has brunette hair, structured black blazer with
lapels, cropped high-neck top, tailored high-waisted shorts, belt/gold buckle,
sheer tights and pointed pumps with heels. The publisher's authored hair islands
are fitted to the coat and canonical rig; the rejected added forelock tubes and
white-brow candidate are preserved as local controls rather than published.

Menu → Appearance has a real demand-rendered rotatable preview, category focus,
Apply/Cancel, Reset look and explicit loading/save errors with Retry. Changes use
normalized cosmetic IDs, authoritative owner saves and a separate appearance
message; ordinary pose packets do not reparse cosmetic fields. Local/remote
actors share one canonical skeleton each and immutable geometry/textures, with
actor-owned materials. The original male look loads zero extra wardrobe files.
The local SharedWorker path uses the same bounded owner profile store in memory;
restoration is only promised while that worker survives, not after its expiry.

Official Quaternius CC0 Standard downloads, provenance, license notices, exact
ImageGen prompts/references and reproducible Blender scripts are retained. Raw
archives, original sources and editable Blender scenes remain ignored locally.
The runtime pack contains 24 selected GLBs; acceptance.json now pins their accepted
visual/sampled-action hashes, and the noncandidate pack completed successfully.

## Evidence completed

- Independent settings UI review: **ship at dialog/workflow scope**, with loaded
  Chromium and WebKit desktop, phone portrait and phone landscape evidence.
  Apply/Cancel/reset, two-client agreement, restored selection, all options,
  asset-failure retention/Retry, delayed-request ordering and cleanup passed.
  See UI_REVIEW.md for exact scope and resource limits.
- Independent men's neutral fit review: **pass across all 243 core combinations**,
  front and rear, with source and PNG hashes. See NEUTRAL_FIT_REVIEW.md.
- Female targeted correction review: dark brows/iris readability, integrated hair
  roots, prior prone hatching and stylized prone drape resolved; no new material
  fit failure observed in neutral/side/rear/sit/crouch/prone/swim evidence.
- Frozen `b2e28ac` runtime: 88 actual WebGL front/rear sampled frames cover three
  complete men's outfits and the female preset in 11 clips. The men's selections
  cover each modeled hair/hat/top/bottom/shoe choice. Independent full-mesh/sampled-action
  review passed at the scope recorded in MESH_ACTION_REVIEW.md; sampled frames
  are not a complete animation sweep.
- Actual Game with two independent clients on the local SharedWorker: female Apply,
  observer agreement and same-worker reload restore passed. Campfire sit, standing
  fishing cast, mounted scooter/boat movement and walking were state checked.
  Prone was independently corroborated by the observer's remote posture and a
  visible settled capture (`verified-clear-grass-prone-front.png`).
- Final men's actual-contact pass: all three complete outfits applied through
  normal UI, with observer agreement; each captured in campfire sit, fishing wait,
  scooter and boat movement. All 12 captures showed no new material fit/contact
  failure at gameplay scale; zero page errors/sockets. The independent mesh/action reviewer inspected
  all 12 captures and found no material actionable issue.
- Earlier misleading `actual-prone.png`/`actual-crouch.png` and tree-occluded prone
  captures are explicitly excluded from visual acceptance. No physics or gameplay
  source was changed to make these tests pass.
- B2 female has 30,254 triangles and 12 rendered primitives, versus the rejected
  control's 35,310 triangles/13 primitives. Matched isolated desktop crowd results
  are recorded in RUNTIME_REVIEW.md; they do not establish iPhone performance.

`REVIEW_EVIDENCE.json` pins local reports and all 88 adverse-pose capture hashes.
Final source checks passed: frontend **582/582** across 100 files, protocol
**182/182** across 14 files, and server TypeScript. Material positive/negative
controls 2/2 and focused local factory/catalogue 18/18 passed earlier. Client
TypeScript and production/isolated QA builds passed for the frozen runtime;
the final accepted-pack production build also passed. Catalogue actual-byte/hash
checks 5/5 and material controls 2/2 passed again after acceptance packing.

## Preview safety and remaining work

All three bounded shared-preview sessions are closed. The B2 session removed exactly
35 authorized, hash-matching additions and verified all 351 original files plus
the normal HTTP index. Listener PID35046 was untouched. The earlier C60 session and final short B2 contact-completion session
also restored their protected baselines. No production connection, live world/home
write, Worker deployment or additional listener was made by these QA fixtures.

Still required: release-owner code/provenance review, any resulting finite fixes,
main integration/release and production verification. Existing mobile controls,
chat, 2048, ownership and world integration must be preserved. No further model
or preview work is outstanding from the completed finite review.
