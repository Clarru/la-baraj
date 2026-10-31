/** Observe real instance-buffer faces on actual draw callbacks, without substituting any game data. */
export * from "../../apps/web/src/arcade2048-tiles";
import { createArcadeTiles as createTiles } from "../../apps/web/src/arcade2048-tiles";
import {
  Matrix4,
  type Mesh,
  type MeshBasicMaterial,
  type Object3D,
} from "three";
import { screenPaints } from "./arcade-live-screen";
const displays = new Map<number, unknown>();
export function createArcadeTiles(...args: Parameters<typeof createTiles>) {
  const tiles = createTiles(...args),
    screen = args[0],
    matrix = new Matrix4(),
    before = tiles.mesh.onBeforeRender;
  let last = "",
    draws = 0;
  tiles.mesh.onBeforeRender = function (...renderArgs) {
    before.apply(this, renderArgs);
    draws++;
    let parent: Object3D | null = screen;
    while (parent && !/^2048 cabinet \d+$/.test(parent.name))
      parent = parent.parent;
    if (!parent) return;
    const id = Number(parent.name.split(" ").at(-1)) - 1,
      uv = tiles.mesh.geometry.getAttribute("tileUv"),
      board = Array<number>(16).fill(0),
      faces = [];
    let settled = true;
    for (let i = 0; i < tiles.mesh.count; i++) {
      tiles.mesh.getMatrixAt(i, matrix);
      const x = matrix.elements[12],
        y = matrix.elements[13],
        col = (x - 97) / 106,
        row = (-y - 211) / 106,
        slot = Math.round(uv.getX(i) * 8) + 8 * Math.round(uv.getY(i) * 4),
        value = 2 ** (slot + 1);
      if (
        Math.abs(col - Math.round(col)) > 0.001 ||
        Math.abs(row - Math.round(row)) > 0.001 ||
        Math.abs(matrix.elements[0] - 98) > 0.01
      )
        settled = false;
      const index = Math.round(row) * 4 + Math.round(col);
      if (index >= 0 && index < 16) board[index] = value;
      faces.push({ value, x, y });
    }
    const canvas = ((screen as Mesh).material as MeshBasicMaterial).map!
      .image as HTMLCanvasElement;
    const record = {
      id,
      visible: tiles.mesh.visible,
      settled,
      board,
      faces,
      paint: screenPaints.get(canvas) ?? [],
      instanceVersion: tiles.mesh.instanceMatrix.version,
      drawn: true,
    };
    const key = JSON.stringify(record);
    if (key === last) return;
    last = key;
    displays.set(id, record);
    const out = document.querySelector<HTMLOutputElement>(
      "[data-arcade-actual-screens]",
    );
    if (out) out.textContent = JSON.stringify([...displays.values()]);
  };
  return tiles;
}
