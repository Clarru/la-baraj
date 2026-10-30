/** Local UI fixture of the ONE physical table. No socket or production import. */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import CruceBoard from "../../apps/web/src/CruceBoard";
import { CruceTable } from "../../apps/server/cruce-table";
import {
  activeCruceSeats,
  type CruceAction,
  type CruceSeat,
  type CruceView,
} from "../../packages/shared/cruce";
import { worldNow, syncWorldTime } from "../../apps/web/src/day-night";
const actors = ["Clau", "Ana", "Mihai", "Ioana", "Vizitator"].map(
  (name, i) => ({ owner: `fixture:${i}`, socket: `fixture:${i}`, name }),
);
let table = new CruceTable({ save: async () => {}, random: () => 0.314159 });
let sequence = 0,
  now = Date.now();
async function action(actor: number, a: CruceAction) {
  now = Math.max(now, worldNow());
  await table.act(
    actors[actor],
    a,
    `test:${++sequence}`,
    table.view(actors[actor]).revision,
    now,
  );
}
async function setup(scenario: string) {
  table = new CruceTable({ save: async () => {}, random: () => 0.314159 });
  now = Date.now();
  syncWorldTime(now);
  const count =
    scenario === "empty"
      ? 0
      : scenario === "alone"
        ? 1
        : scenario === "waiting"
          ? 2
          : 4;
  for (let i = 0; i < count; i++)
    await table.join(actors[i], i as CruceSeat, now);
  if (["empty", "alone", "waiting", "full"].includes(scenario)) return;
  for (let i = scenario === "ready" ? 1 : 0; i < 4; i++)
    await action(i, { kind: "ready" });
  if (scenario === "ready") return;
  await action(table.view(null).turn!, { kind: "cut", cut: false });
  for (let i = 0; i < 4; i++)
    await action(table.view(null).turn!, { kind: "bid", value: i ? 0 : 1 });
  if (scenario === "away") await table.disconnect(actors[1], now);
  if (scenario === "stopped") await table.leave(actors[1]);
}
function Fixture() {
  const [view, setView] = useState<CruceView | null>(null);
  const [actor, setActor] = useState(0),
    [open, setOpen] = useState(true),
    [connected, setConnected] = useState(true);
  const refresh = (who = actor) => setView(table.view(actors[who]));
  useEffect(() => {
    void setup("game").then(() => setView(table.view(actors[0])));
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      void table.expire(worldNow()).then((changed) => {
        if (changed) refresh();
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [actor]);
  const next = async () => {
    const v = table.view(null);
    if (v.phase === "trick") {
      now = v.deadline!;
      await table.expire(now);
      syncWorldTime(now);
    } else if (v.phase === "playing" && v.turn !== null) {
      const p = table.view(actors[v.turn]);
      await action(v.turn, {
        kind: "play",
        card: p.legalCards[0],
        announce: false,
      });
    }
    refresh();
  };
  const seatFriends = async () => {
    const v = table.view(null);
    for (const seat of activeCruceSeats(v.settings.mode))
      if (!v.players[seat]) await table.join(actors[seat], seat, worldNow());
    refresh();
  };
  const readyFriends = async () => {
    const v = table.view(null);
    for (const seat of activeCruceSeats(v.settings.mode))
      if (seat !== actor && v.players[seat] && !v.players[seat]!.ready)
        await action(seat, {
          kind: v.phase === "round-end" ? "continue" : "ready",
        });
    refresh();
  };
  return (
    <>
      <aside
        className="fixture-tools"
        aria-label="Controale pentru testul local"
      >
        <label>
          Stare UI{" "}
          <select
            defaultValue="game"
            onChange={(e) => {
              const state = e.target.value;
              const who = state === "full" ? 4 : 0;
              setActor(who);
              setConnected(true);
              setOpen(true);
              void setup(state).then(() => refresh(who));
            }}
          >
            <option value="game">În joc</option>
            <option value="empty">Masă liberă</option>
            <option value="alone">Singur la masă</option>
            <option value="waiting">Așteptăm jucători</option>
            <option value="ready">Toți așezați</option>
            <option value="full">Masă completă · spectator</option>
            <option value="away">Reconectare</option>
            <option value="stopped">Partidă oprită</option>
          </select>
        </label>
        <button
          onClick={() => {
            setOpen(true);
            refresh();
          }}
        >
          Deschide Cruce
        </button>
        <button onClick={() => void next()}>Mutarea următoare (test)</button>
        <button onClick={() => void seatFriends()}>Așază colegii (test)</button>
        <button onClick={() => void readyFriends()}>
          Pregătește colegii (test)
        </button>
        <button
          onClick={() => {
            const next = (actor + 1) % actors.length;
            setActor(next);
            refresh(next);
          }}
        >
          Schimbă jucătorul (test)
        </button>
        <button onClick={() => setConnected((c) => !c)}>
          Conexiune (test)
        </button>
        <span>Test local · masa este simulată în această pagină</span>
      </aside>
      <CruceBoard
        view={view}
        connected={connected}
        open={open}
        onAction={async (a) => {
          try {
            await action(actor, a);
            refresh();
            return null;
          } catch (e) {
            return (e as Error).message;
          }
        }}
        onClose={() => setOpen(false)}
        onLeave={() => {
          void table.leave(actors[actor]).then(() => refresh());
        }}
        onSit={async (s) => {
          await table.join(actors[actor], s, worldNow());
          refresh();
          return true;
        }}
      />
    </>
  );
}
createRoot(document.getElementById("root")!).render(<Fixture />);
