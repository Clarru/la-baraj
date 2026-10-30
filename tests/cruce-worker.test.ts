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
import {
  beginCruceRound,
  suitOf,
  type CruceAction,
  type CruceSeat,
} from "../packages/shared/cruce";
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
  expect(t.view(null).phase).toBe("bidding");
  for (let s = 0; s < 4; s++)
    await act(t, t.view(null).turn!, { kind: "bid", value: s ? 0 : 1 });
}
describe("Cruce authoritative table", () => {
  it("deals once after readiness, rejects legacy cut packets and immediately redeals after all pass", async () => {
    const { t } = await table();
    for (let seat = 0; seat < 4; seat++) await act(t, seat, { kind: "ready" });
    const before = t.view(null),
      hands = actors.map((a) => t.view(a).hand);
    expect(before.phase).toBe("bidding");
    expect(hands.flat()).toHaveLength(24);
    await expect(
      act(t, before.turn!, { kind: "cut", cut: false }),
    ).rejects.toThrow(/împărțite/);
    expect(actors.map((a) => t.view(a).hand)).toEqual(hands);
    expect(t.view(null).revision).toBe(before.revision);
    for (let i = 0; i < 4; i++)
      await act(t, t.view(null).turn!, { kind: "bid", value: 0 });
    expect(t.view(null)).toMatchObject({
      phase: "bidding",
      round: before.round + 1,
    });
    expect(new Set(actors.flatMap((a) => t.view(a).hand)).size).toBe(24);
  });
  it("settles a restored online cut once, waits for absent members and preserves state on failed save", async () => {
    const { saved } = await table();
    const legacy = structuredClone(saved());
    legacy.game = beginCruceRound(legacy.game, () => 0.43);
    legacy.deadline = null;
    let fail = true;
    const restored = new CruceTable(
      {
        save: async () => {
          if (fail) throw Error("storage down");
        },
      },
      legacy,
    );
    await expect(restored.expire(2000)).rejects.toThrow("storage down");
    expect(restored.view(null).phase).toBe("cut");
    fail = false;
    expect(await restored.expire(2001)).toBe(true);
    const dealt = actors.map((a) => restored.view(a).hand);
    expect(dealt.flat()).toHaveLength(24);
    expect(await restored.expire(2002)).toBe(false);
    expect(actors.map((a) => restored.view(a).hand)).toEqual(dealt);
    legacy.members[0]!.awayUntil = 10000;
    const paused = new CruceTable({ save: async () => {} }, legacy);
    expect(await paused.expire(2000)).toBe(false);
    expect(paused.view(null).phase).toBe("cut");
    await paused.resume({ ...actors[0], socket: "returned" }, 2001);
    expect(paused.view(null).phase).toBe("bidding");
    expect(paused.view({ ...actors[0], socket: "returned" }).hand).toHaveLength(
      6,
    );
  });
  it("does not persist an automatic deal from an inconsistent legacy cut record", async () => {
    const { saved } = await table(),
      legacy = structuredClone(saved());
    legacy.game = beginCruceRound(legacy.game, () => 0.43);
    legacy.deadline = null;
    legacy.game.hands[0].push(legacy.game.stock.shift()!);
    let saves = 0;
    const restored = new CruceTable(
      {
        save: async () => {
          saves++;
        },
      },
      legacy,
    );
    await expect(restored.expire(2000)).rejects.toThrow(/împărțirea automată/);
    expect(saves).toBe(0);
    expect(restored.view(null).phase).toBe("cut");
    expect(restored.view(actors[0]).hand).toHaveLength(1);
  });
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
    expect(t.view(null).phase).toBe("bidding");
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
  it("automatically seats every two-player pairing opposite and keeps host/request identity", async () => {
    for (const first of [0, 1, 2, 3] as const)
      for (const second of [0, 1, 2, 3] as const) {
        if (first === second) continue;
        const t = new CruceTable({ save: async () => {} });
        await t.join(actors[first], first, 1000);
        await t.join(actors[second], second, 1000);
        const revision = t.view(null).revision,
          settings = {
            mode: "duel" as const,
            target: 11 as const,
            iber: false,
            cheating: false,
          };
        await t.act(
          actors[first],
          { kind: "configure", settings },
          "duel",
          revision,
          1100,
        );
        const a = t.view(actors[first]),
          b = t.view(actors[second]);
        expect([a.you, b.you].sort()).toEqual([0, 2]);
        expect(a.host).toBe(a.you);
        expect(a.players.filter(Boolean)).toHaveLength(2);
        expect(a.players.every((p) => !p?.ready)).toBe(true);
        const applied = a.revision;
        await t.act(
          actors[first],
          { kind: "configure", settings },
          "duel",
          revision,
          1101,
        );
        expect(t.view(null).revision).toBe(applied);
        await expect(
          t.act(actors[second], { kind: "ready" }, "stale", revision, 1102),
        ).rejects.toThrow(/actualizat/);
        await Promise.all(
          [actors[first], actors[second]].map((actor, index) =>
            t.act(actor, { kind: "ready" }, `ready${index}`, applied, 1200),
          ),
        );
        expect(t.view(null).phase).toBe("bidding");
      }
  });
  it("handles three-player capacity, reservations and failed persistence without ejecting anybody", async () => {
    let fail = false;
    const t = new CruceTable({
      save: async () => {
        if (fail) throw Error("storage down");
      },
    });
    for (const seat of [0, 2, 3] as const)
      await t.join(actors[seat], seat, 1000);
    const before = t.view(null);
    await expect(
      act(
        t,
        0,
        {
          kind: "configure",
          settings: { mode: "duel", target: 11, iber: false, cheating: false },
        },
        1100,
      ),
    ).rejects.toThrow(/3 jucători/);
    expect(t.view(null)).toEqual(before);
    fail = true;
    await expect(
      act(
        t,
        0,
        {
          kind: "configure",
          settings: {
            mode: "trio-standard",
            target: 11,
            iber: false,
            cheating: false,
          },
        },
        1100,
      ),
    ).rejects.toThrow("storage down");
    expect(t.view(null)).toEqual(before);
    fail = false;
    await t.disconnect(actors[3], 1150);
    await act(
      t,
      0,
      {
        kind: "configure",
        settings: {
          mode: "trio-standard",
          target: 11,
          iber: false,
          cheating: false,
        },
      },
      1200,
    );
    expect(t.view(null).players[3]).toBeNull();
    expect(t.view(null).players[1]?.online).toBe(false);
    const replacement = { ...actors[3], socket: "rejoined-reservation" };
    expect(await t.resume(replacement, 1300)).toBe(1);
    expect(t.view(replacement).you).toBe(1);
  });
  it("plays and scores a complete duel after automatic reseating and mid-hand reconnect", async () => {
    const people = [{ ...actors[1] }, { ...actors[3] }],
      t = new CruceTable({ save: async () => {}, random: () => 0.43 });
    let now = 1000,
      plays = 0,
      resumed = false;
    await t.join(people[0], 1, now);
    await t.join(people[1], 3, now);
    await t.act(
      people[0],
      {
        kind: "configure",
        settings: { mode: "duel", target: 11, iber: false, cheating: false },
      },
      "configure",
      t.view(null).revision,
      ++now,
    );
    for (const actor of people)
      await t.act(
        actor,
        { kind: "ready" },
        `ready:${actor.socket}`,
        t.view(null).revision,
        ++now,
      );
    for (
      let step = 0;
      step < 100 && !["round-end", "finished"].includes(t.view(null).phase);
      step++
    ) {
      const v = t.view(null);
      if (v.phase === "trick") {
        now = v.deadline!;
        await t.expire(now);
        continue;
      }
      if (plays === 2 && !resumed) {
        const old = people[1],
          seat = t.sideFor(old),
          hand = t.view(old).hand;
        await t.disconnect(old, ++now);
        people[1] = { ...old, socket: "duel-reconnect" };
        expect(await t.resume(people[1], ++now)).toBe(seat);
        expect(t.view(people[1]).hand).toEqual(hand);
        resumed = true;
      }
      const current = t.view(null),
        actor = people.find((a) => t.sideFor(a) === current.turn)!;
      let action: CruceAction;
      if (current.phase === "cut") action = { kind: "cut", cut: false };
      else if (current.phase === "bidding")
        action = { kind: "bid", value: current.bid ? 0 : 1 };
      else if (current.phase === "trump")
        action = { kind: "trump", suit: suitOf(t.view(actor).hand[0]) };
      else {
        expect(current.phase).toBe("playing");
        action = {
          kind: "play",
          card: t.view(actor).legalCards[0],
          announce: false,
        };
        plays++;
      }
      await t.act(actor, action, `step${step}`, current.revision, ++now);
    }
    expect(plays).toBe(24);
    expect(resumed).toBe(true);
    expect(t.view(null).phase).toBe("round-end");
    const result = t.view(null);
    expect(result.roundPoints.reduce((a, b) => a + b, 0)).toBe(
      120 + result.announcements.reduce((a, b) => a + b, 0),
    );
    await Promise.all(
      people.map((actor, i) =>
        t.act(
          actor,
          { kind: "continue" },
          `continue${i}`,
          result.revision,
          ++now,
        ),
      ),
    );
    expect(t.view(null)).toMatchObject({
      phase: "bidding",
      round: result.round + 1,
      scores: result.scores,
    });
    expect(people.map((a) => t.view(a).hand.length)).toEqual([8, 8]);
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
  it("broadcasts reseated identities and rejects queued old positions without losing either player", async () => {
    const connections = [new Connection(), new Connection()],
      cruce = new CruceTable({ save: async () => {} });
    const room = new RoomCore({
      connections: () => connections,
      saveFire: async () => {},
      homes: new HomeAssignments({ save: async () => {} }),
      cruce,
    });
    let now = 100000;
    const send = async (i: number, m: ClientMessage) => {
      now += 1000;
      await room.message(connections[i], JSON.stringify(m), now);
    };
    for (const i of [0, 1]) {
      room.connect(connections[i], `pair${i}`, now);
      await send(i, { type: "hello", nickname: `Pair ${i}` });
      const seat = (i ? 3 : 1) as CruceSeat;
      await send(i, {
        type: "pose",
        pose: {
          ...cruceSeatPose(seat),
          animation: "Idle_Neutral",
          activity: "none",
          vehicle: "none",
        },
      });
      await send(i, {
        type: "seat",
        seatId: CRUCE_SEATS[seat],
        requestId: `join${i}`,
      });
    }
    await send(0, {
      type: "cruce-action",
      requestId: "duel",
      revision: cruce.view(null).revision,
      action: {
        kind: "configure",
        settings: { mode: "duel", target: 11, iber: false, cheating: false },
      },
    });
    for (const i of [0, 1]) {
      const seat = (i ? 2 : 0) as CruceSeat;
      expect(connections[i].state!.player.seatId).toBe(CRUCE_SEATS[seat]);
      expect(connections[i].state!.player.position).toEqual(
        cruceSeatPose(seat).position,
      );
      expect(
        connections[i].messages.filter((m) => m.type === "cruce").at(-1),
      ).toMatchObject({ view: { you: seat, settings: { mode: "duel" } } });
      await send(i, {
        type: "pose",
        pose: {
          ...cruceSeatPose((i ? 3 : 1) as CruceSeat),
          animation: "Idle_Neutral",
          activity: "none",
          vehicle: "none",
        },
      });
      expect(connections[i].state!.player.position).toEqual(
        cruceSeatPose(seat).position,
      );
      expect(connections[i].state!.player.activity).toBe("sit");
    }
    const revision = cruce.view(null).revision;
    await Promise.all(
      [0, 1].map((i) =>
        send(i, {
          type: "cruce-action",
          requestId: `ready${i}`,
          revision,
          action: { kind: "ready" },
        }),
      ),
    );
    expect(cruce.view(null).phase).toBe("bidding");
    expect(cruce.view(null).players.filter(Boolean)).toHaveLength(2);
  });

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
