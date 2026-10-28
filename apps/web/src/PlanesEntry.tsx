import { useSyncExternalStore } from "react";
import type { NavigationFeed } from "./navigation-feed";
import type { PlanesView } from "../../../packages/shared/planes";
import { PLANES_TABLE } from "../../../packages/shared/planes-station";
export function PlanesEntry({
  navigation,
  view,
  seated,
  onOpen,
}: {
  navigation: NavigationFeed;
  view: PlanesView | null;
  seated: boolean;
  onOpen: () => void;
}) {
  const position = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );
  if (
    !seated &&
    Math.hypot(position.x - PLANES_TABLE.x, position.z - PLANES_TABLE.z) > 5
  )
    return null;
  return (
    <div className="planes-entry">
      <button type="button" onClick={onOpen}>
        {seated ? "Open your Planes game" : "Watch Planes"}
      </button>
      <span>
        {seated
          ? view?.phase === "playing"
            ? view.turn === view.you
              ? "Your turn"
              : "Your opponent's turn"
            : "Your place at the table is held"
          : view?.phase === "playing"
            ? "A round is in progress"
            : "Sit opposite a friend to play."}
      </span>
    </div>
  );
}
