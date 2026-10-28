import { ROOM_ID_PATTERN } from "../../packages/shared/protocol";

export function allowedOrigin(origin: string | null, allowed: string): boolean {
  return origin !== null && allowed.split(",").map((item) => item.trim()).filter(Boolean).includes(origin);
}
export function validRoomPath(pathname: string): boolean {
  const match = /^\/parties\/world-room\/([^/]+)$/.exec(pathname);
  return Boolean(match && ROOM_ID_PATTERN.test(match[1]));
}
