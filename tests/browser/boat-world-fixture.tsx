/** Local-only two-browser QA of the actual Game/Player/SharedWorker authority. */
import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import Game from "../../apps/web/src/Game";
import { getBoatState, parkBoat } from "../../apps/web/src/boat-state";
import { requestCruceTestMove } from "../../apps/web/src/cruce-world-test";
import { southShore } from "../../apps/web/src/geography";
import { currentMultiplayerRoom } from "../../apps/web/src/multiplayer";
import "../../apps/web/src/multiplayer.css";
import "../../apps/web/src/scene-loading.css";
import "../../apps/web/src/style.css";
import "../../apps/web/src/game-art.css";

const role = Math.max(
  0,
  Math.min(
    2,
    Number(new URLSearchParams(location.search).get("boat-player") ?? 0),
  ),
);
type Scenario =
  | "head-on"
  | "rear"
  | "glancing"
  | "moored"
  | "boost"
  | "off-centre"
  | "rubbing"
  | "chain"
  | "dock";
function App() {
  const [visible, setVisible] = useState(true);
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
      const historyNode = document.querySelector("#boat-history");
      const history = JSON.parse(
        historyNode?.getAttribute("data-history") ?? "[]",
      );
      history.push({
        at: performance.now(),
        mounted: own.mounted,
        position: motion.position,
        velocity: motion.velocity,
        yaw: own.yaw,
        angularVelocity: own.angularVelocity,
        rudder: own.rudder,
        renderCorrection: motion.boatRenderCorrection,
        damping: motion.bodyLinearDamping,
      });
      historyNode?.setAttribute(
        "data-history",
        JSON.stringify(history.slice(-300)),
      );
      const out = document.querySelector("#boat-state");
      out?.setAttribute("data-state", JSON.stringify(value));
      if (out)
        out.textContent = `Player ${role + 1} · ${room?.getSnapshot().status} · boat ${own.mounted ? "driving" : "moored"} · ${own.speed.toFixed(2)} m/s · spin ${own.angularVelocity.toFixed(2)} rad/s`;
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
    if (scenario === "off-centre") x = role === 0 ? 0.7 : 0;
    if (scenario === "rubbing") {
      x = role === 0 ? 0 : 2.25;
      z = -60;
    }
    if (scenario === "chain") {
      x = 0;
      z = -60 + role * 6.4;
    }
    if (scenario === "dock") {
      x = role === 0 ? 2 : 20;
      z = southShore(0) - 18;
    }
    parkBoat([x, 0.05, z], yaw);
    requestCruceTestMove([
      x + Math.cos(yaw) * 2.4 * (role === 0 ? -1 : 1),
      -0.55,
      z - Math.sin(yaw) * 2.4 * (role === 0 ? -1 : 1),
    ]);
    document.querySelector("#boat-impacts")?.setAttribute("data-events", "[]");
    document.querySelector("#boat-history")?.setAttribute("data-history", "[]");
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
      {visible && <Game initialName={`Boat QA ${role + 1}`} />}
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
            <option value="off-centre">Off-centre rear</option>
            <option value="rubbing">Side rubbing</option>
            <option value="chain">Three-boat chain</option>
            <option value="dock">Dock approach</option>
          </select>
        </label>
        <button onClick={stage}>Stage my boat</button>
        <p>{status}</p>
        <button onClick={() => setVisible(false)}>Leave test world</button>
        <output id="boat-history" data-history="[]" hidden />
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
