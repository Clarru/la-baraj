# Chill movement: real controller verification

Technical verification record for the movement PR. Earlier observations below are retained as dated implementation evidence; final runtime acceptance follows them.

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

## Final controller repeat (30 October)

Rebuilt the fixture from the final candidate with its exact exported action JSON pinned using Three's `file:` cache key. Actual crouched position under the ceiling was `[56.2265, 5.5842, 68.0349]`, controller height 0.58065m. C refused expansion. Z accepted prone; the after-physics-step capsule quaternion was approximately `(x=0.67391, y=0.21411, z=-0.21411, w=0.67391)`, preserving its horizontal axis. Switching to crouch succeeded; standing still refused. After moving clear, C restored height 1.09015m and identity collider rotation.

Eight more C/C/Z/Z toggles stayed grounded. All four standing samples returned to 1.090229358m, crouch to 0.58044–0.58046m and prone to 0.430197–0.430201m. No accumulated vertical drift. The fixture was closed afterward.

## Full-world paired-client check

A temporary production-shaped build used the existing `VITE_PLANES_PAIRED_LAB=1 VITE_GAME_DIAGNOSTICS=1` flags on the same 4173 server, with two test tabs and the existing `time=12` daylight override. Both clients shared only an in-memory test authority.

- Client A crouched through C. Client B received explicit `posture: crouching`, `animation: Crouch_Idle` and the same grounded visual root, and visibly rendered the dressed character in crouch. The normal standing avatar beside it provided a direct height reference.
- Client A returned to standing and used G. Client B received `Social_Wave` and visibly animated the raised arm.
- The Menu's Wave hello action closed the menu and started Social_Wave locally.
- A crouched player walked to the Planes bench and used the actual F interaction. The seated pose became `standing`/`Activity_Sit` with activity `sit`. C, Z, G and P did not override the active table-game UI. Stand up completed back to standing Idle_Neutral and activity none.
- Both test clients were closed after releasing seats. No production homes or match data were touched.

This paired check preceded the Cruce followup release. PR34 was subsequently merged as `190d7bd` after its resource-allocation fixes; its production table/seat smoke passed. The movement branch includes that release.


## Final normal-world regression (30 October)

The latest combined 4173 build used normal LocalWorldRoom authority, no paired-player/performance toolbar. The separate opt-in shrub study and approved rock stayed intact.

- Chat opened through Enter; typing C/Z/P/G produced `czpg` while the player remained Prone_Idle with no held movement keys. Escape closed it.
- V while prone retained prone with no vehicle. Standing restored the scooter prompt and mounting worked. C/Z/P/G while mounted left the existing rider pose and standing transport posture intact. V parked normally.
- Opened Menu after walking; Wave hello became enabled as motion settled, and its action closed Menu and produced Social_Wave.
- Entered the actual cabin after lowered traversal, crouched inside, then used E to leave. The completed exit restored outdoor standing Idle_Neutral.
- Walked around solid campfire obstacles to the shore; crouched movement crossed into `inWater: true`, `posture: standing`, Swim_Forward. C/Z/P/G in the lake retained Swim_Idle. Swimming ashore restored grounded standing Idle_Neutral.
- A second normal local client previously received/rendered final Prone_Idle and the same visual root. Presence/chat anchors now lower with posture. Final dressed target-rig tests cover clip bounds, support/hand placement, finite transforms, provenance hash and equality with the runtime JSON.

All temporary test tabs were closed. No production homes, fire or card-game state were changed. See [the measured performance report](../performance/CHILL_MOVEMENT.md) for the identical-camera baseline/candidate load comparison and distant-rig cleanup counters. Deployment evidence belongs to PR33.
