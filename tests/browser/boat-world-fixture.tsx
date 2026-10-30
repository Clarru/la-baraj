/** Local-only two-browser QA of the actual Game/Player/SharedWorker authority. */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Game from "../../apps/web/src/Game";
import { getBoatState, parkBoat } from "../../apps/web/src/boat-state";
import { requestCruceTestMove } from "../../apps/web/src/cruce-world-test";
import { currentMultiplayerRoom } from "../../apps/web/src/multiplayer";
import "../../apps/web/src/multiplayer.css";
import "../../apps/web/src/scene-loading.css";
import "../../apps/web/src/style.css";
import "../../apps/web/src/game-art.css";

const role =
  new URLSearchParams(location.search).get("boat-player") === "1" ? 1 : 0;
type Scenario = "head-on" | "rear" | "glancing" | "moored" | "boost";
function App() {
  const [scenario, setScenario] = useState<Scenario>("rear");
  const [status, setStatus] = useState("Press R before staging a new case.");
  useEffect(() => {
    const timer = setInterval(() => {
      const room = currentMultiplayerRoom(),
        own = getBoatState();
      const motion = JSON.parse(
        document
          .querySelector('[data-testid="movement-metrics"]')
          ?.getAttribute("data-motion") ?? "{}",
      );
      const value = {
        role,
        status: room?.getSnapshot().status,
        mounted: own.mounted,
        speed: own.speed,
        motion,
        remotes: [...(room?.remotes.values() ?? [])].map((r) => r.player),
      };
      const out = document.querySelector("#boat-state");
      out?.setAttribute("data-state", JSON.stringify(value));
      if (out)
        out.textContent = `Player ${role + 1} · ${room?.getSnapshot().status} · boat ${own.mounted ? "driving" : "moored"} · ${own.speed.toFixed(2)} m/s`;
    }, 150);
    return () => clearInterval(timer);
  }, []);
  function stage() {
    if (getBoatState().mounted) {
      setStatus("Press R to leave/reset before staging.");
      return;
    }
    let x = 0,
      z = role === 0 ? -60 : -48,
      yaw = 0;
    if (scenario === "boost") {
      z = role === 0 ? -130 : -70;
    }
    if (scenario === "head-on") {
      z = role === 0 ? -60 : -48;
      yaw = role === 0 ? 0 : Math.PI;
    }
    if (scenario === "glancing") {
      x = role === 0 ? -8 : 0;
      z = role === 0 ? -56 : -48;
      yaw = role === 0 ? Math.PI / 4 : 0;
    }
    parkBoat([x, 0.05, z], yaw);
    requestCruceTestMove([
      x + Math.cos(yaw) * 2.4,
      -0.55,
      z - Math.sin(yaw) * 2.4,
    ]);
    document.querySelector("#boat-impacts")?.setAttribute("data-events", "[]");
    const trace = document.querySelector("#boat-impacts");
    if (trace) trace.textContent = "No impact yet";
    setStatus(
      scenario === "moored" && role === 1
        ? "Stay in the water: this boat is moored."
        : "Press V to board. Player 1 approaches with W.",
    );
  }
  return (
    <>
      <Game initialName={`Boat QA ${role + 1}`} />
      <aside id="boat-controls">
        <strong>Boat collision QA · player {role + 1}</strong>
        <p>Isolated local authority. No production connection.</p>
        <label>
          Collision scenario
          <select
            aria-label="Collision scenario"
            value={scenario}
            onChange={(e) => setScenario(e.target.value as Scenario)}
          >
            <option value="rear">Rear push</option>
            <option value="head-on">Head-on</option>
            <option value="glancing">Glancing</option>
            <option value="moored">Moored target</option>
            <option value="boost">Boost approach</option>
          </select>
        </label>
        <button onClick={stage}>Stage my boat</button>
        <p>{status}</p>
        <output id="boat-state" />
        <output id="boat-impacts" data-events="[]">
          No impact yet
        </output>
      </aside>
    </>
  );
}
if (!["127.0.0.1", "localhost"].includes(location.hostname))
  throw new Error("Local QA only");
createRoot(document.querySelector("#root")!).render(<App />);
