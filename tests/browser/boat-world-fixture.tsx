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
let heldCodes: string[] = [],
  keyTimer: number | null = null;
let recording = true,
  finishedAt = 0;
function releaseControls() {
  if (keyTimer !== null) window.clearTimeout(keyTimer);
  keyTimer = null;
  for (const code of heldCodes)
    window.dispatchEvent(
      new KeyboardEvent("keyup", {
        code,
        key: code.replace("Key", "").toLowerCase(),
        bubbles: true,
      }),
    );
  heldCodes = [];
  const out = document.querySelector("#boat-control-status");
  if (out) {
    out.textContent = "Controls released";
    out.setAttribute("data-state", "released");
  }
  finishedAt = performance.now();
}
function holdControls(codes: string[]) {
  releaseControls();
  heldCodes = codes;
  recording = true;
  finishedAt = 0;
  for (const code of codes)
    window.dispatchEvent(
      new KeyboardEvent("keydown", {
        code,
        key: code.replace("Key", "").toLowerCase(),
        bubbles: true,
      }),
    );
  const out = document.querySelector("#boat-control-status");
  if (out) {
    out.textContent = "Controls active";
    out.setAttribute("data-state", "active");
  }
  keyTimer = window.setTimeout(releaseControls, 4000);
}
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
      if (recording)
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
          vehicle: motion.vehicle,
          keys: motion.pressedKeys,
          desiredControls: [...heldCodes],
          active: motion.movementActive,
          paused: motion.paused,
          mode: motion.movementMode,
          frameDt: motion.frameDt,
        });
      historyNode?.setAttribute(
        "data-history",
        JSON.stringify(history.slice(-300)),
      );
      if (finishedAt && performance.now() - finishedAt > 500) recording = false;
      const out = document.querySelector("#boat-state");
      out?.setAttribute("data-state", JSON.stringify(value));
      if (out)
        out.textContent = `Player ${role + 1} · ${room?.getSnapshot().status} · boat ${own.mounted ? "driving" : "moored"} · ${own.speed.toFixed(2)} m/s · spin ${own.angularVelocity.toFixed(2)} rad/s`;
    }, 150);
    return () => {
      clearInterval(timer);
      releaseControls();
    };
  }, []);
  function stage() {
    releaseControls();
    recording = true;
    finishedAt = 0;
    document
      .querySelector("#boat-world-contacts")
      ?.setAttribute("data-contacts", "[]");
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
        <button onClick={() => holdControls(["KeyW"])}>Drive forward 4s</button>
        <button onClick={() => holdControls(["KeyW", "KeyA"])}>
          Turn forward 4s
        </button>
        <button onClick={releaseControls}>Release controls</button>
        <output id="boat-control-status" data-state="released">
          Controls released
        </output>
        <output id="boat-world-contacts" data-contacts="[]" hidden />
        <button
          onClick={() => {
            releaseControls();
            setVisible(false);
          }}
        >
          Leave test world
        </button>
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
