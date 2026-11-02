/** Actual Game/local SharedWorker acceptance; never connects to production. */
import "./mobile-world";
import { currentMultiplayerRoom } from "../../apps/web/src/multiplayer";
import { playerPosition } from "../../apps/web/src/player";
import { getActivityPose } from "../../apps/web/src/activity-state";
import { getVehicleState } from "../../apps/web/src/vehicle-state";
import { getBoatState } from "../../apps/web/src/boat-state";
import { requestCruceTestMove } from "../../apps/web/src/cruce-world-test";
import { terrainHeight, fishingSpots } from "../../apps/web/src/geography";
import { fireCircleSpot } from "../../apps/web/src/settlement";

if (
  !["127.0.0.1", "localhost"].includes(location.hostname) ||
  import.meta.env.VITE_ROOM_SERVER_URL
)
  throw Error("Wardrobe actual-Game QA is local-only");
declare global {
  interface Window {
    __wardrobeGameQA: {
      inspect(): unknown;
      approach(kind: "fire" | "fish" | "scooter" | "boat"): void;
    };
  }
}
window.__wardrobeGameQA = {
  inspect: () => {
    const room = currentMultiplayerRoom(),
      view = room?.getSnapshot();
    return {
      status: view?.status,
      id: view?.selfId,
      home: view?.homeIndex,
      appearance: view?.appearance,
      available: view?.appearanceAvailable,
      position: playerPosition.toArray(),
      activity: getActivityPose(),
      scooter: getVehicleState(),
      boat: getBoatState(),
      remotes: [...(room?.remotes.values() ?? [])].map(
        (remote) => remote.player,
      ),
    };
  },
  approach: (kind) => {
    let x: number, z: number;
    if (kind === "fire") {
      x = fireCircleSpot.x + 4;
      z = fireCircleSpot.z;
    } else if (kind === "fish") {
      x = fishingSpots[0].x;
      z = fishingSpots[0].z + 1;
    } else {
      const parked =
        kind === "boat" ? getBoatState().parked : getVehicleState().parked;
      x = parked[0] + 1;
      z = parked[2];
    }
    requestCruceTestMove([x, terrainHeight(x, z) + 0.05, z]);
  },
};
