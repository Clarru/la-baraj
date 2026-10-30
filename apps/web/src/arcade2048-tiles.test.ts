// @vitest-environment jsdom
import { afterEach, it, expect, vi } from "vitest";
import * as THREE from "three";
import {
  drawArcadeScreen,
  makeTileAnimation,
  type ArcadeScreenState,
} from "./arcade2048-screen";
import {
  createArcadeTiles,
  writeArcadeTilePoses,
  type ArcadeTilePose,
} from "./arcade2048-tiles";
const state: ArcadeScreenState = {
  active: true,
  pending: false,
  page: "board",
  error: "",
  local: true,
  view: {
    best: 0,
    leaders: [],
    ranked: false,
    game: {
      board: [2, 2, ...Array(14).fill(0)],
      score: 0,
      moves: 1,
      revision: 1,
      continued: false,
    },
  },
};
function context() {
  const words: string[] = [];
  return {
    words,
    c: {
      save() {},
      restore() {},
      clearRect() {},
      fillRect() {},
      beginPath() {},
      roundRect() {},
      rect() {},
      clip() {},
      fill() {},
      stroke() {},
      translate() {},
      scale() {},
      fillText(s: string) {
        words.push(s);
      },
    } as unknown as CanvasRenderingContext2D,
  };
}
afterEach(() => vi.restoreAllMocks());
it("keeps exactly the requested footer and paints identical text while a save is pending", () => {
  const a = context(),
    b = context();
  drawArcadeScreen(a.c, state);
  drawArcadeScreen(b.c, { ...state, pending: true });
  expect(a.words).toEqual(b.words);
  expect(a.words).toContain("Use WASD or mouse to move them");
  expect(a.words).not.toContain("Saving…");
  expect(a.words.join(" ")).not.toContain("Practice ·");
});
it("interpolates every render timestamp, reuses pose slots, and finishes at the authoritative board", () => {
  const after = {
    ...state.view!,
    game: {
      ...state.view!.game!,
      board: [4, 2, ...Array(14).fill(0)],
      score: 4,
      moves: 2,
      revision: 2,
    },
  };
  const animation = makeTileAnimation(state.view, after, "left", 0)!,
    pool: ArcadeTilePose[] = [];
  expect(writeArcadeTilePoses(after.game.board, animation, 0, pool)).toBe(2);
  expect(pool[1].x).toBe(154);
  const slot = pool[0];
  writeArcadeTilePoses(after.game.board, animation, 1000 / 60, pool);
  const first = pool[1].x;
  writeArcadeTilePoses(after.game.board, animation, 2000 / 60, pool);
  expect(pool[1].x).toBeLessThan(first);
  expect(pool[0]).toBe(slot);
  writeArcadeTilePoses(after.game.board, animation, 150, pool);
  expect(pool.slice(0, 2).map((p) => [p.value, p.x, p.scale])).toEqual([
    [4, 48, 1],
    [2, 154, 1],
  ]);
});
it("uses one bounded instanced draw with no texture uploads during movement or idle updates", () => {
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
    () => context().c as never,
  );
  const geometry = new THREE.PlaneGeometry(0.52, 0.65),
    uv = geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) uv.setY(i, 1 - uv.getY(i));
  const screen = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial()),
    tiles = createArcadeTiles(screen);
  const map = (tiles.mesh.material as THREE.MeshBasicMaterial).map!,
    version = map.version;
  const after = {
      ...state.view!,
      game: {
        ...state.view!.game!,
        board: [4, 2, ...Array(14).fill(0)],
        score: 4,
        moves: 2,
        revision: 2,
      },
    },
    s = { ...state, view: after },
    animation = makeTileAnimation(state.view, after, "left", 0)!;
  for (let now = 0; now <= 150; now += 1000 / 60)
    tiles.update(s, animation, now);
  expect(map.version).toBe(version);
  expect(tiles.metrics().atlasUploads).toBe(1);
  expect(tiles.mesh.count).toBe(2);
  expect(tiles.mesh.instanceMatrix.count).toBe(16);
  tiles.update(s, null, 160);
  const matrices = tiles.mesh.instanceMatrix.version;
  tiles.update(s, null, 200);
  expect(tiles.mesh.instanceMatrix.version).toBe(matrices);
  tiles.update({ ...s, page: "confirm" }, null, 210);
  expect(tiles.mesh.visible).toBe(false);
  tiles.dispose();
  expect(screen.children).toHaveLength(0);
  geometry.dispose();
  (screen.material as THREE.Material).dispose();
});
