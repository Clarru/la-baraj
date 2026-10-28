import { useGLTF } from "@react-three/drei";
import { assetUrl } from "./assets";
import { cabinDesignForPlot } from "./cabin-designs";
import { roomNames } from "./cabin-interior-state";

/** Load only the room whose doorway the player is approaching. */
export function preloadCabinInterior(index: number) {
  useGLTF.preload(
    assetUrl("Lake_Interior_" + roomNames[cabinDesignForPlot(index).family]),
  );
}
