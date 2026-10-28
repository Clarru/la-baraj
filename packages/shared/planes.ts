/** Avioane: classic 10×10 paper grids, three ten-square aircraft, headshots. */
export const PLANES_SIZE = 10;
export const PLANES_COUNT = 3;
export type Plane = { x: number; y: number; rotation: number };
export type GridPoint = { x: number; y: number };
export type Side = 0 | 1;
export type Shot = GridPoint & {
  result: "miss" | "body" | "head";
  revealed?: Plane;
};
export type PlanesAction =
  | { kind: "ready"; planes: Plane[] }
  | { kind: "shot"; x: number; y: number }
  | { kind: "rematch"; planes: Plane[] }
  | { kind: "leave" };
export type PlanesEvent = {
  id: number;
  at: number;
  actor: string;
  target: string;
  result: Shot["result"];
  winner: Side | null;
};
export type PlanesView = {
  version: 1;
  revision: number;
  round: number;
  phase: "lobby" | "setup" | "playing" | "finished";
  players: [
    null | {
      name: string;
      online: boolean;
      ready: boolean;
      remaining: number;
      awayUntil: number | null;
    },
    null | {
      name: string;
      online: boolean;
      ready: boolean;
      remaining: number;
      awayUntil: number | null;
    },
  ];
  you: Side | null;
  ownPlanes: Plane[] | null;
  shots: [Shot[], Shot[]];
  turn: Side | null;
  winner: Side | null;
  deadline: number | null;
  reason: "fleet" | "left" | "connection" | "timeout" | null;
  event: PlanesEvent | null;
};
const footprint = [
  [0, 0],
  [-2, 1],
  [-1, 1],
  [0, 1],
  [1, 1],
  [2, 1],
  [0, 2],
  [-1, 3],
  [0, 3],
  [1, 3],
];
export const otherSide = (side: Side): Side => (side === 0 ? 1 : 0);
export function planeCells(plane: Plane): GridPoint[] {
  return footprint.map(([a, b]) => {
    for (let i = 0; i < plane.rotation; i++) [a, b] = [-b, a];
    return { x: plane.x + a, y: plane.y + b };
  });
}
export function isGridPoint(x: unknown, y: unknown): boolean {
  return (
    Number.isInteger(x) &&
    Number.isInteger(y) &&
    Number(x) >= 0 &&
    Number(x) < PLANES_SIZE &&
    Number(y) >= 0 &&
    Number(y) < PLANES_SIZE
  );
}
export function isPlane(value: unknown): value is Plane {
  if (!value || typeof value !== "object") return false;
  const p = value as Plane;
  return (
    isGridPoint(p.x, p.y) &&
    Number.isInteger(p.rotation) &&
    p.rotation >= 0 &&
    p.rotation < 4 &&
    planeCells(p).every((c) => isGridPoint(c.x, c.y))
  );
}
export function legalFleet(value: unknown): value is Plane[] {
  if (
    !Array.isArray(value) ||
    value.length !== PLANES_COUNT ||
    !value.every(isPlane)
  )
    return false;
  const cells = value.flatMap(planeCells).map((p) => `${p.x}:${p.y}`);
  return new Set(cells).size === PLANES_COUNT * 10;
}
export function randomFleet(random: () => number = Math.random): Plane[] {
  const candidates: Plane[] = [];
  for (let x = 0; x < PLANES_SIZE; x++)
    for (let y = 0; y < PLANES_SIZE; y++)
      for (let rotation = 0; rotation < 4; rotation++) {
        const p = { x, y, rotation };
        if (isPlane(p)) candidates.push(p);
      }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.min(i, Math.max(0, Math.floor(random() * (i + 1))));
    [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
  }
  // Bounded backtracking keeps awkward rotations from creating an endless deal loop.
  const search = (
    fleet: Plane[],
    used: Set<string>,
    start: number,
  ): Plane[] | null => {
    if (fleet.length === PLANES_COUNT) return fleet;
    for (let i = start; i < candidates.length; i++) {
      const p = candidates[i],
        keys = planeCells(p).map((c) => `${c.x}:${c.y}`);
      if (keys.some((k) => used.has(k))) continue;
      const found = search([...fleet, p], new Set([...used, ...keys]), i + 1);
      if (found) return found;
    }
    return null;
  };
  const result = search([], new Set(), 0);
  if (!result) throw Error("No legal plane layout");
  return result;
}
export function destroyed(plane: Plane, shots: readonly Shot[]) {
  return shots.some(
    (s) => s.result === "head" && s.x === plane.x && s.y === plane.y,
  );
}
export function targetUnavailable(
  x: number,
  y: number,
  shots: readonly Shot[],
) {
  return shots.some(
    (s) =>
      (s.x === x && s.y === y) ||
      (s.revealed &&
        planeCells(s.revealed).some((c) => c.x === x && c.y === y)),
  );
}
export function resolveShot(
  fleet: readonly Plane[],
  shots: readonly Shot[],
  x: number,
  y: number,
): Shot {
  if (!isGridPoint(x, y) || targetUnavailable(x, y, shots))
    throw Error("Choose an unmarked square.");
  const plane = fleet.find((p) =>
    planeCells(p).some((c) => c.x === x && c.y === y),
  );
  if (!plane) return { x, y, result: "miss" };
  return plane.x === x && plane.y === y
    ? { x, y, result: "head", revealed: { ...plane } }
    : { x, y, result: "body" };
}
export function coordinate(point: GridPoint) {
  return `${String.fromCharCode(65 + point.x)}${point.y + 1}`;
}
