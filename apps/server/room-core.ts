import { MAX_PLAYERS, PROTOCOL_VERSION, parseClientMessage, type FireState, type PlayerPresence, type ServerMessage } from "../../packages/shared/protocol";

type Bucket = { tokens: number; at: number };
export type SessionState = {
  player: PlayerPresence;
  all: Bucket;
  pose: Bucket;
  action: Bucket;
  violations: number;
};
export interface RoomConnection {
  readonly state: Readonly<SessionState> | null;
  setState(state: SessionState): unknown;
  send(message: string): void;
  close(code: number, reason: string): void;
}
export type RoomRuntime = {
  connections(): Iterable<RoomConnection>;
  saveFire(fire: FireState): Promise<void>;
};
/** These buckets are stored in the websocket attachment and survive hibernation. */
export function consume(bucket: Bucket, now: number, rate: number, capacity: number): Bucket | null {
  const tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.at) * rate / 1000);
  return tokens >= 1 ? { tokens: tokens - 1, at: now } : null;
}

export class RoomCore {
  fire: FireState;
  constructor(private runtime: RoomRuntime, fire: FireState = { lit: true, revision: 0 }) { this.fire = fire; }
  private send(connection: RoomConnection, message: ServerMessage) { connection.send(JSON.stringify(message)); }
  private active() { return [...this.runtime.connections()].filter((c) => c.state !== null); }
  private broadcast(message: ServerMessage, exclude?: RoomConnection) {
    const raw = JSON.stringify(message);
    for (const connection of this.active()) if (connection !== exclude) connection.send(raw);
  }
  private seats(): Record<string, string> {
    return Object.fromEntries(this.active().flatMap((c) => c.state!.player.seatId ? [[c.state!.player.seatId, c.state!.player.id]] : []));
  }
  snapshot(connection: RoomConnection) {
    if (!connection.state) return;
    this.send(connection, { type: "snapshot", version: PROTOCOL_VERSION, selfId: connection.state.player.id,
      players: this.active().map((c) => c.state!.player), fire: this.fire, seats: this.seats() });
  }
  connect(connection: RoomConnection, id: string, now = Date.now()) {
    if (this.active().length >= MAX_PLAYERS) {
      this.send(connection, { type: "error", code: "room-full", message: "This room is full (30 friends)." });
      connection.close(1008, "Room full"); return;
    }
    connection.setState({ player: { id, nickname: "Guest", position: [0, 0, 0], yaw: 0, animation: "idle", activity: "none", vehicle: "none" },
      all: { tokens: 30, at: now }, pose: { tokens: 3, at: now }, action: { tokens: 5, at: now }, violations: 0 });
    this.snapshot(connection);
    this.broadcast({ type: "joined", player: connection.state!.player }, connection);
  }
  private invalid(connection: RoomConnection, code: string, message: string) {
    if (!connection.state) return;
    const violations = connection.state.violations + 1;
    connection.setState({ ...connection.state, violations });
    this.send(connection, { type: "error", code, message });
    if (violations >= 3) connection.close(1008, "Invalid or excessive messages");
  }
  async message(connection: RoomConnection, raw: unknown, now = Date.now()) {
    const state = connection.state;
    if (!state) return;
    const all = consume(state.all, now, 20, 30);
    if (!all) { this.invalid(connection, "rate-limit", "Message limit exceeded."); return; }
    connection.setState({ ...state, all });
    const message = typeof raw === "string" ? parseClientMessage(raw) : null;
    if (!message) { this.invalid(connection, "invalid-packet", "Unsupported or invalid message."); return; }
    const current = connection.state!;
    if (message.type === "pose") {
      const pose = consume(current.pose, now, 10, 3);
      // Dropping excess poses absorbs ordinary network batching without an error storm.
      if (!pose) return;
      const { seatId: _ignored, ...clientPose } = message.pose;
      const player = { ...current.player, ...clientPose };
      connection.setState({ ...current, pose, player });
      this.broadcast({ type: "pose", player }, connection); return;
    }
    const action = consume(current.action, now, 2, 5);
    if (!action) { this.invalid(connection, "rate-limit", "Interaction limit exceeded."); return; }
    connection.setState({ ...current, action });
    if (message.type === "sync") { this.snapshot(connection); return; }
    if (message.type === "hello") {
      const player = { ...connection.state!.player, nickname: message.nickname };
      connection.setState({ ...connection.state!, player });
      this.broadcast({ type: "pose", player }); return;
    }
    if (message.type === "fire") {
      if (this.fire.lit === message.lit) return;
      const previous = this.fire;
      this.fire = { lit: message.lit, revision: this.fire.revision + 1 };
      const next = this.fire;
      try { await this.runtime.saveFire(next); }
      catch {
        if (this.fire === next) this.fire = previous;
        this.send(connection, { type: "error", code: "storage-unavailable", message: "The fire change could not be saved. Try again." });
        this.snapshot(connection); return;
      }
      this.broadcast({ type: "fire", fire: next }); return;
    }
    const occupied = message.seatId !== null && this.seats()[message.seatId];
    const player = connection.state!.player;
    if (occupied && occupied !== player.id) {
      this.send(connection, { type: "seat-result", requestId: message.requestId, accepted: false,
        seatId: player.seatId ?? null, reason: "Someone is already sitting here." });
      this.send(connection, { type: "seats", seats: this.seats() }); return;
    }
    const { seatId: _oldSeat, ...standing } = player;
    const nextPlayer = message.seatId === null ? standing : { ...standing, seatId: message.seatId };
    connection.setState({ ...connection.state!, player: nextPlayer });
    this.send(connection, { type: "seat-result", requestId: message.requestId, accepted: true, seatId: message.seatId });
    this.broadcast({ type: "seats", seats: this.seats() });
    this.broadcast({ type: "pose", player: nextPlayer }, connection);
  }
  disconnect(connection: RoomConnection) {
    if (!connection.state) return;
    this.broadcast({ type: "left", id: connection.state.player.id }, connection);
    // The PartyServer iterator no longer contains the closed connection.
    this.broadcast({ type: "seats", seats: this.seats() }, connection);
  }
}
