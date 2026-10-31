// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { bindMobileJoystick } from "./mobile-joystick";
type Create = Parameters<typeof bindMobileJoystick>[1];
const disposals: (() => void)[] = [];
beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  disposals.splice(0).forEach((f) => f());
  document.body.innerHTML = "";
  vi.useRealTimers();
});
function harness() {
  const managers: {
    start: (id: number) => void;
    move: (id: number, x: number, y: number) => void;
    end: (id: number) => void;
    destroy: ReturnType<typeof vi.fn>;
  }[] = [];
  const live = new Set<object>();
  const create = vi.fn(() => {
    const handlers = new Map<string, (event: { data: unknown }) => void>();
    const emit = (name: string, data: unknown) =>
      handlers.get(name)?.({ data });
    const m = {
      on: (name: string, cb: (event: { data: unknown }) => void) => {
        handlers.set(name, cb);
      },
      start: (id: number) => emit("start", { identifier: id }),
      move: (id: number, x: number, y: number) =>
        emit("move", { instance: { identifier: id }, vector: { x, y } }),
      end: (id: number) => emit("end", { identifier: id }),
      destroy: vi.fn(() => live.delete(m)),
    };
    managers.push(m);
    live.add(m);
    return m;
  });
  return { create: create as unknown as Create, calls: create, managers, live };
}
function zone() {
  const node = document.createElement("div");
  document.body.append(node);
  return node;
}
function touch(
  target: HTMLElement,
  type: string,
  id: number,
  touches: { identifier: number; target: HTMLElement }[],
) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, {
    changedTouches: [{ identifier: id, target }],
    touches,
  });
  target.dispatchEvent(event);
}
it("normal short taps immediately clear axes and reuse one manager repeatedly", () => {
  const h = harness(),
    el = zone(),
    axes = vi.fn();
  disposals.push(bindMobileJoystick(el, h.create, axes));
  for (let i = 0; i < 50; i++) {
    const t = { identifier: i, target: el };
    h.managers[0].start(i);
    touch(el, "touchstart", i, [t]);
    h.managers[0].move(i, 0.5, 0.5);
    touch(el, "touchend", i, []);
    h.managers[0].end(i);
    vi.advanceTimersByTime(40);
    expect(axes).toHaveBeenLastCalledWith(0, 0);
  }
  expect(h.calls).toHaveBeenCalledTimes(1);
  expect(h.live.size).toBe(1);
});
it("a missing pointer end zeros external input and publicly rearms a usable next gesture", () => {
  const h = harness(),
    el = zone(),
    axes = vi.fn();
  disposals.push(bindMobileJoystick(el, h.create, axes));
  const first = h.managers[0];
  first.start(1);
  touch(el, "touchstart", 101, [{ identifier: 101, target: el }]);
  first.move(1, 0.4, 0.8);
  touch(el, "touchend", 101, []);
  expect(axes).toHaveBeenLastCalledWith(0, 0);
  first.move(1, 0.7, 0.7);
  expect(axes).toHaveBeenLastCalledWith(0, 0);
  vi.advanceTimersByTime(40);
  expect(first.destroy).toHaveBeenCalledOnce();
  expect(h.calls).toHaveBeenCalledTimes(2);
  expect(h.live.size).toBe(1);
  const next = h.managers[1];
  next.start(2);
  touch(el, "touchstart", 102, [{ identifier: 102, target: el }]);
  next.move(2, -0.6, 0.2);
  expect(axes).toHaveBeenLastCalledWith(-0.6, -0.2);
  first.end(1);
  expect(axes).toHaveBeenLastCalledWith(-0.6, -0.2);
});
it("recovering Move uses its native identifier and leaves held Look completely untouched", () => {
  const h = harness(),
    move = zone(),
    look = zone(),
    m = vi.fn(),
    l = vi.fn();
  disposals.push(
    bindMobileJoystick(move, h.create, m),
    bindMobileJoystick(look, h.create, l),
  );
  h.managers[0].start(1);
  touch(move, "touchstart", 101, [{ identifier: 101, target: move }]);
  h.managers[0].move(1, 0.3, 0.9);
  h.managers[1].start(2);
  touch(look, "touchstart", 202, [
    { identifier: 101, target: move },
    { identifier: 202, target: look },
  ]);
  h.managers[1].move(2, 0.7, -0.4);
  const calls = l.mock.calls.length;
  touch(move, "touchend", 101, [{ identifier: 202, target: look }]);
  vi.advanceTimersByTime(40);
  expect(m).toHaveBeenLastCalledWith(0, 0);
  expect(l.mock.calls.length).toBe(calls);
  expect(l).toHaveBeenLastCalledWith(0.7, 0.4);
  expect(h.managers[1].destroy).not.toHaveBeenCalled();
  expect(h.live.size).toBe(2);
});
it("a new gesture before the deferred check cannot be zeroed or destroyed by the old one", () => {
  const h = harness(),
    el = zone(),
    axes = vi.fn();
  disposals.push(bindMobileJoystick(el, h.create, axes));
  h.managers[0].start(1);
  touch(el, "touchstart", 10, [{ identifier: 10, target: el }]);
  h.managers[0].move(1, 0.2, 0.5);
  touch(el, "touchend", 10, []);
  el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  const fresh = h.managers[1];
  fresh.start(2);
  touch(el, "touchstart", 20, [{ identifier: 20, target: el }]);
  fresh.move(2, 0.8, 0.1);
  vi.advanceTimersByTime(50);
  expect(h.live.size).toBe(1);
  expect(fresh.destroy).not.toHaveBeenCalled();
  expect(axes).toHaveBeenLastCalledWith(0.8, -0.1);
});
it("a normal rapid new contact reuses the manager and ignores an old identifier's end", () => {
  const h = harness(),
    el = zone(),
    axes = vi.fn();
  disposals.push(bindMobileJoystick(el, h.create, axes));
  const m = h.managers[0];
  m.start(1);
  touch(el, "touchstart", 10, [{ identifier: 10, target: el }]);
  m.move(1, 0.3, 0.4);
  touch(el, "touchend", 10, []);
  m.end(1);
  el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  m.start(2);
  touch(el, "touchstart", 20, [{ identifier: 20, target: el }]);
  m.move(2, 0.7, 0.2);
  m.end(1);
  vi.advanceTimersByTime(50);
  expect(h.calls).toHaveBeenCalledTimes(1);
  expect(axes).toHaveBeenLastCalledWith(0.7, -0.2);
});
it("blur suspends managers, focus rebuilds once, and late callbacks after dispose have no effect", () => {
  const h = harness(),
    el = zone(),
    axes = vi.fn();
  const dispose = bindMobileJoystick(el, h.create, axes);
  h.managers[0].start(1);
  h.managers[0].move(1, 0.4, 0.5);
  window.dispatchEvent(new Event("blur"));
  expect(h.live.size).toBe(0);
  expect(axes).toHaveBeenLastCalledWith(0, 0);
  window.dispatchEvent(new Event("focus"));
  expect(h.live.size).toBe(1);
  h.managers[1].start(2);
  h.managers[1].move(2, 0.6, 0.3);
  expect(axes).toHaveBeenLastCalledWith(0.6, -0.3);
  dispose();
  const count = axes.mock.calls.length;
  h.managers[1].move(2, 0.9, 0.9);
  h.managers[1].end(2);
  vi.advanceTimersByTime(100);
  expect(axes.mock.calls.length).toBe(count);
  expect(h.live.size).toBe(0);
});

