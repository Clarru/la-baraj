import { describe, expect, it } from "vitest";
import { MAX_PLAYERS, parseClientMessage, type PlayerPose, type ServerMessage } from "../packages/shared/protocol";
import { RoomCore, type RoomConnection, type SessionState } from "../apps/server/room-core";
import { allowedOrigin, validRoomPath } from "../apps/server/request-policy";
import { HomeAssignments, readHomeLedger, type HomeLedger } from "../apps/server/home-assignments";

const pose: PlayerPose = { position: [7, 2, 10], yaw: 0.5, animation: "Walk", activity: "none", vehicle: "none" };
class FakeConnection implements RoomConnection {
  state: SessionState | null = null;
  messages: ServerMessage[] = [];
  closed: [number, string] | null = null;
  setState(state: SessionState) { this.state = structuredClone(state); }
  send(message: string) { this.messages.push(JSON.parse(message)); }
  close(code: number, reason: string) { this.closed = [code, reason]; }
}
function fixture() {
  const connections: FakeConnection[] = [];
  const saved: { lit: boolean; revision: number }[] = [];
  const homeSaves: HomeLedger[] = [];
  const homes = new HomeAssignments({ save: async (ledger) => { homeSaves.push(structuredClone(ledger)); }, random: () => 0.6 });
  const runtime = { connections: () => connections.filter((c) => !c.closed), saveFire: async (fire: { lit: boolean; revision: number }) => { saved.push(fire); }, homes };
  const room = new RoomCore(runtime);
  const connect = (id: string) => { const c = new FakeConnection(); connections.push(c); room.connect(c, id, 0); return c; };
  const send = (connection: FakeConnection, message: unknown, now = 0) => room.message(connection, JSON.stringify(message), now);
  return { room, connect, send, connections, saved, runtime, homeSaves };
}
const token = (index: number) => index.toString(16).padStart(43, "a");
const homeHello = (index: number, createHome = true) => ({ type: "hello", nickname: "Same nickname", requestHome: true, resumeToken: token(index), ...(createHome ? { createHome: true } : {}) });

describe("bounded friend-room protocol", () => {
  it("copies allowed fields and ignores forged identity", () => {
    expect(parseClientMessage(JSON.stringify({ type: "pose", id: "victim", pose: { ...pose, id: "victim" } }))).toEqual({ type: "pose", pose });
    expect(parseClientMessage(JSON.stringify({ type: "hello", nickname: "  Claudiu  " }))).toEqual({ type: "hello", nickname: "Claudiu" });
  });
  it("rejects malformed, oversized, nonfinite and out-of-bounds data", () => {
    for (const raw of ["{", "null", "[]", "x".repeat(1025), JSON.stringify({ type: "pose", pose: { ...pose, position: [1, 2, null] } }), JSON.stringify({ type: "pose", pose: { ...pose, position: [5001, 0, 0] } }), JSON.stringify({ type: "hello", nickname: "<script>" }), JSON.stringify({ type: "seat", seatId: "__proto__", requestId: "a" })]) expect(parseClientMessage(raw)).toBeNull();
  });
  it("restricts paths and exact origins, including missing origins", () => {
    expect(validRoomPath("/parties/world-room/qwertyuiopasdfghjklzxcv")).toBe(true);
    for (const path of ["/parties/world-room/public", "/parties/other/qwertyuiopasdfghjklzxcv", "/parties/world-room/qwertyuiopasdfghjklzxcv/extra", "/parties/world-room/%2Fqwertyuiopasdfghjklzxcv"]) expect(validRoomPath(path)).toBe(false);
    expect(allowedOrigin("https://friends.example", "https://friends.example,http://localhost:5173")).toBe(true);
    for (const origin of [null, "https://friends.example.attacker.test", "https://friends.example/", "null"]) expect(allowedOrigin(origin, "https://friends.example")).toBe(false);
  });
  it("requires an explicit bounded home capability and ignores ownership overrides", () => {
    expect(parseClientMessage(JSON.stringify({ ...homeHello(1), homeIndex: 25 }))).toEqual(homeHello(1));
    for (const message of [{ ...homeHello(1), resumeToken: "short" }, { type: "hello", nickname: "A", requestHome: true }, { type: "hello", nickname: "A", createHome: true }, { ...homeHello(1), requestHome: false }]) expect(parseClientMessage(JSON.stringify(message))).toBeNull();
  });
});

