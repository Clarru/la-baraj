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
- Browser confirmation is queued with the release owner on the existing4173 listener. No shared build writes or additional listeners have been started for this change.

Release requires a backward-compatible Worker update before the frontend. The release owner coordinates that with frontend availability; this feature branch does not deploy or reset the world.
