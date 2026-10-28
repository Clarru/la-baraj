import { MAX_HOMES, isResumeToken, type HomeAssignment } from "../../packages/shared/protocol";

type HomeOwner = { digest: string; index: number };
export type HomeLedger = { version: 1; owners: HomeOwner[] };
export class HomeAllocationError extends Error {
  constructor(readonly code: "homes-full" | "invalid-resume", message: string) { super(message); }
}
type Runtime = {
  save(ledger: HomeLedger): Promise<void>;
  digest?(token: string): Promise<string>;
  random?(): number;
};
async function digestToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
/** Fail closed on corrupt storage rather than silently assigning somebody's plot twice. */
export function readHomeLedger(value: unknown): HomeLedger {
  if (value === undefined) return { version: 1, owners: [] };
  if (!value || typeof value !== "object") throw Error("Invalid stored home ledger");
  const ledger = value as HomeLedger;
  if (ledger.version !== 1 || !Array.isArray(ledger.owners) || ledger.owners.length > MAX_HOMES ||
    !ledger.owners.every((owner) => owner && /^[a-f0-9]{64}$/.test(owner.digest) && Number.isInteger(owner.index) && owner.index >= 0 && owner.index < MAX_HOMES) ||
    new Set(ledger.owners.map((owner) => owner.index)).size !== ledger.owners.length ||
    new Set(ledger.owners.map((owner) => owner.digest)).size !== ledger.owners.length) throw Error("Invalid stored home ledger");
  return { version: 1, owners: ledger.owners.map(({ digest, index }) => ({ digest, index })) };
}

/** Bounded permanent ownership, independent of active WebSocket presence. */
export class HomeAssignments {
  private ledger: HomeLedger;
  private pending: Promise<void> = Promise.resolve();
  constructor(private runtime: Runtime, stored?: unknown) { this.ledger = readHomeLedger(stored); }

  claim(resumeToken: string, createHome = false): Promise<HomeAssignment> {
    // Serializing the complete read/choose/persist step also makes concurrent
    // hello packets idempotent when they carry the same pre-persisted token.
    const result = this.pending.then(() => this.claimNext(resumeToken, createHome));
    this.pending = result.then(() => {}, () => {});
    return result;
  }
  private async claimNext(resumeToken: string, createHome: boolean): Promise<HomeAssignment> {
    if (!isResumeToken(resumeToken)) throw new HomeAllocationError("invalid-resume", "This home credential is invalid.");
    const digest = await (this.runtime.digest ?? digestToken)(resumeToken);
    const existing = this.ledger.owners.find((owner) => owner.digest === digest);
    if (existing) return { index: existing.index, resumeToken };
    if (!createHome) throw new HomeAllocationError("invalid-resume", "Your cabin could not be restored. Try again from your usual browser.");
    const used = new Set(this.ledger.owners.map((owner) => owner.index));
    const free = Array.from({ length: MAX_HOMES }, (_, index) => index).filter((index) => !used.has(index));
    if (!free.length) throw new HomeAllocationError("homes-full", "A cabin is not available right now. Please try again later.");
    const random = this.runtime.random?.() ?? crypto.getRandomValues(new Uint32Array(1))[0] / 0x100000000;
    const index = free[Math.min(free.length - 1, Math.max(0, Math.floor(random * free.length)))];
    const next: HomeLedger = { version: 1, owners: [...this.ledger.owners, { digest, index }] };
    await this.runtime.save(next);
    this.ledger = next;
    return { index, resumeToken };
  }
}
