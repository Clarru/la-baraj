import { Server, routePartykitRequest, type Connection } from "partyserver";
import {
  CANONICAL_WORLD_ID,
  HOUSING_EPOCH,
  HOME_NAME_GRACE_MS,
  type FireState,
} from "../../packages/shared/protocol";
import { RoomCore, type RoomConnection, type SessionState } from "./room-core";
import {
  allowedOrigin,
  canonicalWorldUrl,
  retireLegacyConnections,
} from "./request-policy";
import { HomeAssignments, type HomeLedger } from "./home-assignments";

export interface Env {
  WorldRoom: DurableObjectNamespace<WorldRoom>;
  /** Comma-separated exact browser origins. Local development uses local origins. */
  ALLOWED_ORIGINS: string;
}

export class WorldRoom extends Server<Env> {
  static options = { hibernate: true };
  private room!: RoomCore;
  async onStart() {
    if (this.retireLegacyRoom()) return;
    const stored = await this.ctx.storage.get<FireState>("fire");
    const fire =
      stored &&
      typeof stored.lit === "boolean" &&
      Number.isSafeInteger(stored.revision) &&
      stored.revision >= 0
        ? stored
        : undefined;
    // An explicit new housing generation retires v1 progress without touching fire
    // or exposing an administrative reset endpoint. The old ledger remains recoverable.
    const key = `home-owners-v${HOUSING_EPOCH}`;
    const storedHomes = await this.ctx.storage.get(key);
    const reset = storedHomes === undefined;
    const save = async (ledger: HomeLedger) => {
      await this.ctx.storage.transaction(async (transaction) => {
        await transaction.put(key, ledger);
        const deadlines = ledger.owners
          .filter(
            (o) => o.pendingName !== null && o.pendingName !== o.ownerName,
          )
          .map((o) => o.nameSince + HOME_NAME_GRACE_MS);
        if (deadlines.length)
          await transaction.setAlarm(
            Math.max(Date.now() + 1, Math.min(...deadlines)),
          );
        else await transaction.deleteAlarm();
      });
    };
    const homes = new HomeAssignments({ save }, storedHomes);
    if (reset) await save({ version: 2, owners: [] });
    this.room = new RoomCore(
      {
        connections: () =>
          this.getConnections<SessionState>() as unknown as Iterable<RoomConnection>,
        saveFire: (next) => this.ctx.storage.put("fire", next),
        homes,
      },
      fire,
    );
    for (const connection of this.getConnections<SessionState>())
      if (connection.state?.housingEpoch !== HOUSING_EPOCH)
        connection.close(1012, "The village has been rebuilt. Reload to join.");
    await this.room.commitNames();
  }
  async onAlarm() {
    if (!this.retireLegacyRoom()) await this.room.commitNames();
  }
  private retireLegacyRoom() {
    return retireLegacyConnections(this.name, this.getConnections());
  }
  onConnect(connection: Connection) {
    if (this.retireLegacyRoom()) return;
    this.room.connect(
      connection as unknown as RoomConnection,
      crypto.randomUUID(),
    );
  }
  onMessage(
    connection: Connection,
    message: string | ArrayBuffer | ArrayBufferView,
  ) {
    if (this.retireLegacyRoom()) return;
    return this.room.message(connection as unknown as RoomConnection, message);
  }
  onClose(connection: Connection) {
    if (!this.retireLegacyRoom())
      this.room.disconnect(connection as unknown as RoomConnection);
  }
  onError(connection: Connection) {
    if (!this.retireLegacyRoom()) connection.close(1011, "Connection error");
  }
  onRequest() {
    if (this.retireLegacyRoom())
      return new Response("Reconnect to the shared world", { status: 410 });
    return new Response("WebSocket connection required", { status: 426 });
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const requestedUrl = new URL(request.url);
    if (requestedUrl.pathname === "/health")
      return Response.json({
        ok: true,
        version: 1,
        service: "la-baraj-world",
        worldId: CANONICAL_WORLD_ID,
        housingEpoch: HOUSING_EPOCH,
      });
    const url = canonicalWorldUrl(requestedUrl);
    if (!url) return new Response("Invalid room", { status: 404 });
    if (request.method !== "GET")
      return new Response("Method not allowed", { status: 405 });
    if (
      !allowedOrigin(request.headers.get("origin"), env.ALLOWED_ORIGINS ?? "")
    )
      return new Response("Origin not allowed", { status: 403 });
    // PartySocket's _pk is client-controlled; use a server identifier for its
    // internal connection tags too, in addition to our own public player ID.
    url.searchParams.set("_pk", crypto.randomUUID());
    return (
      (await routePartykitRequest(new Request(url, request), env)) ??
      new Response("Not found", { status: 404 })
    );
  },
} satisfies ExportedHandler<Env>;
