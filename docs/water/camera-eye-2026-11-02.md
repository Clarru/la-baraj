# Water shimmer while driving

The desktop lake cached the entire Three `Water.onBeforeRender` callback at
20 Hz. That callback updates both the expensive mirror render and the shader's
`eye` uniform. The boat, main camera and wave time advanced every frame, but
Fresnel, sun highlights and distance-based ripple distortion used the old eye
between mirror updates. Driving made that view advance in visible steps.

`throttleWaterReflection` now copies the rendered camera's world position to
`eye` on every water draw, before applying the existing mirror gate. The cached
image and its texture projection remain paired. This adds one vector copy per
draw, with no extra mirror passes, texture size, render targets or physics work.
The mobile branch already updated its eye each draw and is unchanged.

## Verification

Runtime tested: `46b9c4bdad107158733d3775f5c699d8ab890dfb`, based on main
`171cea4`. Both controlled builds use the actual Game, Player and Water. The
before build removes only the new eye copy from the helper. Tests run one fresh
local world at a time through the existing port 4173, with a named QA worker,
prefixed credentials, and no production socket. The controls hold forward or
forward + left for four seconds; captured windows also include the short lead-in
and release. Each turn restarts from the same open-water staging point.

An after-render observer records the rendered camera, shader eye, wave time,
frame interval and cumulative actual mirror-camera render calls. The first
sample has no interval and is excluded. All remaining intervals were below
10 ms; no reset/resume or hidden-water gaps occurred in these six windows.

| Case | Valid frames before / after | Maximum eye lag before / after | Mirror Hz before / after |
| --- | --- | --- | --- |
| Stationary, floating | 316 / 302 | 3.30 mm / 0 | 18.60 / 18.67 |
| Driving | 590 / 603 | 401.60 mm / 0 | 18.51 / 18.31 |
| Turning | 602 / 597 | 316.11 mm / 0 | 18.34 / 18.29 |

The eye was unchanged on 499 of 590 driving intervals before the fix, then
jumped up to 468 mm at a mirror refresh. After the fix it followed the camera
on every sample. Wave time increased on every valid interval in all six cases.
Both clients had no console errors, including teardown. Captures show intact
water, boat, curved wake and reflected shoreline in stationary/driving/turning
views; the traces establish temporal behavior that still screenshots cannot.

The focused regression invokes the real Three Water callback for 120 frames
with a translating and rotating parented camera. It failed before the fix
after one cached frame with a 68.99 mm eye error. It passes after the fix while
retaining 17–20 mirror renders, at least 100 cached frames, and an unchanged
texture projection on skipped mirror frames. The mobile reflection regression,
all 584 frontend tests, TypeScript and production build passed.

These short captures used in-app WebKit on an M4 Pro desktop at its existing
1164 × 655 viewport. The observer, contact diagnostics and DOM serialization
add overhead. Frame times near the refresh cap are not an uncapped GPU cost
measurement or a guarantee for every device. Animated reflected objects still
use the intended 20 Hz cache; this fix addresses stale view-dependent water
shading, not every possible source of aliasing.

## Evidence and reproduction

- [Summary and cleanup](results/camera-eye-2026-11-02.json)
- [All six raw traces](results/2026-11-02/)
- [Stationary, drive and turn captures](captures/2026-11-02/)
- Build comparison payloads with `node scripts/prepare-water-jitter-fixture.mjs`
  and `node scripts/prepare-water-jitter-fixture.mjs --before` under Node 24.
  Request the shared preview owner's bounded additive publication slot before
  serving them; do not start another listener or overwrite the normal index.

After testing, both owned tabs left their test worlds and closed. All nine
temporary additions were removed after matching their SHA and size. The full
397-file baseline matched again, the normal HTTP index hash was unchanged, and
the original listener PID 2669 remained. Later commits only remove the unused
initial boat-motion observer and add this evidence; production runtime stays at
the tested head.
