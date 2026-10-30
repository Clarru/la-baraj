# La Baraj: relaxed movement and social play

Goal: make the existing lakeside world feel more expressive and comfortable for friends spending time together. Keep the established character, assets, single world, sparse HUD, homes and activities. This is an implementation and verification plan, not a claim of finished work.

## Baseline evidence

Baseline is main `67c59ab`: one shared world, persistent cabins, benches, temporary chat bubbles, swimming, scooter, punching/stun, Planes and Cruce. Both primary mouse buttons already rotate the camera. Scroll zooms. Punch currently uses Q; the controller uses a standing capsule. The shared 4173 preview includes an approved experimental rock and an independent Cruce QA page. Another active chat owns vegetation and other asset studies.

## First delivery: posture and comfortable controls

- C toggles crouch; Z toggles prone. Pressing the current stance key returns to standing when there is enough room. Switching between lowered stances should be predictable.
- Make real poses on the approved rig, with transitions and slower movement appropriate to each posture (initial targets: crouch 1.5m/s, prone crawl 0.65m/s; no sprint/jump/punch while lowered). Keep feet/body contact coherent on slopes and avoid stretching or flattening the character mesh.
- Fit collision to posture and refuse an expansion that intersects the world, using the target collider's overlap/sweep rather than a floor ray. Verify standing under furniture/roofs, not just open-ground visuals. Prevent vertical pops and invalid body transforms. Repeated toggles must not accumulate vertical drift. A blocked stand attempt stays lowered; moving into clear space permits standing.
- Jump, water, scooter, furniture, cabin doors, stun and reset must have explicit compatible transitions. Text entry, menus and card games own their keys. Window blur must release held input.
- Other players see the same posture through an additive optional stance enum on the existing pose transport. Missing stance defaults to standing; invalid enums are rejected. The server also rejects lowered players' punch requests. Avoid a new persistence subsystem or extra per-frame React state.
- Punch uses P or middle click on the world canvas, only while standing. Preserve left/right camera drags and wheel zoom. Keep the existing cooldown and server hit validation.
- Update on-demand help. Do not add permanent key legends or a large posture HUD. Blur releases all held input and clears incomplete gestures, but never forces a collider expansion into an obstruction.

## Next delivery: small social expression

The independent product review selected one worthwhile addition after the first delivery works: a greeting wave. The shipped clip named Wave is actually Idle_Talking_Loop and failed the review's raised-hand test, so a compatible raised-arm/wrist gesture is being authored separately. Its purpose is visible intent between friends without a chat message, another activity or persistent state. Confirm control conflicts, cancellation, remote playback and discoverability before implementation. Prefer an accessible action in the existing menu plus G over an emote wheel.

## Ownership and sequence

The release chat owns `codex/chill-movement`: plan, punch pointer adapter, help, integration and shared preview. A separate worker owns `codex/stance-movement`: posture, animation, controller and remote pose integration. Product and technical reviewers inspect independently. The asset chat keeps ownership of trees, rocks, grass and other art studies. Only the release owner publishes 4173 or integrates main.

1. Inventory actual input, animation, networking and collision code; review this plan independently.
2. Implement and test pure stance/input rules and rig poses on feature branches.
3. Integrate with current main, review failure paths and run frontend/protocol tests, both type checks and production build.
4. Publish a reversible local candidate to the existing 4173 listener, preserving the rock and QA fixture. Inspect crouch/prone from multiple angles, movement and transitions, and compare actual collider clearance.
5. Exercise two independent clients using the existing isolated in-memory browser transport. Verify remote transitions and cancellation without allocating production homes or touching live match state.
6. Address review findings and verify performance at a representative multiplayer load; compare renderer/frame metrics on the same scene rather than claim speed from polygon counts.
7. Add the selected social improvement, repeat the relevant checks, and open reviewable PRs with evidence. Release only verified changes under the standing workflow.

## Completion evidence

Record actual code/commit, automated checks, local screenshots, two-client behavior, clearance tests, mode-transition regressions, and a bounded performance comparison. Green unit tests alone do not establish believable animation or collision. Do not call this whole objective complete while any explicit movement/control requirement or selected social delivery lacks evidence.

Capture front, side and three-quarter views locally and remotely. Crouch must show bent knees, lowered pelvis/head and planted feet. Prone must show a connected horizontal torso, supported forearms and a face above the ground. Inspect the complete transition for detached clothing/hands/feet, vertical snaps and stale pose offsets. Record actual collider clearance under a ceiling and after moving clear. Test pose priority across stun, activities, water, scooter, doors and reset; safe collision takes precedence over automatic visual cleanup.

## Deliberate boundaries

No account system, progression economy, new currency, combat progression, new rooms, mobile work, visual asset replacement, paid hosting, or world reset. Do not turn lowering posture into a competitive stealth mechanic. Keep time available for visual correction and testing rather than expanding the feature list.

## Product review outcomes

The product reviewer supports C/Z toggles and P with a middle-click alternative, requests a 6px movement threshold to cancel accidental mouse punches, and recommends G for a one-shot greeting using the existing rig. Keep stance collision conservative and prove it before enabling traversal benefits. They also found stale Q/left-mouse punch documentation, now updated in this branch. A roster is deferred until people actually need it. The final technical and runtime evidence is recorded below; the dated progress sections preserve earlier findings.

## Final technical acceptance (30 October)

