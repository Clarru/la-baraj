import type { NavigationSample } from "./home";

/** Only the minimap subscribes to motion; the 3D scene need not rerender with it. */
export function createNavigationFeed(initial: NavigationSample) {
  let current = initial;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    update(next: NavigationSample) {
      if (![next.x, next.z, next.heading].every(Number.isFinite)) return;
      if (
        next.x === current.x &&
        next.z === current.z &&
        next.heading === current.heading
      )
        return;
      current = next;
      for (const listener of listeners) listener();
    },
  };
}
export type NavigationFeed = ReturnType<typeof createNavigationFeed>;
