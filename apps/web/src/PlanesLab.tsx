/** Explicit localhost-only integration fixture; uses the real room/parser/table, no network or persistent homes. */
import { useSyncExternalStore } from "react";
import {
  RoomCore,
  type RoomConnection,
  type SessionState,
} from "../../server/room-core";
import { HomeAssignments } from "../../server/home-assignments";
import { MultiplayerRoom } from "./multiplayer";
import {
  PLANES_TABLE,
  PLANES_SEATS,
  planesSeatPose,
} from "../../../packages/shared/planes-station";
import {
  HOUSING_EPOCH,
  type ClientMessage,
  type ServerMessage,
} from "../../../packages/shared/protocol";
import type { PlanesView, Side } from "../../../packages/shared/planes";

export const planesLab =
  import.meta.env.VITE_PLANES_LAB === "1" &&
  ["127.0.0.1", "localhost"].includes(location.hostname);
class LocalConnection implements RoomConnection {
  state: SessionState | null = null;
  closed = false;
  constructor(private receive: (message: ServerMessage) => void) {}
  setState(state: SessionState) {
    this.state = structuredClone(state);
  }
  send(raw: string) {
    this.receive(JSON.parse(raw));
  }
  close() {
    this.closed = true;
  }
}
export class LocalPlanesRoom extends MultiplayerRoom {
  private core: RoomCore;
  private self: LocalConnection;
  private friend: LocalConnection;
  private friendView: PlanesView | null = null;
  private sequence = 0;
  constructor(name: string) {
    super(name, false);
    this.self = new LocalConnection((message) => this.receive(message));
    this.friend = new LocalConnection((message) => {
      if (message.type === "planes") this.friendView = message.view;
      if (message.type === "snapshot" && message.planes)
        this.friendView = message.planes;
    });
    this.core = new RoomCore({
      connections: () => [this.self, this.friend].filter((c) => !c.closed),
      homes: new HomeAssignments({ save: async () => {} }),
      saveFire: async () => {},
    });
  }
  override connect() {
    const stop = super.connect(true);
    this.self.closed = false;
    this.friend.closed = false;
    this.core.connect(this.self, "lab-you");
    this.core.connect(this.friend, "lab-friend");
    void (async () => {
      await this.core.message(
        this.self,
        JSON.stringify({
          type: "hello",
          nickname: this.getSnapshot().nickname,
          housingEpoch: HOUSING_EPOCH,
          requestHome: true,
          createHome: true,
          resumeToken: "l".repeat(43),
        }),
      );
      await this.core.message(
        this.friend,
        JSON.stringify({ type: "hello", nickname: "Robin (test)" }),
      );
    })();
    return () => {
      this.self.closed = true;
      this.friend.closed = true;
      stop();
    };
  }
  protected override send(message: ClientMessage) {
    void this.core.message(this.self, JSON.stringify(message));
  }
  private async sendFriend(message: ClientMessage) {
    await this.core.message(this.friend, JSON.stringify(message));
  }
  async joinTable() {
    await this.core.message(
      this.self,
      JSON.stringify({
        type: "pose",
        pose: {
          ...planesSeatPose(0),
          animation: "Idle_Neutral",
          activity: "none",
          vehicle: "none",
        },
      }),
    );
    await this.claimSeat(PLANES_SEATS[0]);
    await this.sendFriend({
      type: "pose",
      pose: {
        ...planesSeatPose(1),
        animation: "Activity_Sit",
        activity: "sit",
        vehicle: "none",
      },
    });
    await this.sendFriend({
      type: "seat",
      seatId: PLANES_SEATS[1],
      requestId: `lab-seat-${++this.sequence}`,
    });
  }
  async readyFriend() {
    const view = this.friendView;
    if (view?.ownPlanes)
      await this.sendFriend({
        type: "planes-action",
        requestId: `lab-ready-${++this.sequence}`,
        revision: view.revision,
        action: {
          kind: view.phase === "finished" ? "rematch" : "ready",
          planes: view.ownPlanes,
        },
      });
  }
  async takeTurn() {
    const view = this.getSnapshot().planes;
    if (view?.phase !== "playing") return;
    const side = view.turn as Side,
      known = side === 0 ? this.friendView?.ownPlanes : view.ownPlanes;
    const shots = view.shots[side];
    const target = known?.find(
      (p) => !shots.some((s) => s.x === p.x && s.y === p.y),
    );
    if (!target) return;
    const message: ClientMessage = {
      type: "planes-action",
      requestId: `lab-shot-${++this.sequence}`,
      revision: view.revision,
      action: { kind: "shot", x: target.x, y: target.y },
    };
    if (side === 0) await this.core.message(this.self, JSON.stringify(message));
    else await this.sendFriend(message);
  }
  async dropFriend() {
    this.friend.closed = true;
    await this.core.disconnect(this.friend);
  }
  async returnFriend() {
    // A real home owner resumes by capability. This fixture uses its original transient identity.
    this.friend.closed = false;
    await this.sendFriend({
      type: "seat",
      seatId: PLANES_SEATS[1],
      requestId: `lab-back-${++this.sequence}`,
    });
  }
}
export function PlanesLabControls({ room }: { room: MultiplayerRoom }) {
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot);
  if (!(room instanceof LocalPlanesRoom)) return null;
  const online = snapshot.status === "online";
  return (
    <aside
      aria-label="Local Planes test controls"
      style={{
        position: "absolute",
        top: 100,
        left: 24,
        zIndex: 100,
        padding: 10,
        background: "#f7f3e8",
        color: "#244b70",
        pointerEvents: "auto",
        maxWidth: 230,
      }}
    >
      <strong>Local Planes test</strong>
      <p style={{ fontSize: 12 }}>
        In-memory only. No live connection or browser-saved test homes.
      </p>
      <button disabled={!online} onClick={() => void room.joinTable()}>
        Join test table
      </button>{" "}
      <button disabled={!online} onClick={() => void room.readyFriend()}>
        Ready test opponent
      </button>{" "}
      <button disabled={!online} onClick={() => void room.takeTurn()}>
        Play next test shot
      </button>{" "}
      <button disabled={!online} onClick={() => void room.dropFriend()}>
        Disconnect test opponent
      </button>{" "}
      <button disabled={!online} onClick={() => void room.returnFriend()}>
        Return test opponent
      </button>
      <output
        hidden
        data-testid="planes-test-position"
        data-position={`${PLANES_TABLE.x},${PLANES_TABLE.z}`}
      />
    </aside>
  );
}
