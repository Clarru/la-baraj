# Mobile 2048 large-value text fit

Follow-up to PR #61, based on released main `034f7b3`. The mobile board's viewport-based 42px landscape text overflowed its 61.5px cells: values including 1024, 2048 and 65536 could extend into neighboring cells. Longer supported values also overflowed the 320px portrait board.

The fix makes the board the inline-size container and sizes tile text by that container and the value's digit count. A per-digit pixel fallback remains in the base CSS for browsers that reject container units. The number, data value, accessibility label, actions, authority and tile geometry are preserved. No game logic, dependency, helper, state, asset or layout redesign is introduced.

`tests/browser/mobile-tile-fit.tsx` renders the **actual MobileArcade2048 component and mobile.css** with authored legal values. This is an isolated layout probe, not an earned game or multiplayer test. `scripts/check-mobile-tile-fit.mjs` bundles it into an in-memory page, embeds the shipped Alegreya Sans 700 font, waits for font readiness and measures actual DOM text/cell bounds. It starts no server, uses no game transport, and closes its owned browser contexts.

Chrome/Chromium 156.0.8078.79, Playwright 1.62.1, coarse-touch emulation, DPR 1:

| Viewport          | Actual square cell width | 2048 text after | 65536 text after | 131072 text after | 1073741824 text after |
| ----------------- | -----------------------: | --------------: | ---------------: | ----------------: | --------------------: |
| 320×740 portrait  |                     62px |         51.69px |          51.69px |           51.67px |               51.69px |
| 844×390 landscape |                   61.5px |         51.31px |          51.31px |           51.31px |               51.31px |

All **16 values in each orientation fit**, including 2, 2048, 65536, 131072 and the largest supported value, 2³⁰. All 32 cases also fit with the per-digit pixel fallback forced. Both boards retained non-collapsed square cells and exact value/ARIA text. The fallback assertion checks that CSS path in modern Chromium; it is not a claim of testing an old browser engine.

Before captures use the preceding released font-size declaration on the same actual board. After captures use the source fix. [Full measured results](captures/mobile-tile-fit-2026-10-31/results.json), [portrait before](captures/mobile-tile-fit-2026-10-31/before-320.png), [portrait after](captures/mobile-tile-fit-2026-10-31/after-320.png), [landscape before](captures/mobile-tile-fit-2026-10-31/before-844.png), [landscape after](captures/mobile-tile-fit-2026-10-31/after-844.png).

Reproduce with Node 24 and Playwright available to Node:

```sh
node scripts/check-mobile-tile-fit.mjs
```

If Playwright/Chrome are supplied by an external runtime rather than local packages, set `PLAYWRIGHT_MODULE` to that package's absolute directory and `CHROME_EXECUTABLE` to the browser executable. These are test-only settings; package files are unchanged.

Frontend TypeScript, all **521 frontend tests**, and the normal production build pass. No shared-preview writes or additional listeners were used. The original mobile integration evidence and real iOS/Android OS/hardware limits remain in [the main mobile report](mobile-2026-10-31.md).
