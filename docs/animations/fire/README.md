# Compact campfire visual revision

The user rejected both the downloaded pixelated flames and the first generated24-frame dissolve. This change replaces those effects with a denser, lower custom flame generated using the built-in ImageGen tool. The original RGBA output is copied byte-for-byte to `apps/web/public/assets/fire/campfire-v2.png` (1536×1024). See [the exact generation prompt](imagegen-v2-prompt.txt) and [asset hash](asset-v2-sha256.txt).

Three intersecting world-space sheets give the flame depth around the logs. View-angle fading hides thin edge-on sheets. A small continuous UV flow and contour deformation replace the frame atlas/crossfade; the transparent PNG is shared by all three materials. Eight ember points, a restrained coal glow and a smaller, dimmer point light anchor the effect to the pit. Reduced motion freezes the flame and hides moving embers.

All effect resources and the point light stay mounted between toggles. The off state uses zero opacity/intensity, preserving the stable light count and shader setup. The existing authored ignition timing, authoritative shared fire updates, bench claims, remote activities and scoot reservations are untouched.

The only activity behavior adjustment is a constant-speed fire approach; seated scoots retain easing. Its regression test checks intermediate and final floor anchors.

## Validation

- Worktree TypeScript/production build pass.
- Worktree test suite:89 tests across16 files pass.
- The local legacy preview was used to inspect the lower flame and continuous motion, lighting action and persistent resources before the GitHub migration. The camera check caught a thin intersecting-sheet edge; the feature branch adds view-angle fading to address it. That final visual change must be inspected in the branch preview before marking ready. No additional local server was started and no legacy dist was written after migration ownership changed.
- This renderer is a visual revision, not a claim of user acceptance. Do not ship the rejected older atlas as the new result.
