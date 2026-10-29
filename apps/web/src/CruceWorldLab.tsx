import { useEffect, useRef, useState } from "react";
import { openLocalWorldPort } from "./LocalWorldRoom";
import type { MultiplayerRoom } from "./multiplayer";
import { cruceWorldLab, requestCruceTestMove } from "./cruce-world-test";
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
  const peers = useRef<Peer[]>([]),
    sequence = useRef(0),
    [status, setStatus] = useState("");
  const send = (p: Peer, m: ClientMessage) =>
    p.port.postMessage({ kind: "message", raw: JSON.stringify(m) });
  const stop = () => {
    peers.current.forEach((p) => {
      p.port.postMessage({ kind: "disconnect" });
      p.port.close();
    });
    peers.current = [];
    setStatus("Jucătorii de test au plecat.");
  };
  useEffect(
    () => () => {
      peers.current.forEach((p) => {
        p.port.postMessage({ kind: "disconnect" });
        p.port.close();
      });
    },
    [],
  );
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
  if (!cruceWorldLab || !room.localPreview) return null;
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
      <p>{status}</p>
      <button
        onClick={() =>
          requestCruceTestMove([
            CRUCE_TABLE.x,
            CRUCE_TABLE.ground,
            CRUCE_TABLE.z + 2.45,
          ])
        }
      >
        Mergi lângă masa Cruce (test)
      </button>
      <button onClick={add}>Așază colegii de test</button>
      <button onClick={stop}>Eliberează colegii de test</button>
    </aside>
  );
}
