/** Keep the isolated browser players next to the station; production spawns are unchanged. */
export * from "../../apps/web/src/home";
import {
  homeSpawn as normalSpawn,
  type HomeSpawn,
} from "../../apps/web/src/home";
import { PLANES_TABLE } from "../../packages/shared/planes-station";
export function homeSpawn(index: number): HomeSpawn {
  return {
    ...normalSpawn(index),
    position: [
      PLANES_TABLE.x + 3 + index,
      PLANES_TABLE.ground,
      PLANES_TABLE.z + 4,
    ],
  };
}
