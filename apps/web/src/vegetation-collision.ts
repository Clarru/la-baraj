/** Decorative vegetation is walk-through; trunks and rocks remain solid. */
export function isSolidVegetation(id: string): boolean {
  return /^(CommonTree|Pine|Rock)/.test(id.replace(/_Distant$/, ""));
}
