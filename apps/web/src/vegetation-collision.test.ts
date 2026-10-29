import { expect, it } from "vitest";
import { isSolidVegetation } from "./vegetation-collision";

it("lets players walk through decorative plants while retaining solid trunks and rocks", () => {
  for (const id of ["Flower_3_Group", "Grass_Common_Short", "Fern_1", "Bush_Common"])
    expect(isSolidVegetation(id), id).toBe(false);
  for (const id of ["CommonTree_1", "Pine_2_Distant", "Rock_Medium_1"])
    expect(isSolidVegetation(id), id).toBe(true);
});
