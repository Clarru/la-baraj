import { MultiplayerRoom } from "./multiplayer";
import {
  HOUSING_EPOCH,
  type ClientMessage,
} from "../../../packages/shared/protocol";
export function localWorldEnabled(
  hostname = location.hostname,
  configured = import.meta.env.VITE_ROOM_SERVER_URL,
) {
  return ["127.0.0.1", "localhost"].includes(hostname) && !configured;
}
function localToken() {
  const key = "la-baraj-local-preview-resume";
  try {
    const saved = sessionStorage.getItem(key);
    if (saved && /^[A-Za-z0-9_-]{43}$/.test(saved)) return saved;
  } catch {}
  const token = btoa(
    String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))),
  )
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  try {
    sessionStorage.setItem(key, token);
  } catch {}
  return token;
}
export function openLocalWorldPort() {
  return new SharedWorker(new URL("./local-world.worker.ts", import.meta.url), {
    type: "module",
  }).port;
}
export class LocalWorldRoom extends MultiplayerRoom {
  override readonly localPreview = true;
  private port: MessagePort | null = null;
  private token = "";
  constructor(name: string) {
    super(name, false);
  }
  override connect() {
    const stop = super.connect(true);
    this.token = localToken();
    let port: MessagePort;
    try {
      port = openLocalWorldPort();
    } catch {
      this.receive({
        type: "error",
        code: "local-preview-unavailable",
        message:
          "Acest browser nu poate porni lumea locală. Folosește un browser cu SharedWorker sau jocul online.",
      });
      return stop;
    }
    this.port = port;
    port.onmessage = (e) => {
      if (e.data?.kind === "server") this.receive(e.data.message);
      else if (e.data?.kind === "ready")
        this.send({ type: "hello", nickname: this.getSnapshot().nickname });
    };
    port.start();
    const pulse = setInterval(
      () => port.postMessage({ kind: "heartbeat" }),
      10_000,
    );
    let closed = false;
    const leave = () => {
      if (closed) return;
      closed = true;
      clearInterval(pulse);
      port.postMessage({ kind: "disconnect" });
      port.close();
      if (this.port === port) this.port = null;
    };
    const hide = (event: PageTransitionEvent) => {
      if (!event.persisted) leave();
    };
    window.addEventListener("pagehide", hide);
    return () => {
      window.removeEventListener("pagehide", hide);
      leave();
      stop();
    };
  }
  protected override send(message: ClientMessage) {
    if (message.type === "hello")
      message = {
        ...message,
        housingEpoch: HOUSING_EPOCH,
        requestHome: true,
        createHome: true,
        resumeToken: this.token,
      };
    this.port?.postMessage({ kind: "message", raw: JSON.stringify(message) });
  }
}
