import {
  RoomCore,
  type RoomConnection,
  type SessionState,
} from "../apps/server/room-core";
import { HomeAssignments } from "../apps/server/home-assignments";
import { CRUCE_SEATS, cruceSeatPose } from "../packages/shared/cruce-station";
import { PLANES_SEATS } from "../packages/shared/planes-station";
import type { ClientMessage, ServerMessage } from "../packages/shared/protocol";
import { describe, it, expect } from "vitest";
import {
  CruceTable,
  readCruceRecord,
  nextCruceDeadline,
  type CruceRecord,
} from "../apps/server/cruce-table";
import { type TableActor } from "../apps/server/planes-table";
import { parseClientMessage } from "../packages/shared/protocol";
import { nextWorldDeadline } from "../apps/server/world-alarm";
import type { CruceAction, CruceSeat } from "../packages/shared/cruce";
const actors: TableActor[] = [0, 1, 2, 3].map((i) => ({
  owner: `home:2:${i}`,
  socket: `s${i}`,
  name: `Player ${i}`,
}));
let sequence = 0;
async function table() {
  let saved: CruceRecord | undefined;
  let fail = false;
  const t = new CruceTable({
    save: async (r) => {
      if (fail) throw Error("storage down");
      saved = structuredClone(r);
    },
    random: () => 0.43,
  });
  for (const s of [0, 1, 2, 3] as CruceSeat[]) await t.join(actors[s], s, 1000);
  return {
    t,
    saved: () => saved!,
    fail: (v: boolean) => {
      fail = v;
    },
  };
}
async function act(
  t: CruceTable,
  seat: number,
  action: CruceAction,
  now = 1100,
) {
  await t.act(
    actors[seat],
    action,
    `r${++sequence}`,
    t.view(actors[seat]).revision,
    now,
  );
}
async function start(t: CruceTable) {
  for (let s = 0; s < 4; s++) await act(t, s, { kind: "ready" });
  await act(t, t.view(null).turn!, { kind: "cut", cut: false });
  for (let s = 0; s < 4; s++)
    await act(t, t.view(null).turn!, { kind: "bid", value: s ? 0 : 1 });
}
describe("Cruce authoritative table", () => {
  it("filters packets and strips additional client fields", () => {
    const packet = (action: unknown) =>
      JSON.stringify({
        type: "cruce-action",
        requestId: "abc",
        revision: 0,
        action,
      });
    expect(
      parseClientMessage(packet({ kind: "play", card: 24, announce: false })),
    ).toBeNull();
    expect(parseClientMessage(packet({ kind: "bid", value: 1.5 }))).toBeNull();
    expect(
      parseClientMessage(
        packet({
          kind: "configure",
          settings: {
            mode: "duel",
            target: 11,
            iber: false,
            cheating: false,
            hands: [[5]],
          },
        }),
      ),
    ).toMatchObject({ action: { settings: { mode: "duel" } } });
    expect(
      JSON.stringify(
        parseClientMessage(
          packet({ kind: "play", card: 5, announce: false, hands: [[5]] }),
        ),
      ),
    ).not.toContain("hands");
  });
  it("never publishes other hands, the stock, captures or offence audit", async () => {
    const { t } = await table();
    await start(t);
    for (const a of [...actors, null]) {
      const v = t.view(a);
      expect(v.hand).toHaveLength(a ? 6 : 0);
      for (const key of [
        "hands",
        "stock",
        "captured",
        "violations",
        "owner",
        "socket",
        "requests",
      ])
        expect(JSON.stringify(v)).not.toContain(`"${key}"`);
    }
    expect(new Set(actors.flatMap((a) => t.view(a).hand)).size).toBe(24);
  });
  it("rejects spectators, stale revisions, out-of-turn actions and replayed requests safely", async () => {
    const { t } = await table();
    await start(t);
    const v = t.view(null),
      seat = v.turn!,
      a = actors[seat],
      card = t.view(a).hand[0];
    await expect(
      t.act(
        { owner: "watcher", socket: "w", name: "Watcher" },
        { kind: "play", card, announce: false },
        "watch",
        v.revision,
      ),
    ).rejects.toThrow(/mas[aă]/);
    await expect(
      t.act(
        actors[(seat + 1) % 4],
        { kind: "play", card, announce: false },
        "turn",
        v.revision,
        1200,
      ),
    ).rejects.toThrow(/rândul/);
    await t.act(
      a,
      { kind: "play", card, announce: false },
      "same",
      v.revision,
      1200,
    );
    await t.act(
      a,
      { kind: "play", card, announce: false },
      "same",
      v.revision,
      1200,
    );
    expect(t.view(null).trick).toHaveLength(1);
    await expect(
      t.act(
        a,
        { kind: "play", card, announce: false },
        "stale",
        v.revision,
        1200,
      ),
    ).rejects.toThrow(/actualizat/);
  });
  it("commits before publishing; storage errors leave the old move and revision intact", async () => {
    const { t, fail } = await table();
    await start(t);
    const v = t.view(null),
      a = actors[v.turn!];
    const before = t.view(a);
    fail(true);
    await expect(
      t.act(
        a,
        { kind: "play", card: before.hand[0], announce: false },
        "fail",
        v.revision,
        1200,
      ),
    ).rejects.toThrow("storage down");
    expect(t.view(a)).toEqual(before);
  });
  it("resumes a private hand after hibernation, pauses clocks and releases expired seats", async () => {
    const { t, saved } = await table();
    await start(t);
    const before = t.view(actors[0]).hand;
    await t.disconnect(actors[0], 2000);
    expect(t.view(null).deadline).toBeNull();
    expect(nextCruceDeadline(saved())).toBe(32_000);
    expect(nextWorldDeadline(undefined, undefined, undefined, saved())).toBe(
      32_000,
    );
    const restored = new CruceTable({ save: async () => {} }, saved());
    const reconnected = { ...actors[0], socket: "new-socket" };
    expect(await restored.resume(reconnected, 3000)).toBe(0);
    expect(restored.view(reconnected).hand).toEqual(before);
    expect(restored.view(actors[0]).hand).toEqual([]);
    await restored.disconnect(reconnected, 4000);
    await restored.expire(34_000);
    expect(restored.view(null).players[0]).toBeNull();
    expect(restored.view(null).phase).toBe("finished");
  });
  it("retains an observed disconnect through storage failure and retries flush", async () => {
    const { t, fail } = await table();
    await start(t);
    fail(true);
    await expect(t.disconnect(actors[0], 2000)).rejects.toThrow();
    expect(t.needsFlush).toBe(true);
    expect(t.view(actors[0]).you).toBeNull();
    fail(false);
    await t.flush();
    expect(t.needsFlush).toBe(false);
  });
  it("serializes two claims for one seat and rejects concurrent ownership in another tab", async () => {
    const t = new CruceTable({ save: async () => {} });
    const results = await Promise.allSettled([
      t.join(actors[0], 0),
      t.join(actors[1], 0),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "rejected"]);
    await expect(
      t.join({ ...actors[0], socket: "other-tab" }, 0),
    ).rejects.toThrow(/altă filă/);
    await t.join(actors[0], 1);
    expect(t.view(actors[0]).you).toBe(1);
    expect(t.view(null).players[0]).toBeNull();
  });
  it("keeps the first sitter as rule owner across later arrivals, moves, and session identity binding", async () => {
    const t = new CruceTable({ save: async () => {} });
    const first = { ...actors[2], owner: "session:s2" };
    await t.join(first, 2, 1000);
    await t.join(actors[0], 0, 1000);
    expect(t.view(null).host).toBe(2);
    await expect(
      t.act(
        actors[0],
        {
          kind: "configure",
          settings: {
            mode: "four-classic",
            target: 11,
            iber: false,
            cheating: false,
          },
        },
        "not-host",
        t.view(null).revision,
        1200,
      ),
    ).rejects.toThrow(/primul jucător/);
    await t.bindActor(actors[2]);
    expect(t.view(null).host).toBe(2);
    await t.join(actors[2], 1, 1300);
    expect(t.view(null).host).toBe(1);
    await t.leave(actors[2]);
    expect(t.view(null).host).toBe(0);
  });
  it("accepts simultaneous readiness from one unchanged configuration but rejects stale rule confirmation", async () => {
    const { t } = await table();
    const revision = t.view(null).revision;
    await Promise.all(
      actors.map((a, i) =>
        t.act(a, { kind: "ready" }, `parallel:${i}`, revision, 1100),
      ),
    );
    expect(t.view(null).phase).toBe("cut");
    const other = await table();
    const oldRevision = other.t.view(null).revision;
    await act(other.t, 0, {
      kind: "configure",
      settings: {
        mode: "four-classic",
        target: 21,
        iber: true,
        cheating: false,
      },
    });
    await expect(
      other.t.act(
        actors[1],
        { kind: "ready" },
        "stale-config",
        oldRevision,
        1200,
      ),
    ).rejects.toThrow(/actualizat/);
  });
  it("cannot move to a different physical seat during a hand or extend a turn by reclaiming the same seat", async () => {
    const { t } = await table();
    await start(t);
    const before = t.view(actors[0]);
    await t.join(actors[0], 0, 2000);
    expect(t.view(actors[0]).revision).toBe(before.revision);
    expect(t.view(null).deadline).toBe(before.deadline);
    await expect(t.join(actors[0], 1, 2000)).rejects.toThrow();
  });
  it("rejects corrupt saved decks rather than duplicating cards", async () => {
    const { t, saved } = await table();
    await start(t);
    const r = saved();
    r.game.hands[0][0] = r.game.hands[0][1];
    expect(() => readCruceRecord(r)).toThrow(/deck/);
  });
});

