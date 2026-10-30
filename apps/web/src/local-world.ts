import { Arcade2048Service } from "../../server/arcade2048";
import {
  RoomCore,
  type RoomConnection,
  type SessionState,
} from "../../server/room-core";
import { HomeAssignments } from "../../server/home-assignments";
import type { ServerMessage } from "../../../packages/shared/protocol";
/** A browser-local authority for the shared localhost world. No production credentials/storage. */
export function createLocalWorld() {
  const clients = new Set<RoomConnection>();
  const core = new RoomCore({
    connections: () => clients,
    homes: new HomeAssignments({ save: async () => {} }),
    saveFire: async () => {},
    arcade: new Arcade2048Service({ save: async () => {}, ranked: false }),
  });
  return {
    connect(send: (m: ServerMessage) => void) {
      const c = {
        state: null as SessionState | null,
        setState(s: SessionState) {
          this.state = structuredClone(s);
        },
        send(raw: string) {
          send(JSON.parse(raw));
        },
        close() {
          void disconnect();
        },
      };
      let closed = false;
      const disconnect = async () => {
        if (closed) return;
        closed = true;
        clients.delete(c);
        await core.disconnect(c);
        c.state = null;
      };
      clients.add(c);
      core.connect(c, crypto.randomUUID());
      return {
        message: (raw: string) =>
          closed ? Promise.resolve() : core.message(c, raw),
        disconnect,
      };
    },
    tick: () => core.commitNames(),
  };
}
