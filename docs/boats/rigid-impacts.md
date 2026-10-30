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
packet bounds/revisions and reset. The coordinated browser matrix below covers
the actual Game, Player and SharedWorker authority on the single 4173 server.

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

## Coordinated browser acceptance — October 30

The second pass used pre-mask head `af9fc90` and repaired head `34be93f`, both
based on released main `85184db`. The actual Game/Player and RoomCore ran through
an isolated in-memory SharedWorker. No production room or extra listener was used.
The earlier pass had already confirmed physical dock deflection; the second pass
finished the previously unpassed rubbing, chain, legacy and delayed-packet cases.

| Case | Observed result |
| --- | --- |
| Ghost stern, before repair | Driver stops at z −50.761974 with W held, active controls and Ecctrl disabled. Actual contact metadata identifies the remote convex hull still at z −48, despite both body/collider enabled flags being false. |
| Same geometry, repaired masks | Driver passes the old stop and retains 4.84 m/s in the captured snapshot. The target moves and turns about 15°, with zero rudder. |
| Two moving boats rubbing | 18/19 corrections, retained speeds 7.46/7.62 m/s, gradual sideways/yaw response, no vertical pop. |
| Three occupied boats | All three move over 5 m, retain about 1.53–1.59 m/s and receive corrections. Centred contact adds zero spin. |
| Centred head-on | Both stop with zero angular velocity, including the network-rounded opposite heading. |
| Moored target | Target position stays [0, −48], its owner stays unmounted, and it receives no impact correction. |
| Boost approach | Peak speed 12.8000002 m/s (Float32 tolerance); target is pushed and both continue around 7.2 m/s without tunnelling. |
| Legacy protocol emulation | Fresh peer omits angular/rudder fields; every correction retains the legacy shape, rotation stays locked and both boats move. Empty active-case error logs. |
| Delayed pose/correction delivery | Both clients delay outgoing poses and incoming impact corrections by 100 ms. Both continue moving with off-centre rotation and empty error logs. Peak render translation offsets are 0.427/0.149 m. |
| Reverse, dismount and reset | Reverse reaches −1.98 m/s along the keel; dismount and reset clear linear/angular motion and mounted state. |

Mounted body height stayed approximately 0.770–0.831 m across the second-pass
cases. The timed fixture controls send the normal Player keyboard events and
repeat held keys every 100 ms so each tab represents an independently focused
driver. The fixed driver's native W hold of 4.2 s covers the fixture's timed 4 s
command. The latency shim delays pose and impact messages, not all transport
categories. These are local acceptance tests, not a production network benchmark.

The first legacy attempt inherited a console error from the preceding fixture
unmount. It is retained in the evidence, followed by a clean fresh-client rerun.
Explicit fixture teardown also reproduced the unchanged `NearbySolids.tsx:53`
cleanup calling `body.isValid()` after its Rapier World had been freed. The release
owner independently reproduced that lifecycle problem without boat code and is
handling it separately. It was absent from the fresh legacy and delayed driving
runs; no controller or collision workaround was added for it.

All owned clients explicitly left, the last peer count reached zero and all test
tabs closed. The ten additive QA paths were removed before the agreed boundary.
All **251** baseline files matched their SHA-256 manifest exactly; normal index
`e3018f03f03e9ceb98299951cced2dc5d86687a89cebc2b8930a4616d7b06711` and
listener PID **12514** on **4173** were preserved.

Focused traces, assertions, raw teardown stacks and restoration paths are in
[the browser report](results/rigid-browser-2026-10-30.json). Full local raw histories
are retained in `.impeccable/review/boat-rigid/browser-evidence-final.json`.
[Off-centre](captures/rigid-impacts/off-centre.png),
[rubbing](captures/rigid-impacts/rubbing.png),
[chain](captures/rigid-impacts/chain.png),
[head-on](captures/rigid-impacts/head-on.png) and
[delayed-correction](captures/rigid-impacts/latency.png) captures show the actual run.

On tested head `34be93f`, 416 frontend and 142 server/protocol tests, both
TypeScript checks, the production build and CI passed. The final branch must
also include the next accepted main integration and pass the combined checks
before the release owner deploys the Worker and frontend.
