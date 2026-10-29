/** Decorative vegetation is walk-through; trunks and rocks remain solid. */
export function isSolidVegetation(id: string): boolean {
  return /^(Cincis_Oak|CommonTree|Pine|Rock)/.test(id.replace(/_Distant$/, ""));
}

/** The oak's impostor has extra transparent headroom, so its quad height is not its trunk height. */
export function treeCollision(id: string, impostorHeight: number) {
  return id.replace(/_Distant$/, "") === "Cincis_Oak_1"
    ? { treeHeight: 6, treeRadius: 0.4 }
    : { treeHeight: impostorHeight * 0.72 };
}
