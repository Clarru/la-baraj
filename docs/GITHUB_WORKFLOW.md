# La Baraj GitHub workflow

The canonical repository is https://github.com/Clarru/la-baraj (private). Production is https://la-baraj.vercel.app. The game name is **La Baraj**; Lake Cinciș is the map/location.

## Who works where

| Chat | Branch | Dedicated working directory | Responsibility |
| --- | --- | --- | --- |
| Putting it live | `main` | `/Users/claumarin/Documents/ChatGPT/multiplayer-game-release` | Integration, multiplayer/backend, release and deployment |
| Choose a low-cost multiplayer stack | `codex/cabins-interiors` | `/Users/claumarin/Documents/ChatGPT/multiplayer-game-worktrees/cabins-interiors` | Cabins, interiors, doors and home/navigation |
| Create a game - fork 1 | `codex/seating-campfire` | `/Users/claumarin/Documents/ChatGPT/multiplayer-game-worktrees/seating-campfire` | Seating, activities, campfire and its animations/effects |
| Fork 2 - bicycle | `codex/scooter-jumping` | `/Users/claumarin/Documents/ChatGPT/multiplayer-game-worktrees/scooter-jumping` | QuickVolt scooter, rider, movement, jump animations and camera |

These are separate Git worktrees, so edits and branch switches in one directory do not change another chat's files. Use the dedicated absolute working directory for every command and edit. Do not switch branches in another chat's checkout. The shared Git configuration sets the correct identity for all worktrees:

`Clau Marin <46570067+Clarru@users.noreply.github.com>`

Never use `clau.marin@usbc.xyz`. Before committing, check `git var GIT_AUTHOR_IDENT` and `git var GIT_COMMITTER_IDENT`; both must resolve to the identity above.

## Transition from the old shared folder

`/Users/claumarin/Documents/ChatGPT/multiplayer-game` is the preserved legacy source/preview folder. It has no GitHub remote and no tracked baseline. Do not pull, checkout, reset, clean, stage everything, commit or push there. Do not delete or replace it. Work already in progress stays safe there while its owner finishes the current scoped task.

Move completed work deliberately into the assigned worktree based on `origin/main`. Compare only the task's owned files/hunks against the current release. Port the change; do not blanket-copy App.tsx, player.tsx, activities.tsx, package files, or the whole legacy source tree over the release. Preserve current multiplayer hooks, server-authoritative seat claims, remote pose publishing and shared fire. Latest legacy interiors and jumping revisions may be ahead of production and need this port.

Large ignored Blender/source assets remain available in the legacy folder. Copy only the local source material needed into the same ignored paths of your worktree, or use it as a read-only reference. Commit runtime assets and their licensing/provenance with the feature, not caches or credentials. Do not perform a new local server migration as part of porting a feature.

## Daily feature work

1. Work only on your branch and in its dedicated directory. Read this checkout's `AGENTS.md`. Use Node 24 (`.nvmrc` and package engines). Run `npm ci` when that checkout needs dependencies.
2. Before starting a new change, with a clean working tree, fetch origin and merge `origin/main` into your feature branch. Preserve unfinished work before synchronizing; do not reset or force a dirty tree. Shared integration files may need a deliberate merge.
3. Keep commits scoped to the task. Stage explicit paths and review `git diff --cached` so another person's or unrelated files are not swept into the commit.
4. Run the checks relevant to the change. For runtime integration, use `npm test` and `npm run build`; backend/protocol changes also require `npm run server:check` and `npm run test:protocol`. No tests are needed solely to mirror documentation edits. Report what actually ran.
5. Commit and push the feature branch with `git push -u origin <your-branch>`. No force pushes or direct pushes to main from feature chats.
6. Open a pull request targeting main; use a draft while unfinished. Include the behavior changed, validation and any asset provenance or shared-file integration concerns. Attach every created PR to the chat with the Codex attachment tool.

The GitHub checks run for pull requests and for main. A branch push is safe to share for review and does not update production. A Vercel preview may be generated, but the Worker allows only the exact production browser origin. Do not widen origin checks to a wildcard. Multiplayer preview testing requires a deliberately approved exact preview origin or integration into production.

## Integration and publication

This chat, **Putting it live**, is the integration/release owner unless the user explicitly assigns another owner. Feature chats may create/push feature branches and PRs. The release owner reviews the diff, resolves overlaps while retaining both features, waits for checks and merges PRs one at a time. Do not merge incomplete work merely because a branch is available.

A merge/push to main automatically builds and deploys the frontend on Vercel. Verify the deployment is Ready and check the production URL after a runtime change. Deploy Cloudflare only for intentional backend/config changes, after compatibility and protocol checks; frontend pushes do not automatically deploy the Worker. No paid upgrade is authorized.

Existing multiplayer invites remain valid. For a shared playtest, everyone uses the same complete URL including its `?room=` value.

## Local preview remains one server

Keep the existing canonical http://127.0.0.1:4173/ listener. Never start per-worktree game or backend servers. Worktrees can run checks and build their own dist without starting a server. Those builds are not automatically the shared preview. Only the coordinated preview owner publishes a build to the canonical preview, and only one chat may write that shared dist at a time. The legacy preview remains in place until its owner deliberately coordinates a switch; do not kill it as part of this Git transition.

## Adding another task later

The release owner can create another feature branch and worktree from current origin/main, assign ownership, and notify the relevant chat. Do not reuse an occupied worktree or branch. This workflow is a coordination convention; it does not claim that a paid GitHub branch-protection feature has been enabled.
