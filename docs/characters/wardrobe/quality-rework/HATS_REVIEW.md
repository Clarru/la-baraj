# Head-fitted hats and colour controls

The user approved the anatomical cap on November 2, 2026. Its construction is
preserved while applying the same fit-first approach to the other two hats.

- Cap: clean cage fitted to the approved scalp; a separate curved visor rooted in
  the actual front opening; double panel stitching and a turned lower edge.
- Beanie: scalp-fitted knit crown with geometric ribbing and a rounded folded cuff.
- Bucket: head-fitted opening, separate top panel, softly tapered wall and a
  downward-sloping brim. Outer edge lifted after the first eye-clearance review.
- Hair: under-hat variants follow the scalp with a small clearance. Original
  hairstyles remain in use when no hat is worn.
- Colours: Original, Navy, Sage, Charcoal, Cream and Rust. Only cloth is dyed;
  texture/normal detail and stitching remain distinct. Materials belong to each
  actor, and resetting to Original restores the authored colour.

The appearance v1 format gains a bounded `hatColor` field. Old profiles resolve
it to `original`; malformed values are discarded. The Worker needs the shared
schema deployed to persist and relay the new field. No database migration or
identity change is required.

## Verification

On the clean e5558b8 lighting/water baseline, frontend and server TypeScript passed.
The full frontend suite passed 602 tests and the protocol suite passed 183 tests.
Tests cover dye isolation, immutable texture sharing, Original restoration, legacy
profile normalization and profile reload. Local exported-model renders cover all
views, selected light/dark colours and the existing hair choices. Reports identify
exact asset hashes.

The prepared real AppearanceDialog/two-client browser check has NOT run yet.
Main cleared one space-guarded build after the machine hit ENOSPC; 3D browser
contexts and shared publication still require a bounded review grant.
No shared-preview write or production deployment was made. UI click-through,
shared-world appearance and device performance remain release checks.

Sources: scripts/prototype-cap-scalp.py, scripts/wardrobe_anatomical.py,
scripts/build-wardrobe-hats.py, scripts/build-wardrobe-hat-hair.py.
Editable Blender sources are retained under assets/source-models/wardrobe.
Existing generated cloth maps/references retain their original provenance.
