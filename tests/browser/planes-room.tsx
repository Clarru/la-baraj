/** Opt-in two-browser UI QA. Uses the actual client, parser and room in a SharedWorker. */
import { MultiplayerRoom } from "../../apps/web/src/multiplayer";
import type {
  ClientMessage,
  ServerMessage,
} from "../../packages/shared/protocol";

export const pairedPlanesLab =
  import.meta.env.VITE_PLANES_PAIRED_LAB === "1" &&
  ["127.0.0.1", "localhost"].includes(location.hostname);
export class PairedPlanesRoom extends MultiplayerRoom {
  readonly testPlayer = Math.max(
    0,
    Math.min(
      2,
      Number(new URL(location.href).searchParams.get("test-player") ?? 0),
    ),
  );
  readonly trace: string[] = [];
  private worker: SharedWorker | null = null;
  private open = false;
  constructor() {
    super("Browser test", false);
  }
  override connect() {
    const stop = super.connect(true);
    this.worker = new SharedWorker(
      new URL("./planes-room.worker.ts", import.meta.url),
      { type: "module", name: "planes-browser-test" },
    );
    this.worker.port.onmessage = (event: MessageEvent<ServerMessage>) => {
      const m = event.data;
      if (m.type === "planes" || m.type === "snapshot") {
        const v = m.type === "planes" ? m.view : m.planes;
        this.trace.push(
          JSON.stringify({
            receive: m.type,
            revision: v?.revision,
            you: v?.you,
            phase: v?.phase,
            members: v?.players.map((p) =>
              p ? { name: p.name, online: p.online, ready: p.ready } : null,
            ),
            ...(m.type === "snapshot"
              ? { seats: m.seats, homeIndex: m.home?.index }
              : {}),
          }),
        );
      }
      this.receive(m);
    };
    this.worker.port.start();
    this.reconnect();
    const leave = () => this.disconnectTest();
    window.addEventListener("pagehide", leave);
    return () => {
      window.removeEventListener("pagehide", leave);
      leave();
      this.worker?.port.close();
      this.worker = null;
      stop();
    };
  }
  protected override send(message: ClientMessage) {
    if (message.type === "seat")
      this.trace.push(
        JSON.stringify({ send: "seat", seat: message.seatId, open: this.open }),
      );
    if (this.open) this.worker?.port.postMessage({ kind: "message", message });
  }
  reconnect() {
    this.open = true;
    this.worker?.port.postMessage({ kind: "connect", player: this.testPlayer });
  }
  disconnectTest() {
    this.open = false;
    this.connectionClosed();
    this.worker?.port.postMessage({ kind: "disconnect" });
  }
  joinTestSeat(side: 0 | 1) {
    this.worker?.port.postMessage({ kind: "seat", side });
  }
}
export function PairedPlanesControls({ room }: { room: MultiplayerRoom }) {
  if (!(room instanceof PairedPlanesRoom)) return null;
  return (
    <aside
      aria-label="Paired browser test"
      style={{
        position: "absolute",
        top: 100,
        left: 24,
        zIndex: 100,
        padding: 12,
        maxWidth: 230,
        background: "#f7f3e8",
        color: "#244b70",
        pointerEvents: "auto",
      }}
    >
      <output hidden data-testid="planes-test-trace">
        {room.trace.slice(-20).join("\n")}
      </output>
      <strong>Browser player {room.testPlayer + 1} · isolated test</strong>
      <p>Shared in RAM across local test tabs. No live rooms or saved homes.</p>
      <button onClick={() => room.joinTestSeat(0)}>
        Take west test seat
      </button>{" "}
      <button onClick={() => room.joinTestSeat(1)}>Take east test seat</button>{" "}
      <button onClick={() => room.disconnectTest()}>
        Disconnect this test player
      </button>{" "}
      <button onClick={() => room.reconnect()}>
        Reconnect this test player
      </button>
    </aside>
  );
}

export const planesLab = pairedPlanesLab;
export {
  PairedPlanesRoom as LocalPlanesRoom,
  PairedPlanesControls as PlanesLabControls,
};
