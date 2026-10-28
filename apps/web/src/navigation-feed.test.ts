import { describe, expect, it, vi } from "vitest";
import { createNavigationFeed } from "./navigation-feed";

describe("minimap motion subscription", () => {
  it("notifies only the map when motion changes, with a stable idle snapshot", () => {
    const initial = { x: 10, z: 20, heading: 0 };
    const feed = createNavigationFeed(initial);
    const listener = vi.fn();
    const unsubscribe = feed.subscribe(listener);
    feed.update({ ...initial });
    feed.update({ x: NaN, z: 20, heading: 0 });
    expect(feed.getSnapshot()).toBe(initial);
    expect(listener).not.toHaveBeenCalled();
    const next = { x: 11, z: 21, heading: 1 };
    feed.update(next);
    expect(listener).toHaveBeenCalledOnce();
    expect(feed.getSnapshot()).toBe(next);
    unsubscribe();
    feed.update({ x: 12, z: 21, heading: 1 });
    expect(listener).toHaveBeenCalledOnce();
  });
});
