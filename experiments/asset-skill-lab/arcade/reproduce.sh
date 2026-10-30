#!/usr/bin/env bash
set -euo pipefail
: "${ASSET_LAB_BLENDER:?Set ASSET_LAB_BLENDER to the Blender executable}"
: "${ARCADE_QA_CANVAS_MODULE:?Set ARCADE_QA_CANVAS_MODULE to an installed @napi-rs/canvas module path}"
ARCADE_ROOT="$(cd "$(dirname "$0")/../../.." && pwd)"
cd "$ARCADE_ROOT"
ARCADE_DIR=experiments/asset-skill-lab/arcade
python3 - <<'PY'
from fontTools.ttLib import TTFont
font=TTFont('apps/web/public/fonts/bree-serif-latin-400-normal.woff2')
font.flavor=None
font.save('experiments/asset-skill-lab/arcade/BreeSerif.ttf')
PY
npx --yes --package=node@24 node "$ARCADE_DIR/render_screen.mjs" "$ARCADE_QA_CANVAS_MODULE"
"$ASSET_LAB_BLENDER" --background --python "$ARCADE_DIR/build_cabinet.py" > "$ARCADE_DIR/build.log" 2>&1
npx --yes --package=node@24 node "$ARCADE_DIR/finish_cabinet.mjs"
npx --yes --package=node@24 node .agents/skills/la-baraj-3d-assets/scripts/optimize_asset.mjs "$ARCADE_DIR/Arcade2048-pbr.glb" "$ARCADE_DIR/cabinet.glb" 1 quantize 1 meshopt > "$ARCADE_DIR/optimization.log"
tail -n 1 "$ARCADE_DIR/optimization.log" > "$ARCADE_DIR/optimization.json"
cp "$ARCADE_DIR/cabinet.glb" apps/web/public/assets/arcade2048/cabinet.glb
npx --yes --package=node@24 node "$ARCADE_DIR/finish_cabinet.mjs" preview
"$ASSET_LAB_BLENDER" --background --python .agents/skills/la-baraj-3d-assets/scripts/inspect_asset.py -- "$ARCADE_DIR/cabinet-display-qa.glb" "$ARCADE_DIR/qa-final" --resolution 960 --views front,side,three-quarter > "$ARCADE_DIR/qa-final.log" 2>&1
"$ASSET_LAB_BLENDER" --background --python "$ARCADE_DIR/render_focus.py" > "$ARCADE_DIR/focus.log" 2>&1
npx --yes --package=node@24 node node_modules/vitest/vitest.mjs run src/arcade2048-asset.test.ts src/arcade2048-screen.test.ts
