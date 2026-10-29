# Chill movement: real controller verification

This is a partial evidence record for the draft movement branch, not release acceptance.

## Reproduce

Use Node 24. Run `node scripts/prepare-controller-fixture.mjs` from the repository root. It writes the ignored `.impeccable/review/controller/fixture.html`. The release owner can publish that single QA file on the existing 4173 listener; do not start another server or replace the shared main build for this fixture.

The fixture uses the actual Player, Ecctrl, Rapier, character clips, camera and a RAM-only LocalPlanesRoom. It embeds the candidate action JSON in the loader cache, while reusing the shared server's original model assets. No production socket or saved cabin is created. The floor is registered as terrain; a 4m-square ceiling sits 1.2m above it. WASD, C, Z, G and Space use the real input handlers. The Reset player button exercises the actual reset prop.

The motion output exposes actual body/visual-root position, contact, grounded state, animation, posture and velocity. `data-physics-after-step` records collider orientation immediately after real simulation, rather than assuming a quaternion setter persists.

## Observed results

- Standing controller height above the floor: approximately 1.09m, preserving the existing configuration.
- Crouch controller height: approximately 0.58m after the stance-specific probe correction. Visual root stayed at ground +0.015m.
- Walked the crouched player beneath the 1.2m ceiling using the real controller. Pressing C there retained crouch and the 0.18/0.30 capsule instead of expanding through the ceiling.
- Prone controller height: approximately 0.43m after the correction.
- Measured crouch speed while holding Shift+W: 1.4999997 world units/s; sprint did not bypass the lowered speed cap. Space remained grounded at about 0.5804m controller height.
- Q retained Idle; P and a stationary middle click each triggered the existing Punch_Jab through the real in-memory room. Both punch controls were then suppressed while crouching.
- Found that Rapier's world-space collider `setRotation` was overwritten on the next dynamic-body step. Changed the attached collider using `setRotationWrtParent`; the horizontal orientation then persisted after simulation. A real-world multi-step regression covers this behavior.
- G published `Social_Wave` while standing. Reset during the gesture returned to standing `Idle_Neutral`; subsequent motion did not retain a stale wave state. Movement cancelled the wave and returned through Walk to Idle.
- Separate dressed-rig front/side captures verified the authored crouch silhouette and appearance. Both crouch clips contain no root drift.

## Remaining gates

Repeat the controller clearance sequence after the final prone clip correction; walk clear of the ceiling and verify standing succeeds, test repeated toggles for vertical drift, and inspect sloped support. Verify crouch/prone/punch suppression during jump, chat, menu, seats, cards, scooter, water and cabin transitions in the full world. Verify two-client pose/gesture parity and the Menu wave action. Run the representative render/performance comparison and restore a normal shared preview build before release.

## Full-world paired-client check

A temporary production-shaped build used the existing `VITE_PLANES_PAIRED_LAB=1 VITE_GAME_DIAGNOSTICS=1` flags on the same 4173 server, with two test tabs and the existing `time=12` daylight override. Both clients shared only an in-memory test authority.

- Client A crouched through C. Client B received explicit `posture: crouching`, `animation: Crouch_Idle` and the same grounded visual root, and visibly rendered the dressed character in crouch. The normal standing avatar beside it provided a direct height reference.
- Client A returned to standing and used G. Client B received `Social_Wave` and visibly animated the raised arm.
- The Menu's Wave hello action closed the menu and started Social_Wave locally.
- A crouched player walked to the Planes bench and used the actual F interaction. The seated pose became `standing`/`Activity_Sit` with activity `sit`. C, Z, G and P did not override the active table-game UI. Stand up completed back to standing Idle_Neutral and activity none.
- Both test clients were closed after releasing seats. No production homes or match data were touched.

The canonical main preview was then restored to the normal Cruce follow-up build (not this unfinished movement branch). A fresh normal-local smoke check walked from the cabin to Cruce, used F to open the board, and released the seat. QA controls were absent. PR34 remains independently gated on idle-prop resource allocation and the performance fixture's narrow room contract.
