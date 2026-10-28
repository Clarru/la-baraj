import {
  MAX_HOMES,
  HOME_NAME_GRACE_MS,
  isResumeToken,
  type HomeAssignment,
  type PublicCabin,
} from "../../packages/shared/protocol";

type HomeOwner = {
  digest: string;
  index: number;
  ownerName: string | null;
  pendingName: string | null;
  nameSince: number;
};
export type HomeLedger = { version: 2; owners: HomeOwner[] };
export class HomeAllocationError extends Error {
  constructor(
    readonly code: "homes-full" | "invalid-resume",
    message: string,
  ) {
    super(message);
  }
}
type Runtime = {
  save(ledger: HomeLedger): Promise<void>;
  digest?(token: string): Promise<string>;
};
async function digestToken(token: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(hash), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
const name = (value: unknown): value is string | null =>
  value === null ||
  (typeof value === "string" &&
    value.length > 0 &&
    value.length <= 24 &&
    !/[\p{C}<>]/u.test(value));
/** Old random ledgers are explicitly reset by the deployment migration, never silently reinterpreted. */
export function readHomeLedger(value: unknown): HomeLedger {
  if (value === undefined) return { version: 2, owners: [] };
  if (!value || typeof value !== "object")
    throw Error("Invalid stored home ledger");
  const ledger = value as HomeLedger;
  if (
    ledger.version !== 2 ||
    !Array.isArray(ledger.owners) ||
    ledger.owners.length > MAX_HOMES ||
    !ledger.owners.every(
      (owner, index) =>
        owner &&
        /^[a-f0-9]{64}$/.test(owner.digest) &&
        owner.index === index &&
        name(owner.ownerName) &&
        name(owner.pendingName) &&
        Number.isFinite(owner.nameSince) &&
        owner.nameSince >= 0,
    ) ||
    new Set(ledger.owners.map((owner) => owner.digest)).size !==
      ledger.owners.length
  )
    throw Error("Invalid stored home ledger");
  return structuredClone(ledger);
}
/** Serial durable allocation and plaque updates: one stable, sequential home per anonymous owner. */
export class HomeAssignments {
  private ledger: HomeLedger;
  private pending: Promise<void> = Promise.resolve();
  constructor(
    private runtime: Runtime,
    stored?: unknown,
  ) {
    this.ledger = readHomeLedger(stored);
  }
  private serial<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.pending.then(operation);
    this.pending = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  publicCabins(): PublicCabin[] {
    return this.ledger.owners.map(({ index, ownerName }) => ({
      index,
      ownerName,
    }));
  }
  nextNameDeadline(): number | null {
    const deadlines = this.ledger.owners
      .filter((o) => o.pendingName !== null && o.pendingName !== o.ownerName)
      .map((o) => o.nameSince + HOME_NAME_GRACE_MS);
    return deadlines.length ? Math.min(...deadlines) : null;
  }
  claim(
    resumeToken: string,
    createHome = false,
    nickname?: string,
    now = Date.now(),
  ): Promise<HomeAssignment> {
    return this.serial(async () => {
      if (!isResumeToken(resumeToken))
        throw new HomeAllocationError(
          "invalid-resume",
          "This home credential is invalid.",
        );
      const digest = await (this.runtime.digest ?? digestToken)(resumeToken);
      const existing = this.ledger.owners.find((o) => o.digest === digest);
      if (existing) return { index: existing.index, resumeToken };
      if (!createHome)
        throw new HomeAllocationError(
          "invalid-resume",
          "Your cabin could not be restored. Try again from your usual browser.",
        );
      if (this.ledger.owners.length >= MAX_HOMES)
        throw new HomeAllocationError(
          "homes-full",
          "A cabin is not available right now. Please try again later.",
        );
      const index = this.ledger.owners.length;
      const next: HomeLedger = {
        version: 2,
        owners: [
          ...this.ledger.owners,
          {
            digest,
            index,
            ownerName: null,
            pendingName: nickname ?? null,
            nameSince: now,
          },
        ],
      };
      await this.runtime.save(next);
      this.ledger = next;
      return { index, resumeToken };
    });
  }
  stageName(index: number, nickname: string, now = Date.now()): Promise<void> {
    return this.serial(async () => {
      const owner = this.ledger.owners[index];
      if (!owner || owner.pendingName === nickname) return;
      const next = structuredClone(this.ledger);
      Object.assign(next.owners[index], {
        pendingName: nickname,
        nameSince: now,
      });
      await this.runtime.save(next);
      this.ledger = next;
    });
  }
  commitDueNames(now = Date.now()): Promise<boolean> {
    return this.serial(async () => {
      const next = structuredClone(this.ledger);
      let changed = false;
      for (const owner of next.owners)
        if (
          owner.pendingName !== null &&
          owner.pendingName !== owner.ownerName &&
          now >= owner.nameSince + HOME_NAME_GRACE_MS
        ) {
          owner.ownerName = owner.pendingName;
          changed = true;
        }
      if (changed) {
        await this.runtime.save(next);
        this.ledger = next;
      }
      return changed;
    });
  }
}
