# Player-created village

The user authorized retiring the earlier random cabin assignments and placements.
The canonical shared world and its fire state remain unchanged.

## Rules

- A visitor explicitly confirms a name before connecting or allocating a cabin.
- One browser owner receives one durable cabin, using the saved private capability.
- Cabin numbers are dense and sequential: 1, 2, 3, and onward.
- Registered owners keep their cabins when offline; reconnects and same-browser
  tabs reuse the same home. Visible names are never ownership credentials.
- The new plot pool is compact, sorted nearest the gathering fire first, dry,
  road-clear, and south of the lake. Its first ten candidates are within 100
  world metres of the fire. Plot centres are at least 20m apart; every candidate has a tested dry arrival and scooter position.
- A placement candidate does not create a house. Only the authoritative public
  cabin roster drives houses, collision, porch benches, doors, foundations and
  minimap cabin markers.
- A name is visible on player presence immediately. The cabin's physical wooden
  sign updates after five unchanged minutes. Renaming restarts the grace period;
  disconnecting/reconnecting with the same name does not. Delayed names survive
  storage reload and hibernation, using one Durable Object alarm for the next
  due change. The previous sign stays visible while a new name is pending.

## Reset and storage

Housing epoch 2 uses `home-owners-v2` in the existing Durable Object. The old
`home-owners-v1` data is retired and retained as a recovery copy; it is never
reinterpreted as the new sequential layout. New clients use a v2 browser
capability key and a new explicit-name preference. Old random offline home
preferences are ignored. No general-purpose reset endpoint is exposed.

The old live connections are retired by generation when the Worker starts.
The frontend and Worker must be released together: deploy the checked Worker,
activate/verify the new village with a read-only snapshot, then merge/publish
its matching frontend and refresh old clients. Rollback must coordinate both
parts. Do not increment the housing generation without a new reset request.

Name writes and alarm scheduling share a storage transaction. Failed durable
name writes do not change the ledger or publish a new sign. A failed save can
be retried by reconnecting with the same saved owner and selected name.

## Presentation and performance

The first-entry form reuses the approved banner, lake illustration, parchment
frame, wooden button and raster pictograms. Headings are Bree Serif and body
text Alegreya Sans. The game is lazy-loaded: the first-entry JavaScript is about
225KB uncompressed / 71KB gzip; the approximately 3.9MB game chunk downloads
only after name confirmation. The full-script size has not been represented
as removed—only deferred until entry.

House signs reuse `assets/ui/sign-plaque.webp`; the full Alegreya Sans Bold
TTF supports Romanian diacritics in 3D. It comes from Google's Fonts repository
(`ofl/alegreyasans/AlegreyaSans-Bold.ttf`) under the existing
`third_party/alegreya-sans-OFL.txt`. Hidden sign text preloads with the cabin so
its five-minute reveal does not suspend the whole scene for a new font fetch.
The offline visual preview shows the chosen name immediately for sign QA;
the deployed shared world uses the server's five-minute rule.

## Validation

The frontend tests cover explicit name entry, validation/storage failures,
retired v1 credentials, public roster updates, name-save recovery, minimap
markers, candidate geography, arrivals and the existing gameplay regressions.
Server tests cover serialized concurrent allocation, duplicate tabs, lost
acknowledgements, offline ownership, capacity, forged home indices, name timing,
storage failures, privacy, and unbuilt-cabin seat rejection. The seat validator
now accepts actual cabin porch seat IDs rather than rejecting their structured
prefixes. The original character and cabin model assets are unchanged.

Local browser evidence is under `captures/`. It verifies the first-entry screen,
keyboard submission, one cabin numbered 1, returning-player entry and a readable
owner sign. Local preview captures are not presented as live server evidence.
Production verification must confirm housing epoch 2 and a sequential public
roster with the non-mutating WebSocket harness. Never create test owners in the
shared world merely to measure it.
