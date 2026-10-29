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
    const t = sessionStorage.getItem(key);
    if (t && /^[A-Za-z0-9_-]{43}$/.test(t)) return t;
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
export function openLocalWorldPort(onError?: () => void) {
  const worker = new SharedWorker(
    new URL("./local-world.worker.ts", import.meta.url),
    { type: "module" },
  );
  if (onError) worker.onerror = onError;
  return worker.port;
}
export class LocalWorldRoom extends MultiplayerRoom {
  override readonly localPreview = true;
  private port: MessagePort | null = null;
  private token = "";
  constructor(name: string) {
    super(name, false);
  }
  override connect() {
    const stop = this.connectLocalSession();
    this.token ||= localToken();
    let port: MessagePort;
    const report = () => {
      stop();
      this.receive({
        type: "error",
        code: "local-preview-unavailable",
        message:
          "Lumea locală s-a întrerupt. Reîncarcă pagina ca să te reconectezi.",
      });
    };
    try {
      port = openLocalWorldPort(() => fail());
    } catch {
      report();
      return stop;
    }
    this.port = port;
    let closed = false,
      closeTimer: ReturnType<typeof setTimeout> | null = null;
    const pulse = setInterval(
      () => port.postMessage({ kind: "heartbeat" }),
      10_000,
    );
    const finish = () => {
      if (closeTimer) clearTimeout(closeTimer);
      closeTimer = null;
      port.onmessage = null;
      port.close();
    };
    const leave = () => {
      if (closed) return;
      closed = true;
      clearInterval(pulse);
      if (this.port === port) this.port = null;
      port.postMessage({ kind: "disconnect" });
      closeTimer = setTimeout(finish, 5000);
    };
    function fail() {
      if (closed) return;
      leave();
      report();
    }
    port.onmessage = (e) => {
      if (e.data?.kind === "closed") {
        if (!closed) fail();
        finish();
        return;
      }
      if (closed) return;
      if (e.data?.kind === "server") this.receive(e.data.message);
      else if (e.data?.kind === "ready")
        this.send({ type: "hello", nickname: this.getSnapshot().nickname });
    };
    port.start();
    const hide = (e: PageTransitionEvent) => {
      if (!e.persisted) leave();
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
