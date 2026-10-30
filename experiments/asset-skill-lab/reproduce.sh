#!/usr/bin/env bash
set -euo pipefail
: "${ASSET_LAB_BLENDER:?Set ASSET_LAB_BLENDER to the Blender executable}"
ASSET_LAB_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ASSET_LAB_ROOT"
ASSET_LAB_TOOLS=.agents/skills/la-baraj-3d-assets/scripts
ASSET_LAB_DATA=experiments/asset-skill-lab
"$ASSET_LAB_BLENDER" --background --python "$ASSET_LAB_TOOLS/bake_prop_trim.py" -- "$ASSET_LAB_DATA/material-atlas-512.png" "$ASSET_LAB_DATA/material-study/own-trim" > "$ASSET_LAB_DATA/material-study/bake.log" 2>&1
for ASSET_LAB_ITEM in lantern crate; do
  if [[ "$ASSET_LAB_ITEM" == lantern ]]; then ASSET_LAB_NAME=Lantern; else ASSET_LAB_NAME=Crate; fi
  ASSET_LAB_DIR="$ASSET_LAB_DATA/$ASSET_LAB_ITEM"
  npx --yes --package=node@24 node "$ASSET_LAB_TOOLS/inspect_materials.mjs" "$ASSET_LAB_DATA/references/$ASSET_LAB_ITEM-original.glb" "$ASSET_LAB_DATA/material-study/$ASSET_LAB_ITEM"
  "$ASSET_LAB_BLENDER" --background --python "$ASSET_LAB_TOOLS/inspect_asset.py" -- "$ASSET_LAB_DATA/references/$ASSET_LAB_ITEM-original.glb" "$ASSET_LAB_DIR/reference" --masks > "$ASSET_LAB_DIR/reference-render.log" 2>&1
  "$ASSET_LAB_BLENDER" --background --python "$ASSET_LAB_TOOLS/measure_components.py" -- "$ASSET_LAB_DATA/references/$ASSET_LAB_ITEM-original.glb" "$ASSET_LAB_DIR/reference/components.json" > "$ASSET_LAB_DIR/reference-components.log" 2>&1
  "$ASSET_LAB_BLENDER" --background --python "$ASSET_LAB_DATA/build_reconstructions.py" -- "$ASSET_LAB_ITEM" > "$ASSET_LAB_DIR/final-build.log" 2>&1
  npx --yes --package=node@24 node "$ASSET_LAB_TOOLS/optimize_asset.mjs" "$ASSET_LAB_DIR/final/Lab_$ASSET_LAB_NAME-raw.glb" "$ASSET_LAB_DIR/final/Lab_$ASSET_LAB_NAME.glb" 1 quantize 0.8 meshopt
  "$ASSET_LAB_BLENDER" --background --python "$ASSET_LAB_TOOLS/inspect_asset.py" -- "$ASSET_LAB_DIR/final/Lab_$ASSET_LAB_NAME.glb" "$ASSET_LAB_DIR/final/qa" --framing "$ASSET_LAB_DIR/reference/metrics.json" --masks > "$ASSET_LAB_DIR/final/qa.log" 2>&1
  npx --yes --package=node@24 node "$ASSET_LAB_TOOLS/validate_asset.mjs" "$ASSET_LAB_DIR/reference/metrics.json" "$ASSET_LAB_DIR/final/qa/metrics.json" "$ASSET_LAB_DIR/final/Lab_$ASSET_LAB_NAME.glb" "$ASSET_LAB_DIR/final/validation.json" "$ASSET_LAB_DATA/material-study/$ASSET_LAB_ITEM/materials.json"
  python3 "$ASSET_LAB_TOOLS/compare_views.py" "$ASSET_LAB_DIR/reference" "$ASSET_LAB_DIR/final/qa" "$ASSET_LAB_DIR/final"
done
npx --yes --package=node@24 node "$ASSET_LAB_DATA/build_viewer.mjs"
