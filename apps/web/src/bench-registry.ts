import type {
  BenchDefinition,
  BenchSeat,
  RegisteredBench,
} from "./seating-types";

type Position = { x: number; y: number; z: number };
const minimumSpacing = 0.65;
const rootOffset = 0.33;
const capsuleCenterHeight = 0.95;
const floorTolerance = 0.8;

function sameDefinition(
  left: BenchDefinition,
  right: BenchDefinition,
): boolean {
  return (
    left.id === right.id &&
    left.label === right.label &&
    left.center.every((value, index) => value === right.center[index]) &&
    left.width === right.width &&
    left.depth === right.depth &&
    left.floorHeight === right.floorHeight &&
    left.facing === right.facing &&
    left.capacity === right.capacity &&
    left.endMargin === right.endMargin &&
    left.seatSpacing === right.seatSpacing
  );
}

/** Shared occupancy within this running world. A network authority can replace this later. */
export function createSeatingRegistry() {
  const benches = new Map<string, RegisteredBench>();
  const registrations = new Map<string, symbol>();
  const actors = new Map<string, string>();
  const listeners = new Set<() => void>();
  let seats = new Map<string, BenchSeat>();
  let snapshot: readonly RegisteredBench[] = [];
  let revision = 0;
  let onlineSeats: Record<string, string> = {};
  let onlineSelfId = "";

  function publish() {
    snapshot = [...benches.values()];
    seats = new Map(
      snapshot.flatMap((bench) =>
        bench.seats.map((seat) => [seat.id, seat] as const),
      ),
    );
    actors.clear();
    for (const seat of seats.values()) {
      if (seat.occupantId !== null) actors.set(seat.occupantId, seat.id);
    }
    revision++;
    for (const listener of [...listeners]) listener();
  }

  function registerBench(definition: BenchDefinition): () => void {
    const token = Symbol(definition.id);
    registrations.set(definition.id, token);
    const previous = benches.get(definition.id);
    const margin = definition.endMargin ?? 0.18;
    const spacing = Math.max(
      minimumSpacing,
      definition.seatSpacing ?? minimumSpacing,
    );
    const valid =
      Boolean(definition.id) &&
      [
        ...definition.center,
        definition.width,
        definition.depth,
        definition.floorHeight,
        definition.facing,
        margin,
        spacing,
      ].every(Number.isFinite) &&
      definition.width > 0 &&
      definition.depth > 0 &&
      margin >= 0;

    if (valid && (!previous || !sameDefinition(previous, definition))) {
      const safeCapacity = Math.max(
        0,
        Math.floor((definition.width - 2 * margin) / spacing),
      );
      const requested =
        definition.capacity === undefined
          ? safeCapacity
          : Number.isFinite(definition.capacity)
            ? Math.max(0, Math.floor(definition.capacity))
            : 0;
      const capacity = Math.min(safeCapacity, requested);
      const sin = Math.sin(definition.facing),
        cos = Math.cos(definition.facing);
      const benchSeats: BenchSeat[] = Array.from(
        { length: capacity },
        (_, index) => {
          const offset = (index - (capacity - 1) / 2) * spacing;
          const center: [number, number, number] = [
            definition.center[0] + cos * offset,
            definition.center[1],
            definition.center[2] - sin * offset,
          ];
          return {
            id: `${definition.id}:seat:${index}`,
            benchId: definition.id,
            index,
            center,
            anchor: [
              center[0] + sin * rootOffset,
              definition.floorHeight,
              center[2] + cos * rootOffset,
            ],
            facing: definition.facing,
            seatHeight: center[1],
            occupantId: onlineSelfId
              ? (onlineSeats[`${definition.id}:seat:${index}`] === onlineSelfId ? "local-player" : onlineSeats[`${definition.id}:seat:${index}`] ?? null)
              : previous?.seats[index]?.occupantId ?? null,
          };
        },
      );
      benches.set(definition.id, {
        ...definition,
        center: [...definition.center],
        seats: benchSeats,
      });
      publish();
    } else if (!valid && benches.delete(definition.id)) {
      publish();
    }

    return () => {
      // React cleanups for older renders cannot remove the latest registration.
      if (registrations.get(definition.id) !== token) return;
      registrations.delete(definition.id);
      if (benches.delete(definition.id)) publish();
    };
  }

  function findNearbyBench(
    position: Position,
    radius = 2.4,
  ): RegisteredBench | undefined {
    if (
      ![position.x, position.y, position.z, radius].every(Number.isFinite) ||
      radius < 0
    )
      return;
    let nearest: RegisteredBench | undefined;
    let nearestDistance = radius;
    for (const bench of snapshot) {
      if (
        !bench.seats.length ||
        Math.abs(position.y - bench.floorHeight - capsuleCenterHeight) >
          floorTolerance
      )
        continue;
      const dx = position.x - bench.center[0],
        dz = position.z - bench.center[2];
      const sin = Math.sin(bench.facing),
        cos = Math.cos(bench.facing);
      const across = dx * cos - dz * sin;
      const forward = dx * sin + dz * cos;
      const halfWidth = Math.max(
        0,
        bench.width / 2 - (bench.endMargin ?? 0.18),
      );
      const distance = Math.hypot(
        Math.max(0, Math.abs(across) - halfWidth),
        Math.max(0, Math.abs(forward) - bench.depth / 2),
      );
      // Occupancy deliberately does not affect selection: the closest bench can be full.
      if (
        distance <= nearestDistance &&
        (!nearest || distance < nearestDistance)
      ) {
        nearest = bench;
        nearestDistance = distance;
      }
    }
    return nearest;
  }

  function findAvailableSeat(
    benchId: string,
    position: Position,
    actorId?: string,
  ): BenchSeat | undefined {
    if (![position.x, position.y, position.z].every(Number.isFinite)) return;
    let nearest: BenchSeat | undefined;
    let distance = Infinity;
    for (const seat of benches.get(benchId)?.seats ?? []) {
      if (seat.occupantId !== null && seat.occupantId !== actorId) continue;
      const candidate = Math.hypot(
        position.x - seat.anchor[0],
        position.z - seat.anchor[2],
      );
      if (candidate < distance) {
        nearest = seat;
        distance = candidate;
      }
    }
    return nearest;
  }

  function setOccupant(seatId: string, occupantId: string | null) {
    const seat = seats.get(seatId);
    if (!seat) return;
    const bench = benches.get(seat.benchId)!;
    benches.set(bench.id, {
      ...bench,
      seats: bench.seats.map((current) =>
        current.id === seatId ? { ...current, occupantId } : current,
      ),
    });
  }

  function claimSeat(seatId: string, actorId: string): BenchSeat | undefined {
    if (!actorId) return;
    const seat = seats.get(seatId);
    if (!seat || (seat.occupantId !== null && seat.occupantId !== actorId))
      return;
    if (seat.occupantId === actorId) return seat;
    const previous = actors.get(actorId);
    if (previous) setOccupant(previous, null);
    setOccupant(seatId, actorId);
    publish();
    return seats.get(seatId);
  }

  function releaseSeat(actorId: string): void {
    const seatId = actors.get(actorId);
    if (!seatId) return;
    setOccupant(seatId, null);
    publish();
  }

  function syncOnlineSeats(occupancy: Record<string, string>, selfId: string) {
    onlineSeats = occupancy;
    onlineSelfId = selfId;
    let changed = false;
    for (const bench of benches.values()) {
      const updated = bench.seats.map((seat) => {
        const actor = occupancy[seat.id];
        const occupantId = actor === selfId && selfId ? "local-player" : actor ?? null;
        if (seat.occupantId !== occupantId) changed = true;
        return seat.occupantId === occupantId ? seat : { ...seat, occupantId };
      });
      benches.set(bench.id, { ...bench, seats: updated });
    }
    if (changed) publish();
  }

  return {
    syncOnlineSeats,
    registerBench,
    getBenches: (): readonly RegisteredBench[] => snapshot,
    getBench: (id: string): RegisteredBench | undefined => benches.get(id),
    getSeat: (id: string): BenchSeat | undefined => seats.get(id),
    findNearbyBench,
    findAvailableSeat,
    claimSeat,
    releaseSeat,
    subscribeSeating: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    getSeatingRevision: (): number => revision,
  };
}

const registry = createSeatingRegistry();
export const {
  syncOnlineSeats,
  registerBench,
  getBenches,
  getBench,
  getSeat,
  findNearbyBench,
  findAvailableSeat,
  claimSeat,
  releaseSeat,
  subscribeSeating,
  getSeatingRevision,
} = registry;