class Connection implements RoomConnection {
  state: SessionState | null = null;
  messages: ServerMessage[] = [];
  setState(state: SessionState) {
    this.state = structuredClone(state);
  }
  send(raw: string) {
    this.messages.push(JSON.parse(raw));
  }
  close() {
    this.state = null;
  }
}
describe("Cruce room integration", () => {
  it("requires proximity, reserves authoritative seats and retains Cruce on rejected Planes transfer", async () => {
    const connections = [
      new Connection(),
      new Connection(),
      new Connection(),
      new Connection(),
    ];
    const cruce = new CruceTable({ save: async () => {} });
    const room = new RoomCore({
      connections: () => connections,
      saveFire: async () => {},
      homes: new HomeAssignments({ save: async () => {} }),
      cruce,
    });
    let now = 100_000;
    const send = async (i: number, m: ClientMessage) => {
      now += 1000;
      await room.message(connections[i], JSON.stringify(m), now);
    };
    for (let i = 0; i < 4; i++) {
      room.connect(connections[i], `p${i}`, now);
      await send(i, { type: "hello", nickname: `Player ${i}` });
    }
    await send(0, { type: "seat", seatId: CRUCE_SEATS[0], requestId: "far" });
    expect(connections[0].messages.at(-1)).toMatchObject({
      type: "seat-result",
      accepted: false,
      reason: "Apropie-te de masa de Cruce înainte de a ocupa un loc.",
    });
    for (const i of [0, 1, 2, 3] as CruceSeat[]) {
      await send(i, {
        type: "pose",
        pose: {
          ...cruceSeatPose(i),
          animation: "Idle_Neutral",
          activity: "none",
          vehicle: "none",
        },
      });
      await send(i, {
        type: "seat",
        seatId: CRUCE_SEATS[i],
        requestId: `sit${i}`,
      });
    }
    expect(cruce.view(null).players.every(Boolean)).toBe(true);
    await send(0, {
      type: "seat",
      seatId: PLANES_SEATS[0],
      requestId: "transfer",
    });
    expect(connections[0].messages.at(-1)).toMatchObject({
      type: "seat-result",
      accepted: false,
    });
    expect(connections[0].state!.player.seatId).toBe(CRUCE_SEATS[0]);
    expect(cruce.view(null).players[0]).not.toBeNull();
    const previous = cruce.view(null).revision;
    await send(0, {
      type: "cruce-action",
      requestId: "ready",
      revision: previous,
      action: { kind: "ready" },
    });
    expect(connections[0].messages.at(-1)).toMatchObject({
      type: "cruce",
      requestId: "ready",
      view: { you: 0 },
    });
    await send(0, { type: "seat", seatId: null, requestId: "leave" });
    expect(cruce.view(null).players[0]).toBeNull();
  });
});
