import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { sockets } = vi.hoisted(() => ({ sockets: [] as FakeSocket[] }));
type FakeSocket = EventTarget & { readyState: number; sent: Record<string, unknown>[]; open(): void; receive(message: unknown): void; close(): void };
vi.mock("partysocket", () => ({ default: class extends EventTarget {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  constructor() { super(); sockets.push(this); }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  receive(message: unknown) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) })); }
  close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
} }));
import { MultiplayerRoom } from "./multiplayer";
const roomId = "friends_room_with_128bits_12345";
const self = { id: "self-1", nickname: "Me", position: [45, 2, 27], yaw: 0, animation: "Idle_Neutral", activity: "none", vehicle: "none" };
const friend = { ...self, id: "friend-1", nickname: "Friend" };
const sample = { feet: [45, 2, 27], facing: [0, 0, 1], animation: "Walk", activity: "none", velocity: [0, 0, 3], jumpPhase: "grounded", vehicle: null };
function snapshot(socket: FakeSocket, selfId = "self-1") { socket.receive({ type: "snapshot", version: 1, selfId, players: [{ ...self, id: selfId }, friend], fire: { lit: true, revision: 0 }, seats: {} }); }
beforeEach(() => {
  sockets.length = 0;
  vi.stubEnv("VITE_ROOM_SERVER_URL", "https://rooms.example.test");
  vi.stubGlobal("location", { href: `https://lake.example.test/?room=${roomId}` });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  vi.spyOn(performance, "now").mockReturnValue(1000);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("friends room client", () => {
  it("retains invite room and publishes the latest feet pose immediately after a snapshot", () => {
    const room = new MultiplayerRoom();
    expect(room.roomId).toBe(roomId);
    room.publishMotion(sample);
    const disconnect = room.connect(), socket = sockets[0];
    socket.open(); snapshot(socket);
    expect(room.getSnapshot()).toMatchObject({ status: "online", count: 2, selfId: "self-1", ids: ["friend-1"], fireLit: true });
    expect(socket.sent.find((message) => message.type === "pose")).toEqual({ type: "pose", pose: { position: [45, 2, 27], yaw: 0, animation: "Walk", activity: "none", vehicle: "none", jumpPhase: "grounded", speed: 3 } });
    disconnect();
  });
  it("generates a random shareable room when the URL has no valid room", () => {
    vi.stubGlobal("location", { href: "https://lake.example.test/?room=invalid" });
    const first = new MultiplayerRoom(), second = new MultiplayerRoom();
    expect(first.roomId).toMatch(/^[A-Za-z0-9_-]{22,80}$/);
    expect(second.roomId).not.toBe(first.roomId);
    expect(history.replaceState).toHaveBeenCalled();
  });
  it("suppresses unchanged poses and updates remote targets without React subscriber notifications", () => {
    const room = new MultiplayerRoom(), disconnect = room.connect(), socket = sockets[0];
    socket.open(); snapshot(socket);
    room.publishMotion(sample);
    const sent = socket.sent.length;
    vi.mocked(performance.now).mockReturnValue(2000);
    room.publishMotion(sample);
    expect(socket.sent).toHaveLength(sent);
    const listener = vi.fn(), unsubscribe = room.subscribe(listener);
    socket.receive({ type: "pose", player: { ...friend, position: [60, 2, 20], animation: "Run" } });
    expect(listener).not.toHaveBeenCalled();
    expect(room.remotes.get(friend.id)?.player.position).toEqual([60, 2, 20]);
    unsubscribe(); disconnect();
  });
  it("clears stale players and pending seat locks on disconnect, then accepts a fresh identity", async () => {
    const room = new MultiplayerRoom(), disconnect = room.connect(), socket = sockets[0];
    socket.open(); snapshot(socket);
    const claimed = room.claimSeat("campfire:seat:0");
    socket.close();
    await expect(claimed).resolves.toBe(false);
    expect(room.getSnapshot()).toMatchObject({ status: "reconnecting", count: 0, ids: [] });
    expect(room.remotes.size).toBe(0);
    socket.open(); snapshot(socket, "self-2");
    expect(room.getSnapshot()).toMatchObject({ status: "online", selfId: "self-2", count: 2 });
    disconnect();
  });
  it("rejects a conflicting seat without freezing presence and treats room-full as terminal", async () => {
    const room = new MultiplayerRoom(), disconnect = room.connect(), socket = sockets[0];
    socket.open(); snapshot(socket);
    const claim = room.claimSeat("campfire:seat:0");
    const request = socket.sent.at(-1)!;
    socket.receive({ type: "seat-result", requestId: request.requestId, accepted: false, seatId: null });
    await expect(claim).resolves.toBe(false);
    socket.receive({ type: "error", code: "storage-unavailable", message: "Try again." });
    expect(room.getSnapshot().status).toBe("online");
    socket.receive({ type: "error", code: "room-full", message: "Room is full." });
    expect(room.getSnapshot().status).toBe("full");
    disconnect();
  });
  it("cancels an unanswered claim timer before a later seat is accepted", async () => {
    vi.useFakeTimers();
    const room = new MultiplayerRoom(), disconnect = room.connect(), socket = sockets[0];
    socket.open(); snapshot(socket);
    const abandoned = room.claimSeat("campfire:seat:0");
    // A rate-limit error does not produce seat-result. Escape releases its request lifetime.
    socket.receive({ type: "error", code: "rate-limit", message: "Try again." });
    room.releaseSeat();
    await expect(abandoned).resolves.toBe(false);
    const accepted = room.claimSeat("campfire:seat:1");
    const request = socket.sent.at(-1)!;
    socket.receive({ type: "seat-result", requestId: request.requestId, accepted: true, seatId: "campfire:seat:1" });
    await expect(accepted).resolves.toBe(true);
    const sentCount = socket.sent.length;
    await vi.advanceTimersByTimeAsync(6000);
    expect(socket.sent).toHaveLength(sentCount);
    expect(socket.sent.filter((message) => message.type === "seat" && message.seatId === null)).toHaveLength(1);
    disconnect();
  });

});
