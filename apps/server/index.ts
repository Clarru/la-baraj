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
import { PlanesTable, type PlanesRecord } from "./planes-table";
import { nextWorldDeadline } from "./world-alarm";

export interface Env {
  WorldRoom: DurableObjectNamespace<WorldRoom>;
  /** Comma-separated exact browser origins. Local development uses local origins. */
  ALLOWED_ORIGINS: string;
}

export class WorldRoom extends Server<Env> {
  static options = { hibernate: true };
  private room!: RoomCore;
  private planes!: PlanesTable;
  /** Both systems share one durable alarm; writes inspect both latest records. */
  private async persist(key: string, value: HomeLedger | PlanesRecord) {
    await this.ctx.storage.transaction(async (transaction) => {
      await transaction.put(key, value);
      const homes = await transaction.get<HomeLedger>(
        `home-owners-v${HOUSING_EPOCH}`,
      );
      const planes = await transaction.get<PlanesRecord>("planes-table-v1");
      const due = nextWorldDeadline(
        homes,
        planes,
        key !== "planes-table-v1" && this.planes?.needsFlush
          ? Date.now() + 1000
          : undefined,
      );
      if (due !== null)
        await transaction.setAlarm(Math.max(Date.now() + 1, due));
      else await transaction.deleteAlarm();
    });
  }
  private async retryPlaneCleanup() {
    await this.ctx.storage.transaction(async (transaction) => {
      const alarm = await transaction.getAlarm();
      await transaction.setAlarm(
        Math.min(alarm ?? Infinity, Date.now() + 1000),
      );
    });
  }
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
    const save = (ledger: HomeLedger) => this.persist(key, ledger);
    const homes = new HomeAssignments({ save }, storedHomes);
    if (reset) await save({ version: 2, owners: [] });
    const planes = new PlanesTable(
      { save: (record) => this.persist("planes-table-v1", record) },
      await this.ctx.storage.get("planes-table-v1"),
    );
    this.planes = planes;
    this.room = new RoomCore(
      {
        connections: () =>
          this.getConnections<SessionState>() as unknown as Iterable<RoomConnection>,
        saveFire: (next) => this.ctx.storage.put("fire", next),
        homes,
        planes,
        retryPlaneCleanup: () => this.retryPlaneCleanup(),
      },
      fire,
    );
    for (const connection of this.getConnections<SessionState>())
      if (connection.state?.housingEpoch !== HOUSING_EPOCH)
        connection.close(1012, "The village has been rebuilt. Reload to join.");
    await planes.reconcileConnections(
      new Set(
        [...this.getConnections<SessionState>()].flatMap((c) =>
          c.state ? [c.state.player.id] : [],
        ),
      ),
    );
    await this.room.commitNames();
  }
  async onAlarm() {
    if (!this.retireLegacyRoom()) {
      await this.room.commitNames();
      // A recovery alarm can fire before the next real turn or plaque deadline.
      await this.ctx.storage.transaction(async (transaction) => {
        const due = nextWorldDeadline(
          await transaction.get<HomeLedger>(`home-owners-v${HOUSING_EPOCH}`),
          await transaction.get<PlanesRecord>("planes-table-v1"),
        );
        if (due !== null)
          await transaction.setAlarm(Math.max(Date.now() + 1, due));
        else await transaction.deleteAlarm();
      });
    }
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
      return this.room.disconnect(connection as unknown as RoomConnection);
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
