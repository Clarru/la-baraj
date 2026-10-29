# La Baraj: relaxed movement and social play

Goal: make the existing lakeside world feel more expressive and comfortable for friends spending time together. Keep the established character, assets, single world, sparse HUD, homes and activities. This is an implementation and verification plan, not a claim of finished work.

## Current evidence

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

The product reviewer supports C/Z toggles and P with a middle-click alternative, requests a 6px movement threshold to cancel accidental mouse punches, and recommends G for a one-shot greeting using the existing rig. Keep stance collision conservative and prove it before enabling traversal benefits. They also found stale Q/left-mouse punch documentation, now updated in this branch. A roster is deferred until people actually need it. Technical review and runtime verification remain pending.

## Progress evidence (29 October, current feature branches)

- `codex/chill-movement`: pointer helper reserves stationary middle click, cancels travel over 6px, pointer leave/cancel/lost capture and window blur; keyboard integration remains owned by stance worker. Focused pointer/camera/UI tests passed (15 at initial pass); subsequent pointer/camera checks passed (8). Frontend typecheck passed before stance integration.
- Dedicated `Social_Wave` additive clip has been integrated from `f51db3a`. Real-rig tests verify normalized finite transforms, raised hand and restoration. Under Node 24.22.1, wave + world collision + remote scooter suites pass 9 tests. Visual fixture and in-world gesture integration are still pending; do not equate bone-height assertions with a visually accepted greeting.
- Stance implementation is still under review on `codex/stance-movement`. Initial draft review flagged expansion clearance for prone-to-crouch, pointer/keyboard grounded parity, visual root offset and the need to replace swimming-like prone motion with credible land motion. Real Rapier clearance tests are being added by that worker.
- The Cruce follow-up chat owns the localhost in-memory transport, square table geometry and held-card gestures. Its future shared-file hooks will be merged deliberately with stance/wave changes. Production origin remains strict.
- The currently served 4173 main game, approved rock swap and Cruce QA fixture have not been replaced by this goal's unfinished branches.
