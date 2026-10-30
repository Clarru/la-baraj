# Equal Planes sheets and shot presentation

The selected direction gives the private fleet and opponent targets equal size, with your fleet consistently on the left. Both sheets retain their latest coordinate/result. No manual marking step is introduced.

Each newly accepted shot draws a curved ink tracer from the firing sheet heading to the measured center of the actual attacked square. Air uses a blue ring; body hits use a brick-red impact and inked cross; cockpit hits add a stronger contact and retain the revealed plane. The boards do not move. Firing is disabled for the 720 ms presentation, including keyboard activation and the action handler. This is a local presentation lock; authoritative turns and their deadlines remain unchanged.

Reduced motion replaces travel/sparks with a static target ring and a 180 ms acknowledgement. Folding, losing the connection, changing seats/rounds, and unmounting cancel the presentation. Initial/joined histories, repeated events and catch-up snapshots do not animate. A winning cockpit impact finishes before the existing rematch editor appears.

## Verification

- Node 24 frontend TypeScript check and production build passed.
- 361 frontend tests passed, including eight DOM lifecycle tests covering actual disabled targets for air/body/cockpit hits, release at the deadline, sending the next shot, unrelated snapshots, historical mount, fold/reopen, reconnect, new round, callback cleanup, reduced motion and the winning shot.
- Existing spectator privacy and unavailable-target tests remain passing.
- `tests/browser/planes-presentation.html` is an isolated visual fixture using the actual board component and shot rules. It has no socket, persistent state or production entry point. Build it separately; normal production builds do not include its controls.
- Shared-port browser QA is coordinated with the release owner. No per-worktree listeners, main/Worker changes or deployment are part of this branch.

The original three-direction HTML study is a local exploration artifact, outside the runtime change.
