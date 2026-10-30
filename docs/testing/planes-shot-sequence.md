# Planes: complete shot sequences, cockpit burst and round result

Follow-up to PR44. Accepted shots now play in order; a newly received shot never replaces the current flight. Several live updates coalesced into one view are recovered in alternating turn order. Pending shot marks remain hidden until their presentation begins. Only accepted shot results are queued; clicks and commands are never queued.

Ordinary shots last 1.2 seconds, with a 650 ms flight and inked impact. Cockpit hits last 1.85 seconds and add a flash, two expanding rings and twelve radial ink fragments. Reduced motion retains the static 180 ms acknowledgement and removes travel/explosion movement.

After the winning impact and any earlier queued presentations finish, a full-screen result names the winning player. A three-second 3–2–1 countdown blocks interaction, then reveals the normal rematch editor. It sends no automatic rematch or ready action. Existing finished histories do not replay the victory when reopened. Round, seat, leave and connection changes retain explicit cleanup.

Player colors remain tied to their authoritative seats: blue for side0 and red for side1, consistently across names, sheet labels, tracers and victory. The reverse player view keeps the same person/color mapping and aligns its own header with the left sheet.

The setup/rematch sidebar restores its missing scoped styles: distinct selected-plane buttons, compact outlined Rotate/Shuffle actions, and one prominent navy Ready/Rematch button. The fixture includes the production global CSS so this hierarchy is checked under the real cascade. Narrow setup screens stack the controls below the editable grid.

## Checks

- Node24 TypeScript, production build and382 frontend tests pass.
- DOM lifecycle tests cover thirty repeated clicks without resending/restarting, an incoming shot arriving during an outgoing flight, three coalesced accepted shots, queue completion before victory, cockpit duration, countdown3–2–1, historical/reconnect suppression and new-round cleanup.
- Browser QA is reserved with the release owner and will be recorded before the PR is ready.

The Game window-capture guard blocks only unmodified Escape/F while a visible board has countdown value1,2,or3. It does not suppress native Tab or browser modifier shortcuts and cannot remain locked on a false/hidden/stale result attribute. Boundary tests cover expiry/unmount. One full-suite run hit the existing weather-freshness timing test; its isolated rerun and the final full suite pass without weather-source changes.

Owner review reproduced the delayed-history case: an open board mounted with view=null could celebrate an already-finished snapshot. A failing regression was recorded, then fixed by requiring an observed playing round/seat before any victory. Null/loading/reconnect snapshots clear that observation. The targeted regression and final suite pass.
