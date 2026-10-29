/** Local browser QA only: shared in-memory room, never a deployed service. */
import {
  RoomCore,
  type RoomConnection,
  type SessionState,
} from "../../apps/server/room-core";
import { HomeAssignments } from "../../apps/server/home-assignments";
import {
  HOUSING_EPOCH,
  type ClientMessage,
} from "../../packages/shared/protocol";
import {
  planesSeatPose,
  PLANES_SEATS,
} from "../../packages/shared/planes-station";

class BrowserConnection implements RoomConnection {
  state: SessionState | null = null;
  constructor(readonly port: MessagePort) {}
  setState(state: SessionState) {
    this.state = structuredClone(state);
  }
  send(raw: string) {
    this.port.postMessage(JSON.parse(raw));
  }
  close() {
    void disconnect(this);
  }
}
const connections = new Set<BrowserConnection>();
const core = new RoomCore({
  connections: () => connections,
  homes: new HomeAssignments({ save: async () => {} }),
  saveFire: async () => {},
});
async function disconnect(connection: BrowserConnection) {
  connections.delete(connection);
  await core.disconnect(connection);
}
// Models the production alarm; the room and all synthetic homes vanish when the
// final test tab closes. No storage API or outbound connection exists here.
setInterval(() => void core.commitNames().catch(() => {}), 250);
type Packet =
  | { kind: "connect"; player: number }
  | { kind: "message"; message: ClientMessage }
  | { kind: "weather"; cloudCover: number | null }
  | { kind: "seat"; side: 0 | 1 }
  | { kind: "disconnect" };
(self as unknown as { onconnect: (event: MessageEvent) => void }).onconnect = (
  event,
) => {
  const port = event.ports[0];
  let connection: BrowserConnection | null = null;
  let pending = Promise.resolve();
  const handle = async (packet: Packet) => {
    if (packet.kind === "connect") {
      if (connection) await disconnect(connection);
      connection = new BrowserConnection(port);
      connections.add(connection);
      core.connect(connection, crypto.randomUUID());
      await core.message(
        connection,
        JSON.stringify({
          type: "hello",
          nickname: `Player ${packet.player + 1} (test)`,
          housingEpoch: HOUSING_EPOCH,
          requestHome: true,
          createHome: true,
          resumeToken: String.fromCharCode(97 + packet.player).repeat(43),
        }),
      );
    } else if (connection && packet.kind === "message")
      await core.message(connection, JSON.stringify(packet.message));
    else if (connection && packet.kind === "weather") {
      const now = Date.now();
      core.setWeather(
        packet.cloudCover === null
          ? null
          : {
              cloudCover: packet.cloudCover,
              weatherCode: packet.cloudCover >= 70 ? 3 : 0,
              observedAt: now,
              fetchedAt: now,
            },
      );
    } else if (connection && packet.kind === "seat") {
      await core.message(
        connection,
        JSON.stringify({
          type: "pose",
          pose: {
            ...planesSeatPose(packet.side),
            animation: "idle",
            activity: "none",
            vehicle: "none",
          },
        }),
      );
      await core.message(
        connection,
        JSON.stringify({
          type: "seat",
          seatId: PLANES_SEATS[packet.side],
          requestId: crypto.randomUUID(),
        }),
      );
    } else if (connection && packet.kind === "disconnect") {
      await disconnect(connection);
      connection = null;
    }
  };
  port.onmessage = (event: MessageEvent<Packet>) => {
    pending = pending
      .then(() => handle(event.data))
      .catch(() =>
        port.postMessage({
          type: "error",
          code: "test-transport",
          message: "The isolated test transport failed.",
        }),
      );
  };
  port.start();
};
