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

The editor remains localhost-only. PR62 stays draft/production hold. Shared
preview publication belongs to the integration owner. Existing design-system
files and the known stale design sidecar are preserved.

## Sources

- https://www.dialkit.dev/
- https://github.com/joshpuckett/dialkit/blob/main/docs/reference.md
- https://gml.noaa.gov/grad/solcalc/solareqns.PDF
- https://gml.noaa.gov/grad/solcalc/glossary.html
- https://open-meteo.com/en/docs
