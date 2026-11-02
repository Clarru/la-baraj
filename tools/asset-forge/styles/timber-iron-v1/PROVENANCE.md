# Timber and iron v1

Original ImageGen color artwork and our own Blender baked surface maps from the retained two-prop study. No Quaternius texture maps are shipped here. The three PNGs are byte-identical snapshots of `experiments/asset-skill-lab/material-study/own-trim/`; see that study’s RESULTS.md and provenance.json. These are authoring inputs, never added to the game’s public bundle by this tool. Approved runtime WebP hashes and material factors are pinned in profile.json.

`blender/parts.py` is a pinned snapshot of the repository’s measured construction helpers; `blender/golden.py` adapts our independently authored lantern/crate geometry into importable functions. The retained experiments and skill scripts remain untouched.

The Forge copy now adds our own continuous corner-wrap/enclosure construction, physical grain mapping and closed panel methods. The 64×64 `speaker-cloth.png` is our original repeating neutral weave, created for the original radio; it is not a Quaternius image. It uses a separate nonmetallic, rough material and adds 222 WebP bytes to that export. The fixed style boards use licensed Quaternius CC0 reference renders as developer-only visual guidance; they are not runtime material maps.
