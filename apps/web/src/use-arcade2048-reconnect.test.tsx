// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useArcade2048, arcadeConnectionMessage } from "./use-arcade2048";
import { arcadeDisplayBoard, arcadeGpuTilesVisible } from "./arcade2048-screen";
import type { MultiplayerRoom } from "./multiplayer";
import type { ArcadeView } from "../../../packages/shared/arcade2048";
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  document.body.replaceChildren();
});
const saved: ArcadeView = {
  ranked: true,
  best: 16,
  leaders: [],
  game: {
    board: [4, 2, ...Array(14).fill(0)],
    score: 4,
    moves: 2,
    revision: 3,
    continued: false,
  },
};
async function fixture(status = "online", error = "") {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let snapshot = {
    status,
    error,
    arcadeAvailable: true,
    arcade2048: null as ArcadeView | null,
  };
  const listeners = new Set<() => void>(),
    pending: ((failure: string | null) => void)[] = [];
  const room = {
    localPreview: false,
    getSnapshot: () => snapshot,
    subscribe: (f: () => void) => {
      listeners.add(f);
      return () => {
        listeners.delete(f);
      };
    },
    arcadeAction: vi.fn(
      () => new Promise<string | null>((resolve) => pending.push(resolve)),
    ),
  };
  let controls: ReturnType<typeof useArcade2048>;
  function Harness() {
    controls = useArcade2048(room as unknown as MultiplayerRoom, true);
    return null;
  }
  const node = document.createElement("div");
  document.body.append(node);
  const root = createRoot(node);
  roots.push(root);
  await act(async () => root.render(<Harness />));
  return {
    room,
    pending,
    controls: () => controls!,
    publish: async (patch: Partial<typeof snapshot>) =>
      act(async () => {
        snapshot = { ...snapshot, ...patch };
        listeners.forEach((f) => f());
      }),
  };
}
it("starts a fresh restore after reconnect even while the old request is unfinished, and ignores its late failure", async () => {
  const f = await fixture();
  expect(f.room.arcadeAction).toHaveBeenCalledTimes(1);
  await f.publish({ status: "reconnecting" });
  expect(f.controls().state.pending).toBe(false);
  expect(f.controls().state.error).toContain(
    "Reconnecting to the shared world",
  );
  await f.publish({ status: "online" });
  expect(f.room.arcadeAction).toHaveBeenCalledTimes(2);
  expect(f.controls().state.pending).toBe(true);
  expect(f.controls().state.error).toBe("");
  await act(async () => f.pending[0]("Connection closed."));
  expect(f.controls().state.pending).toBe(true);
  expect(f.controls().state.error).toBe("");
  await f.publish({ arcade2048: saved });
  await act(async () => f.pending[1](null));
  expect(f.controls().state.pending).toBe(false);
  expect(f.controls().state.view).toEqual(saved);
  expect(f.controls().state.error).toBe("");
});
it("shows the actual offline failure, sends no arcade commands, and never presents the demo as a personal board", async () => {
  const f = await fixture("offline", "Room server is not configured");
  expect(f.controls().state.error).toBe("Room server is not configured");
  expect(f.room.arcadeAction).not.toHaveBeenCalled();
  expect(arcadeDisplayBoard(f.controls().state)).toEqual(Array(16).fill(0));
  expect(arcadeGpuTilesVisible(f.controls().state)).toBe(false);
  await f.publish({ arcade2048: saved });
  await act(async () => f.controls().move("left"));
  expect(f.room.arcadeAction).not.toHaveBeenCalled();
  expect(f.controls().state.view).toEqual(saved);
});
it("distinguishes joining, reconnecting, busy, unavailable and fatal connection states", () => {
  const base = { arcadeAvailable: true, error: "" };
  expect(arcadeConnectionMessage({ ...base, status: "connecting" })).toContain(
    "Connecting to the shared world",
  );
  expect(
    arcadeConnectionMessage({ ...base, status: "reconnecting" }),
  ).not.toContain("Your saved game will return");
  expect(arcadeConnectionMessage({ ...base, status: "full" })).toContain(
    "busy",
  );
  expect(
    arcadeConnectionMessage({
      ...base,
      status: "error",
      error: "Your cabin could not be saved",
    }),
  ).toBe("Your cabin could not be saved");
  expect(
    arcadeConnectionMessage({
      ...base,
      status: "online",
      arcadeAvailable: false,
    }),
  ).toContain("updating");
  expect(arcadeConnectionMessage({ ...base, status: "online" })).toBeNull();
});
