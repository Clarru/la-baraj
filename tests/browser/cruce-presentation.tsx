import { useState } from "react";
import { createRoot } from "react-dom/client";
import CruceBoard from "../../apps/web/src/CruceBoard";
import {
  freshCruce,
  activeCruceSeats,
  type CruceView,
  type CruceMode,
  type CruceSeat,
} from "../../packages/shared/cruce";
import "../../apps/web/src/style.css";
import "../../apps/web/src/game-art.css";
function App() {
  const [mode, setMode] = useState<CruceMode>("duel"),
    [scenario, setScenario] = useState("playing");
  const names = ["Claudiu", "Ioana", "Amalia", "Alexandru cu nume lung"],
    active = activeCruceSeats(mode);
  const v = {
    ...freshCruce({ mode, target: 11, iber: false, cheating: false }),
    version: 1,
    revision: 10,
    you: 0,
    host: 0,
    phase: "playing",
    turn: 0,
    dealer: 2,
    round: 1,
    bid: 3,
    bidder: 2,
    bids: [2, null, 3, null],
    trump: 1,
    stockCount: mode === "duel" ? 4 : 0,
    hand: [0, 1, 2, 3, 4, 5, 6, 10],
    legalCards: [0, 1, 2, 3, 4, 5, 6, 10],
    handCounts: [0, 0, 0, 0],
    players: [0, 1, 2, 3].map((s) =>
      active.includes(s as CruceSeat)
        ? { name: names[s], online: true, ready: false, awayUntil: null }
        : null,
    ),
    deadline: Date.now() + 38000,
  } as CruceView;
  v.handCounts = [0, 1, 2, 3].map((s) =>
    active.includes(s as CruceSeat) ? 8 : 0,
  );
  if (scenario === "bidding") {
    v.phase = "bidding";
    v.trump = null;
  }
  if (scenario.startsWith("announcement")) {
    const forty = scenario === "announcement40";
    v.trick = [
      { seat: 2, card: forty ? 7 : 13, announcement: forty ? 40 : 20 },
    ];
    v.handCounts[2] = 7;
  }
  if (scenario === "trick") {
    v.phase = "trick";
    v.turn = null;
    v.deadline = Date.now() + 1800;
    v.trickWinner = 2;
    v.trick = [
      { seat: 0, card: 11, announcement: 0 },
      { seat: 2, card: 7, announcement: 40 },
    ];
  }
  if (scenario === "overdue") {
    v.deadline = Date.now() - 5000;
    v.turnOverdue = true;
  }
  if (scenario === "away") {
    v.players[2]!.online = false;
    v.players[2]!.awayUntil = Date.now() + 24000;
  }
  if (scenario === "lobby") {
    v.phase = "lobby";
    v.round = 0;
    v.bid = 0;
    v.bidder = null;
    v.bids = [null, null, null, null];
    v.trump = null;
    v.hand = [];
    v.handCounts = [0, 0, 0, 0];
    v.stockCount = 0;
    v.deadline = null;
    v.players[1] = null;
    v.players[3] = null;
  }
  if (scenario === "round-end") {
    v.phase = "round-end";
    v.hand = [];
    v.handCounts = [0, 0, 0, 0];
    v.stockCount = 0;
    v.deadline = null;
    v.roundPoints = [66, 0, 54, 0];
    v.roundScores = [2, 0, 1, 0];
    v.scores = [2, 0, 1, 0];
  }
  return (
    <>
      <CruceBoard
        view={v}
        connected={scenario !== "disconnected"}
        open
        onAction={async () =>
          "Machetă vizuală: folosește jocul real pentru acțiuni."
        }
        onClose={() => {}}
        onLeave={() => {}}
        onSit={async () => false}
        onSync={() => {}}
      />
      <aside
        style={{
          position: "fixed",
          bottom: 3,
          right: 8,
          zIndex: 100,
          font: "12px sans-serif",
          display: "flex",
          gap: 6,
          background: "#fffdf6",
          padding: 4,
        }}
        aria-label="Machetă vizuală Cruce"
      >
        <label>
          Variantă QA
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value as CruceMode)}
          >
            {[
              "duel",
              "trio-standard",
              "trio-talon",
              "four-individual",
              "four-classic",
              "four-standard",
            ].map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Stare QA
          <select
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
          >
            {[
              "playing",
              "bidding",
              "announcement20",
              "announcement40",
              "trick",
              "overdue",
              "away",
              "disconnected",
              "lobby",
              "round-end",
            ].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </aside>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
