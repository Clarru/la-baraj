# Cruce at the lake

There is exactly one physical Cruce table: the east picnic table beside Planes. It has four physical seats. There is no virtual table creation, room browser, password or separate-lobby system. All Cruce interface text, accessible card names, rules and server recovery messages are Romanian. Walk to it and press F to sit, or open its contextual Join or watch action. Escape folds the board while holding the place; F or „Ridică-te” leaves. An active match asks for confirmation because leaving stops it for everyone. All participants must sit and ready up. The first seated player controls match settings and retains that role when a later arrival occupies a lower-numbered seat or when they change seats. If they leave, another seated player inherits the role. Seats can be changed only between matches.

## Rules and variants

Primary rule source: https://tromf.ro/tutorial.htm. Current create-table choices were inspected at https://tromf.ro/cruce/ on 2026-10-29. The live create-table UI adds the three-player four-card bidding variant and a 15-point match target. A live occupied table requires authentication; no account was created to inspect it.

- Duel: eight cards each, eight in stock; trump is the first led suit. Winner draws before loser. Suit/trump restrictions start only after the stock is empty.
- Three, standard: bid from four, declare trump, then four more each starting at the bidder.
- Three, talon: seven each and a three-card talon. The bidder chooses trump, takes the talon and gives one card to each opponent, ending with eight each, following the tutorial's explicit distribution rule. The current UI calls this discarding two without specifying recipients.
- Four, individual: six each, first led card sets trump, individual scores.
- Four, teams classic: six each, first led card sets trump, opposite players share score.
- Four, teams standard: the player to dealer's right accepts (six-card bidding) or cuts (three-card bidding, explicit trump, then three more each starting with the bidder). This follows the site's documented accept/cut distinction.

Bid once clockwise, pass or strictly increase I–VI. All-pass deals again and rotates the dealer. A bid is 33 points per level. Cards rank Nine, Unter, Ober, King, Ten, Ace, worth 0, 2, 3, 4, 10, 11. Follow suit, otherwise trump, otherwise discard. Iber optionally requires beating the best card of the led suit when possible unless an off-suit trump has been played. A led Ober/King while holding both can announce 20, or 40 in trump. No invented last-trick bonus.

Scores are floor(collected / 33). A failed bidder's scoring group receives minus the bid. Target is 6, 11, 15 or 21, with tied leaders playing on. Optional cheating lets illegal cards through; opponents explicitly accuse before the next hand. Proven offences void that hand and cost 3 plus a winning bid; false accusations cost the accuser 3. Final-hand accusations remain available before a rematch.

Turns have a 60-second deadline. Completed tricks remain visible for 1.8 seconds. A lost connection pauses the hand and holds the seat for 30 seconds; leaving, expiry or a turn timeout stops the match without awarding a fabricated winner. Players can ready up again. Unfinished hands are not scored.

## Before the first hand

The same physical table has explicit Romanian UI for an empty table, choosing a free seat, an incomplete roster, all players seated, ready confirmations, a full table viewed by a spectator, a reserved reconnect, and an interrupted match. Only the rule owner edits the variant/target/Iber/cheating controls; everyone sees the rules. Applying changed rules clears readiness. Simultaneous readiness from one unchanged configuration is accepted; an older confirmation cannot approve changed rules. If a variant requires different physical seats, the UI identifies the people who must change seats before it enables Apply.

## Server integration

`packages/shared/cruce.ts` is a pure rules engine. `apps/server/cruce-table.ts` serializes joins and moves, validates stored records, persists before publishing, deduplicates request IDs and provides connection-specific views. Hands, stock contents, captures and offence audit never enter spectator or opponent views. Stable cabin identity resumes a seat across a new socket; an older or competing tab does not gain the hand.

The existing RoomCore, protocol, MultiplayerRoom and single Durable Object alarm carry Cruce alongside Planes, homes and weather. The new durable key is `cruce-table-v1`; existing keys and protocol version remain. Deploy the compatible Worker before integrating the frontend. This branch does not deploy the Worker or merge main.

## Card art

The owner rejected the initial sheet. Final art uses 24 individually prompted built-in ImageGen calls, with further corrections for the Leaves/Acorns pip layouts. Traditional references: https://github.com/tomasdrus/hungarian-playing-cards. References were used for structure; their original PNG bytes are not included in runtime or Git. Generated redraws are original project assets, not an assertion that the reference repository has a CC0 license.

Per-suit exact prompts, source identifiers, reference links and generated contact sheets live in `docs/art-direction/cruce/`. Full resolution generated PNGs are kept locally in its ignored `generated/` folder. Runtime uses 363×585 WebPs in `apps/web/public/assets/cruce/`, preserving the original card proportions. `back.svg` is project-authored geometric artwork. The four contact sheets show doiar, treiar, pătrar, nouar, zecar, as in that order. `felt.webp` is an ImageGen material shared by the real 3D tabletop and the compact board fallback; `table-surround.webp` is an ImageGen overhead timber/lakeside surround behind the board. Exact material prompts are in `table-prompts.json`. The board inherits the current runtime Alegreya Sans/Bree Serif fonts, including Romanian glyphs.

## Physical-world follow-up

On `localhost` or `127.0.0.1` without `VITE_ROOM_SERVER_URL`, `LocalWorldRoom` uses a module `SharedWorker` and the existing `RoomCore` through `createLocalWorld`. Tabs therefore share one browser-local authority and one Cruce table without opening another listener. Its resume token is session-scoped and local-only. A configured production origin continues to use its configured backend; this fallback is not a production deployment or a replacement room service.

