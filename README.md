# La Baraj

A browser multiplayer playtest at Lake Cinciș, Romania. The public game/project slug is `la-baraj`; Lake Cinciș names the real map/location.

The release adds a Cloudflare PartyServer room for real presence, synchronized movement/activity/scooter presentation, exclusive seat reservations and shared campfire state. The frontend is deployed on Vercel; this repository is the release source. Catches remain local to each browser.

See [live multiplayer and deployment](docs/LIVE_MULTIPLAYER.md) for setup, environment variables, limits and verification. Parallel contributors follow [the GitHub workflow](docs/GITHUB_WORKFLOW.md): one feature branch/worktree per chat, PRs to main, and one integration/release owner.


A small multiplayer lake playground for a Romanian design community. English throughout. Up to 30 people online together. Real Cinciș geography, fictional cabins and activities.

Cabins and shared activity spaces follow the southern road-facing shore of the selected wider basin. The opposite northern shore stays forest, without cabins. See [the area reference](assets/geography/inhabited-area-reference.png).

## Project baseline

The product and architecture below are the v1 implementation baseline, dated 28 October 2026. Gameplay numbers are initial tuning values. Changes to scope or architecture should be recorded in these documents rather than silently introduced during implementation.

| Document | Purpose |
| --- | --- |
| [Product requirements](docs/PRD.md) | Experience, first-release scope, game rules, acceptance criteria |
| [Technical decisions](docs/TECH_STACK.md) | Selected stack, authority, persistence, performance, cost model |
| [Reuse research](docs/REUSE_PLAN.md) | What to reuse, evaluated alternatives, sources and licenses |
| [Geography](docs/GEOGRAPHY.md) | Real shoreline, road and elevation pipeline; fictional buildings |
| [Cloudflare setup](docs/CLOUDFLARE_SETUP.md) | Free-account setup and later deployment steps |

## Selected stack

React + TypeScript + Vite; Three.js through React Three Fiber and Drei; Rapier + Ecctrl for local character movement; PartySocket + PartyServer; Cloudflare Workers and one SQLite-backed Durable Object for the shared world; Vercel for the static frontend.

Reuse maintained packages and licensed art. Write the small set of La Baraj game rules ourselves. No full-game fork has been adopted.

## Current status

The public La Baraj friends playtest is live at https://la-baraj.vercel.app. Real multiplayer presence, movement, activities, scooter state, shared fire and exclusive seating are implemented. Fishing catches and cabin interior presentation remain local. Persistent ownership and punching are not implemented. See [verified deployment details](docs/deployment/PLAYTEST.md).

The owner rejected the first test's scale, character and interface. The revised test expands geographic distances 5×, preserves human-scale buildings and avatars, uses a Blender-assembled character study and baked distant trees, adds reflective water, and replaces the original HUD with Barlow typography and Phosphor icons. Terrain heights remain a procedural proxy.

See [the feasibility test plan](docs/feasibility/TEST_PLAN.md), [results](docs/feasibility/RESULTS.md), and [the editable character source](assets/blender/Lakeside_Character.blend). The large Blender/source downloads remain local and are excluded from Git; scripts and provenance are retained.

## Run locally

```sh
npm ci
npm run dev
```

Use the one canonical local URL, `http://127.0.0.1:4173/`, and reuse an existing listener as required by `AGENTS.md`. To inspect a production build, run `npm run build` and use the existing preview process; only start `npm run preview` when no other game server is running.

Choose **On foot**, use WASD/arrows to move, Shift to run and Space to jump. Drag to turn the camera. **Survey view** shows the wider settlement. The side controls change light, compare close materials and render 30 local avatars. The inventory distinguishes imported, custom, mixed and pending families and exports the current rendering measurements.

`npm test` checks source asset integrity and the geographic/settlement constraints. `npm run build` typechecks and builds the application. The current bundle has a size advisory; code splitting remains a later optimization.

The frontend is deployed on Vercel and multiplayer runs on the Cloudflare Worker `la-baraj-world`. No paid plan was enabled.

Geographic inputs and generated previews live under `assets/geography/`. See their data license before redistribution. Buildings and game objects are separate from the source geography.

Owner-playtest fixes: the outfit meshes are rebound to the animation skeleton, a single terrain mesh supplies visible ground and collision, model yaw follows travel without controller double rotation, and a physical shoreline boundary replaces the water-entry reset. Seven regression checks cover geography, asset integrity and collision.


The current house library follows the [generated cabin reference sheet](docs/art-direction/cabin-reference-grid.png), replacing the rejected experimental house assemblies. Three complete Blender models supply the timber veranda cabin, A-frame with dormer, and sage cabin with offset porch. The reference prompt and source render are in `docs/art-direction/`; edit `assets/blender/Reference_Cabin_Library.blend` or regenerate with `scripts/build-reference-cabins.py` and `scripts/optimize-cabins.mjs`.

Select **Cabins** and press **1**, **2**, or **3** to inspect the three archetypes. There are 30 stable southern plots, split between uphill and lake-side road plots while preserving a shared lakefront band. In **On foot**, use E near a fishing rack to cast, wait for the bite prompt, then E to reel. Catch records are local to this browser. E near the fire circle lights or extinguishes the embers. Desktop keyboard play is the current target; mobile work is deferred.


Current cabin/navigation extension: six fixed architectural designs are shuffled across the 30 plots (five of each). Extra variants follow `docs/art-direction/cabin-variants-grid.png`; actual Blender output is `cabin-variants-blender.png`. Number plates attach to validated model-specific wall/post mounts. In Cabins mode, keys 1–6 inspect each design. H or Home focuses your local-preview cabin; M expands the live north-up minimap. This browser stores the current home selection, while server ownership, actual room interiors, owner-approved visits and admin authentication remain next-stage work. All seating behavior belongs to the separate seating task.
