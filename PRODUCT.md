# La Baraj

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + TypeScript + Vite; Three.js / React Three Fiber / Drei; Rapier and Ecctrl for movement; Cloudflare PartyServer for the eventual multiplayer room; Vercel frontend hosting. See docs/TECH_STACK.md.

## Users

An existing Romanian design community, gamers around 30–45, up to 30 simultaneous players. English game content.

## Product Purpose

A playful lakeside world: explore a seeded cabin settlement, meet friends, fish, and collect objects in an immediate, walkable arrival space. Personalization, cabin ownership, and shared persistence remain future product work.

## Capabilities and Constraints

Real Cinciș lake and road geography. Original settlement only on the southern road-facing shore of the wider basin. North shore forest without cabins. The current settlement retains 30 stable road-zoned cabin plots: 15 uphill of the southern road and 15 between the road and a reserved lakefront band. Six complete whole-house designs are distributed five each by a stable Fisher–Yates world shuffle in `apps/web/src/cabin-designs.ts`: Timber veranda, Forest A-frame, Sage porch, Blue wraparound, Copper shelter, and Ivory pergola. The runtime GLBs are `Lake_Cabin_Gable`, `Lake_Cabin_AFrame`, `Lake_Cabin_Sage`, `Lake_Cabin_GableBlue`, `Lake_Cabin_AFrameCopper`, and `Lake_Cabin_SagePergola`; a shared lakefront fire circle is available as a social landmark. All cabin number plates use validated author-defined post/wall mounts above 1.5m with raycast geometry gaps below 5cm.

The local prototype supports fishing with E: cast at a fishing spot, wait for a bite, and press E to reel. Catch records persist only in this browser's local storage; there is no network persistence or cabin ownership system in this pass. The preview selects and stores home plot index 18 locally. A home label and porch light identify that cabin, while a directional north-up minimap uses the real lake and roads plus cabin, fishing, and campfire landmarks; M expands it and H or the Home button focuses the local home camera. These are local-preview navigation cues, not server ownership.

The local prototype now includes three furnished room GLBs, `Lake_Interior_Timber`, `Lake_Interior_AFrame`, and `Lake_Interior_Sage`, mapped by cabin family across all six exterior designs and all 30 local cabins. Rooms are placed at each cabin's actual coordinates and rotation, with a local Z offset that aligns the interior frame to the exterior. Home/Cabins inspection offers Go inside, and E near an exterior door enters; inside and outside share the exact `cabinDoor` plane. The outdoor landscape, lighting, and neighbours remain rendered throughout the exchange; there is no screen overlay, fade, or black backdrop. The active exterior switches to an original-mesh-derived low deck/foundation cutaway from `apps/web/src/cabin-cutaway.ts`, preserving the original porch and steps, while its solid body collider is disabled and a furnished cutaway room supplies primitive floor/wall collision plus tall furniture blockers that prevent stepping onto furnishings. The avatar transfers inside and walks with WASD through a 0.72s kinematic path, using Walk then Idle animation. The camera blends continuously over 0.8s. E at the same inner door, Escape, or Go outside returns to the porch only when near that door; away from it, the HUD says to walk to the door. Exterior roof restoration occurs on exit after 0.76s; entering locks for 0.95s and exiting for 1.42s, while controls lock during the crossing and R cancels the transition. Vehicle entry is gated and the indoor scooter shortcut is suppressed. Final live checks verified all three rooms enter, stable feet at floor +0.015, Go outside porch return, sage room walking, E/Escape exit gating away from the door, and reset during leaving returning to spawn (45, 27), the outside camera, and idle phase. The fixed-orientation `roomCutawayFront` helper removes the foreground door/frame with the front wall from the same GLB; it does not dynamically reclassify walls on every camera rotation. This is a cutaway interaction reference, not full Sims parity.

