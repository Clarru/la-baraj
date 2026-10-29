# Environment finish — 29 October 2026

## Asset contract

Extend the existing textured, stylized 3D La Baraj world. Preserve the accepted character, buildings, nearby tree models, real Lake Cinciș shoreline and OSM road centerlines. Main views are a standing human camera, the lakeside tables and a road-level camera. Desktop rendering cost takes priority over adding objects.

The new art consists of quiet unmarked rural asphalt and a neutral painted grass-detail texture. Both were generated with the built-in OpenAI ImageGen tool; their exact requests are in `road-prompt.txt` and `ground-prompt.txt`. No external reference images were supplied. These are actual runtime material assets, not concept-only mockups.

## Files and provenance

- `apps/web/public/assets/environment/asphalt.webp`: 512×512, 86,612 bytes.
- `apps/web/public/assets/environment/ground-detail.webp`: 512×512, 54,876 bytes.
- Adjacent JSON sidecars retain the exact prompt, source generation filename, SHA256 and export settings. The only preparation is resizing and WebP encoding at quality 80; no painted details were redrawn procedurally.

Total additional compressed artwork: **141,488 bytes**. The old generated canvas ground texture is replaced, so the net live texture count increases by one. No new tree or building GLBs are downloaded.

## Runtime construction

`landscape-geometry.ts` owns the editable geometry algorithms. The road uses shared cross-sections, bounded corner miters, metre-based UVs and feathered verges (MSAA coverage when available, blended fallback otherwise). It follows the original centerlines and widths. The existing walkable terrain positions, collision surface, cabin plots and lake boundary are unchanged; terrain UVs now keep a constant world scale, and a normalized byte attribute removes grass strokes at the sandy shoreline.

`WorldBackdrop.tsx` uses a static gradient sky and one visual-only outer land mesh: **965 vertices / 1,536 triangles**. The outer land fills beyond the original terrain edges, with layered height and colour; it is distant scenery, not a new walkable area or surveyed elevation data. It has no shadows, physics or per-frame deformation.

2,400 slightly larger background tree silhouettes reuse the four existing crossed-plane tree sprites and the same four far-forest instance batches. That adds at most 9,600 simple triangles per visible pass, with no extra forest draw batches. The nearby full-detail vegetation count stays fixed. Their trunk collisions use the existing 85–100m active-radius system; far trees do not keep live colliders. The radius checks now use squared distances. Water waves still animate every frame; the reflected world now updates at 20Hz instead of 30Hz, at the existing 512px resolution. This avoids drawing the crowd a second time unnecessarily, while retaining moving ripples.

The tree sprites are baked from the existing Quaternius nature models. Their CC0-1.0 notices remain in `third_party/quaternius-nature-LICENSE.txt` and the existing asset catalog; this pass does not replace those meshes or their provenance.

## Acceptance

Geometry tests cover joined road corners, UV continuity, verge alpha, invalid/duplicate points, horizon bounds/triangle budget and deterministic background placement clear of water and cabin plots. The existing real Rapier shore/raycast tests still pass. Runtime captures and matching-load measurements are recorded in `docs/performance/environment-finish.md`.
