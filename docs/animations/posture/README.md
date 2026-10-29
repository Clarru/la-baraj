# Posture and social gestures

This feature branch adds C crouch, Z prone, P/stationary middle click for punch, and G/Menu for a one-shot greeting. A repeated stance key returns to standing when the target collider fits. Crouch and prone cannot sprint, jump or punch. UI, text entry, activities, vehicles and water retain input/pose priority.

## Compatible assets

Crouch uses the existing licensed original `human_male.glb` library's `Crouch_Idle_Loop` and `Crouch_Fwd_Loop`, extracted as `Crouch_Idle` and `Crouch_Walk` into the established `character-actions.json`. The source model stays local under `assets/character-source`; its license/provenance remain alongside the character documentation. No mesh, outfit or texture replacement is involved.

Run `node scripts/extract-stance-actions.mjs [source-glb-path]` from the repository root to add/update only those clips while preserving existing actions. The full `extract-activity-clips.mjs` also includes them. Both preserve compatible quaternion and root/pelvis tracks. The original model contains 86 clips; the shipped character alone is not a complete inventory of reusable motion.

`Social_Wave` is a dedicated additive raised-arm gesture with identity endpoints. The historical asset named `Wave` is actually a talking loop and is not used for the new greeting. Prone clips are maintained separately in `stance-clips.ts`; the upright treading-water `Swim_Idle` is not used for prone.

## Controller and networking

The optional `posture` enum travels over the existing pose transport. Server punch eligibility rejects lowered postures; seat/activity/vehicle poses normalize posture to standing. Explicit posture wins over animation-name fallback. Existing clients without posture remain compatible.

Rapier target-shape queries exclude the player's body and sensors. Collider changes preserve vertical support extent, and the Ecctrl ground-probe origin follows that extent. Prone rotation uses a horizontal footprint and refuses a turn into a solid. Cabin transfers attempt safe expansion at departure and destination rather than bypassing clearance. Reset relocates to the established spawn and clears pending gestures.

Local motion transmits the visual root position (`sample.feet`); the stance visual offset is already included there, so remote avatars must not add the same lift a second time. Whole-avatar distance culling remains enabled. Skinned submeshes use a conservative animated root envelope in their own mesh-level bounding sphere, avoiding stale standing-bind culling while retaining behind-camera culling. Geometry-only bounds are insufficient for Three SkinnedMesh.

## Verification status

The authored crouch was inspected on the actual dressed character from front and side at a frozen phase. The head/pelvis visibly lower, feet contact the floor and appearance is retained. Real-rig tests measure hip lowering and deformed vertex contact rather than mistaking ankle-joint height for sole height. Both crouch clips have zero root drift.

The first procedural crouch and upright swimming-based prone failed visual acceptance. Prone support/contact correction is still in progress. The full in-world/local-remote transition, activity and performance gates in `docs/CHILL_GAMEPLAY_PLAN.md` remain release requirements. These notes do not claim that the feature is deployed.
