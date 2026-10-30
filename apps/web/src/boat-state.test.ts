import { expect, it } from "vitest";
import {
  getBoatState,
  mountBoat,
  parkBoat,
  resetBoatToDock,
  subscribeBoatPlacement,
  updateBoatMotion,
} from "./boat-state";
import { nearestDockSpawn } from "./boat-placement";
it("updates parked hull subscribers immediately on boarding, parking and reset", () => {
  parkBoat([0, 0.05, 0], 0);
  const observed: { mounted: boolean; position: number[] }[] = [];
  const stop = subscribeBoatPlacement(() =>
    observed.push({
      mounted: getBoatState().mounted,
      position: [...getBoatState().parked],
    }),
  );
  mountBoat();
  expect(observed.at(-1)?.mounted).toBe(true);
  updateBoatMotion(0.2, 4); // per-frame motion must not rebuild parked colliders
  expect(observed).toHaveLength(1);
  parkBoat([10, 0.05, -20], 0.2);
  expect(observed.at(-1)).toEqual({
    mounted: false,
    position: [10, 0.05, -20],
  });
  resetBoatToDock(45, 0);
  expect(observed.at(-1)?.position).toEqual(nearestDockSpawn(45, 0).position);
  stop();
  mountBoat();
  expect(observed).toHaveLength(3);
  resetBoatToDock(45, 0);
});
