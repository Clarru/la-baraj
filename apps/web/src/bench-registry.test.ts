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
  it("reserves the departing seat during an adjacent move and releases only that reservation on finish", () => {
    const registry = createSeatingRegistry();
    registry.registerBench(bench);
    const [first, second, third] = registry.getBench(bench.id)!.seats;
    registry.claimSeat(first.id, "alice");
    registry.claimSeat(third.id, "bob");
    const move = registry.moveSeat("alice", 1)!;
    expect(move.from.id).toBe(first.id);
    expect(move.to.id).toBe(second.id);
    expect(registry.getSeat(first.id)).toMatchObject({
      occupantId: null,
      reservedBy: "alice",
    });
    expect(registry.getSeat(second.id)?.occupantId).toBe("alice");
    expect(registry.claimSeat(first.id, "charlie")).toBeUndefined();
    expect(registry.claimSeat(first.id, "alice")).toBeUndefined();
    expect(
      registry.findAvailableSeat(bench.id, standing, "charlie"),
    ).toBeUndefined();
    expect(registry.claimSeat(second.id, "alice")).toBe(
      registry.getSeat(second.id),
    );
    const revision = registry.getSeatingRevision();
    expect(registry.moveSeat("alice", -1)).toBeUndefined();
    expect(registry.moveSeat("alice", 1)).toBeUndefined();
    expect(registry.getSeatingRevision()).toBe(revision);
    expect(registry.finishSeatMove("alice")?.id).toBe(second.id);
    expect(registry.getSeat(first.id)).toMatchObject({
      occupantId: null,
      reservedBy: null,
    });
    expect(registry.getSeat(second.id)?.occupantId).toBe("alice");
    expect(registry.getSeat(third.id)?.occupantId).toBe("bob");
    expect(registry.claimSeat(first.id, "charlie")?.occupantId).toBe("charlie");
  });

  it("rejects edges and occupied or reserved neighbours without skipping or changing state", () => {
    const registry = createSeatingRegistry();
    registry.registerBench({ ...bench, width: 3.1 });
    const [first, second, third, fourth] = registry.getBench(bench.id)!.seats;
    registry.claimSeat(first.id, "alice");
    registry.claimSeat(second.id, "bob");
    const snapshot = registry.getBenches();
    expect(registry.moveSeat("alice", -1)).toBeUndefined();
    expect(registry.moveSeat("alice", 1)).toBeUndefined();
    expect(registry.moveSeat("missing", 1)).toBeUndefined();
    expect(registry.getBenches()).toBe(snapshot);
    registry.moveSeat("bob", 1);
    expect(registry.moveSeat("alice", 1)).toBeUndefined();
    expect(registry.getSeat(second.id)?.reservedBy).toBe("bob");
    expect(registry.getSeat(third.id)?.occupantId).toBe("bob");
    expect(registry.claimSeat(fourth.id, "bob")).toBeUndefined();
    expect(registry.findAvailableSeat(bench.id, standing, "bob")?.id).toBe(
      third.id,
    );
    registry.finishSeatMove("bob");
    expect(registry.moveSeat("bob", -1)?.to.id).toBe(second.id);
  });

  it("clears both occupied and reserved seats when an actor leaves mid-move", () => {
    const registry = createSeatingRegistry();
    registry.registerBench(bench);
    const [first, second] = registry.getBench(bench.id)!.seats;
    registry.claimSeat(first.id, "alice");
    registry.moveSeat("alice", 1);
    registry.releaseSeat("alice");
    expect(registry.finishSeatMove("alice")).toBeUndefined();
    expect(registry.getSeat(first.id)).toMatchObject({
      occupantId: null,
      reservedBy: null,
    });
    expect(registry.getSeat(second.id)).toMatchObject({
      occupantId: null,
      reservedBy: null,
    });
    expect(registry.claimSeat(first.id, "bob")?.occupantId).toBe("bob");
    expect(registry.claimSeat(second.id, "charlie")?.occupantId).toBe(
      "charlie",
    );
  });

  it("preserves a pending reservation across upserts and clears it if its destination is removed", () => {
    const registry = createSeatingRegistry();
    registry.registerBench(bench);
    const [first, second] = registry.getBench(bench.id)!.seats;
    registry.claimSeat(first.id, "alice");
    registry.moveSeat("alice", 1);
    registry.registerBench({
      ...bench,
      label: "Updated",
      center: [2, 0.55, 0],
    });
    expect(registry.getSeat(first.id)?.reservedBy).toBe("alice");
    expect(registry.getSeat(second.id)?.occupantId).toBe("alice");
    expect(registry.moveSeat("alice", 1)).toBeUndefined();
    registry.registerBench({ ...bench, capacity: 1 });
    expect(registry.getSeat(first.id)).toMatchObject({
      occupantId: null,
      reservedBy: null,
    });
    expect(registry.finishSeatMove("alice")).toBeUndefined();
    expect(registry.claimSeat(first.id, "bob")?.occupantId).toBe("bob");
  });

  it("keeps a surviving destination occupied if the source is removed and cleans moves on unmount", () => {
    const registry = createSeatingRegistry();
    registry.registerBench(bench);
    const [first, second] = registry.getBench(bench.id)!.seats;
    registry.claimSeat(second.id, "alice");
    registry.moveSeat("alice", -1);
    registry.registerBench({ ...bench, capacity: 1 });
    expect(registry.getSeat(first.id)?.occupantId).toBe("alice");
    expect(registry.finishSeatMove("alice")).toBeUndefined();
    const unmount = registry.registerBench(bench);
    expect(registry.moveSeat("alice", 1)).toBeDefined();
    unmount();
    expect(registry.finishSeatMove("alice")).toBeUndefined();
    registry.registerBench(bench);
    expect(
      registry
        .getBench(bench.id)
        ?.seats.every(
          (seat) => seat.occupantId === null && seat.reservedBy === null,
        ),
    ).toBe(true);
    expect(registry.claimSeat(first.id, "alice")?.occupantId).toBe("alice");
  });

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

  it("preserves a local authored scoot reservation while applying the server destination", () => {
    const registry = createSeatingRegistry();
    registry.registerBench(bench);
    const first = `${bench.id}:seat:0`, second = `${bench.id}:seat:1`;
    registry.syncOnlineSeats({ [first]: "me" }, "me");
    expect(registry.moveSeat("local-player", 1)?.to.id).toBe(second);
    registry.syncOnlineSeats({ [second]: "me" }, "me");
    expect(registry.getSeat(first)?.reservedBy).toBe("local-player");
    expect(registry.getSeat(second)?.occupantId).toBe("local-player");
    registry.finishSeatMove("local-player");
    expect(registry.getSeat(first)?.reservedBy).toBeNull();
    registry.syncOnlineSeats({}, "");
    expect(registry.getSeat(second)?.occupantId).toBeNull();
  });

});
