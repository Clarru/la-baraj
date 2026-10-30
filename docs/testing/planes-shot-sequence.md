# Planes: complete shot sequences, cockpit burst and round result

Follow-up to PR44. Accepted shots now play in order; a newly received shot never replaces the current flight. Several live updates coalesced into one view are recovered in alternating turn order. Pending shot marks remain hidden until their presentation begins. Only accepted shot results are queued; clicks and commands are never queued.

Ordinary shots last 1.2 seconds, with a 650 ms flight and inked impact. Cockpit hits last 1.85 seconds and add a flash, two expanding rings and twelve radial ink fragments. Reduced motion retains the static 180 ms acknowledgement and removes travel/explosion movement.

After the winning impact and any earlier queued presentations finish, a full-screen result names the winning player. A three-second 3–2–1 countdown blocks interaction, then reveals the normal rematch editor. It sends no automatic rematch or ready action. Existing finished histories do not replay the victory when reopened. Round, seat, leave and connection changes retain explicit cleanup.

Player colors remain tied to their authoritative seats: blue for side0 and red for side1, consistently across names, sheet labels, tracers and victory. The reverse player view keeps the same person/color mapping and aligns its own header with the left sheet.

The setup/rematch sidebar restores its missing scoped styles: distinct selected-plane buttons, compact outlined Rotate/Shuffle actions, and one prominent navy Ready/Rematch button. The fixture includes the production global CSS so this hierarchy is checked under the real cascade. Narrow setup screens stack the controls below the editable grid.

## Checks

- Node24 TypeScript, production build and377 frontend tests pass.
- DOM lifecycle tests cover thirty repeated clicks without resending/restarting, an incoming shot arriving during an outgoing flight, three coalesced accepted shots, queue completion before victory, cockpit duration, countdown3–2–1, historical/reconnect suppression and new-round cleanup.
- Browser QA is reserved with the release owner and will be recorded before the PR is ready.
