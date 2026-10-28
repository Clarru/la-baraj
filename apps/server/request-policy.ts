import { CANONICAL_WORLD_ID, ROOM_ID_PATTERN } from "../../packages/shared/protocol";

export function allowedOrigin(origin: string | null, allowed: string): boolean {
  return origin !== null && allowed.split(",").map((item) => item.trim()).filter(Boolean).includes(origin);
}
export function validRoomPath(pathname: string): boolean {
  const match = /^\/parties\/world-room\/([^/]+)$/.exec(pathname);
  return Boolean(match && ROOM_ID_PATTERN.test(match[1]));
}
/** All accepted old links address the same existing Durable Object. */
export function canonicalWorldUrl(input: URL): URL | null {
  if (!validRoomPath(input.pathname)) return null;
  const url = new URL(input);
  url.pathname = `/parties/world-room/${CANONICAL_WORLD_ID}`;
  return url;
}

/** Retire archived objects once they next wake; no alarms or restart loop. */
export function retireLegacyConnections(worldName: string, connections: Iterable<{ close(code: number, reason: string): void }>): boolean {
  if (worldName === CANONICAL_WORLD_ID) return false;
  for (const connection of connections) connection.close(1012, "Reconnecting to the shared world");
  return true;
}
