# Boat-to-boat collisions

## Intended feel

Boat impacts stay horizontal. Equal-mass occupied boats exchange momentum with
very little rebound (restitution 0.05). A rear impact pushes the boat ahead; a
head-on impact stops most forward motion; glancing hits retain tangential travel
with modest friction. Lateral motion decays through water drag. An unoccupied
boat is moored: it is visible and solid, but cannot be sent drifting by a passerby.
There is no damage, forced dismount, vertical impulse or jump.

## Shared outcome

The room authority detects swept hull contacts from accepted boat poses and
computes both responses. Clients cannot submit an impact or choose another
player's impulse. Each occupied participant receives a numbered correction and
acknowledges it in subsequent poses. The room drops older, pre-impact poses so
latency cannot immediately undo a collision. Unchanged parked boats remain part
of presence; disconnecting removes their session boat. Existing world storage,
housing epoch and invitations are unchanged.

The hull is the same oriented rectangle used by local world collision. Swept
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
