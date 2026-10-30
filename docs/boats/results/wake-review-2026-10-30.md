# Curved-wake review and acceptance

George's PR49 was integrated with released main47/51 and then accepted43 (`4eee676`). Browser runtime head: `1ea6364`. Later changes are review records and measurement labels.

The review found a real ribbon defect: inactive indexed rows collapsed to the newest head, connecting the old tail back across the trail with nonzero triangle area and opacity. A failing geometry regression measured area0.503; the fix collapses inactive rows at the oldest centre and fully fades them. The test now passes.

Integration preserves47's world-velocity input, smoothed trailing-hull anchor for reverse/side slip, propeller-spray gating, physical wire pose and steering-wheel behavior. George's48-sample world-space ribbon and persistent post-dismount fade are retained. A vehicle guard prevents remote walking speed from emitting new boat foam.

## Actual two-client pass

Both clients ran the real Game/Player/RoomCore through a distinct named local SharedWorker. The normal preview authority and production were isolated. No backend listener was started.

- Straight travel produced a local and corresponding remote wake.
- A turn produced visibly curved ribbons in both clients. Sampled centreline deviation from the end-to-end chord was7.78m locally and8.06m remotely.
- Reverse used the bow-side trailing edge: the recorded head was3.683m ahead of its source centre while velocity was negativeZ.
- Off-centre contact retained the released drift/rotation response with both wake paths present.
- Immediately after dismount, the same local ribbon remained visible with180 active vertices. After4.4seconds of walking, both ribbons had zero active vertices and were hidden. Walking emitted no new boat foam.
- Hiding a moving remote source hid its portalled ribbon while the remote boat kept moving; showing it restored the ribbon. No orphan wake remained visible.
- A fresh emission after reset contained only nearby points at the new boat position. Unit regressions cover live long-jump clearing and forward-to-reverse anchor changes; browser observations confirm the fresh path stays nearby.
- An initial dismount attempt occurred after its old foam had already expired; it is retained in the JSON and excluded from early-fade acceptance. The immediately-after-driving repeat above is the accepted check.

All active-case and teardown error logs were empty. Both clients explicitly left, the final observed peer count was zero, and both owned tabs closed. All five temporary files were removed. The full271-file SHA manifest matched exactly, normal index `03d61c2388d5e875f4820b6b42603c1e4e17404c7d922d7391e40ed144adb182` and listener12514/4173 were preserved. Returned18:26UTC before the18:33:51 boundary.

## Resources and checks

The renderer keeps two draw objects per boat (ribbon plus propeller points). A ribbon has432 vertices. Its unique typed buffers total11,328bytes per boat, plus one shared3,384-byte CPU index array; counting a separate per-geometry index upload gives a14,712-byte upper bound before Three/driver overhead. Positions and auxiliary attributes can upload10,368bytes per active layout. GPU upload/render cost was not isolated in this visual pass.

Actual numerical layout, five-trial Node24 medians on this M4Pro: about1.8microseconds for one boat and90microseconds for50. This excludes Three rendering, GPU uploads, reflections and full frame time. Raw scope/results: `wake-layout-review-2026-10-30.json`; reproduce with `node scripts/benchmark-boat-wake.mjs`.

Integrated runtime checks:450 frontend tests,163 server/protocol tests, both TypeScript checks and production build pass. Exact tested-head CI/Vercel passed. No server/protocol feature change is introduced by49.

Raw path/visibility/UUID/pose observations and cleanup proof: [JSON](wake-review-2026-10-30.json). Captures: [turn](../captures/wake-review/turn.png), [reverse](../captures/wake-review/reverse.png), [slip](../captures/wake-review/slip.png), [early foam](../captures/wake-review/dismount-early.png), [faded](../captures/wake-review/dismount-faded.png), [hidden remote](../captures/wake-review/hidden-remote.png).
