import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LocalWorldRoom } from "./LocalWorldRoom";
import { currentMultiplayerRoom } from "./multiplayer";
class Port {
  onmessage: ((e: { data: unknown }) => void) | null = null;
  messages: unknown[] = [];
  closed = false;
  postMessage(m: unknown) {
    this.messages.push(m);
  }
  start() {}
  close() {
    this.closed = true;
  }
  receive(data: unknown) {
    this.onmessage?.({ data });
  }
}
const workers: { port: Port; onerror: (() => void) | null }[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  workers.length = 0;
  vi.stubGlobal("location", {
    href: "http://127.0.0.1:4173/",
    hostname: "127.0.0.1",
  });
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal("sessionStorage", { getItem: () => null, setItem: vi.fn() });
  vi.stubGlobal(
    "SharedWorker",
    class {
      port = new Port();
      onerror: (() => void) | null = null;
      constructor() {
        workers.push(this);
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
describe("local transport teardown and StrictMode reconnect", () => {
  it("waits for the close acknowledgement instead of discarding disconnect", () => {
    const room = new LocalWorldRoom("Test"),
      cleanup = room.connect(),
      p = workers[0].port;
    cleanup();
    expect(p.messages.at(-1)).toEqual({ kind: "disconnect" });
    expect(p.closed).toBe(false);
    p.receive({ kind: "closed" });
    expect(p.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("worker failure clears heartbeat and releases the transport, with a bounded close fallback", () => {
    const room = new LocalWorldRoom("Test"),
      cleanup = room.connect(),
      w = workers[0];
    w.onerror!();
    expect(room.getSnapshot().status).toBe("error");
    expect(w.port.messages.at(-1)).toEqual({ kind: "disconnect" });
    const n = w.port.messages.length;
    vi.advanceTimersByTime(11_000);
    expect(w.port.closed).toBe(true);
    expect(w.port.messages).toHaveLength(n);
    cleanup();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("a closed first StrictMode transport cannot clear the second session", () => {
    const room = new LocalWorldRoom("Test"),
      first = room.connect();
    first();
    const second = room.connect();
    workers[0].onerror!();
    workers[0].port.receive({ kind: "closed" });
    expect(currentMultiplayerRoom()).toBe(room);
    expect(room.getSnapshot().status).toBe("connecting");
    second();
    workers[1].port.receive({ kind: "closed" });
    expect(currentMultiplayerRoom()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    expect(vi.mocked(localStorage.setItem)).not.toHaveBeenCalled();
    expect(vi.mocked(sessionStorage.setItem)).toHaveBeenCalledWith(
      "la-baraj-local-preview-resume",
      expect.any(String),
    );
  });
  it("clears an unexpected worker-side close instead of keeping a ghost online session", () => {
    const room = new LocalWorldRoom("Test"),
      cleanup = room.connect();
    workers[0].port.receive({ kind: "closed" });
    expect(room.getSnapshot().status).toBe("error");
    expect(workers[0].port.closed).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    cleanup();
  });
});