PR33 integrates against released main `190d7bd`, preserving the Cruce followup. The final character uses the approved model, original crouch clips and an offline target-rig bake for belly idle/crawl. `scripts/prone-retarget.ts` is authoring code; runtime loads the two baked clips through the existing action library. Existing action data is unchanged. Mesh-owned conservative skinned bounds replace the earlier frustum bypass; whole-avatar distance culling remains.

- Front/side/three-quarter dressed-rig and actual-world checks accepted grounded crouch and belly-down crawl. A second normal local client rendered the same explicit prone posture, animation and visual root. A mild slope changed support by 0.125m over 1.38m without a floating root.
- The final real Ecctrl/Rapier fixture walked crouched under its 1.2m ceiling, refused standing there, accepted prone with horizontal collider rotation persisting after simulation, returned to crouch, and stood after moving clear. Eight additional C/C/Z/Z toggles stayed grounded: standing height returned to 1.090229m on all four cycles, crouch approximately 0.58045m and prone approximately 0.43020m.
- Actual controller tests verified lowered speed limits, jump suppression, P/middle-click punch and Q removal, G cancellation by movement/reset, and no stale gesture state. Protocol tests cover optional stance compatibility and server rejection of lowered punches. Chat C/Z/P/G remained text. Planes seating owned its keys and restored standing after leaving.
- The normal combined-world smoke verified menu greeting eligibility after settling, menu-triggered greeting, prone scooter mount rejection, standing mount/rider/park, land-gesture suppression on the scooter, crouched cabin exit to standing, crouch-to-swim conversion and standing walking after swimming ashore. No production homes or matches were allocated by these RAM-only tests.
- The measured 50-avatar comparison is in [performance/CHILL_MOVEMENT.md](performance/CHILL_MOVEMENT.md), including raw counters. Solo remained 120fps on the recorded M4 Pro; walkers averaged 74.4fps (baseline 78.3), riders 65.5fps (baseline 67.4), mixed crouch/crawl 74.4fps. The modest draw overhead is an accepted conservative-culling cost; mesh/material/texture counts did not grow. Distant-avatar cleanup released active rig resources. These are this machine's steady-state samples, not a universal frame-rate guarantee.
- Shared 4173 is the normal combined world without QA controls. The exact approved rock and opt-in shrub study are preserved separately; no study asset/code is in this PR or its production deployment. No extra listener, hosting upgrade, room or world reset was introduced.

See [testing/chill-movement-controller.md](testing/chill-movement-controller.md) for detailed runtime evidence. Automated totals and deployment verification are recorded on PR33 at the reviewed head.

## Historical progress (29 October, before acceptance)

- `codex/chill-movement`: pointer helper reserves stationary middle click, cancels travel over 6px, pointer leave/cancel/lost capture and window blur; keyboard integration remains owned by stance worker. Focused pointer/camera/UI tests passed (15 at initial pass); subsequent pointer/camera checks passed (8). Frontend typecheck passed before stance integration.
- Dedicated `Social_Wave` additive clip has been integrated from `f51db3a`. Real-rig tests verify normalized finite transforms, raised hand and restoration. Under Node 24.22.1, wave + world collision + remote scooter suites pass 9 tests. Visual fixture and in-world gesture integration are still pending; do not equate bone-height assertions with a visually accepted greeting.
- Stance implementation is still under review on `codex/stance-movement`. Initial draft review flagged expansion clearance for prone-to-crouch, pointer/keyboard grounded parity, visual root offset and the need to replace swimming-like prone motion with credible land motion. Real Rapier clearance tests are being added by that worker.
- The Cruce follow-up chat owns the localhost in-memory transport, square table geometry and held-card gestures. Its future shared-file hooks will be merged deliberately with stance/wave changes. Production origin remains strict.
- The currently served 4173 main game, approved rock swap and Cruce QA fixture have not been replaced by this goal's unfinished branches.

## Historical revision evidence

- The first in-world posture pass failed visual acceptance: prone idle was upright/buried and crouch barely lowered the silhouette. Those aliases are no longer the intended delivery.
- A fresh inventory of the full original `human_male.glb` found 86 animations, including `Crouch_Idle_Loop` and `Crouch_Fwd_Loop`. The runtime now uses extracted `Crouch_Idle`/`Crouch_Walk` clips through the existing action JSON; all previous clips remain byte-equivalent as parsed data. Added compressed payload is about 52 KB. Both full and incremental extraction scripts preserve these clips.
- Real-rig crouch validation checks a hip drop over 20cm and the actual deformed mesh's lowest vertex within 1.5cm of the floor. An authored raised heel makes ankle-joint height unsuitable as a sole-contact assertion.
- Skinned character pieces now bypass stale bind-pose frustum bounds; whole-avatar distance culling remains. Hair/beard skin weights and head tracks were verified before changing this.
- Controller followups fix posture-aware ground probing, full target orientation/volume clearance, collision-safe prone turning and cabin-path expansion checks. Exact capsule-axis tests cover four cardinal headings.
- The revised branch passes 218 frontend tests and 114 server/protocol tests under Node 24, plus frontend/server type checks. In-world authored crouch/prone, wave/reset/menu, two-client visual parity and representative performance checks still remain; these test totals are not release acceptance.
- The preview is temporarily allocated to the Cruce followup's final world/hand check. Its local-only candidate preserves the approved rock and QA routes. The normal pre-QA build is preserved at the release owner's recorded temporary backup path.
