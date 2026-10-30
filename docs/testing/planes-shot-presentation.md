# Equal Planes sheets and shot presentation

The selected direction gives the private fleet and opponent targets equal size, with your fleet consistently on the left. Both sheets retain their latest coordinate/result. No manual marking step is introduced.

Each newly accepted shot draws a curved ink tracer from the firing sheet heading to the measured center of the actual attacked square. Air uses a blue ring; body hits use a brick-red impact and inked cross; cockpit hits add a stronger contact and retain the revealed plane. The boards do not move. Firing is disabled for the 720 ms presentation, including keyboard activation and the action handler. This is a local presentation lock; authoritative turns and their deadlines remain unchanged.

Reduced motion replaces travel/sparks with a static target ring and a 180 ms acknowledgement. Folding, losing the connection, changing seats/rounds, and unmounting cancel the presentation. Initial/joined histories, repeated events and catch-up snapshots do not animate. A winning cockpit impact finishes before the existing rematch editor appears.

## Verification

- Node 24 frontend TypeScript check and production build passed.
- 363 frontend tests passed, including ten DOM lifecycle tests covering actual disabled targets for air/body/cockpit hits, release at the deadline, sending the next shot, unrelated snapshots, historical mount, fold/reopen, reconnect, new round, callback cleanup, reduced motion, measured landing coordinates, quick return-shot replacement and the winning shot.
- Existing spectator privacy and unavailable-target tests remain passing.
- `tests/browser/planes-presentation.html` is an isolated visual fixture using the actual board component and shot rules. It has no socket, persistent state or production entry point. Build it separately; normal production builds do not include its controls.
- Browser QA passed on runtime head `2d7a18f520100de905f27f31491599c9a2b2d2fb` using the existing port 4173 listener and the release owner's bounded exclusive window. No sockets, persistent state, main/Worker changes or deployment were involved.

The original three-direction HTML study is a local exploration artifact, outside the runtime change.

## Browser evidence — 30 October 2026

[Desktop after a cockpit hit](captures/planes-attention/desktop.jpg) · [Shot in flight](captures/planes-attention/shot-in-flight.jpg) · [Narrow layout](captures/planes-attention/narrow.jpg)

The final component was checked at measured CSS viewports 1706×960, 1280×800, and 390×844. Grid widths were identical within each pair: 369, 361.667, and 158.333 px respectively. An initial narrow-screen defect caused the fixed row labels to stretch the grid; the scoped correction removes that minimum only from battle row labels. The confirmation capture has square 14.229×14.229 px cells and a contiguous 14.25 px row pitch, with no horizontal overflow. This checks fit and geometry; it does not claim 14 px targets are ideal for sustained phone play.

The final live sample saw all 100 targets disabled at 268 ms and enabled at 750 ms after initiating a shot. The animation's SVG endpoint exactly matched the attacked square's measured center. Exact 720/180 ms boundaries are additionally asserted by DOM tests. Browser actions covered air/body/cockpit results, returning fire, fold/reopen during a shot, disconnect/reconnect cancellation, and the winning impact finishing before rematch controls. Browser warning/error logs were empty.

Reduced motion uses a static ring and is verified by the DOM lifecycle test at 180 ms. The available browser control does not expose media emulation, so this was not visually exercised under an actual reduced-motion preference; no OS settings were changed.

After confirmation the review tab was closed and the viewport override reset. All six owned temporary review files were removed. The complete before/after manifest matched exactly: 218 baseline files, root index SHA-256 `446afdf64ff95291a53d8e893c37d8809fa6be12ab3cd49a6c10e6bb27e07288`, existing listener PID 12514 unchanged. [Restoration record](captures/planes-attention/restoration.json), [motion samples](captures/planes-attention/motion-samples.json), and [narrow geometry](captures/planes-attention/narrow-geometry.json) are included. The full local backup and manifests are at `/tmp/planes-attention-937a66c-backup-20261030-150533`.
