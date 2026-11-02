# Local lighting profiles

Open **Lighting** on `http://127.0.0.1:4173/`.

- Choose **Time** and **Weather**. Selection applies immediately; each of the
  6 × 7 combinations has independent controls and native Dialkit versions.
- Edits save automatically to that combination. Switching back restores its
  sunlight, exposure, sun position, colors, haze, waves, reference and notes.
- **Month** previews the 15th of any month; **Current date** follows today.
  Profiles are shared across month previews, rather than creating 504 recipes.
  A manually chosen clock hour stays held when changing month. Automatic phase
  times follow seasonal sunrise/sunset; manual sun-position overrides stay manual.
- **Reset this condition** restores only the selected condition. **Return to
  live** bypasses local editing and restores the current date/time/shared weather.
- Native **Save version** compares alternatives within the active condition.
  Export downloads schema 2 with the current recipe, all stored condition panels,
  and the preserved previous draft.

## Persistence and recovery

Dialkit panel IDs use `la-baraj-environment-v2:<time>:<weather>`; its normal
`dialkit:` localStorage prefix retains each panel's values, base, versions and
selected version. `la-baraj-environment-selection-v2` remembers the selected
condition and month. Per-condition `la-baraj-environment-clock-v2:` metadata
retains the automatic phase-hour basis across month/condition switches. The optional timeline retains its separate stable ID.

The old `dialkit:la-baraj-environment-v1` draft is copied once into the inferred
condition, never overwritten or deleted. In the former UI, selecting Clear did
not apply it; a draft with manual cloud cover 0.5 is therefore recovered as Partly
cloudy. Existing sun/manual-position values and native versions are retained.
Old fixed phase hours are advanced to the corresponding seasonal phase; a custom
clock hour is preserved. Corrupt/unavailable storage does not block the editor.

## Authored defaults

`environment-profile-defaults.json` stores approved copied Dialkit recipes by
`time:weather`. The Golden hour / Lakeside mist entry now uses the owner’s
16:30 recipe: Sun 0.30, hemisphere 0.60, ambient 0.90, exposure 0.71, cloud cover
0.80, fog 20–360, and wave distortion 0.30. The complete supplied palette,
reference and control defaults are retained in that entry. Native slider ranges,
image/text/pad types and action buttons stay intact when applying it.

Fresh condition controllers and **Reset this condition** use these defaults.
Existing browser edits and saved versions retain precedence; a source-default
update does not silently discard them. This recipe’s 16:30 is an authored fixed
clock default, while other conditions retain their automatic seasonal phase time.
Manual Sun remains off, so seasonal positioning still controls the rendered sun;
the supplied manual-pad coordinates and disabled custom palette are not forced.

Two regressions verify the adapter preserves native ranges/types and that the
real controller starts/resets to this recipe, retains later edits across condition
switches, and leaves Clear unchanged. Node24 tests now pass 105 files / 597 tests,
with TypeScript and the production build passing.

Browser acceptance of `d1c8f46` confirmed fresh Golden/Mist 16:30, Sun 0.30,
hemisphere 0.60, ambient 0.90, exposure 0.71, cloud 0.80, automatic sun and the
-62/6 pad readout. A later Sun 0.41 edit survived Clear switching and full reload;
Reset returned the authored lighting recipe. Clear retained 1.0/0.92 and the
seeded Dawn/Partly condition retained 0.43/0.88. There were no console errors,
and the real-storage guard stayed true. The owned test tab closed, viewport was
reset, seven authorized additions were removed after hash checks, and all391
normal baseline paths/SHA/sizes were verified restored. The publisher then
published local combined `b3a67d0` with the exact runtime, preserving existing
study assets and the single2669 listener. Production remains unchanged. Evidence:
`.impeccable/review/golden-mist-defaults.jpg` and the publisher’s
`.impeccable/review/golden-mist-local/publication.json`. No extra visual/build
cycle was needed for this data/defaults update.

## Seasonal daylight

`solar.ts` uses NOAA's compact fractional-year equations at the existing weather
coordinates, 45.69° N / 22.85° E. Romanian civil dates and DST use
`Europe/Bucharest` through Intl. No additional dependency, API call, backend or
weather schema is needed. Open-Meteo also offers daily sunrise/sunset, but the
local calculation works offline and supports all twelve preview months.

Live lighting and preview colors map the existing authored palette to calculated
dawn, sunrise, solar noon, sunset and civil twilight. The sun direction follows
calculated azimuth/elevation above the horizon. Below the horizon the existing
navigable directional fill remains an artistic moonlight approximation, not a
lunar ephemeris. Explicit fixed day/evening diagnostic fixtures stay stable.
The daily result is cached; day/year/month is part of the lighting cache key.

These are approximate astronomical-horizon times. Lake hills, trees, clouds and
atmospheric conditions can make the visible sun disappear sooner. Weather looks
shape light/haze/clouds/waves; precipitation and snow accumulation are not added.

## Production rendering

Production release is now authorized by the owner. The editor remains restricted
by hostname to localhost/127.0.0.1. Browser recipes, notes, actions, the preview
month and the fixed16:30 authoring clock are not read by the production world.

