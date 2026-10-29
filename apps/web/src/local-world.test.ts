import { describe, it, expect, vi, afterEach } from "vitest";
import { createLocalWorld } from "./local-world";
import { localWorldEnabled } from "./LocalWorldRoom";
import {
  CRUCE_MODES,
  activeCruceSeats,
  type CruceView,
} from "../../../packages/shared/cruce";
import {
  CRUCE_SEATS,
  cruceSeatPose,
} from "../../../packages/shared/cruce-station";
import {
  HOUSING_EPOCH,
  type ClientMessage,
  type ServerMessage,
} from "../../../packages/shared/protocol";
let seq = 0;
function client(world: ReturnType<typeof createLocalWorld>, token: string) {
  let view: CruceView | null = null;
  const messages: ServerMessage[] = [];
  const connection = world.connect((m) => {
    messages.push(m);
    if (m.type === "cruce") view = m.view;
    if (m.type === "snapshot" && m.cruce) view = m.cruce;
  });
  return {
    messages,
    get view() {
      return view!;
    },
    disconnect: connection.disconnect,
    async send(m: ClientMessage) {
      vi.setSystemTime(Date.now() + 1000);
      await connection.message(JSON.stringify(m));
    },
    async hello() {
      await this.send({
        type: "hello",
        nickname: `Jucător ${token[0]}`,
        housingEpoch: HOUSING_EPOCH,
        requestHome: true,
        createHome: true,
        resumeToken: token,
      });
    },
    async act(
      action: Extract<ClientMessage, { type: "cruce-action" }>["action"],
    ) {
      await this.send({
        type: "cruce-action",
        requestId: `local:${++seq}`,
        revision: view!.revision,
        action,
      });
      expect(messages.at(-1)).not.toHaveProperty("error");
    },
  };
}
afterEach(() => vi.useRealTimers());
describe("local authority on the existing 4173 origin", () => {
  it("never enables local simulation on production or a configured multiplayer target", () => {
    expect(localWorldEnabled("la-baraj.vercel.app", undefined)).toBe(false);
    expect(localWorldEnabled("localhost", "https://example.test")).toBe(false);
    expect(localWorldEnabled("127.0.0.1", "")).toBe(true);
  });
  for (const mode of CRUCE_MODES)
    it(`plays an entire hand over real room packets: ${mode}`, async () => {
      vi.useFakeTimers();
      vi.setSystemTime(100_000);
      const world = createLocalWorld();
      const people = [0, 1, 2, 3].map((i) =>
        client(world, String.fromCharCode(65 + i).repeat(43)),
      );
      for (const p of people) await p.hello();
      const seats = activeCruceSeats(mode);
      const join = async (s: 0 | 1 | 2 | 3) => {
        await people[s].send({
          type: "pose",
          pose: {
            ...cruceSeatPose(s),
            animation: "Idle_Neutral",
            activity: "none",
            vehicle: "none",
          },
        });
        await people[s].send({
          type: "seat",
          seatId: CRUCE_SEATS[s],
          requestId: `seat:${++seq}`,
        });
        expect(people[s].view.you).toBe(s);
      };
      await join(0);
      await people[0].act({
        kind: "configure",
        settings: { mode, target: 11, iber: true, cheating: false },
      });
      for (const s of seats.slice(1)) await join(s);
      for (const s of seats) await people[s].act({ kind: "ready" });
      let bids = 0,
        played = 0;
      for (let n = 0; n < 80; n++) {
        const v = people[0].view;
        if (["round-end", "finished"].includes(v.phase)) break;
        if (v.phase === "trick") {
          vi.setSystemTime(v.deadline! + 1);
          await world.tick();
          continue;
        }
        const p = people[v.turn!];
        if (v.phase === "cut") await p.act({ kind: "cut", cut: true });
        else if (v.phase === "bidding")
          await p.act({ kind: "bid", value: bids++ ? 0 : 1 });
        else if (v.phase === "trump") await p.act({ kind: "trump", suit: 0 });
        else if (v.phase === "exchange")
          await p.act({
            kind: "give",
            card: p.view.hand[0],
            to: seats.find((s) => s !== p.view.you && !v.given.includes(s))!,
          });
        else if (v.phase === "playing") {
          await p.act({
            kind: "play",
            card: p.view.legalCards[0],
            announce: false,
          });
          played++;
        }
      }
      expect(played).toBe(24);
      expect(people[0].view.phase).toBe("round-end");
      expect(people[0].view.roundPoints.reduce((a, b) => a + b)).toBe(120);
      for (const p of people) {
        for (const m of p.messages.filter((m) => m.type === "cruce"))
          expect(m.view).not.toHaveProperty("hands");
      }
    });
  it("rejects a distant seat claim and resumes the same private hand after a closed tab", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const world = createLocalWorld(),
      a = client(world, "A".repeat(43)),
      b = client(world, "B".repeat(43));
    await a.hello();
    await b.hello();
    await a.send({ type: "seat", seatId: CRUCE_SEATS[0], requestId: "far" });
    expect(a.messages.at(-1)).toMatchObject({ accepted: false });
    for (const [p, s] of [
      [a, 0],
      [b, 2],
    ] as const) {
      await p.send({
        type: "pose",
        pose: {
          ...cruceSeatPose(s),
          animation: "Activity_Sit",
          activity: "sit",
          vehicle: "none",
        },
      });
      await p.send({
        type: "seat",
        seatId: CRUCE_SEATS[s],
        requestId: `join:${s}`,
      });
      if (s === 0)
        await a.act({
          kind: "configure",
          settings: { mode: "duel", target: 11, iber: false, cheating: false },
        });
    }
    await a.act({ kind: "ready" });
    await b.act({ kind: "ready" });
    await a.act({ kind: "cut", cut: false });
    const hand = [...a.view.hand];
    await a.disconnect();
    expect(b.view.deadline).toBeNull();
    expect(b.view.players[0]!.online).toBe(false);
    const resumed = client(world, "A".repeat(43));
    expect(resumed.view.hand).toEqual([]);
    await resumed.hello();
    expect(resumed.view.you).toBe(0);
    expect(resumed.view.hand).toEqual(hand);
    expect(b.view.hand).not.toEqual(hand);
  });
});
