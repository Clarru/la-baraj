import { describe, expect, it, vi } from "vitest";
import {
  RoomCore,
  type RoomConnection,
  type SessionState,
} from "../apps/server/room-core";
import {
  CruceTable,
  type CruceRecord,
  nextCruceDeadline,
} from "../apps/server/cruce-table";
import { HomeAssignments } from "../apps/server/home-assignments";
import { CRUCE_SEATS, cruceSeatPose } from "../packages/shared/cruce-station";
import {
  type CruceAction,
  type CruceSeat,
  suitOf,
} from "../packages/shared/cruce";
import type { ClientMessage, ServerMessage } from "../packages/shared/protocol";
class Connection implements RoomConnection {
  state: SessionState | null = null;
  messages: ServerMessage[] = [];
  setState(s: SessionState) {
    this.state = structuredClone(s);
  }
  send(s: string) {
    this.messages.push(JSON.parse(s));
  }
  close() {
    this.state = null;
  }
}
async function setup() {
  const connections = [new Connection(), new Connection()],
    homes = new HomeAssignments({ save: async () => {} });
  let saved: CruceRecord;
  const cruce = new CruceTable({
    save: async (r) => {
      saved = structuredClone(r);
    },
    random: () => 0.43,
  });
  let now = 100000;
  const makeRoom = (table: CruceTable) =>
    new RoomCore({
      connections: () => connections,
      homes,
      cruce: table,
      saveFire: async () => {},
    });
  const room = makeRoom(cruce);
  const send = async (i: number, m: ClientMessage, time = now + 1000) => {
    now = time;
    await room.message(connections[i], JSON.stringify(m), now);
  };
  for (const i of [0, 1]) {
    room.connect(connections[i], `freeze-${i}`, now);
    await send(i, { type: "hello", nickname: `Player ${i}` });
    await send(i, {
      type: "pose",
      pose: {
        ...cruceSeatPose((i ? 2 : 0) as CruceSeat),
        animation: "Idle_Neutral",
        activity: "none",
        vehicle: "none",
      },
    });
    await send(i, {
      type: "seat",
      seatId: CRUCE_SEATS[i ? 2 : 0],
      requestId: `sit${i}`,
    });
  }
  const actor = (i: number) => ({
    owner: connections[i].state!.home ? `home:2:${connections[i].state!.home!.index}` : `session:${connections[i].state!.player.id}`,
    socket: connections[i].state!.player.id,
    name: connections[i].state!.player.nickname,
  });
  const act = async (
    i: number,
    action: CruceAction,
    revision = cruce.view(null).revision,
  ) =>
    send(i, {
      type: "cruce-action",
      requestId: crypto.randomUUID(),
      revision,
      action,
    });
  await act(0, {
    kind: "configure",
    settings: { mode: "duel", target: 11, iber: false, cheating: false },
  });
  await act(0, { kind: "ready" });
  await act(1, { kind: "ready" });
  while (cruce.view(null).phase !== "playing") {
    const v = cruce.view(null),
      i = [0, 1].find((i) => cruce.sideFor(actor(i)) === v.turn)!;
    await act(
      i,
      v.phase === "cut"
        ? { kind: "cut", cut: false }
        : v.phase === "bidding"
          ? { kind: "bid", value: v.bid ? 0 : 1 }
          : { kind: "trump", suit: suitOf(cruce.view(actor(i)).hand[0]) },
    );
  }
  const playTrick = async () => {
    for (let n = 0; n < 2; n++) {
      const v = cruce.view(null),
        i = [0, 1].find((i) => cruce.sideFor(actor(i)) === v.turn)!;
      await act(i, {
        kind: "play",
        card: cruce.view(actor(i)).legalCards[0],
        announce: false,
      });
    }
    return cruce.view(null).deadline!;
  };
  return {
    room,
    cruce,
    connections,
    homes,
    actor,
    act,
    send,
    playTrick,
    saved: () => saved!,
    makeRoom,
  };
}
describe("authoritative stalled-trick recovery", () => {
  it("collects a completed trick through existing sync even when no alarm ran", async () => {
    const f = await setup(),
      deadline = await f.playTrick();
    expect(f.cruce.view(null).phase).toBe("trick");
    const before = f.cruce.view(null).revision;
    await f.send(0, { type: "sync" }, deadline + 5000);
    expect(f.cruce.view(null)).toMatchObject({
      phase: "playing",
      stockCount: 6,
      handCounts: [8, 0, 8, 0],
    });
    const message = f.connections[0].messages.at(-1);
    expect(message).toMatchObject({
      type: "snapshot",
      cruceRecovery: { phase: "trick", trickCount: 2, transitioned: true },
      cruce: { phase: "playing", you: 0 },
    });
    const after = f.cruce.view(null).revision;
    expect(after).toBe(before + 1);
    await f.send(1, { type: "sync" }, deadline + 5001);
    expect(f.cruce.view(null).revision).toBe(after);
  });
  it("repairs a complete trick with a missing deadline without fabricating cards", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const f = await setup(),
      deadline = await f.playTrick();
    const restored = new CruceTable(
      { save: async () => {} },
      { ...f.saved(), deadline: null },
    );
    const room = f.makeRoom(restored);
    await room.message(
      f.connections[0],
      JSON.stringify({ type: "sync" }),
      deadline + 5000,
    );
    expect(restored.view(null)).toMatchObject({
      phase: "playing",
      stockCount: 6,
      handCounts: [8, 0, 8, 0],
    });
    expect(f.connections[0].messages.at(-1)).toMatchObject({
      cruceRecovery: { deadline: null, transitioned: true },
    });
    vi.restoreAllMocks();
  });
  it("refreshes a stale client snapshot when the server already collected the trick", async () => {
    const f = await setup(),
      deadline = await f.playTrick();
    await f.cruce.expire(deadline);
    const revision = f.cruce.view(null).revision;
    await f.send(0, { type: "sync" }, deadline + 1000);
    expect(f.connections[0].messages.at(-1)).toMatchObject({
      type: "snapshot",
      cruceRecovery: { phase: "playing", transitioned: false },
      cruce: { phase: "playing", revision },
    });
  });
  it("warns once for AFK, schedules no past-deadline spin and accepts the returning player action", async () => {
    const f = await setup(),
      v = f.cruce.view(null),
      i = [0, 1].find((i) => f.cruce.sideFor(f.actor(i)) === v.turn)!;
    const hand = f.cruce.view(f.actor(i)).hand;
    await f.cruce.expire(v.deadline!);
    expect(f.cruce.view(null)).toMatchObject({
      phase: "playing",
      turnOverdue: true,
      turn: v.turn,
    });
    expect(f.cruce.view(f.actor(i)).hand).toEqual(hand);
    expect(nextCruceDeadline(f.saved())).toBeNull();
    expect(await f.cruce.expire(v.deadline! + 60000)).toBe(false);
    await f.send(
      i,
      {
        type: "cruce-action",
        requestId: "returning-player",
        revision: v.revision,
        action: {
          kind: "play",
          card: f.cruce.view(f.actor(i)).legalCards[0],
          announce: false,
        },
      },
      v.deadline! + 1000,
    );
    expect(f.cruce.view(null).phase).not.toBe("finished");
    expect(f.cruce.view(null).turnOverdue).toBe(false);
    expect(f.cruce.view(f.actor(i)).hand).toHaveLength(hand.length - 1);
  });
});
