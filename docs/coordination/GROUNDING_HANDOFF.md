# Loading and level-foundation handoff

Owned new files only: `apps/web/src/SceneLoading.tsx`, `scene-loading.css`,
`cabin-grounding.ts`, `cabin-grounding.test.ts`, and `GroundSupports.tsx`.
No house asset, script, settlement, geography, or environment file was edited.

## Loading integration

Import `SceneLoading` from `./SceneLoading` in App and replace the old Suspense
fallback with `<SceneLoading />`. The component imports its own namespaced CSS
and owns `useProgress`; remove the old App `Loading` function and its unused
`useProgress` import. Root has already applied this integration.

The title remains “Down by the lake.” The cool neutral palette and Barlow fonts
match the HUD. A thin shore drawing moves subtly; real resource progress alone
drives the determinate bar. Before a resource total exists, the bar is explicitly
indeterminate and has no `aria-valuenow`. If resources reach 100% while Suspense
still waits, it reads “Preparing your view.” Reduced motion removes drawing,
entrance, bar sweep, and progress transition animations. There are no responsive
or mobile additions, dependencies, timer-driven percentages, or minimum delays.

## Why a static cabin may appear to float

Read-only observations against the current working tree on 2026-10-28:

- `Cabin` is translated to `terrainHeight(x, z)` at its centre and its Rapier body
  is already `type="fixed"`. Gravity cannot settle a fixed body. Making the house
  dynamic would allow rotation, and does not solve the visual terrain mismatch.
- `terrainHeight` analytically flattens each cabin plot to its centre height
  within radius 8 m, blending back to the terrain between radii 8 and 12 m.
- `makeTerrain` evaluates that analytic function at a grid with roughly 3 m
  spacing near the settlement. Rendering and collision use the same triangle
  mesh, whose interior heights interpolate its vertices. A direct analytic
  height call and an intersection on those triangles can differ near plot
  transitions. Footprint samples should query the actual terrain triangles or
  matching terrain-only collision rather than the analytic function alone.
- The cabin `<primitive>` preserves its GLB node transforms. In the three GLBs
  inspected, the root Y translation was approximately +0.28 and raw accessor
  minimum Y approximately -0.28, yielding a lowest point of approximately 0.
  This does **not** establish a large model-origin offset in the current assets.
  That minimum may represent feet or stair tips; the level underside being
  supported is a separate model datum. The other chat is revising these assets,
  so sample the final geometry and confirm its intended support locations.

These observations identify possible contact errors, not a measured visible gap
for every house. The helper is deliberately independent of evolving house files.

## Minimal foundation integration for the house owner

`sampleFootprintGround(footprint, { x, z, yaw }, sampleGround)` transforms nine
local points (corners, edge midpoints, centre) into world X/Z and samples ground.
The positive yaw matches Three.js rotation about Y. `planLevelFoundation`
returns a discriminated result with one level `baseY` and per-sample world-space
support positions, heights, bottom elevations, and top elevations.

```tsx
const samples = sampleFootprintGround(
  { minX, maxX, minZ, maxZ }, // Explicit structural footprint of final cabin.
  { x, z, yaw },
  sampleTerrainTriangleY, // Terrain-only raycast; return NaN if there is no hit.
);
const foundation = planLevelFoundation(samples, {
  clearance: 0.04,
  embedment: 0.12,
  maxRise: 2,
  maxSpan: 16,
  maxSupportHeight: 2.5,
});
if (!foundation.ok) {
  // Choose/regrade another plot; do not silently place the house unsupported.
  return null;
}
const originY = foundation.baseY - localUndersideY;
return (
  <>
    <group position={[x, originY, z]} rotation={[0, yaw, 0]}>
      {/* Final cabin and its fixed colliders share this transform. */}
    </group>
    <GroundSupports plan={foundation} width={0.24} />
  </>
);
```

`localUndersideY` is the model-local underside to which the new supports attach,
after retained GLB transforms and any model scale. It is not automatically the
global GLB minimum. Scale local footprint coordinates into world metres before
sampling. Do not add `terrainHeight` again: the plan's Y values are already world
elevations. Render `GroundSupports` as a sibling outside the cabin translation
and yaw group. It uses world positions and adds no physics bodies.

Defaults limit ground elevation variation to 2 m, total sampled horizontal
diameter to 16 m, and exposed support height to 2.5 m. `maxSpan` means the entire
sampled footprint diameter, **not** a structural engineering beam-span guarantee.
Support feet extend 0.12 m into sampled terrain to hide numerical contact cracks.
Invalid/non-finite samples, degenerate footprints, invalid limits, and exceeded
limits return explicit failures. Nine points cannot detect every unsampled
terrain bump. Where the final model has specific load-bearing posts, pass those
points directly to `planLevelFoundation` instead of adding duplicate posts.

This helper and renderer are available but intentionally not inserted in the
live settlement. The house-owning chat must decide the final asset datum,
footprint, ground sampler, and whether its existing foundation should be extended
instead of rendering these generic supports.

## Verification

- `npx vitest run apps/web/src/cabin-grounding.test.ts`: **6 tests passed**.
  Covers slopes, level support tops, buried ground contact, centre humps, world
  yaw transforms, exact limits, terrain misses, invalid inputs, and degenerate
  footprints.
- `npx tsc --noEmit`: **passed** against the shared tree after these additions.
- Prettier run on the five new code files.
- Loader visually unverified in a running browser by this worker; root owns App
  integration and runtime verification.

No commit was created.

## Root integration completed

Root added `CabinGroundContacts.tsx` as an App sibling, without editing settlement or house files. It uses actual terrain-only Rapier raycasts (the terrain body is tagged), extends the existing stone plinth downward with one mesh, and renders the porch support plans in one instanced draw. It does not move or rotate house assets or change fixed colliders. Runtime evidence recorded 30 cabins, 480 skirt triangles, 120 supports and an original sampled plinth gap up to 0.625 m. See docs/animations/RESULTS.md and captures/level-foundations.json. Footprint dimensions are the small explicit adapter to the current three reference house models.
