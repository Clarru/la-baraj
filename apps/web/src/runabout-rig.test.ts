import { expect, it } from "vitest";
import fs from "node:fs";
import * as THREE from "three";
import {
  BOAT_DIMENSIONS,
  extractBoatRig,
  setBoatWheelAngle,
} from "./boat-geometry";
import { loadRunabout } from "./runabout-test-model";

const library = JSON.parse(
  fs.readFileSync(
    new URL("../public/assets/runabout-library.json", import.meta.url),
    "utf8",
  ),
) as {
  models: { id: string; bounds: { min: number[]; max: number[] } }[];
};
const world = (object: THREE.Object3D) =>
  object.getWorldPosition(new THREE.Vector3());

it("extracts the wheel, grips and seats", async () => {
  const rig = extractBoatRig(await loadRunabout("Lake_Runabout"));
  for (const part of [
    rig.group,
    rig.wheel,
    rig.wheelSpin,
    rig.grips.left,
    rig.grips.right,
    rig.driverSeat,
  ])
    expect(part).toBeInstanceOf(THREE.Object3D);
  expect(rig.wheel.name).toBe("SteeringWheel");
  expect(rig.wheelSpin.name).toBe("WheelSpin");
  expect(rig.grips.left.name).toBe("Grip_L");
  expect(rig.grips.right.name).toBe("Grip_R");
  expect(rig.driverSeat.name).toBe("DriverSeat");
  expect(rig.seats.map((seat) => seat.name)).toEqual(
    [0, 1, 2, 3, 4, 5].map((i) => `Seat_${i}`),
  );
});

it("wheel turns counter-clockwise for a left turn", async () => {
  const rig = extractBoatRig(await loadRunabout("Lake_Runabout"));
  // Height of the left grip measured in the (unspun) wheel plane.
  const height = (angle: number) => {
    setBoatWheelAngle(rig, angle);
    rig.group.updateMatrixWorld(true);
    return rig.wheel.worldToLocal(world(rig.grips.left)).y;
  };
  const straight = height(0);
  expect(height(1)).toBeLessThan(straight - 0.1);
  expect(rig.wheelSpin.rotation.z).toBeCloseTo(-1);
});

it("grips stay on the rim as the wheel turns", async () => {
  const rig = extractBoatRig(await loadRunabout("Lake_Runabout"));
  const radius = (side: "left" | "right", angle: number) => {
    setBoatWheelAngle(rig, angle);
    rig.group.updateMatrixWorld(true);
    return world(rig.grips[side]).distanceTo(world(rig.wheel));
  };
  for (const side of ["left", "right"] as const) {
    const rest = radius(side, 0);
    expect(rest).toBeGreaterThan(0.1);
    for (const angle of [1.2, -2.4])
      expect(Math.abs(radius(side, angle) - rest)).toBeLessThan(0.005);
  }
});

it("fails loudly on a model missing the wheel", () => {
  expect(() => extractBoatRig(new THREE.Group())).toThrow(/SteeringWheel/);
});

it("dimensions match the shipped asset", () => {
  const { min, max } = library.models.find(
    (model) => model.id === "Lake_Runabout",
  )!.bounds;
  expect(Math.abs(BOAT_DIMENSIONS.length - (max[2] - min[2]))).toBeLessThan(
    0.01,
  );
  expect(BOAT_DIMENSIONS.bowExtent).toBeCloseTo(max[2], 2);
  expect(BOAT_DIMENSIONS.sternExtent).toBeCloseTo(-min[2], 2);
  expect(BOAT_DIMENSIONS.beam).toBeCloseTo(max[0] - min[0], 2);
  expect(BOAT_DIMENSIONS.draft).toBeCloseTo(-min[1], 2);
});
