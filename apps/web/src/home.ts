/** A local-preview home selection; server ownership will replace this when rooms go online. */
const key = "lake-cincis-home-v1";
export function readLocalHome(
  storage?: Pick<Storage, "getItem" | "setItem">,
): number {
  const fallback = 18;
  try {
    const store = storage ?? window.localStorage;
    const saved = JSON.parse(store.getItem(key) ?? "null");
    if (
      Number.isInteger(saved?.plotIndex) &&
      saved.plotIndex >= 0 &&
      saved.plotIndex < 30
    )
      return saved.plotIndex;
    store.setItem(key, JSON.stringify({ plotIndex: fallback }));
  } catch {
    /* Preview home remains usable when browser storage is blocked. */
  }
  return fallback;
}
export type NavigationSample = { x: number; z: number; heading: number };
export function playerMapRotation(heading: number) {
  return 180 - (heading * 180) / Math.PI;
}
export function mapHomePosition(
  home: { x: number; z: number },
  center: { x: number; z: number },
  range: number,
) {
  const inset = range * 0.085,
    half = range / 2 - inset;
  const dx = home.x - center.x,
    dz = home.z - center.z;
  const scale = Math.max(1, Math.abs(dx) / half, Math.abs(dz) / half);
  return {
    x: center.x + dx / scale,
    z: center.z + dz / scale,
    offscreen: scale > 1,
  };
}
