import type { MultiplayerRoom } from "./multiplayer";
/** Crowd/performance fixtures intentionally supply only remotes, without game snapshots. */
export type RemoteCardRoom = Pick<MultiplayerRoom, "remotes"> & {
  getSnapshot?: () => Pick<ReturnType<MultiplayerRoom["getSnapshot"]>, "cruce">;
};
export function remoteCruceView(room: RemoteCardRoom) {
  return room.getSnapshot?.().cruce ?? null;
}
