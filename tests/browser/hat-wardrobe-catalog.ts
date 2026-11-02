/** QA-only URL isolation; use the production catalogue for all selection rules. */
import { wardrobeAssetURL as productionURL } from "../../apps/web/src/wardrobe-catalog.ts";
import versions from "../../apps/web/src/wardrobe-asset-versions.json";
import type { WardrobeAssetId } from "../../apps/web/src/wardrobe-catalog.ts";
export {
  WARDROBE_ASSETS,
  wardrobeAssetIds,
} from "../../apps/web/src/wardrobe-catalog.ts";
export type { WardrobeAssetId } from "../../apps/web/src/wardrobe-catalog.ts";
const isolated = new Set([
  "hat-panel-cap",
  "hat-knit-beanie",
  "hat-stitched-bucket",
  "hair-parted-hat",
  "hair-buzzed-hat",
  "hair-long-hat",
]);
export function wardrobeAssetURL(id: WardrobeAssetId): string {
  return isolated.has(id)
    ? `/assets/hat-colours-qa/${id}-${versions[id].slice(0, 16)}.glb`
    : productionURL(id);
}
