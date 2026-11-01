import { mobileMovement, mobileLook } from "../../apps/web/src/mobile-input";
/** Local-only touch QA: real Game and LocalWorldRoom; no production connection. */
import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import Game from "../../apps/web/src/Game";
import { MobileExperience } from "../../apps/web/src/MobileExperience";
import { installMobileDisplay } from "../../apps/web/src/mobile-display";
import { currentMultiplayerRoom } from "../../apps/web/src/multiplayer";
import { requestCruceTestMove } from "../../apps/web/src/cruce-world-test";
import { fishingSpots, terrainHeight } from "../../apps/web/src/geography";
import {
  cabinDoor,
  cabinLocalToWorld,
} from "../../apps/web/src/cabin-interior-state";
import { fireCircleSpot } from "../../apps/web/src/settlement";
import {
  ARCADE_STATIONS,
  arcadeStationYaw,
} from "../../packages/shared/arcade2048-station";
import { getVehicleState } from "../../apps/web/src/vehicle-state";
import "../../apps/web/src/multiplayer.css";
import "../../apps/web/src/scene-loading.css";
import "../../apps/web/src/style.css";
import "../../apps/web/src/game-art.css";
import "../../apps/web/src/mobile.css";
if (
  !["localhost", "127.0.0.1"].includes(location.hostname) ||
  import.meta.env.VITE_ROOM_SERVER_URL
)
  throw Error("Mobile QA is localhost only");
installMobileDisplay();
function approach(x: number, z: number) {
  requestCruceTestMove([x, terrainHeight(x, z) + 0.05, z]);
}
function Fixture() {
  const [showTouch, setShowTouch] = useState(false);
  const dropMoveEnd = useRef(false);
  useEffect(() => {
    const drop = (event: PointerEvent) => {
      if (
        dropMoveEnd.current &&
        event.target instanceof Element &&
        event.target.closest(".mobile-move")
      ) {
        dropMoveEnd.current = false;
        event.stopImmediatePropagation();
      }
    };
    document.addEventListener("pointerup", drop, true);
    return () => document.removeEventListener("pointerup", drop, true);
  }, []);
  const touchOutput = useRef<HTMLOutputElement>(null);
  const output = useRef<HTMLOutputElement>(null);
  useEffect(() => {
    const timer = setInterval(() => {
      if (touchOutput.current)
        touchOutput.current.textContent = `Move ${mobileMovement.x.toFixed(2)}, ${mobileMovement.y.toFixed(2)} · Look ${mobileLook.x.toFixed(2)}, ${mobileLook.y.toFixed(2)} · ${Array.from(
          document.querySelectorAll(".mobile-stick-zone .joystick"),
        )
          .map((node) => node.id)
          .join(" / ")}`;
      const room = currentMultiplayerRoom(),
        view = room?.getSnapshot();
      if (view && room)
        output.current?.setAttribute(
          "data-state",
          JSON.stringify({
            status: view.status,
            selfId: view.selfId,
            players: [...room.remotes.values()].map(({ player }) => player),
            home: view.homeIndex,
            seat: room?.ownSeatId(),
            cruce: view.cruce,
            arcade: view.arcade2048,
            stations: view.arcadeStations,
          }),
        );
    }, 200);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <MobileExperience>
        <Game initialName="Mobile QA" />
      </MobileExperience>
      <aside
        aria-label="Mobile QA tools"
        style={{
          position: "fixed",
          top: 58,
          right: 6,
          zIndex: 150,
          maxWidth: 160,
          background: "#fff4d8",
          color: "#243831",
          padding: 4,
          font: "12px sans-serif",
        }}
      >
        <details>
          <summary>Local touch QA</summary>
          <button onClick={() => setShowTouch((v) => !v)}>
            Toggle input readout
          </button>
          <button
            onClick={() => {
              dropMoveEnd.current = true;
            }}
          >
            Drop next Move pointer end (test)
          </button>
          <button
            onClick={() => {
              const s = ARCADE_STATIONS[0],
                yaw = arcadeStationYaw(s.id);
              approach(s.x + Math.sin(yaw) * 1.5, s.z + Math.cos(yaw) * 1.5);
            }}
          >
            Approach 2048
          </button>
          <button
            onClick={() => {
              const home =
                  currentMultiplayerRoom()?.getSnapshot().homeIndex ?? 0,
                door = cabinDoor(home),
                p = cabinLocalToWorld(home, door.x, door.outsideZ + 0.3);
              approach(p.x, p.z);
            }}
          >
            Approach cabin
          </button>
          <button
            onClick={() => approach(fireCircleSpot.x + 4, fireCircleSpot.z)}
          >
            Approach fire
          </button>
          <button
            onClick={() => approach(fishingSpots[0].x, fishingSpots[0].z + 1)}
          >
            Approach fishing
          </button>
          <button
            onClick={() => {
              const p = getVehicleState().parked;
              approach(p[0] + 1, p[2]);
            }}
          >
            Approach scooter
          </button>
        </details>
      </aside>
      {showTouch && (
        <output
          ref={touchOutput}
          aria-label="Native touch input readout"
          style={{
            position: "fixed",
            top: 130,
            left: "25%",
            zIndex: 180,
            background: "#fff4d8",
            color: "#243831",
            font: "14px sans-serif",
            padding: 4,
            pointerEvents: "none",
          }}
        />
      )}
      <output ref={output} hidden data-mobile-qa />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
