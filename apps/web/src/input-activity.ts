import { AFK_AFTER_MS } from "../../../packages/shared/protocol";

/** Capture real interaction without sending a packet for every pointer event. */
export class InputActivity {
  private lastInput = performance.now();
  private lastSent = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private readonly send: (idleMs: number) => void) {}
  input = () => {
    const now = performance.now();
    const returningFromAfk = now - this.lastInput >= AFK_AFTER_MS;
    this.lastInput = now;
    const remaining = 5000 - (this.lastInput - this.lastSent);
    if (returningFromAfk || remaining <= 0) this.flush();
    else if (!this.timer)
      this.timer = setTimeout(() => this.flush(), remaining);
  };
  flush = () => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const now = performance.now();
    this.lastSent = now;
    this.send(
      Math.min(AFK_AFTER_MS, Math.max(0, Math.round(now - this.lastInput))),
    );
  };
  dispose = () => {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  };
}
