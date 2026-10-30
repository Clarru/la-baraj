import { it, expect } from "vitest";
import {
  hitArcadeScreen,
  makeTileAnimation,
  type ArcadeScreenState,
} from "./arcade2048-screen";
const state: ArcadeScreenState = {
  active: true,
  pending: false,
  page: "board",
  error: "",
  local: false,
  view: {
    ranked: true,
    best: 0,
    leaders: [],
    game: {
      board: [2, 2, ...Array(14).fill(0)],
      score: 0,
      moves: 1,
      revision: 1,
      continued: false,
    },
  },
};
it("routes screen buttons on the actual texture and blocks clicks while saving", () => {
  expect(hitArcadeScreen(state, 230, 110)).toBe("new");
  expect(hitArcadeScreen(state, 400, 110)).toBe("scores");
  expect(hitArcadeScreen(state, 240, 350)).toBeNull();
  expect(hitArcadeScreen({ ...state, pending: true }, 230, 110)).toBeNull();
  expect(hitArcadeScreen({ ...state, page: "leaders" }, 200, 565)).toBe("back");
  expect(hitArcadeScreen({ ...state, page: "confirm" }, 350, 390)).toBe(
    "confirm",
  );
  expect(hitArcadeScreen({ ...state, page: "confirm" }, 100, 390)).toBe("back");
});
it("maps the game-over action to a new game and only animates accepted moves", () => {
  const game = {
    ...state.view!.game!,
    board: [2, 4, 2, 4, 4, 2, 4, 2, 2, 4, 2, 4, 4, 2, 4, 2],
  };
  expect(
    hitArcadeScreen({ ...state, view: { ...state.view!, game } }, 250, 390),
  ).toBe("continue");
  const after = {
    ...state.view!,
    game: {
      ...state.view!.game!,
      board: [4, 2, ...Array(14).fill(0)],
      moves: 2,
      revision: 2,
      score: 4,
    },
  };
  const animation = makeTileAnimation(state.view, after, "left", 100);
  expect(animation?.merged).toEqual([0]);
  expect(animation?.spawned).toEqual([1]);
  expect(animation?.gain).toBe(4);
  expect(makeTileAnimation(after, after, "left", 200)).toBeNull();
});
