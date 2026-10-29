import { useSyncExternalStore } from "react";
import type { NavigationFeed } from "./navigation-feed";
import type { CruceView } from "../../../packages/shared/cruce";
import { CRUCE_TABLE } from "../../../packages/shared/cruce-station";
import "./cruce.css";
export function CruceEntry({
  navigation,
  view,
  seated,
  onOpen,
}: {
  navigation: NavigationFeed;
  view: CruceView | null;
  seated: boolean;
  onOpen: () => void;
}) {
  const p = useSyncExternalStore(
    navigation.subscribe,
    navigation.getSnapshot,
    navigation.getSnapshot,
  );
  if (!seated && Math.hypot(p.x - CRUCE_TABLE.x, p.z - CRUCE_TABLE.z) > 5)
    return null;
  return (
    <div className="cruce-entry">
      <button onClick={onOpen}>
        {seated ? "Deschide Cruce" : "Masa de Cruce"}
      </button>
      <span>
        {seated
          ? view?.turn === view?.you
            ? "E rândul tău"
            : "Locul tău la masă este rezervat"
          : "În 2, 3 sau 4 · Cărți ungurești"}
      </span>
    </div>
  );
}
