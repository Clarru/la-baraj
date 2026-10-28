# Gameplay and minimap checks — October 28, 2026

## Scooter repair

The original production failure was reproduced using native browser inputs:
V mounted the rider, but W alone left the scooter near its parking point.
Steering first allowed it to escape. The parked scooter used a kinematic body
whose transform and enabled state were updated every frame.

The parked solid is now a fixed body created only while parked and removed
while mounted. Its visual model remains reusable. This also removes the parked
body's per-frame transform and enabled-state updates.

The same local V → W test now moves approximately 19 metres in two seconds,
reaching approximately 9.95 m/s. Repeated reset/mount/ride/brake/park checks pass;
braking returns speed close to zero. These are observed browser results, not a
claim that every route through vegetation is clear.

## Permanent minimap

The map stays visible as a 200px circle, 24px from the bottom and left viewport
edges. It has no visible heading, N, distance, legend, footer or buttons. There
is no Show/Hide map action or M shortcut. OpenStreetMap attribution remains in
the game menu. Accessible map and marker labels remain available.

The final positioning check reads browser layout bounds: `position: absolute`,
left gap 24px, bottom gap 24px, size 200×200px and border radius 50%. The explicit
position declaration is required; bottom/left values alone do not anchor a
statically positioned element.

A small navigation subscription updates only the map when a motion sample
changes. The full scene no longer receives map-driven React state updates.
Obsolete map panel and button CSS has been removed.

## Verification scope

- Browser: mounting, sustained acceleration, steering, braking, dismounting,
  reset, walking/running, jump start/loop/landing, porch seating, adjacent seat
  movement, standing, cabin entry and exit.
- Automated: 118 frontend tests; 23 protocol/server tests; frontend and server
  TypeScript checks; production build.
- Deployed backend: twelve read-only checks covering health, origins, canonical
  world/legacy aliases, identity, shared presence, snapshots and departure
  cleanup. No new homes allocated or fire/seat state changed by that harness.
- The approved character model and animation assets remain unchanged.

Local inspection can enable hidden DOM measurements with
`VITE_GAME_DIAGNOSTICS=1 npm run build`; it does not enable visible developer
tools. Public production builds do not set this flag. Temporary detailed input
and contact traces used during the investigation are not included in the change.

Longer vegetation traversal and the complete fishing interaction are separate
checks still in progress; this report does not claim they passed.
