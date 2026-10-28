import { Server, routePartykitRequest, type Connection } from "partyserver";
import { type FireState } from "../../packages/shared/protocol";
import { RoomCore, type RoomConnection, type SessionState } from "./room-core";
import { allowedOrigin, validRoomPath } from "./request-policy";
import { HomeAssignments } from "./home-assignments";

export interface Env {
  WorldRoom: DurableObjectNamespace<WorldRoom>;
  /** Comma-separated exact browser origins. Local development uses local origins. */
  ALLOWED_ORIGINS: string;
}

export class WorldRoom extends Server<Env> {
  static options = { hibernate: true };
  private room!: RoomCore;
  async onStart() {
    const stored = await this.ctx.storage.get<FireState>("fire");
    const fire = stored && typeof stored.lit === "boolean" && Number.isSafeInteger(stored.revision) && stored.revision >= 0 ? stored : undefined;
    const homes = new HomeAssignments({ save: (ledger) => this.ctx.storage.put("home-owners-v1", ledger) }, await this.ctx.storage.get("home-owners-v1"));
    this.room = new RoomCore({
      connections: () => this.getConnections<SessionState>() as unknown as Iterable<RoomConnection>,
      saveFire: (next) => this.ctx.storage.put("fire", next),
      homes,
    }, fire);
  }
  onConnect(connection: Connection) {
    this.room.connect(connection as unknown as RoomConnection, crypto.randomUUID());
  }
  onMessage(connection: Connection, message: string | ArrayBuffer | ArrayBufferView) {
    return this.room.message(connection as unknown as RoomConnection, message);
  }
  onClose(connection: Connection) { this.room.disconnect(connection as unknown as RoomConnection); }
  onError(connection: Connection) { connection.close(1011, "Connection error"); }
  onRequest() { return new Response("WebSocket connection required", { status: 426 }); }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") return Response.json({ ok: true, version: 1, service: "la-baraj-world" });
    if (!validRoomPath(url.pathname)) return new Response("Invalid room", { status: 404 });
    if (request.method !== "GET") return new Response("Method not allowed", { status: 405 });
    if (!allowedOrigin(request.headers.get("origin"), env.ALLOWED_ORIGINS ?? "")) return new Response("Origin not allowed", { status: 403 });
    // PartySocket's _pk is client-controlled; use a server identifier for its
    // internal connection tags too, in addition to our own public player ID.
    url.searchParams.set("_pk", crypto.randomUUID());
    return (await routePartykitRequest(new Request(url, request), env)) ?? new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