describe("persistent cabin ownership", () => {
  it("keeps legacy hello clients online without consuming cabins", async () => {
    const f = fixture(), a = f.connect("legacy");
    await f.send(a, { type: "hello", nickname: "Legacy", homeIndex: 18 });
    expect(a.state!.player.nickname).toBe("Legacy");
    expect(a.state!.home).toBeUndefined();
    expect(f.homeSaves).toHaveLength(0);
    expect(a.closed).toBeNull();
    await f.send(a, homeHello(1), 1000);
    expect(a.state!.player.homeIndex).toBe(18);
    expect(f.homeSaves).toHaveLength(1);
  });
  it("assigns distinct random unused homes concurrently and never publishes credentials", async () => {
    const f = fixture(), a = f.connect("public-a"), b = f.connect("public-b");
    await Promise.all([f.send(a, homeHello(1)), f.send(b, homeHello(2))]);
    expect(a.state!.home!.index).toBe(18);
    expect(b.state!.home!.index).not.toBe(18);
    expect(a.state!.home!.index).not.toBe(b.state!.home!.index);
    const aSnapshot = a.messages.findLast((message) => message.type === "snapshot");
    expect(aSnapshot).toMatchObject({ home: { index: 18, resumeToken: token(1) } });
    expect(JSON.stringify(a.messages)).not.toContain(token(2));
    expect(JSON.stringify(b.messages)).not.toContain(token(1));
    expect(JSON.stringify(f.homeSaves)).not.toContain(token(1));
    expect(JSON.stringify(f.homeSaves)).not.toContain(token(2));
    for (const message of [...a.messages, ...b.messages]) if (message.type !== "snapshot") expect(JSON.stringify(message)).not.toContain("resumeToken");
  });
  it("deduplicates simultaneous first hellos and retries after a lost acknowledgement", async () => {
    const f = fixture(), a = f.connect("a");
    await Promise.all([f.send(a, homeHello(1)), f.send(a, homeHello(1))]);
    expect(f.homeSaves).toHaveLength(1);
    a.close(1000, "lost ack");
    const b = f.connect("new-public-id");
    await f.send(b, homeHello(1));
    expect(b.state!.home!.index).toBe(a.state!.home!.index);
    expect(b.state!.player.id).not.toBe(a.state!.player.id);
    expect(f.homeSaves).toHaveLength(1);
  });
  it("resumes an allocation when the first socket disconnects during its storage write", async () => {
    const f = fixture(), a = f.connect("departing");
    let finishWrite!: () => void, startWrite!: () => void, writes = 0;
    const writing = new Promise<void>((resolve) => { startWrite = resolve; });
    const homes = new HomeAssignments({ save: async () => {
      writes++;
      startWrite();
      await new Promise<void>((resolve) => { finishWrite = resolve; });
    } });
    const room = new RoomCore({ ...f.runtime, homes });
    const first = room.message(a, JSON.stringify(homeHello(1)), 0);
    await writing;
    a.close(1000, "connection dropped");
    const messagesBefore = a.messages.length;
    finishWrite(); await first;
    expect(a.messages).toHaveLength(messagesBefore);
    const b = f.connect("retry");
    await room.message(b, JSON.stringify(homeHello(1)), 1000);
    expect(b.state!.home).toBeDefined();
    expect(writes).toBe(1);
  });
  it("preserves a newer nickname, pose, and seat while an earlier home hello awaits storage", async () => {
    const f = fixture(), a = f.connect("a"), observer = f.connect("observer");
    let finishWrite!: () => void, startWrite!: () => void;
    const writing = new Promise<void>((resolve) => { startWrite = resolve; });
    const homes = new HomeAssignments({ save: async () => {
      startWrite();
      await new Promise<void>((resolve) => { finishWrite = resolve; });
    } });
    const room = new RoomCore({ ...f.runtime, homes });
    const first = room.message(a, JSON.stringify({ ...homeHello(1), nickname: "Earlier" }), 0);
    await writing;
    expect(a.state!.player.nickname).toBe("Earlier");
    await room.message(a, JSON.stringify({ type: "hello", nickname: "Newest" }), 100);
    await room.message(a, JSON.stringify({ type: "pose", pose }), 100);
    await room.message(a, JSON.stringify({ type: "seat", seatId: "bench:seat:0", requestId: "seat" }), 100);
    finishWrite(); await first;
    expect(a.state!.player).toMatchObject({ ...pose, nickname: "Newest", seatId: "bench:seat:0", homeIndex: a.state!.home!.index });
    expect(observer.messages.at(-1)).toMatchObject({ type: "pose", player: { ...pose, nickname: "Newest", seatId: "bench:seat:0", homeIndex: a.state!.home!.index } });
    expect(a.messages.at(-1)).toMatchObject({ type: "snapshot", players: expect.arrayContaining([expect.objectContaining({ id: "a", nickname: "Newest" })]) });
  });
  it("restores ownership after storage reload and hibernation, including older attachments", async () => {
    const f = fixture(), a = f.connect("a");
    await f.send(a, homeHello(1));
    const homes = new HomeAssignments({ save: async () => { throw Error("Unexpected extra allocation"); } }, f.homeSaves.at(-1));
    const recovered = new RoomCore({ ...f.runtime, homes });
    await recovered.message(a, JSON.stringify({ type: "sync" }), 1000);
    expect(a.messages.at(-1)).toMatchObject({ type: "snapshot", home: a.state!.home });
    a.close(1000, "left");
    const b = f.connect("b");
    await recovered.message(b, JSON.stringify(homeHello(1, false)), 1000);
    expect(b.state!.home!.index).toBe(a.state!.home!.index);
    expect(b.messages.at(-1)).toMatchObject({ type: "snapshot", home: a.state!.home });
  });
  it("retains offline homes and resumes existing owners when all thirty plots are reserved", async () => {
    let stored: HomeLedger | undefined;
    const homes = new HomeAssignments({ save: async (ledger) => { stored = structuredClone(ledger); } });
    const results = await Promise.all(Array.from({ length: 30 }, (_, i) => homes.claim(token(i), true)));
    expect(new Set(results.map((home) => home.index)).size).toBe(30);
    expect(stored!.owners).toHaveLength(30);
    const recovered = new HomeAssignments({ save: async () => { throw Error("No new writes expected"); } }, stored);
    await expect(recovered.claim(token(31), true)).rejects.toMatchObject({ code: "homes-full" });
    await expect(recovered.claim(token(5), false)).resolves.toEqual(results[5]);
    await expect(recovered.claim(token(5), true)).resolves.toEqual(results[5]);
  });
  it("rejects unknown resume and attempts to override or switch ownership", async () => {
    const f = fixture(), a = f.connect("a"), b = f.connect("b");
    await f.send(a, { ...homeHello(1), homeIndex: 0 });
    const assigned = a.state!.home!.index;
    await f.send(a, { type: "pose", homeIndex: 0, pose: { ...pose, homeIndex: 0 } });
    expect(a.state!.player.homeIndex).toBe(assigned);
    await f.send(b, homeHello(2, false));
    expect(b.closed?.[0]).toBe(1008);
    expect(b.messages.at(-1)).toMatchObject({ type: "error", code: "invalid-resume" });
    await f.send(a, homeHello(2), 1000);
    expect(a.closed?.[0]).toBe(1008);
    expect(f.homeSaves).toHaveLength(1);
  });
  it("gives concurrent tabs of one anonymous owner the same cabin and distinct player IDs", async () => {
    const f = fixture(), a = f.connect("tab-a"), b = f.connect("tab-b");
    await Promise.all([f.send(a, homeHello(1)), f.send(b, homeHello(1))]);
    expect(a.state!.home).toEqual(b.state!.home);
    expect(a.state!.player.id).not.toBe(b.state!.player.id);
    expect(f.homeSaves).toHaveLength(1);
  });
  it("does not commit a failed write and fails closed on corrupt persisted ownership", async () => {
    let fail = true;
    const homes = new HomeAssignments({ save: async () => { if (fail) throw Error("Storage unavailable"); }, random: () => 0.1 });
    await expect(homes.claim(token(1), true)).rejects.toThrow("Storage unavailable");
    fail = false;
    await expect(homes.claim(token(1), true)).resolves.toMatchObject({ index: 3 });
    await expect(homes.claim(token(2), true)).resolves.toMatchObject({ index: 2 });
    const duplicate = { version: 1, owners: [{ digest: "a".repeat(64), index: 0 }, { digest: "b".repeat(64), index: 0 }] };
    expect(() => readHomeLedger(duplicate)).toThrow("Invalid stored home ledger");
  });
});

