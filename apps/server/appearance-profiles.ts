import { normalizeAppearance, type Appearance } from "../../packages/shared/appearance";
import { MAX_HOMES } from "../../packages/shared/protocol";

type Runtime = { save(owner: number, appearance: Appearance): Promise<void> };

/** Optional cosmetic storage, keyed by an already authenticated home assignment.
 * No home ledger migration or world reset is required.
 */
export class AppearanceProfiles {
  private values = new Map<number, Appearance>();
  private pending = new Map<number, Promise<void>>();
  constructor(private runtime: Runtime, stored: Iterable<[number, unknown]> = []) {
    for (const [owner, value] of stored)
      if (Number.isInteger(owner) && owner >= 0 && owner < MAX_HOMES)
        this.values.set(owner, normalizeAppearance(value));
  }

  get(owner: number): Appearance {
    return normalizeAppearance(this.values.get(owner));
  }

  save(owner: number, value: unknown): Promise<void> {
    if (!Number.isInteger(owner) || owner < 0 || owner >= MAX_HOMES)
      return Promise.reject(new RangeError("Appearance owner is not a home assignment"));
    const appearance = normalizeAppearance(value);
    const previous = this.pending.get(owner) ?? Promise.resolve();
    const next = previous.then(async () => {
      await this.runtime.save(owner, appearance);
      this.values.set(owner, appearance);
    });
    // A failed save must leave the previously committed profile intact and must
    // not poison the next attempt. Different owners can persist independently.
    const settled = next.then(() => {}, () => {});
    this.pending.set(owner, settled);
    void settled.then(() => {
      if (this.pending.get(owner) === settled) this.pending.delete(owner);
    });
    return next;
  }
}
