# Lake Cinciș — shared workspace rules

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
