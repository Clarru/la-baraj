/** Authored localhost QA only: actual Game/GLB/physics and its isolated in-memory SharedWorker. */
import React, { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import Game from "../../apps/web/src/Game";
import { currentMultiplayerRoom } from "../../apps/web/src/multiplayer";
import { requestCruceTestMove } from "../../apps/web/src/cruce-world-test";
import { terrainHeight } from "../../apps/web/src/geography";
import { ARCADE_STATIONS } from "../../packages/shared/arcade2048-station";
import "../../apps/web/src/multiplayer.css";
import "../../apps/web/src/scene-loading.css";
import "../../apps/web/src/style.css";
import "../../apps/web/src/game-art.css";
const role =
  Number(new URL(location.href).searchParams.get("arcade-player") ?? 0) === 1
    ? 1
    : 0;
if (
  !["localhost", "127.0.0.1"].includes(location.hostname) ||
  import.meta.env.VITE_ROOM_SERVER_URL
)
  throw Error("Local QA only");
function approach(id: number, distance = 1.5) {
  const s = ARCADE_STATIONS[id];
  requestCruceTestMove([
    s.x,
    terrainHeight(s.x, s.z + distance) + 0.1,
    s.z + distance,
  ]);
}
function Fixture() {
  const output = useRef<HTMLOutputElement>(null),
    started = useRef(false);
  useEffect(() => {
    const timer = setInterval(() => {
      const room = currentMultiplayerRoom(),
        v = room?.getSnapshot();
      if (!v) return;
      if (!started.current && v.status === "online" && v.homeIndex !== null) {
        started.current = true;
        approach(role ? 2 : 0);
      }
      if (output.current)
        output.current.textContent = JSON.stringify({
          status: v.status,
          selfId: v.selfId,
          stations: v.arcadeStations,
          privateGame: v.arcade2048?.game,
          blocked: v.arcadeBlocked,
        });
    }, 250);
    return () => clearInterval(timer);
  }, []);
  return (
    <>
      <Game initialName={role ? "Arcade friend QA" : "Arcade player QA"} />
      <aside
        aria-label="Arcade QA controls"
        style={{
          position: "absolute",
          right: 15,
          top: 75,
          zIndex: 100,
          padding: 8,
          background: "#f3e5c9",
          color: "#263b30",
        }}
      >
        <strong>Local arcade QA · player {role + 1}</strong>
        <div>
          {ARCADE_STATIONS.map((s) => (
            <button key={s.id} onClick={() => approach(s.id)}>
              Approach {s.id + 1}
            </button>
          ))}
          <button onClick={() => approach(1, 4.5)}>Observe row</button>
        </div>
        <output ref={output} data-arcade-qa-state hidden />
      </aside>
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Fixture />
  </React.StrictMode>,
);
