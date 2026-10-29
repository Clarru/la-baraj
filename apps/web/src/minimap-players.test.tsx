import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readMapPlayers, sameMapPlayers } from "./minimap-players";
import { createNavigationFeed } from "./navigation-feed";
import { Minimap } from "./Minimap";
import type { MultiplayerRoom, RemotePlayer } from "./multiplayer";
function remote(
  id: string,
  position: [number, number, number],
  animation = "Idle_Neutral",
): RemotePlayer {
  return {
    player: {
      id,
      nickname: id,
      position,
      yaw: 0,
      animation,
      activity: "none",
      vehicle: "none",
    },
    receivedAt: 0,
    activityAt: 0,
  };
}
describe("other players on the minimap", () => {
  it("uses valid, initialized remote positions and detects changes and disconnects", () => {
    const remotes = new Map([
      ["a", remote("a", [10.23, 5, -3.76])],
      ["b", remote("b", [0, 0, 0], "idle")],
    ]);
    const room = { remotes } as Pick<MultiplayerRoom, "remotes">;
    const first = readMapPlayers(room);
    expect(first).toEqual([{ id: "a", x: 10, z: -4 }]);
    expect(sameMapPlayers(first, readMapPlayers(room))).toBe(true);
    remotes.set("a", remote("a", [11, 5, -4]));
    expect(sameMapPlayers(first, readMapPlayers(room))).toBe(false);
    remotes.delete("a");
    expect(readMapPlayers(room)).toEqual([]);
    remotes.set("bad", remote("bad", [NaN, 0, 0]));
    expect(readMapPlayers(room)).toEqual([]);
  });
  it("places visible players below objectives and keeps off-map players out", () => {
    const remotes = new Map([
      ["near", remote("near", [10, 0, 10])],
      ["far", remote("far", [500, 0, 0])],
    ]);
    const html = renderToStaticMarkup(
      <Minimap
        navigation={createNavigationFeed({ x: 0, z: 0, heading: 0 })}
        homeIndex={0}
        cabins={[{ index: 0, ownerName: null }]}
        room={{ remotes }}
      />,
    );
    expect(
      html.match(/data-testid="other-player-map-marker"/g) ?? [],
    ).toHaveLength(1);
    expect(html.indexOf('data-testid="other-player-map-layer"')).toBeLessThan(
      html.indexOf('data-testid="home-map-marker"'),
    );
    expect(html.indexOf('data-testid="home-map-marker"')).toBeLessThan(
      html.indexOf('data-testid="player-map-marker"'),
    );
  });
});
