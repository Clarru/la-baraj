# Invisible, shared bench seating

Every current standalone bench and joined cabin porch bench is registered as a semantic bench entity. The running scene verifies 50 benches and 110 usable seats:40 porch benches, 4 campfire benches, 3 picnic benches and3 fishing benches.

Seat slots are invisible game data. The discarded circles, numbers and free-count displays have been removed. Nearby players see a contextual F Sit action, automatically use the nearest free seat, and see Full if none are available. F/Escape stands; reservations remain held until that exit animation finishes.

## Identification and placement

`Model` automatically registers the Bench asset. A semantic `Bench` wrapper supplies stable IDs, labels and facing where authored. Joined cabin GLBs use explicit local seat sockets for their three fixture families; the six cabin designs inherit those fixtures. Nested translation, yaw and scale become world seat positions. New assets can declare bench metadata instead of relying on mesh-shape guessing.

Capacity comes from usable width, end margins and minimum 0.65 m spacing. Current short porch benches have 2 seats and long standalone benches have 3. Each bench/slot has a stable ID and each actor can own at most one seat. Re-registering unchanged geometry or toggling textures retains occupancy. Unmount, reset, pause, blur and invalidation release it.

The reservation engine supports multiple actor IDs within the current running world. It is not yet a cross-client authority: multiplayer integration must arbitrate claims on the server. No fake remote players or browser-storage occupancy were added.

## Verification

- Full repository suite: 62 tests across 13 files pass. Scoped bench/activity/character checks: 21 pass.
- TypeScript and isolated production build pass. Preview remains http://127.0.0.1:4174/ so other chats retain their own distribution builds.
- Registry tests fill a bench with distinct actors, deny an extra actor, release/reclaim slots, enforce one actor/seat, preserve occupancy through metadata replacement and protect against stale cleanup.
- Live browser verifies campfire, fishing and embedded porch seating. A texture/material toggle retains the claim. Standing-up keeps the slot occupied; completion releases it.
- Focused read-only correctness review reported no material findings in seating scope.
- Runtime entity snapshot: seating-registry.json. Clean visual proof: captures/invisible-bench-seats.png. Raw captures and state metadata are retained; cropping only removes the browser backend’s unused margin.

The duplicate seating implementation from the separate ride fork was stopped and reconciled. Existing BMX interaction guards and cabin/map changes were preserved. No player locomotion or house geometry changes were made by this seating pass.
