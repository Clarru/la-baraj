export * from "../../apps/web/src/LocalWorldRoom";
import { LocalWorldRoom as NormalRoom } from "../../apps/web/src/LocalWorldRoom";
import type { ServerMessage } from "../../packages/shared/protocol";
/** Observation only: the actual transport, parser and response stay unchanged. */
export class LocalWorldRoom extends NormalRoom {
  protected override receive(message: ServerMessage) {
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
