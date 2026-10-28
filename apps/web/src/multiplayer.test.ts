import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { sockets, storageData } = vi.hoisted(() => ({ sockets: [] as FakeSocket[], storageData: new Map<string, string>() }));
type FakeSocket = EventTarget & { options: Record<string, unknown>; readyState: number; sent: Record<string, unknown>[]; open(): void; receive(message: unknown): void; close(): void };
vi.mock("partysocket", () => ({ default: class extends EventTarget {
  readyState = 0;
  sent: Record<string, unknown>[] = [];
  constructor(readonly options: Record<string, unknown>) { super(); sockets.push(this); }
  send(raw: string) { this.sent.push(JSON.parse(raw)); }
  open() { this.readyState = 1; this.dispatchEvent(new Event("open")); }
  receive(message: unknown) { this.dispatchEvent(new MessageEvent("message", { data: JSON.stringify(message) })); }
  close() { this.readyState = 3; this.dispatchEvent(new Event("close")); }
} }));
import { MultiplayerRoom } from "./multiplayer";
import { queueCabinTransfer, takeCabinTransfer, sampleCabinMotion } from "./cabin-interior-state";
import { CANONICAL_WORLD_ID, parseClientMessage } from "../../../packages/shared/protocol";
const roomId = CANONICAL_WORLD_ID;
const self = { id: "self-1", nickname: "Me", position: [45, 2, 27], yaw: 0, animation: "Idle_Neutral", activity: "none", vehicle: "none" };
const friend = { ...self, id: "friend-1", nickname: "Friend" };
const sample = { feet: [45, 2, 27], facing: [0, 0, 1], animation: "Walk", activity: "none", velocity: [0, 0, 3], jumpPhase: "grounded", vehicle: null };
function snapshot(socket: FakeSocket, selfId = "self-1", homeIndex = 14) { const hello = [...socket.sent].reverse().find((message) => message.type === "hello")!; socket.receive({ type: "snapshot", version: 1, selfId, players: [{ ...self, id: selfId, homeIndex }, friend], fire: { lit: true, revision: 0 }, seats: {}, home: { index: homeIndex, resumeToken: hello.resumeToken } }); }
beforeEach(() => {
  sockets.length = 0;
  storageData.clear();
  vi.stubEnv("VITE_ROOM_SERVER_URL", "https://rooms.example.test");
  vi.stubGlobal("location", { href: `https://lake.example.test/?room=${roomId}` });
  vi.stubGlobal("history", { replaceState: vi.fn() });
  vi.stubGlobal("localStorage", { getItem: (key: string) => storageData.get(key) ?? null, setItem: (key: string, value: string) => { storageData.set(key, value); } });
  vi.stubGlobal("WebSocket", { OPEN: 1 });
  vi.spyOn(performance, "now").mockReturnValue(1000);
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("friends room client", () => {
  it.each([
    ["takeoff", "Jump_RunStart"],
    ["airborne", "Jump_RunAir"],
    ["landing", "Jump_RunLand"],
  ])("publishes running jump %s through the existing pose contract", (jumpPhase, animation) => {
    const room = new MultiplayerRoom();
    const disconnect = room.connect(), socket = sockets[0];
    socket.open(); snapshot(socket);
    room.publishMotion({ ...sample, jumpPhase, animation, velocity: [0, 2, 6.5], jumpStyle: "run" });
    const packet = socket.sent.find((message) => message.type === "pose")!;
    expect(packet).toMatchObject({ type: "pose", pose: { jumpPhase, animation, vehicle: "none", speed: 6.5 } });
    expect(parseClientMessage(JSON.stringify(packet))).toEqual(packet);
    expect(packet.pose).not.toHaveProperty("jumpStyle");
    disconnect();
  });
  it("uses the shared world and publishes the feet pose after assigned-home acknowledgement", () => {
    const room = new MultiplayerRoom();
    expect(room.roomId).toBe(roomId);
    const disconnect = room.connect(), socket = sockets[0];
    socket.open(); snapshot(socket);
    room.publishMotion(sample);
    expect(room.getSnapshot()).toMatchObject({ status: "online", count: 2, selfId: "self-1", ids: ["friend-1"], fireLit: true });
    expect(socket.sent.find((message) => message.type === "pose")).toEqual({ type: "pose", pose: { position: [45, 2, 27], yaw: 0, animation: "Walk", activity: "none", vehicle: "none", jumpPhase: "grounded", speed: 3 } });
    disconnect();
  });
  it.each([true, false])("publishes intermediate doorway feet and Walk/Idle for entering=%s", (entering) => {
    const room = new MultiplayerRoom(), disconnect = room.connect(), socket = sockets[0];
    socket.open(); snapshot(socket);
    queueCabinTransfer(18, entering, true);
    const transfer = takeCabinTransfer()!;
    const poses: Array<{position: number[]; animation: string; yaw: number; speed: number}> = [];
    for (const [i, elapsed] of [.16, .32, .48, .8].entries()) {
      vi.mocked(performance.now).mockReturnValue(1200 + i * 160);
      const motion = sampleCabinMotion(transfer, elapsed);
      room.publishMotion(motion);
      const packet = socket.sent.at(-1)! as { type: string; pose: typeof poses[number] };
      expect(packet.type).toBe("pose");
      expect(parseClientMessage(JSON.stringify(packet))).toMatchObject({type: "pose", pose: {position: packet.pose.position, animation: packet.pose.animation}});
      expect(packet.pose.position).toEqual(motion.feet.map(v => Math.round(v * 1000) / 1000));
      expect(motion.feet[1]).toBeCloseTo(transfer.position[1] - .95 + .015);
      expect(packet.pose.yaw).toBeCloseTo(Math.atan2(motion.facing[0], motion.facing[2]), 2);
      poses.push(packet.pose);
    }
    expect(new Set(poses.map(p => p.position.join(','))).size).toBe(4);
    expect(poses.slice(0, 3).map(p => p.animation)).toEqual(["Walk", "Walk", "Walk"]);
    expect(poses[1].speed).toBeGreaterThan(0);
    expect(poses[3]).toMatchObject({animation: "Idle_Neutral", speed: 0});
    disconnect();
  });
  it.each(["", "?room=invalid", "?room=friends_room_with_128bits_12345"])("joins the same world for URL query %s", (query) => {
    vi.stubGlobal("location", { href: `https://lake.example.test/${query}` });
    const first = new MultiplayerRoom(), second = new MultiplayerRoom();
    expect(first.roomId).toBe(CANONICAL_WORLD_ID);
    expect(second.roomId).toBe(CANONICAL_WORLD_ID);
    if (query) {
      expect(history.replaceState).toHaveBeenCalled();
      const changed = vi.mocked(history.replaceState).mock.calls[0][2] as URL;
      expect(new URL(String(changed)).searchParams.has("room")).toBe(false);
    }
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

  it("opts into a private durable home, keeps credentials out of URL/diagnostics, and preserves the shared owner through old room links", () => {
    const room = new MultiplayerRoom(), disconnect = room.connect(), socket = sockets[0];
    socket.open();
    const hello = socket.sent[0];
    expect(hello).toMatchObject({ type: "hello", requestHome: true, createHome: true });
    expect(hello.resumeToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(storageData.get(`la-baraj-home-resume-v1:${roomId}`)).toContain(String(hello.resumeToken));
    expect(socket.options).not.toHaveProperty("query");
    expect(location.href).not.toContain(String(hello.resumeToken));
    room.publishMotion(sample);
    socket.receive({ type: "snapshot", version: 1, selfId: "self-1", players: [self], fire: {lit: true, revision: 0}, seats: {} });
    expect(room.getSnapshot()).toMatchObject({ status: "connecting", homeIndex: null });
    expect(socket.sent.some((message) => message.type === "pose")).toBe(false);
    snapshot(socket, "self-1", 2);
    expect(room.getSnapshot()).toMatchObject({ status: "online", homeIndex: 2 });
    // The obsolete preview pose is dropped instead of briefly publishing the wrong cabin.
    expect(socket.sent.some((message) => message.type === "pose")).toBe(false);
    const write = vi.fn();
    room.attachDiagnostics({ setAttribute: write } as unknown as HTMLOutputElement);
    const diagnostics = String(write.mock.calls.at(-1)?.[1]);
    expect(diagnostics).toContain('"homeIndex":2');
    expect(diagnostics).not.toContain(String(hello.resumeToken));
    expect(diagnostics).not.toContain("resumeToken");
    disconnect();
    vi.stubGlobal("location", { href: "https://lake.example.test/?room=second_room_with_128bits_12345" });
    const other = new MultiplayerRoom(), stopOther = other.connect();
    sockets[1].open();
    expect(sockets[1].sent[0].resumeToken).toBe(hello.resumeToken);
    stopOther();
  });

  it("restores the same owner after refresh and replays movement only after reconnect acknowledgement", () => {
    const room = new MultiplayerRoom(), disconnect = room.connect(), socket = sockets[0];
    socket.open(); snapshot(socket, "self-1", 7);
    const token = socket.sent[0].resumeToken;
    room.publishMotion({ ...sample, homeIndex: 7, feet: [94, 3, 40] });
    socket.close(); socket.open();
    expect([...socket.sent].reverse().find((message) => message.type === "hello")).toMatchObject({ resumeToken: token, requestHome: true });
    expect([...socket.sent].reverse().find((message) => message.type === "hello")).not.toHaveProperty("createHome");
    const poses = socket.sent.filter((message) => message.type === "pose").length;
    socket.receive({ type: "snapshot", version: 1, selfId: "self-2", players: [self], fire: {lit: true, revision: 0}, seats: {} });
    expect(room.getSnapshot()).toMatchObject({ homeIndex: 7, status: "reconnecting" });
    expect(socket.sent.filter((message) => message.type === "pose")).toHaveLength(poses);
    snapshot(socket, "self-2", 7);
    expect(socket.sent.at(-1)).toMatchObject({ type: "pose", pose: { position: [94, 3, 40] } });
    expect(room.getSnapshot().homeIndex).toBe(7);
    disconnect();
    const refreshed = new MultiplayerRoom(), stop = refreshed.connect(), nextSocket = sockets[1];
    nextSocket.open(); snapshot(nextSocket, "refreshed-self", 7);
    expect(nextSocket.sent[0]).toMatchObject({ resumeToken: token, requestHome: true });
    expect(nextSocket.sent[0]).not.toHaveProperty("createHome");
    expect(refreshed.getSnapshot().homeIndex).toBe(7);
    stop();
  });

  it("retries the same pending anonymous owner after a lost first acknowledgement", () => {
    const first = new MultiplayerRoom(), stopFirst = first.connect(), a = sockets[0];
    a.open();
    const token = a.sent[0].resumeToken;
    stopFirst();
    const retry = new MultiplayerRoom(), stopRetry = retry.connect(), b = sockets[1];
    b.open();
    expect(b.sent[0]).toMatchObject({ resumeToken: token, createHome: true });
    snapshot(b, "retry-self", 9);
    expect(JSON.parse(storageData.get(`la-baraj-home-resume-v1:${roomId}`)!)).toEqual({ resumeToken: token, createHome: false });
    stopRetry();
  });

  it("uses distinct public assignments and rejects invalid resume without replacing the credential", () => {
    const first = new MultiplayerRoom(), stopFirst = first.connect(), a = sockets[0];
    a.open(); snapshot(a, "one", 3);
    const otherBrowserData = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (key: string) => otherBrowserData.get(key) ?? null, setItem: (key: string, value: string) => { otherBrowserData.set(key, value); } });
    const second = new MultiplayerRoom(), stopSecond = second.connect(), b = sockets[1];
    b.open(); snapshot(b, "two", 24);
    expect(first.getSnapshot().homeIndex).toBe(3);
    expect(second.getSnapshot().homeIndex).toBe(24);
    expect(b.sent[0].resumeToken).not.toBe(a.sent[0].resumeToken);
    const saved = otherBrowserData.get(`la-baraj-home-resume-v1:${roomId}`);
    b.receive({ type: "error", code: "invalid-resume", message: "This home could not be resumed." });
    expect(second.getSnapshot().status).toBe("error");
    expect(b.readyState).toBe(3);
    expect(otherBrowserData.get(`la-baraj-home-resume-v1:${roomId}`)).toBe(saved);
    stopFirst(); stopSecond();
  });

});
