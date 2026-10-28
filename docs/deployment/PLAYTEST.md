# La Baraj live playtest — 28 October 2026

Invite everyone using the same full URL:

https://la-baraj.vercel.app/?room=7ed351d159534d08a04dab72d8e32e0c

- Frontend: https://la-baraj.vercel.app
- Private repository: https://github.com/Clarru/la-baraj
- Worker health: https://la-baraj-world.claumarin336.workers.dev/health
- Cloudflare Worker version: `8e8df522-ec3d-4de6-8b50-57ba3ef8a4b6`
- Verified source commit: `827465dcd665f5c6e65fe1f6ecbe5355d351749b`
- Vercel production deployment: `dpl_DAJCud1Nq1bDKA3V5KNXBKc5JQkb`
- Passing GitHub checks: https://github.com/Clarru/la-baraj/actions/runs/40719418288

The two initial commits were corrected to GitHub account `Clarru`'s noreply identity, `46570067+Clarru@users.noreply.github.com`, for both author and committer. GitHub resolves both identities to Clarru, and Vercel accepted and built the corrected source. The local identity setting applies only to this release repository.

## Verified

- Public production alias returns HTTP 200 without cookies or authentication.
- Frontend: 88 tests across 16 files, TypeScript and production build pass.
- Backend: 9 protocol/core tests and server TypeScript pass.
- Deployed Worker: all 12 socket scenarios pass (see `socket-check.json`).
- Two production browser sessions join the same invite with distinct server identities and mutually visible presence; both display Online 2/30.
- Moving the second player changes the first player's received remote pose and animation (Walk); the rendered remote name badge is visible.
- Both sessions report online, no network error and no pending seat claims. The second session's browser error log is empty.
- `browser-check.json` preserves the authored diagnostic outputs; `captures/live-two-players.png` shows the rendered production scene and Online 2/30.

## Playtest scope

Presence, movement, facing, animation/activity, scooter state, campfire state and seat occupancy are shared. Seat authority, conflicts, disconnect release, room isolation, reconnect snapshots and fire state are covered by the deployed socket harness. Catch inventory and cabin interior presentation remain local. This is not a 30-browser load test and does not provide authoritative movement physics or anti-cheat.

Vercel Hobby and Cloudflare's free configuration are in use; no paid plan was enabled. Original sibling game development remains separate until deliberately integrated into this release snapshot.


## Follow-up integration — completed parallel work

The GitHub transition and ready feature ports are integrated through:

- [PR #1](https://github.com/Clarru/la-baraj/pull/1): running jump holds one extended stride, walking jump is preserved, Shift is held to run, and remote avatars use the same derived jump clips.
- [PR #2](https://github.com/Clarru/la-baraj/pull/2): continuous cabin cutaways and same-door traversal, with 7Hz pose publication during scripted entry/exit. The integration review found and resolved a gap where the doorway branch bypassed pose updates.

Verified runtime source: `be7a4690b2ae39a7473a976a04afbdfc73a8f083`. Vercel production deployment `dpl_FKup89DDUrGtJVbnojEnLEHzzD4C` is Ready; GitHub main checks pass at https://github.com/Clarru/la-baraj/actions/runs/40723461837.

The combined checkout passes97 frontend tests across18 files,9 protocol tests, server TypeScript and the production build. The existing bundle-size advisory remains. An independent read-only review of movement PR#1 found no material issue.

Two production browser sessions in a separate QA room verified distinct player identities, Online2/30 on both clients, `Jump_RunStart` → `Jump_RunAir` → `Jump_RunLand` → idle locally, and a received remote `Jump_RunAir` pose. Cabin entry kept the landscape visible and arrived grounded inside the room. Exit sent intermediate `Walk` poses to the peer before the final outdoor idle pose. Both browser error logs were empty.

Authored diagnostics are preserved in `integrated-browser-check.json`; `captures/integrated-cutaway-online.png` shows the cutaway and Online2/30. QA tabs were separate from the user's shared friends room. This does not establish30-client performance or cabin access permissions.

The unfinished reference-led campfire revision is pushed separately as [draft PR#3](https://github.com/Clarru/la-baraj/pull/3). It remains outside production until its owning chat completes visual QA and marks it ready. The single local preview publication is reserved for that chat during its final check; no new local listener was started by this release process.
