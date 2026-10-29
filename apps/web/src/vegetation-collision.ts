import type RAPIER from "@dimforge/rapier3d-compat";

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

/** Build the same scaled, grounded trunk collider regardless of visual LOD. */
export function treeColliderDesc(
  rapier: typeof RAPIER,
  item: {
    x: number;
    y: number;
    z: number;
    scale: number;
    treeHeight: number;
    treeRadius?: number;
  },
) {
  const height = item.treeHeight * item.scale;
  return rapier.ColliderDesc.cylinder(
    height / 2,
    (item.treeRadius ?? 0.24) * item.scale,
  ).setTranslation(item.x, item.y + height / 2, item.z);
}
