/**
 * Local-only two-browser QA of the actual Game against a locally running
 * room Worker (`wrangler dev`). Unlike boat-world-fixture.tsx there is no
 * in-page authority: the room URL is baked in by scripts/prepare-boat-live-fixture.mjs.
 * Staging only parks the local boat and teleports the player beside it; boarding,
 * driving, impacts and wakes use the normal game code and the real room.
 */
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

const params = new URLSearchParams(location.search);
const role = params.get("boat-player") === "1" ? 1 : 0;
type Scenario = "rear" | "head-on" | "moored" | "turn";
/** Hull poses per scenario: [x, z, yaw] for player 1 then player 2. Yaw 0 faces +z. */
const STAGES: Record<Scenario, [number, number, number][]> = {
  rear: [
    [0, -60, 0],
    [0, -48, 0],
  ],
  "head-on": [
    [0, -60, 0],
    [0, -44, Math.PI],
  ],
  moored: [
    [0, -60, 0],
    [0, -48, 0],
  ],
  turn: [
    [-12, -60, 0],
    [6, -52, -Math.PI / 2],
  ],
};
function App() {
  const [scenario, setScenario] = useState<Scenario>(
    (params.get("scenario") as Scenario | null) ?? "rear",
  );
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
        localPreview: room?.localPreview ?? null,
        mounted: own.mounted,
        speed: own.speed,
        yaw: own.yaw,
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
    const [x, z, yaw] = STAGES[scenario][role];
    parkBoat([x, 0.05, z], yaw);
    requestCruceTestMove([
      x + Math.cos(yaw) * 2.4,
      -0.55,
      z - Math.sin(yaw) * 2.4,
    ]);
    setStatus(
      scenario === "moored" && role === 1
        ? "Stay in the water: this boat is moored."
        : "Press V to board, then drive with W/A/S/D.",
    );
  }
  return (
    <>
      <Game initialName={`Live QA ${role + 1}`} />
      <aside id="boat-controls">
        <strong>Boat live-room QA · player {role + 1}</strong>
        <p>Local room Worker only. No production connection.</p>
        <label>
          Scenario
          <select
            aria-label="Scenario"
            value={scenario}
            onChange={(e) => setScenario(e.target.value as Scenario)}
          >
            <option value="rear">Rear push</option>
            <option value="head-on">Head-on</option>
            <option value="moored">Moored target</option>
            <option value="turn">Turning wake</option>
          </select>
        </label>
        <button id="stage" onClick={stage}>
          Stage my boat
        </button>
        <p>{status}</p>
        <output id="boat-state" />
      </aside>
    </>
  );
}
if (!["127.0.0.1", "localhost"].includes(location.hostname))
  throw new Error("Local QA only");
createRoot(document.querySelector("#root")!).render(<App />);
