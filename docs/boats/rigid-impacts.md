# Surface rigid-body boat impacts

## Physics contract

- Use a convex, tapered waterline hull for boat contact and local world sweeps.
- Treat the authored hull pivot as the effective centre of mass (the stern engine
  balances the pointed bow). Equal boats use 650 kg and a length/beam-derived
  yaw inertia. Moored boats have zero inverse mass and inertia.
- Resolve contact points, including their angular velocities, with accumulated
  normal and friction impulses. Fast impacts have low restitution; slow rubbing
  has none. Off-centre contact changes yaw momentum; central hits do not invent spin.
- Preserve momentum for free boats within safety limits and never add kinetic
  energy. Bound translation, separation and angular speed for delayed packets.
- Helm input drives a damped yaw rate. Collision spin persists briefly and is
  resisted by water. The steering wheel follows the helm, not the collision spin.
- Turning preserves world momentum; lateral water resistance gradually realigns
  travel with the hull. The float remains separate: no vertical collision impulse,
  forced dismount or damage. Unattended boats remain auto-moored.
- Resolve small multi-boat contact islands, rather than only the first pair.
  Broad-phase rejection and fixed iteration/contact budgets bound server work.
- Smooth small local render corrections while retaining the exact physical and
  acknowledged server state. Reset and dismount clear the visual offset.

## Compatibility and resources

Keep the current room/transport and pose frequency. Optional angular velocity
also identifies rotation-capable clients; older clients retain translation with
locked rotation. Quantize transmitted boat coordinates/velocity/rudder to
millimetre-scale precision. Omit zero rudder and moored rotation state. The
representative packet averages shrink; individual packets may still grow slightly. Do not add geometry, textures, physics listeners, services,
storage migrations or paid infrastructure.

Measure the old/new narrow-phase and 50-boat scenarios on the same process, plus
real Rapier world queries and wire sizes. Report actual cost rather than claiming
that more accurate maths is free.

## Acceptance

Automated cases cover contact geometry, mirrored/off-centre torque, central hits,
linear/angular momentum, kinetic energy, rubbing/separation, moored/legacy hulls,
boost and rotating sweeps, multi-boat chains, world obstacles, water damping,
packet bounds/revisions and reset. Run two browser clients through the same
cases on the coordinated single 4173 server, fix observed failures, preserve and
restore the shared preview, then submit the fully checked release candidate.

## Implementation and measured budget

Contact generation uses clipped face manifolds, with symmetric normals for tied
corner features. A two-point normal block solve and one centred friction patch
avoid contact ordering bias. Position projection is separate from impulses;
energy and impulse angular momentum tests account for that distinction. Fast
contacts use restitution 0.05; slow contact uses zero. World pilings/docks use the
same contact-point impulse response and tapered convex prism. Cached padded
hulls cover angular sweeps without rebuilding a convex hull each frame.

Occupied/invisible remote hulls also clear their client collision-group mask.
The current Rapier runtime can retain physical contact response after only the
body/collider disabled flag is set. The mask is restored for moored pedestrian
collisions; changes run only on body/visibility/collider-count transitions. Real
Rapier regressions cover clearing a ghost stern, restoring solidity and releasing
an existing contact when a driver boards.

The pose interval remains 120 ms minimum. A correction is sent once per affected
owner, after solving, rather than for each manifold iteration. Contact processing
is capped at 4,096 work units, 32 continuous contact events and 12 affected
boats per packet. Invalid overlap piles brake at the last safe state when the
work, island or event budget is exhausted. Swept padding uses relative travel, so
common forward travel cannot invent contacts. The bow has a 12 cm flat contact
face to avoid quantized opposite headings behaving like infinitely sharp points.
Normal packed 50-boat coverage does not enter that fallback.

Node 24 on the measured Apple machine (five-trial medians, microseconds/call):

| Kernel | Before | After |
| --- | ---: | ---: |
| Swept two-boat contact | 1.34 | 4.92 |
| 50-boat scan, one contact | 1.71 | 13.78 |
| Packed 50-boat contact island | first-pair model only | 1,765 |
| Invalid overlapping 50-boat pile | not equivalent | 1,657, bounded fallback |
| Rapier world shape cast | 1.97 | 4.68 |
| New conservative angular query | — | 3.17 |

Representative full pose packet averages before/after: moored 273/255 bytes,
straight 282/279, turning 321/308, post-impact 321/297. The largest sampled
individual increase was 21 bytes. These are matched encoding samples, not a
claim that every packet shrinks. The comparison includes the extra angular state.

The old 50-boat kernel resolved only a first pair; the new kernel includes contact
island work. These are function/query measurements, not full browser frame time,
Cloudflare runtime or billing measurements. No new textures, visible meshes,
services or update frequency were introduced. Reproduce with Node 24:
`node scripts/benchmark-boat-physics.mjs 3c106da`. Full trials and scope are in
`docs/performance/results/boat-rigid-impacts-2026-10-30.json`.

A separate coordinated browser pass will verify visible turning, rubbing,
correction smoothing, docks, legacy protocol emulation and latency before release.
