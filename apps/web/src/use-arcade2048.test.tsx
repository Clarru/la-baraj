// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useArcade2048 } from "./use-arcade2048";
import type { MultiplayerRoom } from "./multiplayer";
const roots: ReturnType<typeof createRoot>[] = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await act(async () => root.unmount());
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
async function fixture(reject = false) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  let now = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => now);
  const view = {
    status: "online",
    arcadeAvailable: true,
    arcade2048: {
      best: 0,
      leaders: [],
      ranked: true,
      game: {
        board: [2, 2, ...Array(14).fill(0)],
        score: 0,
        moves: 0,
        revision: 1,
        continued: false,
      },
    },
  };
  const room = {
    localPreview: false,
    subscribe: () => () => {},
    getSnapshot: () => view,
    arcadeAction: vi.fn(async () => {
      if (reject) throw Error("socket closed");
      return null;
    }),
  };
  let controls: ReturnType<typeof useArcade2048>;
  function Harness({ open }: { open: boolean }) {
    controls = useArcade2048(room as unknown as MultiplayerRoom, open);
    return null;
  }
  const element = document.createElement("div");
  document.body.append(element);
  const root = createRoot(element);
  roots.push(root);
  await act(async () => root.render(<Harness open />));
  return {
    room,
    view,
    controls: () => controls!,
    time: (n: number) => {
      now = n;
    },
    close: () => act(async () => root.render(<Harness open={false} />)),
  };
}
it("restores once, throttles held keys below authority rate, and does not send moves after exit", async () => {
  const f = await fixture();
  expect(f.room.arcadeAction).toHaveBeenCalledTimes(1);
  await act(async () => {
    f.controls().move("left");
  });
  expect(f.room.arcadeAction).toHaveBeenCalledTimes(2);
  f.time(1030);
  await act(async () => {
    f.controls().move("right");
  });
  expect(f.room.arcadeAction).toHaveBeenCalledTimes(2);
  f.time(1151);
  await act(async () => {
    f.controls().move("right");
  });
  expect(f.room.arcadeAction).toHaveBeenCalledTimes(3);
  await f.close();
  f.time(1500);
  await act(async () => {
    f.controls().move("left");
  });
  expect(f.room.arcadeAction).toHaveBeenCalledTimes(3);
});
it("keeps the accepted board and shows a recoverable error if transport rejects", async () => {
  const f = await fixture(true);
  expect(f.controls().state.pending).toBe(false);
  expect(f.controls().state.error).toContain("could not reach");
  expect(f.controls().state.view?.game?.board.slice(0, 2)).toEqual([2, 2]);
});

it("continues a newly won full board before offering a fresh game", async () => {
  const f = await fixture();
  const game = f.view.arcade2048.game;
  game.board = [2048, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2];
  game.score = 2048;
  game.moves = 1;
  await act(async () => {
    f.controls().action("continue");
  });
  expect(f.room.arcadeAction).toHaveBeenLastCalledWith({ kind: "continue" }, 1);
  game.continued = true;
  await act(async () => {
    f.controls().action("continue");
  });
  expect(f.room.arcadeAction).toHaveBeenLastCalledWith({ kind: "new" }, 1);
});

it("keeps a 125ms input boundary for the server's eight-action rate while tiles settle in 120ms", async () => {
  const f = await fixture();
  await act(() => f.controls().move("left"));
  f.time(1124);
  await act(() => f.controls().move("right"));
  expect(f.room.arcadeAction).toHaveBeenCalledTimes(2);
  f.time(1125);
  await act(() => f.controls().move("right"));
  expect(f.room.arcadeAction).toHaveBeenCalledTimes(3);
});
