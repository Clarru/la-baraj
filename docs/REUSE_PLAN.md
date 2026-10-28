# La Baraj — Reuse and build plan

Research date: 28 October 2026. Source review only; no third-party game has been cloned into this project or run.

## Decision

Build La Baraj's own small gameplay layer on reused rendering, controller, networking and art packages. Do not fork a whole game as the default. A full fork is worthwhile only when its existing gameplay, runtime and data model reduce more work than they introduce.

This is a reuse-heavy custom game. The original work is the map composition, game rules, persistence/identity integration and polish. No numerical “percentage already built” is claimed.

## Selected reusable pieces

| Need | Source | What it saves | Work still needed |
| --- | --- | --- | --- |
| Character movement | [Ecctrl](https://github.com/pmndrs/ecctrl), MIT | Grounding, slopes, movement and controller integration | Camera tuning, controls, stun adapter and network poses |
| Physics | [React Three Rapier](https://github.com/pmndrs/react-three-rapier) | Rapier integration | Simple colliders and recovery volumes |
| Rendering helpers | [Drei](https://github.com/pmndrs/drei) | Loading, cameras and scene helpers | Scene composition and performance work |
| Room/network lifecycle | [PartyServer](https://github.com/cloudflare/partykit/tree/main/packages/partyserver), ISC | Room routing, connection hooks, broadcasts, hibernation integration | Authentication, schema validation and gameplay authority |
| Reconnecting socket | [PartySocket](https://github.com/cloudflare/partykit/tree/main/packages/partysocket), MIT package metadata | Transport retry behavior | Re-authentication and authoritative resync |
| Trees, rocks, plants | [Kenney Nature Kit](https://kenney.nl/assets/nature-kit), CC0 | A coherent environment prop library | Import, scale, placement, collision and instancing |
| Cabin/camp props | [Kenney Survival Kit](https://kenney.nl/assets/survival-kit), CC0 on pack page | Props for the settlement | Select actual suitable models; create a simple original cabin shell where necessary |
| Initial avatars | [Kenney Blocky Characters](https://kenney.nl/assets/blocky-characters), CC0 | Animated starting characters | Verify clip names, punch coverage and stylistic fit in a sample scene |
| Geographic footprint | [OpenStreetMap](https://www.openstreetmap.org/copyright), ODbL | Real shoreline and selected roads | Import, projection, simplification and attribution |

Package license statements apply to code. Preserve included notices when redistributing copied code. [Ecctrl LICENSE](https://github.com/pmndrs/ecctrl/blob/main/LICENSE), [Ecctrl NOTICE](https://github.com/pmndrs/ecctrl/blob/main/NOTICE). Source files and model licenses must be recorded independently; demo assets do not inherit a repository's code license automatically.

Kenney confirms its asset-page packs are CC0. Download the chosen packs directly and keep their included license files and provenance. [Kenney asset usage](https://kenney.nl/support)

## Whole projects evaluated

| Candidate | Evidence | Fit and decision |
| --- | --- | --- |
| [Tom Johnson's Pilgrimage](https://github.com/tomjohndesign/pilgrimage) | Public source; custom noncommercial source-available license | Noncommercial reuse is expressly permitted subject to its conditions, but this is a settlement game with a different core loop. It is also distinct from Tom's portfolio. Do not adopt it as the base. |
| [Treehouse](https://github.com/robertguss/treehouse) | R3F + Cloudflare shared-world starter; inspected root and repository metadata show no explicit license | Architecturally close, but reuse permission is not established. Keep as a reference only. Do not copy its kit or instructions. |
| [R3F.Multiplayer](https://github.com/juniorxsound/R3F.Multiplayer) | Small Socket.IO/Vite template, repository last pushed July 2022; no explicit license found in inspected root/metadata | Would require backend replacement and dependency modernization. Reference only. |
| [MML 3D Web Experience](https://github.com/mml-io/3d-web-experience) | MIT; browser multiplayer world, avatars and chat; documented Node server deployment | A genuine reusable whole-world alternative. Its MML composition and server architecture add a different model to learn/port. Reconsider if an avatar/chat world becomes the main objective; not selected for the lake's mechanics. |
| [Colyseus](https://github.com/colyseus/colyseus) | MIT multiplayer framework with Node server focus | Strong alternative if authoritative game simulation becomes complex. For this scope it introduces a separate server hosting decision. Not selected. |
| Ecctrl's example scene | Maintained alongside the controller, with explicit code license | Best source for a small movement/animation integration example. Use the package and adapt only useful licensed example code; avoid importing the entire showcase. |

Repository status/license observations were checked against each repository's root and GitHub API metadata on the research date. No-license findings mean permission was not established by this review, not a claim that the author could never grant permission.

Pilgrimage's own license distinguishes noncommercial permission from commercial use, requires preservation of notices and identification of modifications, and treats separately licensed dependencies separately. [Actual Pilgrimage license](https://github.com/tomjohndesign/pilgrimage/blob/main/LICENSE). The original pasted stack breakdown is not the source of truth for either game's code or asset rights.

## Quaternius and paid-template options

Quaternius is a useful art candidate, but current downloads must be checked against the specific pack's terms. The current [Quaternius Asset License](https://quaternius.com/license.html) permits use in completed projects and restricts standalone asset redistribution. Older CC0 labels do not establish the license of a new download. Kenney is the simplest initial choice for a repository containing redistributable source assets.

A paid coherent pack could be economical if the free character/cabin combination fails the visual or animation test. No purchase is selected or authorized. Do not buy a whole game just because it advertises multiplayer; verify the server runtime, source license, animation rig, build process and persistent-state support first.

## What we actually build

1. The world composition around real Cinciș geography and fictional buildings.
2. A small player-controller adapter and remote avatar presentation.
3. The server's identity/cabin records and access checks.
4. Trophy pickup, carry, drop, placement and capture rules.
5. Punch validation, stun, immunity and safe areas.
6. A fishing state machine, reward table, collection and display slots.
7. The overlay UI and consistent audiovisual feedback.

Start with inexpensive visual solutions: a hand-attached carried object, an authored attack animation or simple procedural swing if the rig permits it, snapped object placement, a flat water shader, and small fixed display slots. Do not build a general inventory engine, multiplayer rigid-body framework or terrain editor.

## Effort comparison

These are planning ranges for one developer familiar with the tools, assisted by coding tools. They are not measured estimates or a quote. Art quality and multiplayer edge cases can change them materially.

| Path | Initial playable spike | Polished first community release | Assessment |
| --- | --- | --- | --- |
| Selected packages + free art | Roughly 2–4 focused days | Roughly 3–6 focused weeks total | Best fit; includes custom rule/persistence work |
| Port a whole multiplayer world to our stack | Could show avatars quickly | Uncertain; porting and removing systems may erase savings | Only worthwhile after a proven compatible demo |
| Build controls, physics, transport and art ourselves | Several foundational tasks before the game loop | Materially longer | Poor use of the budget |

Hosting can be inexpensive while development still takes real work. The hardest custom tasks are reliable ownership/reconnect behavior, a satisfying punch/trophy loop, and a coherent scene running well on laptops.

## First implementation gate

Within the first 1–2 focused days of implementation, prove: one Kenney character moves through simple terrain with Ecctrl; a second browser sees it; a server-accepted punch produces the same two-second stun on both; one trophy cannot have two carriers; the production-shaped Worker deploys on the free plan.

If this fails because of controller/animation compatibility, replace the isolated controller or character asset before building more systems. This is the point to revise a package decision, with evidence. Do not expand into a full custom engine to rescue a poor starter choice.

## Asset intake record

For every downloaded asset or copied example record: source URL, author, source revision/date, license file, original file name, any conversion and shipped location. Keep upstream notices in `third_party/` when material is actually imported. Separate OSM-derived data from original game objects. Do not rip a game's assets or copy an unlicensed repository merely because it is public.
