# Wardrobe runtime evidence

Frozen candidate: `b2e28ac7589c4fddb3f4a3c477464c0ab2cf5f45`.
Runtime manifest SHA256:
`cc00e165695d60ffd3fc7a6e584a4588fdaf09657f24ca78ac774f683af7c9fc`.
These are local acceptance fixtures on the coordinated single4173 listener.
No production socket or backend listener was used.

## Actual Game

Two fresh pages in one browser context connected through the emitted local
SharedWorker. Both rendered the actual Game. Female appearance was applied through
Menu → Appearance → Female → Apply look; a second client observed the same bounded
record, and reloading the owner page restored it while the worker survived.
See `captures-b2/game/bootstrap-report.json`.

The normal controls exercised campfire sitting (F), standing fishing cast (E),
scooter and boat mounting/movement (V/W), and walking. Casting from a fishing bench
is intentionally not supported by existing activities.tsx, so the corrected test
casts while standing. A blocked bench-seated attempt was not counted as a failure
of wardrobe geometry or changed to bypass gameplay guards.

C/Z tests near a cabin or bench could legitimately fail grounded/headroom/state
checks. The corrected prone procedure moved clear of the bench, waited for
settlement, pressed Z and asserted `remote.posture === "prone"` in the independent
client. The visible settled capture is `verified-clear-grass-prone-front.png`.
Old filenames `actual-prone.png` and `actual-crouch.png` are unproven and excluded;
tree-occluded views do not count as visual evidence. No Player physics or stance
logic was changed. See final-activity-report.json and focused-prone-report.json.
All successful runners closed their own contexts/browsers in finally blocks;
reports contain zero page errors and zero sockets.

The final bounded completion pass applied all three men's complete outfits through
the same normal UI and asserted independent observer agreement. Each was captured
in settled campfire sit, fishing wait, mounted scooter and mounted boat states:
12 captures total. Recorded scooter speeds were9.59–9.85 and boat speeds1.08–1.12
while mounted. No new material/garment/footwear/contact defect was observed at
these gameplay camera scales. See `captures-b2/men-game/report.json` and its
classic/trail/weekend screenshots. This is finite sampled contact evidence,
not an exhaustive physics acceptance.

## Sampled model actions

88 actual WebGL front/rear captures cover four looks in 11 clips. Three men's
looks collectively cover all three modeled options per requested slot, including
hats and each footwear height. The fourth look is the female preset. Clips are
recorded in `captures-b2/adverse/report.json`, alongside bounded configurations and
one-skeleton-per-actor observations. These are sampled poses, not continuous
sweeps, collision checks or contact validation on their own.

## Matched resource fixture

Chrome156, ANGLE Metal on Apple M4 Pro; 1280×800, DPR1, Idle_Neutral, no shadows.
Two-actor and 50-actor samples use the same fixture/framing. The 50 models are a
rendering stress fixture, not 50 network clients. The release owner kept unrelated
heavy jobs quiet for the measurements.

| Appearance | Actors | Draw calls | Triangles | Geometries | Textures |
| --- | ---: | ---: | ---: | ---: | ---: |
| Approved default | 2 | 21 | 39,762 | 11 | 14 |
| Approved default | 50 | 501 | 994,050 | 11 | 62 |
| Revised female | 2 | 25 | 60,508 | 23 | 22 |
| Revised female | 50 | 601 | 1,512,700 | 23 | 70 |

Every inspected actor had exactly one canonical skeleton. Returning to two actors
and restoring default left the expected bounded retained catalogue cache.
Warm requestAnimationFrame means were display-paced at about16.67ms. This is not
GPU duration, whole-Game FPS, iPhone Safari performance, heat or battery evidence.
Source report: `captures-b2/resources.json`.

## Publication cleanup

The B2 session ended early at monotonic245796.942767916. Exactly35 authorized
hash-matching additions were removed. All 351 original path/size/SHA entries were
verified, as was the HTTP index SHA256
`16c499ab1c8235ad1322817d74cde81f9778e37b5ae443edff7523d5e496f21f`.
Listener PID35046 remained running and untouched. The cleanup report is
`.impeccable/review/wardrobe/cleanup-b2e28ac.json`.

A final short completion window reused the same frozen 35-file packet solely for
three men's outfits in actual activities/vehicles. It closed at
monotonic246433.550570083, well before its action cutoff247005.329321166. All 35
additions were removed, all 351 protected path/size/SHA entries and the HTTP index
were verified again, and listener 35046 remained untouched. Report:
`.impeccable/review/wardrobe/cleanup-b2e28ac-completion.json`.

## Final selected pack

The independent mesh/action review subsequently passed the finite 88+12 capture
set and the female reference/component comparison. `acceptance.json` pins the
selected 24 GLB hashes. Noncandidate packing completed with24 files totaling
15,884,484 bytes, and the normal production build passed. The GLB bytes and
content URLs are unchanged from the inspected B2 packet; only manifest stage
metadata changed to accepted. That does not itself publish a build or grant
release-owner integration approval.

## Native Appearance keyboard regression

The global panel shortcut previously closed Appearance directly on Escape, so it
could bypass `GameDialog`'s pending-save close guard. `?` could also replace it
with Controls. Appearance now retains native dialog defaults while stopping game
listeners, allowing the dialog's cancel handler to honor its save state.

`node scripts/check-appearance-dialog-keys.mjs` (with the existing Playwright
module/browser paths) runs four Chromium/WebKit cases against the actual
TypeScript-stripped game-input module and a native dialog. The negative control
removes only the new guard and reproduces the busy Escape close. The fixed cases
retain the busy dialog, close normally after saving, block help/game listeners,
and retain native Enter/Space button activation. All owned contexts close in
finally blocks. No listener, Game scene, production socket or profile write is
involved; this is a native key/default-event regression, not another whole-Game
capture. Report: `.impeccable/review/wardrobe/native-cancel-report.json`.

The focused production UI suite8/8, full frontend583/583, client TypeScript and
normal production build passed after the fix. Protocol182/182 and server
TypeScript remain valid from the unchanged backend source.
