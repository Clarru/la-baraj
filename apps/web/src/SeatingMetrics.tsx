import { useSyncExternalStore } from "react";
import {
  getBenches,
  getSeatingRevision,
  subscribeSeating,
} from "./bench-registry";
/** Public diagnostics for inspecting logical bench/seat entities without scene guessing. */
export function SeatingMetrics() {
  useSyncExternalStore(
    subscribeSeating,
    getSeatingRevision,
    getSeatingRevision,
  );
  const benches = getBenches();
  return (
    <output
      hidden
      data-testid="seating-metrics"
      data-seating={JSON.stringify({
        benches: benches.map((b) => ({
          id: b.id,
          label: b.label,
          capacity: b.seats.length,
          free: b.seats.filter((s) => s.occupantId === null && !s.reservedBy)
            .length,
          center: b.center,
          seats: b.seats.map((s) => ({
            id: s.id,
            number: s.index + 1,
            center: s.center,
            anchor: s.anchor,
            facing: s.facing,
            occupant: s.occupantId,
            reservedBy: s.reservedBy ?? null,
          })),
        })),
        benchCount: benches.length,
        capacity: benches.reduce((n, b) => n + b.seats.length, 0),
      })}
    />
  );
}
