export * from "../../apps/web/src/LocalWorldRoom";
import { LocalWorldRoom as NormalRoom } from "../../apps/web/src/LocalWorldRoom";
import type {
  ClientMessage,
  ServerMessage,
} from "../../packages/shared/protocol";
/** Observation only: the actual transport, parser and response stay unchanged. */
export class LocalWorldRoom extends NormalRoom {
  protected override send(message: ClientMessage) {
    let outgoing = message;
    if (
      new URLSearchParams(location.search).has("legacy") &&
      message.type === "pose" &&
      message.pose.boat
    ) {
      outgoing = structuredClone(message);
      if (outgoing.type === "pose" && outgoing.pose.boat) {
        delete outgoing.pose.boat.angularVelocity;
        delete outgoing.pose.boat.rudder;
      }
    }
    const delay = Math.min(
      200,
      Math.max(
        0,
        Number(new URLSearchParams(location.search).get("latency") ?? 0),
      ),
    );
    if (delay && outgoing.type === "pose")
      setTimeout(() => super.send(outgoing), delay);
    else super.send(outgoing);
  }
  protected override receive(message: ServerMessage) {
    const delay = Math.min(
      200,
      Math.max(
        0,
        Number(new URLSearchParams(location.search).get("latency") ?? 0),
      ),
    );
    if (delay && message.type === "boat-impact") {
      setTimeout(() => this.receiveNow(message), delay);
      return;
    }
    this.receiveNow(message);
  }
  private receiveNow(message: ServerMessage) {
    if (message.type === "boat-impact") {
      const out = document.querySelector("#boat-impacts");
      const old = JSON.parse(out?.getAttribute("data-events") ?? "[]");
      const events = [...old, { at: performance.now(), ...message }].slice(-40);
      out?.setAttribute("data-events", JSON.stringify(events));
      if (out)
        out.textContent = `${events.length} impact corrections · revision ${message.revision}`;
    }
    super.receive(message);
  }
}
