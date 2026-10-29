import { describe, expect, it, vi } from "vitest";
import { bindPunchPointer } from "./punch-input";

describe("punch pointer control", () => {
  it("reserves middle click before the camera and removes both listeners", () => {
    const listeners = new Map<string, Function>();
    const target = {
      addEventListener: vi.fn((type, callback) =>
        listeners.set(type, callback),
      ),
      removeEventListener: vi.fn((type, callback) => {
        if (listeners.get(type) === callback) listeners.delete(type);
      }),
    };
    const punch = vi.fn();
    const unbind = bindPunchPointer(target as unknown as HTMLElement, punch);
    const event = {
      pointerId: 1,
      clientX: 10,
      clientY: 10,
      button: 1,
      pointerType: "mouse",
      preventDefault: vi.fn(),
      stopImmediatePropagation: vi.fn(),
    };
    listeners.get("pointerdown")!(event);
    expect(punch).not.toHaveBeenCalled();
    listeners.get("pointerup")!(event);
    expect(punch).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledTimes(2);
    expect(event.stopImmediatePropagation).toHaveBeenCalledTimes(2);
    for (const change of [
      { button: 0 },
      { button: 2 },
      { ctrlKey: true },
      { pointerType: "touch" },
    ])
      listeners.get("pointerdown")!({ ...event, ...change });
    expect(punch).toHaveBeenCalledOnce();
    listeners.get("auxclick")!(event);
    expect(event.preventDefault).toHaveBeenCalledTimes(3);
    for (const cancel of [
      "pointercancel",
      "pointerleave",
      "lostpointercapture",
    ]) {
      listeners.get("pointerdown")!(event);
      listeners.get(cancel)!(event);
      listeners.get("pointerup")!(event);
    }
    listeners.get("pointerdown")!(event);
    listeners.get("pointermove")!({ ...event, clientX: 20 });
    listeners.get("pointerup")!(event);
    expect(punch).toHaveBeenCalledOnce();
    unbind();
    expect(listeners.size).toBe(0);
  });
});
