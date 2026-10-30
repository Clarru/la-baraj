# Planes completed-round review

The final boards stay in the same two-sheet composition after the winning impact. The existing status row, directly below the names, identifies the winner. There is no full-screen overlay. A five-second local pause retains the final planes and shots; afterward Prepare rematch becomes available while the result remains visible. Preparing is a separate local editing action and sends no automatic rematch/ready request.

## Completed layout privacy

`PlanesView.revealedPlanes` is an optional tuple indexed by fleet owner, sent only for finished rounds with a winner. Existing version1 clients ignore it; a new client can still display existing shot evidence when an old server/legacy record has no reveal. Setup/live projections omit the property entirely, including spectators. The UI also ignores accidental reveal data during a live round.

The server freezes `completedPlanes` before finish can be followed by rematch readiness or seat release. This matters because the first rematch-ready action changes a member's private next fleet while the phase is still finished. The projection uses only the completed snapshot, never that mutable member field. Shot arrays remain unchanged until the next round starts, so the old snapshot and shot marks stay coherent. Fresh setup and startPlaying remove the snapshot.

Storage version1 remains additive/compatible. Snapshot arrays are validated and projection copies are isolated. Legacy finished records can be reconstructed only while no member has readied a rematch; ambiguous records omit the reveal rather than exposing a prepared next fleet. The UI also avoids pairing an already-prepared private fleet with old shot marks when the original snapshot is unavailable.

## Checks

- Node24 frontend and server TypeScript, production build and Worker dry-run pass.
- 484 frontend tests pass after integrating meadow main755c7f7 (459 passed before that merge). They cover five-second gating, retained boards after expiry, explicit preparation with no automatic command, visible opponent planes with preserved marks for both viewer sides, no reveal during play, historical/reconnect behavior and the accepted-shot queue.
- 166 protocol/server tests pass. Both winner0 and winner1 reveal completed layouts to players/spectators only after finish; one-ready and reloaded records retain the old layouts and shots while new fleets stay private. Fresh setup/new play clear the reveal. Legacy reconstruction/omission, invalid snapshot rejection, copy isolation and actual WorldRoom alarm/fanout persistence are checked.
- Browser confirmation passed on the existing4173 listener in the release-owner bounded slot; capture and restoration details follow. No additional listeners or live game/server actions were used.

Release requires a backward-compatible Worker update before the frontend. The release owner coordinates that with frontend availability; this feature branch does not deploy or reset the world.

## Browser confirmation — 30 October 2026

Frozen combined head `33ba2ae7fb4d6ef7de046d130836c6ddbb15bbda` uses the actual Board and production global CSS in an isolated rule/projection fixture. It has no sockets or saved state. The review bundle remained byte-identical after integrating main755c7f7.

- [Losing-player review during the pause](captures/planes-result-reveal/loser-five-second-review.jpg): Robin wins in red; the right target grid reveals all three winning planes with B5 body and A5 air marks. The left grid retains the actual three destroyed planes and cockpit marks. No fullscreen modal is present; both grids are369px wide at1707×960.
- [After the pause](captures/planes-result-reveal/loser-review-after-pause.jpg): every SVG path and shot-mark label is identical to the in-pause snapshot; all targets remain disabled and Prepare rematch alone becomes enabled. No automatic placement or rematch action occurs.
- [A played blue-player win](captures/planes-result-reveal/blue-winner-final-boards.jpg): the fixture's actual shot rules resolve the three cockpit hits, then the compact pause samples5→4→3→2→1→null at140/966/1967/2965/3966/4967ms relative to the post-impact observation. The board remains present throughout. Exact5000ms gating is asserted in the DOM test.
- [Explicit preparation](captures/planes-result-reveal/explicit-rematch-preparation.jpg) switches to editing only after clicking Prepare rematch. The fixture revision remains unchanged, confirming that preparing did not submit a command. Resetting a new live round removes the opponent's revealed outlines.
- Null→finished history reload completes in290ms with no replayed pause and an enabled Prepare action. The delayed history still shows its final boards.
- [Narrow review](captures/planes-result-reveal/narrow-final-boards.jpg) at391×844 has matching158.333px grids, all three target planes and both shot marks, with no horizontal overflow. This is a fit check rather than a claim of ideal phone targeting.
- Browser warning/error logs are empty. One default2-second locator wait timed out while the intended five-second gate was still active; an explicit7-second wait passed. This was a tool wait bound, not an application defect.

Reverse-viewer interaction, an already-readied opponent across reload, and ambiguous legacy records are not exposed by this browser fixture. They are covered by the DOM and server/protocol tests; no live network gameplay claim is made for them. [Compact observations and board hashes](captures/planes-result-reveal/browser-results.json).

The one owned tab was closed and the viewport reset. Only the three owned temporary files were removed. The complete281-file SHA256+size manifest matches the original backup, including normal index `931c40968a8956dd30a940ddd4aa21978f159b12cacde47b50754ce7115241da`; existing listener12514 is unchanged. [Restoration record](captures/planes-result-reveal/restoration.json). The full local backup/manifests are at `/tmp/planes-result-review-backup-20261030-215640`.