The interior reference sheet is docs/art-direction/interiors/interior-reference-grid.png, generated with the built-in image_gen tool from docs/art-direction/interiors/interior-reference-prompt.txt. The actual Blender render is docs/art-direction/interiors/interiors-blender.png, with editable source assets/blender/Cabin_Interiors.blend, construction scripts scripts/build-cabin-interiors.py and scripts/optimize-interiors.mjs, and runtime metadata apps/web/public/assets/interior-library.json. The cutaway interaction follows the owner-selected Sims-style home reference shown on EA's official Sims 4 features page: https://www.ea.com/games/the-sims/the-sims-4/features. It is an interaction-pattern reference, not a pixel-perfect art target. All unclaimed cabins are locally explorable through doors and inspection; this is local preview access, not administrator authority.

The approved future access rule is that visits require the owner's approval, while administrator entry is independent of owner approval. Local interiors and door entry are implemented. Cabin ownership, owner-approved network visits and administrator authentication remain future server-backed work. Existing multiplayer room invites are separate from cabin visitor approval. Cheap hosting and reuse-heavy implementation remain constraints. Desktop keyboard play is the current target; mobile optimization and testing are explicitly deferred. Stop character refinement for now and optimize only for a demonstrated performance problem. The current authorized step is an asset feasibility test covering at least 80% of a defined environment-family inventory, with real imported assets, timed integration, browser evidence and an honest feasibility verdict.

## Brand Commitments

La Baraj is the game; Lake Cinciș is its location. English throughout. The owner is exploring a playful stylized 3D look with more shape, texture and lighting detail than basic flat low-poly, using Fortnite as an example of the visual level. This is a direction to test, not an approved finished style. Avoid committing to the simplest Kenney look merely because it is free.

## Evidence on Hand

PRD and technical/reuse/geography documents under docs/. Imported OSM shoreline and roads under assets/geography/. Owner's selected shoreline reference in assets/geography/inhabited-area-reference.png. The current local browser implementation includes the 30 stable settlement plots, six-model runtime library described in apps/web/public/assets/cabin-library.json, validated number mounts, shared fire circle, local home state, north-up minimap, and E-key fishing activity. The original cabin reference sheet is docs/art-direction/cabin-reference-grid.png, generated with the built-in image_gen tool using docs/art-direction/cabin-grid-prompt.txt. The three additional variant references are docs/art-direction/cabin-variants-grid.png, generated with the exact prompt docs/art-direction/cabin-variants-prompt.txt; the actual variant Blender render is docs/art-direction/cabin-variants-blender.png, with editable source assets/blender/Reference_Cabin_Library.blend. The prior 16-family feasibility report remains historical. Final verification includes the parent build with 55 tests and the reviewer build with 65 tests across 14 files, live H/Home home-camera focus, M minimap expansion, six-design inspection keys, and zero console errors. Final captures with JSON/raw sidecars include home-navigation-user.png, home-navigation-desktop.png, home-map-expanded-desktop.png, cabin-number-gable.png, cabin-number-aframe.png, cabin-number-sage.png, cabin-variant-blue.png, cabin-variant-copper.png, and cabin-variant-pergola.png under docs/feasibility/captures/. Feasibility measurements remain local rendering evidence; no network persistence, cabin ownership, or multiplayer-session evidence is established.

## Product Principles

- Prove choices in a running scene before expanding the game.
- Reuse cohesive licensed assets; measure integration cost.
- Preserve real geography and owner-controlled fictional buildings separately.
- Let the world lead; keep interface small and usable.
- Report limitations and unbuilt coverage honestly.

## Cabin migration evidence

The Sims-style cutaway was ported into the dedicated GitHub worktree, retaining the release App’s room lifecycle, remote avatars, shared fire and authoritative seating. Runtime interior GLBs and construction scripts already matched the completed legacy assets. No backend or protocol change is part of this port. The original preview captures remain historical browser evidence: `sims-final-user-aframe.png`, `sims-final-timber.png`, `sims-final-sage.png`, and `sims-final-porch-return.png` under `docs/feasibility/captures/`. Their JSON records preserve the measured 1136×1181 viewport; raw originals remain in the legacy folder. The port passed 90 frontend tests, TypeScript and the production build under Node 24. No worktree server or new live multiplayer validation was run. Interior visibility remains local, and the short scripted crossing resumes the normal remote motion callback after completion; live room/door integration should be checked by the release owner.
