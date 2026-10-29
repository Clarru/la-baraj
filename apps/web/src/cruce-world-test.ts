/** Explicit localhost-only authored QA input, consumed by the actual physics controller. */
let destination: [number, number, number] | null = null;
export const cruceWorldLab =
  import.meta.env.VITE_CRUCE_WORLD_LAB === "1" &&
  ["localhost", "127.0.0.1"].includes(location.hostname);
export function requestCruceTestMove(p: [number, number, number]) {
  if (cruceWorldLab) destination = p;
}
export function takeCruceTestMove() {
  const p = destination;
  destination = null;
  return p;
}
