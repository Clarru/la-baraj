# Boat-to-boat collisions

## Intended feel

Boat impacts stay horizontal. Equal-mass occupied boats exchange momentum with
very little rebound (restitution 0.05). A rear impact pushes the boat ahead; a
head-on impact stops most forward motion; glancing hits retain tangential travel
with modest friction. Contact-point impulses also transfer yaw momentum; centred
hits do not invent spin. Lateral and angular motion decay through water drag. An unoccupied
boat is moored: it is visible and solid, but cannot be sent drifting by a passerby.
There is no damage, forced dismount, vertical impulse or jump.

See [surface rigid-body details and measurements](rigid-impacts.md) for the
contact manifold, inertia, compatibility and resource budget.

## Shared outcome

The room authority detects swept hull contacts from accepted boat poses and
computes both responses. Clients cannot submit an impact or choose another
player's impulse. Each occupied participant receives a numbered correction and
acknowledges it in subsequent poses. The room drops older, pre-impact poses so
latency cannot immediately undo a collision. Unchanged parked boats remain part
of presence; disconnecting removes their session boat. Existing world storage,
housing epoch and invitations are unchanged.

Both trajectories are aligned to the same server interval, and the remaining
time after contact is integrated with the resulting velocity. The authority uses
the physical boat coordinates, rather than the visual feet that can lag the
physics body by a rendered frame. These details prevent repeated rear contact
from rewinding boats and making a push appear sticky.

The hull is the same tapered convex waterline footprint used by local world collision. Swept
tests include translation and heading changes, with bounded substeps. Contact
separation and velocities are bounded. Clients preserve their current body
height when applying a correction and check world obstacles before translating.
Dock/terrain collision remains local; boats never receive a vertical impact.

Personal boats get deterministic, separated berths near their nearest dock.
Without that change every owner would start in the same overlapping hull.
Duplicate sessions for the same home represent the same personal boat and do
not collide with each other. Older clients without collision-capable boat
presence remain compatible and need a reload to participate in this feature.

## Acceptance

- Head-on, rear, glancing, reversing, stopped-driver and moored-boat impacts.
- Boost-speed crossing and thin/corner contacts cannot pass through unchecked.
- No energy gain from repeated contact, no vertical impulses, no forced dismount.
- Both participants and an observer receive the same authoritative result.
- Stale/reordered/duplicate corrections and pre-impact poses cannot overwrite it.
- Reset, dismount, disconnect and a nearby shore/dock remain safe.
- Unique berths are in water and do not overlap for all registered home slots.
- Full frontend/protocol tests, both type checks and production/Worker builds.

This work is prepared on its own feature branch. Shared localhost publication
and production release remain coordinated with the release owner.

## Browser verification — 30 October 2026

Two independent tabs ran the actual Game, Player, remote rigs and SharedWorker
RoomCore on the existing 4173 listener, using an isolated RAM-only authority.
The authored fixture stages hulls but uses normal V/W/A/S/Shift/R controls for
boarding and driving. No production connections or saved world state were used.

- Rear push: target moved from z -48 to -39.21 after a five-second approach;
  both boats continued at about 4 m/s, with body heights 0.77–0.78 m at capture.
- Opposing head-on: both clients received the same low-energy response;
  first resulting forward-world speeds were -0.071 and +0.158 m/s.
- Glancing: target received about 1.96 m/s on each horizontal axis, with
  sideways velocity decaying while forward motion continued. Both rigs stayed seated.
- Moored target: remained exactly at (0, -48) with zero velocity and no driver
  correction; the approaching boat stopped short while the owner stayed swimming.
- Boost: 12.8 m/s measured before contact, no early impact. The first collision
  split forward speed into 6.08 m/s for the approaching boat and 6.72 for the target.
- S recovered to -2 m/s reverse after contact; V dismounted and R returned to
  the assigned cabin. Both browser error logs were empty.

The pass found the repeated-contact rewind described above; it was fixed and
all scenarios were rerun on the corrected candidate. The sustained physics test
now requires meaningful forward progress, not merely a positive displacement.
Screenshots and DOM telemetry are retained locally under
`.impeccable/review/boat-world/`. Reproduce the local-only page with
`node scripts/prepare-boat-collision-fixture.mjs` after coordinating publication.

The normal preview root was never replaced. All temporary QA additions were
removed, and all 204 original build files matched the pre-test SHA-256 manifest,
including the accepted Cruce runtime, character actions, studies and other QA pages.