The approved Golden hour / Lakeside mist rendering values apply only when actual
shared WMO weather code45 or48 indicates fog/mist and the solar palette phase is
17–19, the final hour before the calculated local sunset. The phase edges ease
in/out over a quarter of a palette hour; changing fog presence blends over the
existing25-second weather transition. All other time/weather combinations retain
the existing rendering settings. Actual cloud coverage and server-corrected time
remain authoritative rather than being replaced by preview values.

The shared lighting sample carries effective rendering settings into sun/fill,
exposure, fog, cloud drift/opacity and water waves. Local editor overrides keep
precedence for local authoring. Mobile shadow limits and cheaper reflection paths
are retained. Fixed diagnostic day/evening fixtures do not activate the live look.

Runtime tests cover the exact mapping/approved values, smooth boundaries,
night/clear/unavailable-weather fallback, the same-cloud-cover fog-to-overcast
case, local override precedence and exclusion of preview clock/weather/reference
fields. Node24.22.2:106 files /599 tests, TypeScript and production build pass.
Publication/deployment evidence is supplied by the release owner after merge;
release authorization alone is not a claim that production has updated.

## Verification

- Real Dialkit controller tests reproduce Dawn/Partly → lowered sun/manual
  position/exposure → Clear defaults → Partly restored. They also cover another
  time, native persisted values, selector focus and condition-only reset.
- Migration tests preserve the original draft and protect already-created
  profiles; malformed and unavailable storage are covered.
- Solar tests cover all twelve months, summer versus winter at 17:30, midnight
  date boundaries, Romanian DST and leap years.
- Existing editor regressions cover cache restoration, colors, the timeline,
  fog bounds and cached mobile reflection. Mobile quality still ANDs the editor
  shadow setting with the mobile limit; desktop/mobile water controls are retained.
- Acceptance must use the single coordinated 4173 preview, with isolated QA
  storage so the owner's existing draft is not changed by tests.

The editor remains localhost-only. PR62 is now authorized for release. Shared
preview publication belongs to the integration owner. Existing design-system
files and the known stale design sidecar are preserved.

## Acceptance — November 2, 2026

Final QA used source `58f3684` (based on `171cea4`) with the mobile and wardrobe
surfaces preserved. The browser run used the exact `58` alias, isolated
namespaced editor storage (legacy v1, new v2 profiles, selection, timeline, and
clock metadata), and the unique local SharedWorker.

- Source consistency: all 6 × 7 time/weather conditions use independent native
  Dialkit controllers with persistence/autosave. The v1 draft is copied once
  and left untouched; the per-condition clock metadata keeps the seasonal
  phase basis across month switches while a custom hour and manual sun position
  remain deliberate overrides. Export includes readable saved profiles and the
  previous draft; if storage is unavailable, it still downloads the current recipe.
- The isolated browser storage was seeded with the old v1 Dawn/Partly draft
  (`sun=.43`, manual `y=9`). The UI changed it to `sun=.27`, elevation `12`;
  Clear showed defaults (`sun=1`, exposure `.92`), then returning to Dawn/Partly
  and doing a full reload restored `.27` / `12`.
- Seasonal checks passed: January Dawn resolved to `7.6833`, June to `5.15`;
  saved weather conditions followed the selected month. A custom hour `17.5`
  held across month/weather changes. With manual sun off, the calculated
  seasonal path is used; with the override on, the manual position stays fixed.
  Monthly previews use the 15th, while month `0` uses the actual current date.
- The January `17.5` preview was visibly dark and the June `17.5` preview
  visibly daylight. Valid captures are
  `.impeccable/review/profiles/winter.jpg`,
  `.impeccable/review/profiles/desktop.jpg` (`1280×720`), and
  `.impeccable/review/profiles/mobile.jpg` (`391×844`).
- Resetting Noon/Clear restored `13.4667` without changing Dawn/Partly’s
  `.27` / `12`. The real-storage comparison stayed `TRUE` throughout, and the
  browser reported no console errors.
- Cleanup closed the owned QA tab and reset the viewport. After a hash check,
  only the eight authorized additions were deleted; all 384 normal-baseline
  paths, SHA values, and sizes were restored, with PID `2669` unchanged.
- The reviewer returned `SHIP` with no findings for both source and captures.
  The publisher then integrated the exact source into local combined `a00cd6f`
  and published the normal URL without changing main/production. The final owned
  normal tab shows the new selectors with the previous disabled Noon/Clear draft.
  UI exports before/after a normal reload contain the same original v1 raw draft
  (SHA256 `343c3cca7b23fe22e214ac4c10e5882d0335fc405a4e48f3b0177bc550994e70`).
  No recipe values were edited during that normal check, and no console errors
  were reported. PR62 remains on production hold.

## Sources

- https://www.dialkit.dev/
- https://github.com/joshpuckett/dialkit/blob/main/docs/reference.md
- https://gml.noaa.gov/grad/solcalc/solareqns.PDF
- https://gml.noaa.gov/grad/solcalc/glossary.html
- https://open-meteo.com/en/docs
