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

The approved future access rule is that visits require the owner's approval, while administrator entry is independent of owner approval. Actual interiors, entry flow, invitations, and administrator authentication are not implemented; they remain the next server-backed step. Cheap hosting and reuse-heavy implementation remain constraints. Desktop keyboard play is the current target; mobile optimization and testing are explicitly deferred. Stop character refinement for now and optimize only for a demonstrated performance problem. The current authorized step is an asset feasibility test covering at least 80% of a defined environment-family inventory, with real imported assets, timed integration, browser evidence and an honest feasibility verdict.

## Brand Commitments

Lake Cinciș. English throughout. The owner is exploring a playful stylized 3D look with more shape, texture and lighting detail than basic flat low-poly, using Fortnite as an example of the visual level. This is a direction to test, not an approved finished style. Avoid committing to the simplest Kenney look merely because it is free.

## Evidence on Hand

PRD and technical/reuse/geography documents under docs/. Imported OSM shoreline and roads under assets/geography/. Owner's selected shoreline reference in assets/geography/inhabited-area-reference.png. The current local browser implementation includes the 30 stable settlement plots, six-model runtime library described in apps/web/public/assets/cabin-library.json, validated number mounts, shared fire circle, local home state, north-up minimap, and E-key fishing activity. The original cabin reference sheet is docs/art-direction/cabin-reference-grid.png, generated with the built-in image_gen tool using docs/art-direction/cabin-grid-prompt.txt. The three additional variant references are docs/art-direction/cabin-variants-grid.png, generated with the exact prompt docs/art-direction/cabin-variants-prompt.txt; the actual variant Blender render is docs/art-direction/cabin-variants-blender.png, with editable source assets/blender/Reference_Cabin_Library.blend. The prior 16-family feasibility report remains historical. Final verification includes the parent build with 55 tests and the reviewer build with 65 tests across 14 files, live H/Home home-camera focus, M minimap expansion, six-design inspection keys, and zero console errors. Final captures with JSON/raw sidecars include home-navigation-user.png, home-navigation-desktop.png, home-map-expanded-desktop.png, cabin-number-gable.png, cabin-number-aframe.png, cabin-number-sage.png, cabin-variant-blue.png, cabin-variant-copper.png, and cabin-variant-pergola.png under docs/feasibility/captures/. Feasibility measurements remain local rendering evidence; no network persistence, cabin ownership, or multiplayer-session evidence is established.

## Product Principles

- Prove choices in a running scene before expanding the game.
- Reuse cohesive licensed assets; measure integration cost.
- Preserve real geography and owner-controlled fictional buildings separately.
- Let the world lead; keep interface small and usable.
- Report limitations and unbuilt coverage honestly.
