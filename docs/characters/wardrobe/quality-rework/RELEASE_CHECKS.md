# Hats-only release checks

Frozen visual/UI build: 0b461639931fa784b284539d974ddcf13a5b26c9, based on
main e5558b8665eb2e3b19dbc68219de68a022cea3d4. The post-QA follow-up adds only
a snapshot capability marker and its test; it does not change the reviewed models
or UI. Acceptance hashes are scoped to the six hat/under-hair exports.

Nine hat/hair combinations were inspected from front, side and rear with brief
Walk/Wave playback. All six swatches on all three hats, Original restoration,
per-actor material ownership/shared texture detail, and removal restoring full
hairstyles passed. Desktop, 393×852 portrait and 852×393 landscape staged UI passed
Apply, Cancel and reopen. The actual Game/local SharedWorker run used two distinct
identities/homes, verified observer colour receipt, saved reload, Reset look and
1.4278m movement. The final direct Game run had no page errors/failed requests or
production sockets. Earlier runner assumptions and failures remain in raw reports.

Cleanup removed only the 18 matching additions. All 409 baseline file paths,
sizes/hashes, the normal HTTP index and listener PID2669 were unchanged. The last
owned context closed within the action window. Evidence stayed below 8MiB.

Geometry tradeoff from release-owner audit: cap12,584 triangles/2 primitives,
beanie11,232/1, bucket7,776/2; under-hair523/544/2,150 triangles. Each hat retains two
images. Brief scene stability is verified; this is not an iPhone thermal benchmark.

Deploy the Worker first. Verify a live snapshot advertises
`features.appearanceHatColors === true` after the Durable Object runs the new code;
then publish the frontend. This avoids an older normalizer dropping the new dye.
Old profiles keep Original and older clients ignore the additive optional marker.
No database migration, identity change or new UI capability framework is needed.

Main owns merge/deployment. Unfinished clothing experiments remain in checkpoint
073a830 on codex/wardrobe-quality and are excluded from this feature branch.
