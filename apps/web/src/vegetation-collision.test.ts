import { expect, it } from "vitest";
import { isSolidVegetation, treeCollision } from "./vegetation-collision";

it("lets players walk through decorative plants while retaining solid trunks and rocks", () => {
  for (const id of ["Flower_3_Group", "Grass_Common_Short", "Fern_1", "Bush_Common"])
    expect(isSolidVegetation(id), id).toBe(false);
  for (const id of ["Cincis_Oak_1", "Cincis_Oak_1_Distant", "CommonTree_1", "Pine_2_Distant", "Rock_Medium_1"])
    expect(isSolidVegetation(id), id).toBe(true);
});

it("uses the authored oak trunk dimensions independently of the padded sprite", () => {
  expect(treeCollision("Cincis_Oak_1_Distant", 11.44)).toEqual({ treeHeight: 6, treeRadius: 0.4 });
  expect(treeCollision("CommonTree_1", 10).treeHeight).toBeCloseTo(7.2);
});
