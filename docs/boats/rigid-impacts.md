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
millimetre-scale precision so the extra rotation state does not require larger
normal pose packets. Do not add geometry, textures, physics listeners, services,
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
