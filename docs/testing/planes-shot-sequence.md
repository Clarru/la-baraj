# Planes: complete shot sequences, cockpit burst and round result

Follow-up to PR44. Accepted shots now play in order; a newly received shot never replaces the current flight. Several live updates coalesced into one view are recovered in alternating turn order. Pending shot marks remain hidden until their presentation begins. Only accepted shot results are queued; clicks and commands are never queued.

Ordinary shots last 1.2 seconds, with a 650 ms flight and inked impact. Cockpit hits last 1.85 seconds and add a flash, two expanding rings and twelve radial ink fragments. Reduced motion retains the static 180 ms acknowledgement and removes travel/explosion movement.

After the winning impact and any earlier queued presentations finish, a full-screen result names the winning player. A three-second 3–2–1 countdown blocks interaction, then reveals the normal rematch editor. It sends no automatic rematch or ready action. Existing finished histories do not replay the victory when reopened. Round, seat, leave and connection changes retain explicit cleanup.

Player colors remain tied to their authoritative seats: blue for side0 and red for side1, consistently across names, sheet labels, tracers and victory. The reverse player view keeps the same person/color mapping and aligns its own header with the left sheet.

The setup/rematch sidebar restores its missing scoped styles: distinct selected-plane buttons, compact outlined Rotate/Shuffle actions, and one prominent navy Ready/Rematch button. The fixture includes the production global CSS so this hierarchy is checked under the real cascade. Narrow setup screens stack the controls below the editable grid.

## Checks

- Node24 TypeScript, production build and382 frontend tests pass.
- DOM lifecycle tests cover thirty repeated clicks without resending/restarting, an incoming shot arriving during an outgoing flight, three coalesced accepted shots, queue completion before victory, cockpit duration, countdown3–2–1, historical/reconnect suppression and new-round cleanup.
- Browser QA passed in the release-owner coordinated single-port additive slot; evidence and complete restoration are recorded below.

The Game window-capture guard blocks only unmodified Escape/F while a visible board has countdown value1,2,or3. It does not suppress native Tab or browser modifier shortcuts and cannot remain locked on a false/hidden/stale result attribute. Boundary tests cover expiry/unmount. One full-suite run hit the existing weather-freshness timing test; its isolated rerun and the final full suite pass without weather-source changes.

Owner review reproduced the delayed-history case: an open board mounted with view=null could celebrate an already-finished snapshot. A failing regression was recorded, then fixed by requiring an observed playing round/seat before any victory. Null/loading/reconnect snapshots clear that observation. The targeted regression and final suite pass.

## Browser verification — 30 October 2026

The fixture renders the real PlanesBoard with production global CSS and the same exit-guard helper used by Game. It uses accepted-result/rule fixtures without sockets or saved state. Initial visual/input evidence is at526edc5; the focused loading/reconnect repair was confirmed at runtime head `e2b22f70da2679f437e7a5d777916a98bb5bbd61`.

- At1707×960 the selected-plane control, outlined secondary row and navy Ready/Rematch action have distinct hierarchy. Player0 is blue and player1 red. [Setup](captures/planes-sequence/setup-hierarchy.jpg), [rematch](captures/planes-sequence/rematch-hierarchy.jpg).
- Three coalesced accepted shots rendered in order1:0→0:0→1:1, sampled at276/1251/2439ms, finishing at3636ms. All targets remained blocked through the queue. Five physical clicks during flight left revision2 and active shot1:0 unchanged at446ms. No input commands were queued.
- [Cockpit explosion](captures/planes-sequence/cockpit-explosion.jpg) shows the flash, shock rings and radial fragments at the actual target. A fast incoming headshot preserved the existing outgoing flight. The final winning exchange sampled outgoing0:1, then cockpit1:2, then the winner countdown; no result overlay appeared before both shots finished.
- [Blue winner](captures/planes-sequence/winner-countdown.jpg) and [red winner](captures/planes-sequence/red-winner-countdown.jpg) retain identity colors. The3→2→1 countdown kept Rematch disabled. Escape and F did not hide the board during the gate; Escape worked again afterward. Native Tab was exercised; modifier shortcut passthrough and expiry/unmount boundaries are covered by DOM tests.
- The added loading-history control explicitly renders null before a finished snapshot: no old victory replay appears, and Rematch is enabled. A fresh live win still shows its three-second result.
- At391×844 there is no horizontal overflow; the full-width primary Rematch is316px wide, and setup/rematch controls are reachable by scrolling the sheet. [Narrow rematch](captures/planes-sequence/narrow-rematch.jpg). This is a fit check; the desktop game remains the primary target.
- Browser warning/error logs are empty. Reduced-motion static180ms acknowledgement and removal of spatial effects are covered by the DOM test/CSS path; the browser control does not expose media emulation, so no visual claim is made for an actual system reduced-motion preference.

[Browser observations](captures/planes-sequence/browser-results.json). The owned tab was closed, viewport reset and all five temporary files removed. All230 original shared-preview files match the complete before manifest, including index SHA256 `260d7c7bfe126117a4216a12151bb369dd80bf9cc9a5a2ebdc361174b37b1feb`; listener12514 is unchanged. [Restoration record](captures/planes-sequence/restoration.json). Full backup/manifests remain locally at `/tmp/planes-sequence-backup-20261030-163541`.
