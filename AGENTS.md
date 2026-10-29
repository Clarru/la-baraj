# La Baraj — shared workspace rules

## Product naming

- The game name is **La Baraj** everywhere players or repository visitors see a product name.
- Use `la-baraj` for public URL, repository and service slugs. The multiplayer Worker is `la-baraj-world`.
- **Lake Cinciș** is the real map/location. Preserve geographical names and existing local storage keys; those are not game branding.

## GitHub and parallel work

- Canonical repository: **https://github.com/Clarru/la-baraj** (private). Follow [the GitHub workflow](docs/GITHUB_WORKFLOW.md) for assigned branches/directories and release rules.
- One dedicated Git worktree and feature branch per chat. The release checkout is `~/Documents/ChatGPT/multiplayer-game-release`; only **Putting it live** owns main and integration/deployment.
- Feature chats may commit, push their feature branches and open PRs. Do not push main, merge your own PR or force-push without explicit user/release-owner coordination. Main automatically deploys the frontend.
- Required Git author and committer: `Clau Marin <46570067+Clarru@users.noreply.github.com>`. Never use a personal or work email address for Git authorship.
- The old shared folder `~/Documents/ChatGPT/multiplayer-game` is preserved legacy source/preview, not a GitHub checkout. Do not pull/reset/clean/checkout/stage/commit/push there. Port only completed owned changes into your assigned worktree while preserving current multiplayer integration.
- Do not start per-worktree servers. Keep the single localhost:4173 preview rule below.

## One shared production world

- Production is https://la-baraj.vercel.app/ for everyone. No room selection, generated room IDs, invite-copy UI, or visible capacity denominator.
- CANONICAL_WORLD_ID is the preserved existing world in packages/shared/protocol.ts. Accepted legacy room URLs are aliases, not separate worlds. Preserve its current ownership and fire state. The user explicitly retired housing v1 on October 28: housing epoch 2 assigns sequential cabins nearest the gathering area, builds only registered owners’ cabins, retains them offline, and commits owner signs after five unchanged minutes. Do not reset epoch 2 without a new user request.
- Player-facing UI is the game, a transparent title banner, compact status, Menu and contextual actions. Inspection/debug tools are development-only. The circular minimap stays visible at bottom-left without labels or map controls; help remains on demand.

## One local game URL

The user explicitly requires **one running local game server** for all chats working on this project.

- The canonical URL is **http://127.0.0.1:4173/**.
- The canonical production build directory is **dist/**.
- Run source checks with `npx tsc --noEmit` and `npm test` as needed.
- Coordinate production builds with the chat currently publishing the shared preview. Only one chat may write `dist/` at a time. A passing build can be served by the existing preview process; it does not require another server.
- Before starting a server, check `lsof -nP -iTCP:4173 -sTCP:LISTEN`. Reuse the existing project listener when present.
- If no project listener is running, build with `npm run build`, then start **one** `npm run preview` process.
- `npm run dev` is an alternative mode on the **same port 4173**. It must not run alongside preview. Switch modes only in coordination with the current preview owner.
- Both server commands must use strict-port behavior: **fail if 4173 is occupied; never fall back to another port**.
- Do not start additional project previews or development/test servers on 5173, 4174, 4175, 4176, or any other port. Do not offer isolated build URLs to the user.
- Backend/local deployment test servers also need explicit coordination; do not leave additional local listeners running after checks. Remote deployed services are separate from this local-preview rule.
- Before stopping a process, confirm it belongs to this project or its release workspace. Do not terminate unrelated Node, browser, plugin, or system services.
- Any exception to the one-port rule requires a new explicit user instruction.

## Parallel chats

- Keep explicit file ownership. Read the latest file before editing a shared integration point, and preserve concurrent changes.
- Do not duplicate work that another chat already owns. Coordinate ownership before editing the same subsystem.
- Port 4173 is the shared latest integrated build, not a private preview for one chat. Report when source changes are still unbuilt rather than starting another server.
