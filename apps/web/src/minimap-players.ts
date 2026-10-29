import type { MultiplayerRoom } from "./multiplayer";
export type MapPlayer = { id: string; x: number; z: number };

/** Round below a pixel on the minimap, avoiding updates for invisible movement. */
export function readMapPlayers(
  room?: Pick<MultiplayerRoom, "remotes">,
): MapPlayer[] {
  if (!room) return [];
  return [...room.remotes.values()].flatMap(({ player }) => {
    const [x, , z] = player.position;
    if (
      player.animation === "idle" ||
      !Number.isFinite(x) ||
      !Number.isFinite(z)
    )
      return [];
    return [
      { id: player.id, x: Math.round(x * 2) / 2, z: Math.round(z * 2) / 2 },
    ];
  });
}
export function sameMapPlayers(
  a: readonly MapPlayer[],
  b: readonly MapPlayer[],
) {
  return (
    a.length === b.length &&
    a.every((p, i) => p.id === b[i].id && p.x === b[i].x && p.z === b[i].z)
  );
}
