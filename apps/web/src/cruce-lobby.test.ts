import { describe, it, expect } from "vitest";
import { CruceTable } from "../../server/cruce-table";
import { cruceLobby } from "./cruce-lobby";
import type { CruceSeat } from "../../../packages/shared/cruce";
const actors = [0, 1, 2, 3].map((i) => ({
  owner: `p${i}`,
  socket: `p${i}`,
  name: `Jucător ${i}`,
}));
describe("stările aceleiași mese fizice de Cruce", () => {
  it("arată masa liberă, așteptarea jucătorilor și masa completă pentru spectator", async () => {
    const t = new CruceTable({ save: async () => {} });
    expect(cruceLobby(t.view(null))).toMatchObject({
      title: "Masa este liberă",
      occupied: 0,
      total: 4,
      canReady: false,
    });
    await t.join(actors[0], 0);
    expect(cruceLobby(t.view(actors[0]))).toMatchObject({
      title: "Așteptăm jucători",
      occupied: 1,
      canReady: false,
    });
    expect(cruceLobby(t.view(null))?.title).toBe("Alege un loc la masă");
    for (const s of [1, 2, 3] as CruceSeat[]) await t.join(actors[s], s);
    expect(cruceLobby(t.view(null))?.title).toBe("Masa este completă");
    expect(cruceLobby(t.view(actors[0]))).toMatchObject({
      title: "Putem începe partida",
      canReady: true,
    });
    await t.act(
      actors[0],
      { kind: "ready" },
      "ready",
      t.view(actors[0]).revision,
    );
    expect(cruceLobby(t.view(actors[0]))?.title).toBe("Ești pregătit");
    await t.disconnect(actors[1]);
    expect(cruceLobby(t.view(actors[0]))).toMatchObject({
      title: "Așteptăm reconectarea",
      canReady: false,
    });
  });
});