The physical station is now a square 1.9m timber table with a 0.82m surface and 1.64m felt, plus four separate backless benches. Each bench is 1.1m wide by 0.44m deep, centered 1.6m from the table center, has capacity one, and registers the same four seat anchors used by the server. The old integrated picnic seating measured 1.2998m after scaling, which is one valid seat rather than zero capacity; its overlap with the added seating was a separate geometry issue. The old geometry is not used for Cruce seating.

The retained character rig holds the owner's actual card faces and remote backs on hand bones. Each frame restores the authored mixer pose before applying reversible arm IK and the reused `Activity_HoldRod` finger grip, so the arms and fingers do not accumulate changes. An accepted play briefly renders the held card, then flies a face-up card to that seat's tabletop target; landed public trick cards remain visible to everyone until collection. The wide active-game board becomes a compact side panel so the physical table, avatars, public trick, trump and private hand remain visible together. Leaving an active hand still requires the Romanian confirmation; cancelling stays seated, while confirming stops the hand and the same player can rejoin with F after standing.

Card presentation is lazy and ownership-aware: idle avatars allocate no Cruce card nodes or card resources, a controller is created only when a seated character has a hand or public trick, and leaving disposes the complete rig resources. The shared existing character-clip cache supplies `Activity_HoldRod`; it is not parsed once per avatar. The narrow performance fixture may provide only `remotes`; its optional Cruce snapshot is treated as absent rather than crashing or fabricating game state. Regression evidence covers 50 idle avatars with zero card-resource loads, three full allocation/disposal cycles, and both full-view and stripped-fixture contracts.

The browser evidence and validation details for this follow-up are in `docs/testing/cruce-world-2026-10-29.md`. The 3D captures prove the local world interaction and local shared authority, while production rollout remains the release owner's responsibility.

The independent follow-up review disposition is SHIP after worker-error cleanup, close-acknowledgement handling, hitch-safe card-flight origins, effect-owned StrictMode rig lifecycle, lazy idle-avatar card resources, and stripped performance-fixture handling were checked. This is a local interaction validation result, not a deployed multiplayer release. Local normal fixes are published by the release owner; production rollout remains pending the corrected commit and review.

## Verification

Run `npm test`, `npm run test:protocol`, `npm run server:check` and `npm run build` under Node 24. Cruce tests cover every variant and cut choice, all 24 cards, suit/trump/Iber enforcement, marriages, bidding, score penalties, protocol validation, hand privacy, durable saves, stale requests, seat races and reconnects. `tests/browser/cruce-fixture.tsx` uses the real authoritative table in a self-contained offline browser fixture, with no extra listener or production socket. Build it with `node scripts/prepare-cruce-fixture.mjs` after preparing all card WebPs. It is never imported by the game.

The offline fixture has a labelled state selector for QA; those test controls are never imported by the production game. The release owner temporarily serves it on an internal route of the existing 4173 listener for browser checks, without changing the main game.

Shared preview publication stays coordinated with the release owner. The feature worktree build alone does not change 127.0.0.1:4173 or production.

The 2026-10-29 finish-review evidence is recorded in `docs/testing/cruce-2026-10-29.md`. Captures in `.impeccable/review/cruce/` cover the empty table, a single sitter, incomplete roster, all-ready roster, full-table spectator, reserved reconnect, interrupted match, and active-hand card view at the component's 1280×720 target, with additional 1440×900 and 390×844 checks; `capture-metrics.json` records the measured viewport and scroll widths. The reviewer disposition was SHIP after resolving the Romanian in-world activity prompts and documenting the explicit no-concept-roll FORM exemption for this precisely pinned extension.

The component fixture evidence above is not proof of 3D world play, live deployed multiplayer, Worker rollout, or 1:1 visual identity with tromf.ro. The separate world follow-up captures are actual 3D local-world evidence, but still do not establish a deployed production backend or remote four-person session. The fixture and world-lab state controls plus their `Test local` notes are QA-only; production has no state selector, table browser, room creation or secret-code flow. The root `DESIGN.md` still contains older Barlow guidance, while the shipped Cruce and game shell use the Alegreya Sans/Bree Serif values in `apps/web/src/game-art.css`; that pre-existing global drift is reported here and deliberately not repaired as part of this ordinary extension.

Final validation for the corrected follow-up is 211 passing frontend tests, 114 unchanged protocol/server tests, and passing normal TypeScript/build checks. The normal bundle contains no QA-toolbar strings. These gates do not convert the local browser authority into a production deployment claim.

### Furniture update · 30 October 2026

The Cruce table now derives from the same Quaternius furniture as the neighboring tables. `scripts/build-cruce-furniture.mjs` resizes Table_Large into the1.6m square Cruce_Table and Bench into the1.12m Cruce_Bench, preserving texture bytes, UVs and triangle counts. The source GLBs remain unchanged; editable authority is this repeatable generator, with hashes/dimensions in `docs/art-direction/cruce/furniture.json`. All four benches retain their IDs and one seat; their radius is1.46m. Client and Worker must release the shared seat geometry together. The sign has an actual grounded timber post and collider. The retained felt texture covers the central1.28m square.

The UI table is square in lobby and play states, rather than stretching the panoramic image. Public plays occupy compass positions matching the seats; two-player opponents remain opposite. Long names truncate, and narrow component hands scroll horizontally without wrapping an eighth card onto an isolated row. This changes layout and furniture only; rules, card art and private hand projection are retained.
