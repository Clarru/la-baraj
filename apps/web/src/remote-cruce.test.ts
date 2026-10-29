import { describe, it, expect } from "vitest";
import { remoteCruceView } from "./remote-cruce";
import { CruceTable } from "../../server/cruce-table";
describe("narrow remote performance-fixture contract", () => {
  it("accepts the crowd/rider fixture without a game snapshot", () => {
    expect(remoteCruceView({ remotes: new Map() })).toBeNull();
  });
  it("passes real snapshot views without widening or fabricating the fixture", () => {
    const v = new CruceTable({ save: async () => {} }).view(null);
    expect(
      remoteCruceView({
        remotes: new Map(),
        getSnapshot: () => ({ cruce: v }),
      }),
    ).toBe(v);
  });
});
