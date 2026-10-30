/** StrictMode replays cleanup/setup synchronously. Dispose only after the final lease. */
export function createArcadeResourceLifetime(dispose: () => void) {
  let leases = 0,
    disposed = false;
  return () => {
    leases++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      leases--;
      queueMicrotask(() => {
        if (leases === 0 && !disposed) {
          disposed = true;
          dispose();
        }
      });
    };
  };
}
