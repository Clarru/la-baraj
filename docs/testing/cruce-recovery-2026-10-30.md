# Cruce setup and stalled-trick recovery

The reported public freeze showed a complete Duel trick with responsive browser controls. The exact old cause remains unproven: a later read-only server snapshot found an empty lobby, while a bounded Cloudflare trace showed successful alarm invocations without exceptions. This patch adds recovery and evidence rather than claiming a missing alarm hook.

A seated client requests an authoritative snapshot after a complete trick stays visible beyond its collection deadline. The existing sync message settles due state, safely repairs a complete online trick with a null clock, and returns sanitized before-state diagnostics. A stale client is refreshed even if the server already advanced. Retries are bounded and timers stop on recovery/disconnect. A normal turn deadline becomes a soft warning: the match/hand stay intact, the expired deadline schedules no alarm spin, and the returning player can act using its unchanged logical-turn revision.

Client JS errors, rejected promises, WebGL context loss, foreground long stalls and Cruce before/after recovery state can be reported through a bounded Vercel function. Reports exclude hands, chat, player names, resume credentials, URL queries/userinfo; schema, origin, size, per-session rate and client dedup limits apply. A manual report yields a correlation code. Production reports are structured with tag la-baraj-client. Source/data are kept in deploy-included folders.

Current regressions cover deliberately missing alarm execution, null complete-trick clocks, server-already-advanced stale snapshots, AFK late actions, client watchdog lifecycle, diagnostics credential redaction/origin/body/rate constraints. Browser and deployed endpoint evidence follows below.

## Accepted browser replay

At runtime `3042d0460b4a5b59815d992badacbe15d9274fd5`, two independent real game clients used F to occupy west/east benches. Applying Duel moved them to south/north in the authority, both boards and both local/remote character poses. Both retained their existing nickname; different connection IDs and home slots identified the two clients. Initial private hands were disjoint. No scripted peers or direct state mutation were used.

Both clients confirmed ready, dealt and bid through the normal controls. All 24 card plays were accepted through actual hand buttons. The exact reported third-trick position was captured: two cards, stock4, hands7/7, revision17. Collection advanced to revision18, stock2, hands8/8. Reloading one client preserved home slot, physical seat and its exact eight-card hand. The completed round reached both clients with 81+39=120 card points and scores2/1. Continuing one player's round-end confirmation correctly waited for the other. Browser error logs were empty. Both clients then left through the normal controls; authority seats and all four Cruce members were empty before the owned tabs closed.

Evidence: [reseated lobby](captures/cruce-recovery/reseated-duel.webp), [reported trick position](captures/cruce-recovery/third-trick.webp), [completed round](captures/cruce-recovery/complete-duel.webp), [move/reconnect replay](captures/cruce-recovery/duel-replay.json).

The sole shared preview process PID12514 was reused. Seven unique QA HTML/chunk additions were removed afterward; all224 original file hashes match the fresh backup, including normal index `3f427788491af25d3dbc92feeaa585c5e75f5250c13cce47bc2887bb1e37c12e`. [Restoration manifest](captures/cruce-recovery/restoration.json).

## Deployed diagnostics proof

The first actual preview API smoke exposed an extensionless Node ESM dependency import despite a successful build. The import now names the emitted `.js` file. Targeted endpoint tests, frontend TypeScript and an explicit NodeNext emit/native Node24 Request/Response invocation pass; native status204.

Preview `dpl_7ZubLyr22EU868HSrug1iwzxz93B`, runtime `de72084981f7ac5ec9f0919bd9af93be76db5c29`, returned204 for one synthetic `diagnostic_test`. Vercel runtime logs contain the same reportId `cruce-qa-de72084-proof`, serverBuild and sanitized context. [Exact structured log](captures/cruce-recovery/vercel-proof.json). This proves preview reporting; production reporting must be checked after release.

Final validation includes370 frontend tests,134 protocol tests, both TypeScript checks, normal/lab bundles and Worker dry-run. The normal bundle contains none of the hand-contact/test controls. The client retry-cap regression confirms exactly three automatic sync attempts for an unchanged stalled revision and timer cleanup on disconnect.

For a future public report, correlate the manual diagnostic code or recent recovery event through the linked project:

```sh
vercel logs --project la-baraj --environment production --no-branch --query la-baraj-client --since 1h --json
```

Inspect public phase/revision/deadline, stock/trick/player/away counts and recovery before/after state. Avoid raw websocket traces or full client snapshots containing private game/session data. The original incident remains unattributed; this evidence makes subsequent stalls diagnosable.
