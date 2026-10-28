import { describe, expect, it, vi } from "vitest";
import { createSeatingRegistry } from "./bench-registry";
import type { BenchDefinition } from "./seating-types";

const bench: BenchDefinition = {
  id: "test-bench",
  label: "Bench",
  center: [0, 0.55, 0],
  width: 2.4,
  depth: 0.6,
  floorHeight: 0,
  facing: 0,
};
const standing = { x: 0, y: 0.95, z: 1 };

describe("bench registry", () => {
  it("derives safe capacities from width and limits authored capacity", () => {
    for (const [width, capacity] of [
      [0.3, 0],
      [0.9, 0],
      [1.02, 1],
      [1.7, 2],
      [2.4, 3],
      [4, 5],
    ]) {
      const registry = createSeatingRegistry();
      registry.registerBench({ ...bench, width, capacity: 100 });
      expect(registry.getBench(bench.id)?.seats).toHaveLength(capacity);
    }
    const registry = createSeatingRegistry();
    registry.registerBench({ ...bench, capacity: 2, seatSpacing: 0.1 });
    const seats = registry.getBench(bench.id)!.seats;
    expect(seats).toHaveLength(2);
    expect(seats[1].center[0] - seats[0].center[0]).toBeCloseTo(0.65);
    registry.registerBench({ ...bench, width: NaN });
    expect(registry.getBench(bench.id)).toBeUndefined();
  });

  it("centres non-overlapping seats symmetrically and rotates centres and root anchors", () => {
    const registry = createSeatingRegistry();
    registry.registerBench(bench);
    const seats = registry.getBench(bench.id)!.seats;
    expect(seats.map((seat) => seat.center[0])).toEqual([-0.65, 0, 0.65]);
    expect(seats[0].id).toBe(`${bench.id}:seat:0`);
    expect(seats[1].anchor).toEqual([0, 0, 0.33]);
    registry.registerBench({
      ...bench,
      center: [5, 2.55, 8],
      floorHeight: 2,
      facing: Math.PI / 2,
    });
    const rotated = registry.getBench(bench.id)!.seats;
    expect(rotated[0].center[0]).toBeCloseTo(5);
    expect(rotated[0].center[2]).toBeCloseTo(8.65);
    expect(rotated[1].anchor[0]).toBeCloseTo(5.33);
    expect(rotated[1].anchor[1]).toBe(2);
    expect(rotated[1].anchor[2]).toBeCloseTo(8);
    expect(rotated[1].seatHeight).toBe(2.55);
  });

  it("atomically seats three actors, denies a fourth, and frees seats for reclaim", () => {
    const registry = createSeatingRegistry();
    registry.registerBench(bench);
    const ids = registry.getBench(bench.id)!.seats.map((seat) => seat.id);
    ids.forEach((id, index) =>
      expect(registry.claimSeat(id, `actor-${index}`)?.occupantId).toBe(
        `actor-${index}`,
      ),
    );
    expect(
      registry.findAvailableSeat(bench.id, standing, "fourth"),
    ).toBeUndefined();
    for (const id of ids)
      expect(registry.claimSeat(id, "fourth")).toBeUndefined();
    expect(registry.findNearbyBench(standing)?.id).toBe(bench.id);
    registry.releaseSeat("actor-1");
    expect(registry.findAvailableSeat(bench.id, standing)?.id).toBe(ids[1]);
    expect(registry.claimSeat(ids[1], "fourth")?.occupantId).toBe("fourth");
  });

  it("keeps one seat per actor and idempotent claims preserve snapshots", () => {
    const registry = createSeatingRegistry();
    registry.registerBench(bench);
    const [first, second, third] = registry.getBench(bench.id)!.seats;
    const claimed = registry.claimSeat(first.id, "alice");
    const snapshot = registry.getBenches(),
      revision = registry.getSeatingRevision();
    expect(registry.claimSeat(first.id, "alice")).toBe(claimed);
    expect(registry.getBenches()).toBe(snapshot);
    expect(registry.getSeatingRevision()).toBe(revision);
    registry.claimSeat(second.id, "alice");
    expect(registry.getSeat(first.id)?.occupantId).toBeNull();
    registry.claimSeat(third.id, "bob");
    expect(registry.claimSeat(third.id, "alice")).toBeUndefined();
    expect(registry.getSeat(second.id)?.occupantId).toBe("alice");
    registry.releaseSeat("alice");
    expect(registry.getSeat(second.id)?.occupantId).toBeNull();
  });

  it("uses the usable footprint, respects floor height, and selects a full nearest bench", () => {
    const registry = createSeatingRegistry();
    registry.registerBench({ ...bench, width: 6 });
    expect(registry.findNearbyBench({ x: 4, y: 0.95, z: 0 })?.id).toBe(
      bench.id,
    );
    expect(registry.findNearbyBench({ x: 6, y: 0.95, z: 0 })).toBeUndefined();
    expect(registry.findNearbyBench({ x: 0, y: 3.95, z: 0 })).toBeUndefined();
    registry.registerBench({ ...bench, width: 1.02 });
    registry.registerBench({ ...bench, id: "farther", center: [0, 0.55, 2] });
    registry.claimSeat(`${bench.id}:seat:0`, "alice");
    expect(registry.findNearbyBench({ x: 0, y: 0.95, z: 0.3 })?.id).toBe(
      bench.id,
    );
    expect(registry.findNearbyBench({ ...standing, z: 10 })).toBeUndefined();
  });

  it("preserves occupants on metadata upsert, ignores stale cleanup, and releases removed seats", () => {
    const registry = createSeatingRegistry();
    const oldCleanup = registry.registerBench(bench);
    registry.claimSeat(`${bench.id}:seat:2`, "alice");
    const cleanup = registry.registerBench({
      ...bench,
      label: "Renamed",
      center: [1, 0.55, 0],
    });
    expect(registry.getSeat(`${bench.id}:seat:2`)?.occupantId).toBe("alice");
    oldCleanup();
    expect(registry.getBench(bench.id)?.label).toBe("Renamed");
    registry.registerBench({ ...bench, width: 1.02 });
    expect(registry.getSeat(`${bench.id}:seat:2`)).toBeUndefined();
    expect(registry.claimSeat(`${bench.id}:seat:0`, "alice")?.occupantId).toBe(
      "alice",
    );
    cleanup();
    expect(registry.getBench(bench.id)).toBeDefined();
    const remove = registry.registerBench(bench);
    remove();
    expect(registry.getBenches()).toEqual([]);
    expect(registry.getSeat(`${bench.id}:seat:0`)).toBeUndefined();
    registry.registerBench(bench);
    expect(registry.getSeat(`${bench.id}:seat:0`)?.occupantId).toBeNull();
  });

  it("publishes stable cached snapshots and revisions only for state changes", () => {
    const registry = createSeatingRegistry();
    const changed = vi.fn();
    const unsubscribe = registry.subscribeSeating(changed);
    const empty = registry.getBenches();
    expect(registry.getBenches()).toBe(empty);
    registry.registerBench(bench);
    const registered = registry.getBenches();
    expect(registered).not.toBe(empty);
    expect(registry.getBenches()).toBe(registered);
    expect(registry.getSeatingRevision()).toBe(1);
    registry.registerBench({ ...bench, center: [...bench.center] });
    expect(registry.getBenches()).toBe(registered);
    expect(registry.getSeatingRevision()).toBe(1);
    registry.releaseSeat("unknown");
    expect(changed).toHaveBeenCalledTimes(1);
    unsubscribe();
    registry.claimSeat(`${bench.id}:seat:0`, "alice");
    expect(changed).toHaveBeenCalledTimes(1);
  });
  it("applies room occupancy before registration and maps this session to the local actor", () => {
    const registry = createSeatingRegistry();
    const firstId = `${bench.id}:seat:0`, secondId = `${bench.id}:seat:1`;
    registry.syncOnlineSeats({ [firstId]: "friend", [secondId]: "me" }, "me");
    registry.registerBench(bench);
    expect(registry.getSeat(firstId)?.occupantId).toBe("friend");
    expect(registry.getSeat(secondId)?.occupantId).toBe("local-player");
    expect(registry.claimSeat(firstId, "local-player")).toBeUndefined();
    registry.syncOnlineSeats({ [firstId]: "friend" }, "me");
    expect(registry.getSeat(secondId)?.occupantId).toBeNull();
    registry.syncOnlineSeats({}, "");
    expect(registry.getBench(bench.id)?.seats.every((seat) => seat.occupantId === null)).toBe(true);
  });

});
