// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useArcadeEntry } from "./use-arcade-entry";
import type { MultiplayerRoom } from "./multiplayer";
type RoomView = ReturnType<MultiplayerRoom["getSnapshot"]>;
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(() => root.unmount());
  document.body.replaceChildren();
});
async function fixture() {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let near = true;
  const snapshot = {
    status: "online",
    error: "",
    arcadeAvailable: true,
    selfId: "you",
    arcadeStations: [],
    arcade2048: null,
  } as unknown as RoomView;
  const waiting: ((error: string | null) => void)[] = [],
    room = {
      getSnapshot: () => snapshot,
      arcadeAction: vi.fn(
        () => new Promise<string | null>((resolve) => waiting.push(resolve)),
      ),
      leaveArcade: vi.fn(),
    },
    opened = vi.fn(),
    canApproach = () => near;
  let controls: ReturnType<typeof useArcadeEntry>;
  function Harness({
    enabled = true,
    blocked = false,
  }: {
    enabled?: boolean;
    blocked?: boolean;
  }) {
    controls = useArcadeEntry(
      room as unknown as MultiplayerRoom,
      enabled,
      blocked,
      canApproach,
      opened,
    );
    return null;
  }
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  roots.push(root);
  await act(() => root.render(<Harness />));
  return {
    room,
    snapshot,
    opened,
    waiting,
    controls: () => controls!,
    near: (value: boolean) => {
      near = value;
    },
    render: (enabled = true, blocked = false) =>
      act(() => root.render(<Harness enabled={enabled} blocked={blocked} />)),
    unmount: () =>
      act(() => {
        roots.splice(roots.indexOf(root), 1);
        root.unmount();
      }),
    resolve: async (index: number, id: number, error: string | null = null) =>
      act(async () => {
        snapshot.arcadeStations = [
          {
            id,
            playerId: "you",
            name: "You",
            game: null,
            best: 0,
            direction: null,
          },
        ];
        waiting[index](error);
      }),
  };
}
it("releases a pending claim immediately, allows retry, and an old completion cannot clear or release the new opening", async () => {
  const f = await fixture();
  let old!: Promise<void>, fresh!: Promise<void>;
  await act(() => {
    old = f.controls().open(0);
  });
  expect(f.controls().opening).toBe(true);
  expect(f.controls().stationId).toBeNull();
  await act(() => f.controls().close());
  expect(f.room.leaveArcade).toHaveBeenCalledWith(0);
  expect(f.controls().opening).toBe(false);
  await act(() => {
    fresh = f.controls().open(0);
  });
  expect(f.room.arcadeAction).toHaveBeenCalledTimes(2);
  await f.resolve(0, 0);
  await old;
  expect(f.controls().opening).toBe(true);
  expect(f.controls().stationId).toBeNull();
  expect(f.room.leaveArcade).toHaveBeenCalledTimes(1);
  await f.resolve(1, 0);
  await fresh;
  expect(f.controls().stationId).toBe(0);
  expect(f.controls().opening).toBe(false);
  expect(f.opened).toHaveBeenCalledTimes(1);
});
it("releases pending entry on menu/eligibility change and on unmount without waiting for a response", async () => {
  const f = await fixture();
  await act(() => {
    void f.controls().open(1);
  });
  await f.render(false);
  expect(f.room.leaveArcade).toHaveBeenCalledWith(1);
  expect(f.controls().opening).toBe(false);
  await f.render(true);
  await act(() => {
    void f.controls().open(2);
  });
  await f.unmount();
  expect(f.room.leaveArcade).toHaveBeenLastCalledWith(2);
  await f.resolve(0, 1);
  await f.resolve(1, 2);
  expect(f.room.leaveArcade).toHaveBeenCalledTimes(2);
  expect(f.opened).not.toHaveBeenCalled();
});
it("releases timed-out or out-of-range entry without focusing and closes an occupied restored game", async () => {
  const f = await fixture();
  await act(() => {
    void f.controls().open(0);
  });
  await f.resolve(0, 0, "Connection timed out.");
  expect(f.room.leaveArcade).toHaveBeenCalledWith(0);
  expect(f.controls().error).toContain("timed out");
  expect(f.controls().stationId).toBeNull();
  await act(() => {
    void f.controls().open(1);
  });
  f.near(false);
  await f.resolve(1, 1);
  expect(f.room.leaveArcade).toHaveBeenLastCalledWith(1);
  expect(f.opened).not.toHaveBeenCalled();
  f.near(true);
  await act(() => {
    void f.controls().open(2);
  });
  await f.resolve(2, 2);
  expect(f.controls().stationId).toBe(2);
  await f.render(true, true);
  expect(f.controls().stationId).toBeNull();
  expect(f.controls().error).toContain("occupied");
  expect(f.room.leaveArcade).toHaveBeenLastCalledWith(2);
});
it("never sends a claim for an occupied cabinet or an offline world", async () => {
  const f = await fixture();
  f.snapshot.arcadeStations = [
    {
      id: 0,
      playerId: "friend",
      name: "Friend",
      game: null,
      best: 0,
      direction: null,
    },
  ];
  await act(() => f.controls().open(0));
  expect(f.controls().error).toContain("Occupied");
  f.snapshot.status = "offline";
  await act(() => f.controls().open(1));
  expect(f.controls().error).toContain("online");
  expect(f.room.arcadeAction).not.toHaveBeenCalled();
});
