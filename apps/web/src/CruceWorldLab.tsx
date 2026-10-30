import { useEffect, useRef, useState } from "react";
import { openLocalWorldPort } from "./LocalWorldRoom";
import type { MultiplayerRoom } from "./multiplayer";
import {
  cruceWorldLab,
  requestCruceTestMove,
  cruceContactSnapshot,
} from "./cruce-world-test";
import {
  CRUCE_TABLE,
  CRUCE_SEATS,
  cruceSeatPose,
} from "../../../packages/shared/cruce-station";
import {
  activeCruceSeats,
  suitOf,
  type CruceView,
  type CruceAction,
  type CruceSeat,
} from "../../../packages/shared/cruce";
import type {
  ClientMessage,
  ServerMessage,
} from "../../../packages/shared/protocol";
type Peer = {
  port: MessagePort;
  view: CruceView | null;
  busy: boolean;
  seat: CruceSeat;
};
export function CruceWorldLab({ room }: { room: MultiplayerRoom }) {
  const [toolsVisible, setToolsVisible] = useState(true);
  const [testSeat, setTestSeat] = useState<CruceSeat>(0);
  const [contacts, setContacts] = useState("[]");
  useEffect(() => {
    const timer = setInterval(
      () => setContacts(JSON.stringify(cruceContactSnapshot())),
      200,
    );
    return () => clearInterval(timer);
  }, []);
  const peers = useRef<Peer[]>([]),
    sequence = useRef(0),
    [status, setStatus] = useState("");
  const send = (p: Peer, m: ClientMessage) =>
    p.port.postMessage({ kind: "message", raw: JSON.stringify(m) });
  const releasePeer = (p: Peer) => {
    let timer: ReturnType<typeof setTimeout>;
    const finish = () => {
      clearTimeout(timer);
      p.port.onmessage = null;
      p.port.close();
    };
    p.port.onmessage = (e) => {
      if (e.data?.kind === "closed") finish();
    };
    p.port.postMessage({
      kind: "message",
      raw: JSON.stringify({
        type: "seat",
        seatId: null,
        requestId: `lab-leave:${++sequence.current}`,
      }),
    });
    p.port.postMessage({ kind: "disconnect" });
    timer = setTimeout(finish, 5000);
  };
  const stop = () => {
    peers.current.forEach(releasePeer);
    peers.current = [];
    setStatus("Jucătorii de test au plecat.");
  };
  useEffect(() => {
    const release = () => {
      peers.current.forEach(releasePeer);
      peers.current = [];
    };
    window.addEventListener("pagehide", release);
    return () => {
      window.removeEventListener("pagehide", release);
      release();
    };
  }, []);
  useEffect(() => {
    const timer = setInterval(() => {
      for (const p of peers.current) {
        p.port.postMessage({ kind: "heartbeat" });
        const v = p.view;
        if (!v || p.busy || v.you === null) continue;
        let action: CruceAction | null = null;
        if (
          v.phase === "lobby" &&
          activeCruceSeats(v.settings.mode).every(
            (s) => v.players[s]?.online,
          ) &&
          !v.players[p.seat]?.ready
        )
          action = { kind: "ready" };
        else if (v.turn === p.seat) {
          if (v.phase === "cut") action = { kind: "cut", cut: false };
          if (v.phase === "bidding") action = { kind: "bid", value: 0 };
          if (v.phase === "trump")
            action = { kind: "trump", suit: suitOf(v.hand[0]) };
          if (v.phase === "exchange")
            action = {
              kind: "give",
              card: v.hand[0],
              to: activeCruceSeats(v.settings.mode).find(
                (s) => s !== p.seat && !v.given.includes(s),
              )!,
            };
          if (v.phase === "playing" && v.legalCards.length)
            action = { kind: "play", card: v.legalCards[0], announce: false };
        }
        if (action) {
          p.busy = true;
          send(p, {
            type: "cruce-action",
            requestId: `lab-action:${++sequence.current}`,
            revision: v.revision,
            action,
          });
        }
      }
    }, 800);
    return () => clearInterval(timer);
  }, []);
  if (!cruceWorldLab || !room.localPreview || !toolsVisible) return null;
  const add = () => {
    stop();
    const view = room.getSnapshot().cruce;
    if (!view || view.you === null) {
      setStatus("Apasă întâi F ca să ocupi locul tău.");
      return;
    }
    for (const seat of activeCruceSeats(view.settings.mode).filter(
      (s) => !view.players[s],
    )) {
      const p: Peer = {
        port: openLocalWorldPort(),
        view: null,
        busy: false,
        seat,
      };
      peers.current.push(p);
      p.port.onmessage = (e) => {
        if (e.data.kind === "ready") {
          send(p, {
            type: "hello",
            nickname: `Test ${["Sud", "Vest", "Nord", "Est"][seat]}`,
          });
          send(p, {
            type: "pose",
            pose: {
              ...cruceSeatPose(seat),
              animation: "Activity_Sit",
              activity: "sit",
              vehicle: "none",
            },
          });
          send(p, {
            type: "seat",
            seatId: CRUCE_SEATS[seat],
            requestId: `lab-seat:${++sequence.current}`,
          });
        } else if (e.data.kind === "server") {
          const m = e.data.message as ServerMessage;
          if (m.type === "cruce") {
            p.view = m.view;
            if (m.requestId) p.busy = false;
          }
          if (m.type === "snapshot" && m.cruce) p.view = m.cruce;
          if (m.type === "error") setStatus(m.message);
        }
      };
      p.port.start();
    }
    setStatus("Colegii de test joacă doar în lumea locală.");
  };
  return (
    <aside
      style={{
        position: "fixed",
        top: 90,
        left: 16,
        zIndex: 100,
        padding: 10,
        maxWidth: 250,
        background: "#f3e5c9",
        color: "#263b30",
        pointerEvents: "auto",
      }}
      aria-label="Teste 3D Cruce"
    >
      <strong>Test local Cruce</strong>
      <button onClick={() => setToolsVisible(false)}>Ascunde testele</button>
      <p>{status}</p>
      <output
        aria-label="Contacte 3D Cruce"
        style={{
          display: "block",
          fontSize: 10,
          overflowWrap: "anywhere",
          maxHeight: 160,
          overflow: "auto",
        }}
      >
        {contacts}
      </output>
      <label>
        Loc de test
        <select
          value={testSeat}
          onChange={(e) => setTestSeat(Number(e.target.value) as CruceSeat)}
        >
          {["sud", "vest", "nord", "est"].map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button
        onClick={() =>
          requestCruceTestMove([
            CRUCE_TABLE.x -
              Math.sin((testSeat * Math.PI) / 2) *
                (CRUCE_TABLE.benchRadius + 0.85),
            CRUCE_TABLE.ground,
            CRUCE_TABLE.z +
              Math.cos((testSeat * Math.PI) / 2) *
                (CRUCE_TABLE.benchRadius + 0.85),
          ])
        }
      >
        Mergi lângă masa Cruce (test)
      </button>
      <button onClick={add}>Așază colegii de test</button>
      <button onClick={stop}>Eliberează colegii de test</button>
      <button onClick={() => room.releaseSeat()}>
        Forțează eliberarea locului (test)
      </button>
    </aside>
  );
}
