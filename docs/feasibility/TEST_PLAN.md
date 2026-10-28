# La Baraj — Environment asset feasibility test

Started: 28 October 2026, 14:28:58 Europe/Bucharest (12:28:58 UTC).

## Question

Can we assemble a cohesive playful stylized 3D lake world, richer than flat low-poly, using mostly existing assets at a sensible integration cost and browser rendering cost?

## Coverage definition, fixed before implementation

The denominator is 20 representative **environment asset families**, not 20 individual model instances, 80% of development, or 80% of the final game's quality. A family counts as integrated only when it is present in the rendered scene using a working mesh/material or authored world surface. Finding a download alone does not count.

| ID | Family | Required sample |
| --- | --- | --- |
| 1 | Terrain | Traversable shaped land |
| 2 | Shore | Water/land transition |
| 3 | Water | Animated lake surface |
| 4 | Roads | Road from the imported geographic layer |
| 5 | Footpaths | Cabin-to-shore access |
| 6 | Broadleaf trees | Several instances and shapes |
| 7 | Conifer trees | Several instances and shapes |
| 8 | Shrubs | Ground-level massing |
| 9 | Ground plants / grass | Repeated small foliage |
| 10 | Rocks | Shore and forest samples |
| 11 | Fallen timber | Logs or stumps |
| 12 | Cabins | Complete exterior, entry and roof |
| 13 | Docks | Walkable structure at water |
| 14 | Fences | Boundary pieces |
| 15 | Benches / seating | Usable-scale seating prop |
| 16 | Outdoor tables | Picnic/social furniture |
| 17 | Exterior lights | Fixtures and light treatment |
| 18 | Fire pit | Social landmark |
| 19 | Storage props | Crates/barrels or equivalent |
| 20 | Signs | Cabin/wayfinding markers |

Pass coverage: at least 16/20 rendered. Record custom assembly separately from imported models and material adaptation. Cosmetic variants are not extra families.

## Scene and evidence

- Real Cinciș shoreline/road geometry; fictional southern settlement, wooded northern bank.
- Actual third-party assets and their source/license records, not generated promises of later assets.
- Walkable camera/character controls, coherent scale, lighting, and materials.
- In-app browser screenshots and measured frame/draw/triangle data; label machine and sampling limits.
- A representative avatar and a 30-avatar rendering stress option are separate checks from the environment-coverage denominator.
- Record elapsed session time and phases; report search/download friction rather than hiding it.
- No paid purchases or cloud deployment required for this asset test.

## Verdict dimensions

Coverage, visual cohesion, fidelity to the intended richer stylized look, import/setup effort, render cost, license clarity, and major missing/custom work. A playable technical demonstration can still fail the art target. State that explicitly if it does.


Owner-playtest regression checks: visible and physical terrain must coincide; soles stay on the ground; all WASD headings follow movement; the lake edge blocks entry without a spawn reset. The corrected character bind must be inspected from front and back.