describe("room behavior", () => {
  it("sends snapshots and broadcasts presence with server-owned identities", async () => {
    const f = fixture(), a = f.connect("server-a"), b = f.connect("server-b");
    expect(b.messages[0]).toMatchObject({ type: "snapshot", selfId: "server-b", version: 1, players: [{ id: "server-a" }, { id: "server-b" }] });
    expect(a.messages.at(-1)).toMatchObject({ type: "joined", player: { id: "server-b" } });
    await f.send(a, { type: "pose", id: "server-b", pose: { ...pose, id: "server-b", seatId: "bench:seat:0" } });
    expect(b.messages.at(-1)).toEqual({ type: "pose", player: { ...pose, id: "server-a", nickname: "Guest" } });
  });
  it("caps active connections at thirty", () => {
    const f = fixture();
    for (let i = 0; i < MAX_PLAYERS; i++) expect(f.connect(String(i)).closed).toBeNull();
    expect(f.connect("overflow").closed?.[0]).toBe(1008);
  });
  it("rejects duplicate seats, preserves an old claim on rejection, and releases on departure", async () => {
    const f = fixture(), a = f.connect("a"), b = f.connect("b");
    await f.send(a, { type: "seat", seatId: "bench:seat:0", requestId: "one" });
    await f.send(b, { type: "seat", seatId: "bench:seat:1", requestId: "two" });
    await f.send(b, { type: "seat", seatId: "bench:seat:0", requestId: "three" });
    expect(b.messages).toContainEqual(expect.objectContaining({ type: "seat-result", requestId: "three", accepted: false, seatId: "bench:seat:1" }));
    expect(b.state!.player.seatId).toBe("bench:seat:1");
    a.close(1000, "done"); f.room.disconnect(a);
    expect(b.messages.at(-1)).toEqual({ type: "seats", seats: { "bench:seat:1": "b" } });
    await f.send(b, { type: "seat", seatId: "bench:seat:0", requestId: "four" });
    expect(b.state!.player.seatId).toBe("bench:seat:0");
    await f.send(b, { type: "seat", seatId: null, requestId: "five" });
    expect(b.state!.player.seatId).toBeUndefined();
  });
  it("persists fire changes and reconstructs pose/seat/rate state after hibernation", async () => {
    const f = fixture(), a = f.connect("a");
    await f.send(a, { type: "seat", seatId: "bench:seat:0", requestId: "seat" });
    await f.send(a, { type: "pose", pose });
    await f.send(a, { type: "fire", lit: false });
    expect(f.saved).toEqual([{ lit: false, revision: 1 }]);
    const recovered = new RoomCore(f.runtime, f.saved[0]);
    await recovered.message(a, JSON.stringify({ type: "sync" }), 1000);
    expect(a.messages.at(-1)).toMatchObject({ type: "snapshot", selfId: "a", fire: { lit: false, revision: 1 }, seats: { "bench:seat:0": "a" }, players: [{ ...pose, seatId: "bench:seat:0" }] });
  });
  it("limits sustained pose broadcasts and closes abusive packets", async () => {
    const f = fixture(), a = f.connect("a"), b = f.connect("b");
    b.messages = [];
    for (let i = 0; i < 20; i++) await f.send(a, { type: "pose", pose });
    expect(b.messages.filter((m) => m.type === "pose")).toHaveLength(3);
    await f.send(a, { type: "pose", pose }, 100);
    expect(b.messages.filter((m) => m.type === "pose")).toHaveLength(4);
    for (let i = 0; i < 3; i++) await f.room.message(a, new ArrayBuffer(5), 200);
    expect(a.closed?.[0]).toBe(1008);
  });
  it("reverts a failed fire write and sends the authoritative snapshot", async () => {
    const f = fixture(), a = f.connect("a");
    const room = new RoomCore({ ...f.runtime, saveFire: async () => { throw Error("unavailable"); } });
    await room.message(a, JSON.stringify({ type: "fire", lit: false }), 1000);
    expect(a.messages.at(-1)).toMatchObject({ type: "snapshot", fire: { lit: true, revision: 0 } });
  });
});
