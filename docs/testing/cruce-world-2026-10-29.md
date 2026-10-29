# Cruce physical interaction follow-up — 2026-10-29

## Reproduced failure

The canonical localhost preview had no room-server configuration. The original Cruce implementation intentionally refused offline seat claims, so F could not start the table interaction. The old picnic model also contained integrated seating; adding four benches produced overlap. Exact measurement of the old separate Bench asset gives a 1.2998m scaled width and one valid registered seat, so zero capacity was not the root cause.

## Changes

- A square 1.9m timber tabletop with green felt at 0.82m and four independent 1.1m-wide benches. Bench centers are 1.6m from the table center, outside the top footprint; each registers exactly one usable seat. Shared server/client seat anchors use the same dimensions. Legs, slab and bench surfaces have explicit fixed colliders.
- A localhost-only SharedWorker authority reusing the actual RoomCore, table engines, protocol parser and per-connection hand projection. Same-build tabs share one local world, without another listener. Production still uses its configured backend and exact origin policy. The local resume key is session-scoped and distinct from the production credential store; local progress is ephemeral.
- Reusable mesh card fans attached to retained hand bones, reversible arm IK and authored HoldRod finger grip. Opponents render backs; only the owning character receives its private face IDs. Accepted public plays animate the right hand and a face-up card flight to the tabletop. Landed trick cards remain until collection. Standing hides props and restores the authored animation pose.
- The active-game panel moves aside on wide desktop layouts, leaving the 3D table/gesture visible while keeping trump, public trick cards and private hand readable. Lobby/rules/results retain the full board.

The fresh independent finish review is SHIP. It verified the worker-error cleanup, close-acknowledgement handshake, hitch-safe card-flight origin and effect-owned StrictMode rig lifecycle; no material finding remains for this follow-up.

The final release-gate review also resolved the two late regressions. `createCruceCharacterController` is side-effect-free for idle avatars and allocates the card rig only while a seated character has a hand or public trick; the back texture is lazy, the existing shared `characterClips` cache supplies `Activity_HoldRod`, and leaving disposes the complete mesh/material/geometry set. The stripped `PerformanceLab`/crowd fixture contract now permits remotes without `getSnapshot`; `remoteCruceView` returns `null` for that fixture and passes through a real Cruce view when available. This prevents eager card work for idle crowds and avoids the `{remotes}`-only fixture crash.

## Browser checks on the one existing 4173 listener

An explicitly flagged QA build ran the actual 3D Game. Its labelled local test controls position the test actor and add three isolated local peers, each using ordinary protocol packets and only its own projected hand. Those controls are excluded from normal production builds.

Passed in browser:

1. Real F claim from beside the physical table; seat-down animation and Romanian board open.
2. Four occupied physical seats, readiness and auction.
3. Held card props for owner and remotes; accepted play/right-arm movement, face-up flight and landed card.
4. Complete 24-card hand through actual card buttons. Final collected points were 60 + 60 = 120, yielding 1–1 score.
5. Stand, release and rejoin with F after the stand animation finishes.
6. F during an active hand opens the warning; cancel remains seated, confirm stands and stops the hand.
7. Two separate browser tabs share the same local table. The second tab claimed the south seat; the first could not claim that occupied seat and could join another free seat.
8. First sitter's target change to 15 appeared in the other tab. The nonhost could not edit settings.
9. Test peers and second tab were released/closed after inspection.

Evidence under `.impeccable/review/cruce-world/`: `play-00.jpg` through `play-11.jpg`, `complete-hand.jpg/json`, `stand-and-rejoin.jpg`, `two-tabs-shared-table.jpg/json`, `cards-held-1280.jpg`, `leave-confirm-1280.jpg`, `table-square-1280.jpg`, `viewport.json`. DOM viewport was 1280×720 with scrollWidth 1280; the screenshot provider pads that override in a 1707×960 bitmap. Portrait captures reflect the user's actual narrower/taller app panel. Test controls are QA tooling, not product controls.

Within the play sequence, `play-04.jpg` and `play-09.jpg` are the concrete held-card/flight evidence: the owner and remote actors expose their appropriate private face/back props, and an accepted card appears face-up in flight before the public trick settles on the physical tabletop.

## Automated checks

The final `npm test` run passes 211 frontend tests; `npm run test:protocol` remains green with 114 protocol/server tests. The targeted world follow-up checks also pass. Coverage includes LocalWorldRoom worker errors, close acknowledgement and StrictMode reconnect teardown; four registered seats and geometry clearance; retained-skeleton hand pose and unchanged limb lengths; reversible finger grip against an unmodified animation mixer; remote back-only card mapping; once-only accepted-card motion; hitch-safe face-up flight; repeated resource cleanup; zero card-resource loads for 50 idle avatars; full disposal over three seated/standing cycles; and both real-snapshot and stripped `{remotes}` fixture contracts. Normal TypeScript and production build checks pass.

The Impeccable detector also ran once for this follow-up. It reported 80 advisory findings (46 palette, 9 radius, 25 type-size) and 0 non-advisory findings. These are documented as detector drift against the older global design file; they were not repaired or promoted into the global design system during this ordinary extension.

The production release and integrated smoke check remain the release owner's responsibility. Browser evidence here proves the actual 3D local game and local shared authority, not an unobserved remote four-person production session.

Final normal bundle was checked for the authored QA toolbar strings; no test controls were present. A single existing listener remained on port4173.

Local normal fixes are published by the release owner. Production rollout remains pending the corrected commit and review; this record does not claim a deployed multiplayer follow-up.