it("an old native end cannot clear a new native identifier after a rapid restart", () => {
  const h = harness(),
    el = zone(),
    axes = vi.fn();
  disposals.push(bindMobileJoystick(el, h.create, axes));
  const m = h.managers[0];
  m.start(1);
  touch(el, "touchstart", 10, [{ identifier: 10, target: el }]);
  m.move(1, 0.3, 0.2);
  m.end(1);
  m.start(2);
  touch(el, "touchstart", 20, [{ identifier: 20, target: el }]);
  m.move(2, 0.8, 0.4);
  touch(el, "touchend", 10, []);
  vi.advanceTimersByTime(50);
  expect(axes).toHaveBeenLastCalledWith(0.8, -0.4);
  expect(h.calls).toHaveBeenCalledTimes(1);
});

it("a fresh trusted input path can rearm after Safari omits a focus-return event", () => {
  const h = harness(),
    el = zone(),
    axes = vi.fn();
  disposals.push(bindMobileJoystick(el, h.create, axes));
  window.dispatchEvent(new Event("blur"));
  expect(h.live.size).toBe(0);
  el.dispatchEvent(new Event("pointerdown", { bubbles: true }));
  expect(h.live.size).toBe(1);
  const m = h.managers[1];
  m.start(2);
  touch(el, "touchstart", 20, [{ identifier: 20, target: el }]);
  m.move(2, 0.5, 0.7);
  expect(axes).toHaveBeenLastCalledWith(0.5, -0.7);
});
