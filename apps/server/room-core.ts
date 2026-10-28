import { MAX_PLAYERS, PROTOCOL_VERSION, parseClientMessage, type FireState, type HomeAssignment, type PlayerPresence, type ServerMessage } from "../../packages/shared/protocol";
import { HomeAllocationError, type HomeAssignments } from "./home-assignments";

type Bucket = { tokens: number; at: number };
export type SessionState = {
  player: PlayerPresence;
  all: Bucket;
  pose: Bucket;
  action: Bucket;
  violations: number;
  /** Optional for connection attachments created before home allocation shipped. */
  home?: HomeAssignment;
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
  homes: HomeAssignments;
};
/** These buckets are stored in the websocket attachment and survive hibernation. */
export function consume(bucket: Bucket, now: number, rate: number, capacity: number): Bucket | null {
  const tokens = Math.min(capacity, bucket.tokens + Math.max(0, now - bucket.at) * rate / 1000);
  return tokens >= 1 ? { tokens: tokens - 1, at: now } : null;
}

export class RoomCore {
  fire: FireState;
  private homeClaims = new WeakMap<RoomConnection, Promise<HomeAssignment>>();
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
      players: this.active().map((c) => c.state!.player), fire: this.fire, seats: this.seats(),
      ...(connection.state.home ? { home: connection.state.home } : {}) });
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
      // Record renames in receipt order. An earlier home allocation may await
      // storage while a newer hello updates this same connection's nickname.
      connection.setState({ ...connection.state!, player: { ...connection.state!.player, nickname: message.nickname } });
      if (message.requestHome === true) {
        if (connection.state!.home && connection.state!.home!.resumeToken !== message.resumeToken) {
          this.send(connection, { type: "error", code: "invalid-resume", message: "A connected player cannot change cabin ownership." });
          connection.close(1008, "Invalid home resume"); return;
        }
        if (!connection.state!.home) {
          let pending = this.homeClaims.get(connection);
          if (!pending) {
            pending = this.runtime.homes.claim(message.resumeToken!, message.createHome === true);
            this.homeClaims.set(connection, pending);
          }
          try {
            const home = await pending;
            // The browser already saved the credential before requesting. If
            // its socket closed during persistence, a retry can safely resume
            // this assignment without sending to the departed connection.
            if (!this.active().includes(connection)) return;
            // A duplicate hello may have awaited the same allocation. Always
            // preserve the newest rate/pose/seat state across this storage wait.
            if (home.resumeToken !== message.resumeToken) throw new HomeAllocationError("invalid-resume", "A connected player cannot change cabin ownership.");
            connection.setState({ ...connection.state!, home, player: { ...connection.state!.player, homeIndex: home.index } });
          } catch (error) {
            if (error instanceof HomeAllocationError) {
              this.send(connection, { type: "error", code: error.code, message: error.message });
              connection.close(1008, "Home allocation unavailable");
            } else this.send(connection, { type: "error", code: "storage-unavailable", message: "Your cabin could not be saved. Retry with the same saved credential." });
            return;
          } finally { this.homeClaims.delete(connection); }
        }
      }
      this.broadcast({ type: "pose", player: connection.state!.player });
      if (message.requestHome) this.snapshot(connection);
      return;
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
