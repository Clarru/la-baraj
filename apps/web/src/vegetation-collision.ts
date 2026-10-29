import type RAPIER from "@dimforge/rapier3d-compat";

/** Decorative vegetation is walk-through; trunks and rocks remain solid. */
export function isSolidVegetation(id: string): boolean {
  return /^(Cincis_Oak|Cincis_Beech|CommonTree|Pine|Rock)/.test(
    id.replace(/_Distant$/, ""),
  );
}

/** The oak's impostor has extra transparent headroom, so its quad height is not its trunk height. */
export function treeCollision(id: string, impostorHeight: number) {
  const model = id.replace(/_Distant$/, "");
  if (model === "Cincis_Oak_1") return { treeHeight: 6, treeRadius: 0.4 };
  if (model === "Cincis_Beech_1") return { treeHeight: 6, treeRadius: 0.45 };
  return { treeHeight: impostorHeight * 0.72 };
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
