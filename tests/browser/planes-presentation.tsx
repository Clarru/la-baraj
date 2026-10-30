/** Isolated visual fixture. The actual PlanesBoard and rules; no sockets or saved state. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import PlanesBoard from "../../apps/web/src/PlanesBoard";
import {
  resolveShot,
  planeCells,
  targetUnavailable,
  destroyed,
  type Plane,
  type PlanesView,
  type Shot,
} from "../../packages/shared/planes";
import "./planes-presentation.css";
const fleet: Plane[] = [
  { x: 3, y: 2, rotation: 0 },
  { x: 7, y: 4, rotation: 0 },
  { x: 2, y: 9, rotation: 2 },
];
function initial(): PlanesView {
  return {
    version: 1,
    revision: 1,
    round: 1,
    phase: "playing",
    players: [
      {
        name: "Claudiu",
        online: true,
        ready: true,
        remaining: 3,
        awayUntil: null,
      },
      {
        name: "Robin",
        online: true,
        ready: true,
        remaining: 3,
        awayUntil: null,
      },
    ],
    you: 0,
    ownPlanes: fleet,
    shots: [[], []],
    turn: 1,
    winner: null,
    deadline: Date.now() + 60000,
    reason: null,
    event: null,
  };
}
function Review() {
  const [view, setView] = useState(initial),
    [open, setOpen] = useState(true),
    [connected, setConnected] = useState(true);
  const [result, setResult] = useState<Shot["result"]>("body");
  function accept(side: 0 | 1, x: number, y: number) {
    setView((before) => {
      const shot = resolveShot(fleet, before.shots[side], x, y);
      const won = fleet.every((plane) =>
        destroyed(plane, [...before.shots[side], shot]),
      );
      return {
        ...before,
        revision: before.revision + 1,
        turn: won ? null : side === 0 ? 1 : 0,
        players: before.players.map((player, index) =>
          player
            ? {
                ...player,
                ready: won ? false : player.ready,
                remaining:
                  index === (side === 0 ? 1 : 0)
                    ? fleet.filter(
                        (plane) =>
                          !destroyed(plane, [...before.shots[side], shot]),
                      ).length
                    : player.remaining,
              }
            : null,
        ) as PlanesView["players"],
        ...(won
          ? ({
              phase: "finished",
              reason: "fleet",
              winner: side,
            } as const)
          : {}),
        shots:
          side === 0
            ? [[...before.shots[0], shot], before.shots[1]]
            : [before.shots[0], [...before.shots[1], shot]],
        deadline: won ? null : Date.now() + 60000,
        event: {
          id: before.revision + 1,
          at: Date.now(),
          actor: "fixture",
          target: "fixture",
          result: shot.result,
          winner: won ? side : null,
        },
      };
    });
  }
  function incoming() {
    const candidates =
      result === "head"
        ? fleet
        : result === "body"
          ? fleet.flatMap((p) =>
              planeCells(p).filter((c) => c.x !== p.x || c.y !== p.y),
            )
          : Array.from({ length: 100 }, (_, i) => ({
              x: i % 10,
              y: Math.floor(i / 10),
            })).filter(
              (c) =>
                !fleet.some((p) =>
                  planeCells(p).some((f) => f.x === c.x && f.y === c.y),
                ),
            );
    const point = candidates.find(
      (c) => !targetUnavailable(c.x, c.y, view.shots[1]),
    );
    if (point) accept(1, point.x, point.y);
  }
  return (
    <>
      <aside className="review-controls">
        <h1>Planes · shot review</h1>
        <p>
          Isolated UI fixture. Actual component and shot rules. No network or
          saved match.
        </p>
        <label>
          Incoming result{" "}
          <select
            value={result}
            onChange={(e) => setResult(e.target.value as Shot["result"])}
          >
            <option value="miss">Air</option>
            <option value="body">Body hit</option>
            <option value="head">Cockpit hit</option>
          </select>
        </label>
        <button disabled={view.turn !== 1} onClick={incoming}>
          Robin fires
        </button>
        <button
          onClick={() =>
            setView((previous) => ({ ...initial(), round: previous.round + 1 }))
          }
        >
          Reset match
        </button>
        <button onClick={() => setOpen(!open)}>
          {open ? "Fold sheet" : "Open sheet"}
        </button>
        <button onClick={() => setConnected(!connected)}>
          {connected ? "Disconnect" : "Reconnect"}
        </button>
        <output>
          Revision {view.revision} ·{" "}
          {view.turn === 0 ? "Your turn" : "Robin’s turn"}
        </output>
      </aside>
      <PlanesBoard
        view={view}
        open={open}
        connected={connected}
        onClose={() => setOpen(false)}
        onLeave={() => setView(initial())}
        onAction={async (action) => {
          if (action.kind === "shot") accept(0, action.x, action.y);
          return null;
        }}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Review />);
