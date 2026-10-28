import { HOME_NAME_GRACE_MS } from "../../packages/shared/protocol";
import type { HomeLedger } from "./home-assignments";
import { nextPlanesDeadline, type PlanesRecord } from "./planes-table";
/** One DO alarm serves both systems; updating either record must preserve the other deadline. */
export function nextWorldDeadline(
  homes: HomeLedger | undefined,
  planes: PlanesRecord | undefined,
  recoveryAt?: number,
): number | null {
  const times =
    homes?.owners
      .filter((o) => o.pendingName !== null && o.pendingName !== o.ownerName)
      .map((o) => o.nameSince + HOME_NAME_GRACE_MS) ?? [];
  const tableDue = planes ? nextPlanesDeadline(planes) : null;
  if (tableDue !== null) times.push(tableDue);
  if (recoveryAt !== undefined) times.push(recoveryAt);
  return times.length ? Math.min(...times) : null;
}
