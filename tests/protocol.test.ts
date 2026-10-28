import { describe, expect, it } from "vitest";
import { MAX_PLAYERS, parseClientMessage, type PlayerPose, type ServerMessage } from "../packages/shared/protocol";
import { RoomCore, type RoomConnection, type SessionState } from "../apps/server/room-core";
import { allowedOrigin, validRoomPath } from "../apps/server/request-policy";

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
  const runtime = { connections: () => connections.filter((c) => !c.closed), saveFire: async (fire: { lit: boolean; revision: number }) => { saved.push(fire); } };
  const room = new RoomCore(runtime);
  const connect = (id: string) => { const c = new FakeConnection(); connections.push(c); room.connect(c, id, 0); return c; };
  const send = (connection: FakeConnection, message: unknown, now = 0) => room.message(connection, JSON.stringify(message), now);
  return { room, connect, send, connections, saved, runtime };
}

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
