import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  SCOOTER_METRICS,
  advanceScooterMotion,
  createScooterRig,
  scooterGripPosition,
} from "./scooter-geometry";

describe("scooter rider contact contract", () => {
  it("keeps both forefeet supported by the deck", () => {
    for (const foot of Object.values(SCOOTER_METRICS.feet)) {
      expect(Math.abs(foot[0])).toBeLessThan(SCOOTER_METRICS.deckWidth / 2);
      expect(Math.abs(foot[2])).toBeLessThan(SCOOTER_METRICS.deckLength / 2);
      expect(foot[1] - SCOOTER_METRICS.deckTop).toBeCloseTo(0.025);
    }
  });

  it("returns neutral grips exactly and rotates both around the stem", () => {
    const pivot = new THREE.Vector3(...SCOOTER_METRICS.steeringPivot);
    for (const side of ["left", "right"] as const) {
      expect(scooterGripPosition(side, 0)).toEqual([
        ...SCOOTER_METRICS.grips[side],
      ]);
      const neutral = new THREE.Vector3(...SCOOTER_METRICS.grips[side]);
      const turned = new THREE.Vector3(...scooterGripPosition(side, 0.3));
      expect(turned.distanceTo(pivot)).toBeCloseTo(neutral.distanceTo(pivot));
      expect(turned.distanceTo(neutral)).toBeGreaterThan(0.05);
    }
    const left = new THREE.Vector3(...scooterGripPosition("left", 0.3));
    const right = new THREE.Vector3(...scooterGripPosition("right", 0.3));
    expect(left.distanceTo(right)).toBeCloseTo(0.52);
  });

  it("bounds invalid and excessive steering at the same physical stop", () => {
    expect(scooterGripPosition("left", NaN)).toEqual(
      scooterGripPosition("left", 0),
    );
    expect(scooterGripPosition("right", 5)).toEqual(
      scooterGripPosition("right", SCOOTER_METRICS.maxSteeringAngle),
    );
    expect(scooterGripPosition("right", -5)).toEqual(
      scooterGripPosition("right", -SCOOTER_METRICS.maxSteeringAngle),
    );
  });
});

describe("scooter motion", () => {
  it("rolls by travel distance with the same steering at different frame rates", () => {
    const one = { wheelAngle: 0, steeringAngle: 0 };
    const many = { wheelAngle: 0, steeringAngle: 0 };
    advanceScooterMotion(one, { speed: 3, steer: 0.6, dt: 0.1 });
    for (let i = 0; i < 6; i++)
      advanceScooterMotion(many, { speed: 3, steer: 0.6, dt: 1 / 60 });
    expect(one.wheelAngle).toBeCloseTo(0.3 / 0.108);
    expect(many.wheelAngle).toBeCloseTo(one.wheelAngle);
    expect(many.steeringAngle).toBeCloseTo(one.steeringAngle);
  });

  it("holds still at rest and does not poison the rig with invalid motion samples", () => {
    const state = { wheelAngle: 0.5, steeringAngle: 0.2 };
    advanceScooterMotion(state, { speed: 0, steer: 0, dt: 0.02 });
    expect(state.wheelAngle).toBe(0.5);
    expect(state.steeringAngle).toBeLessThan(0.2);
    advanceScooterMotion(state, { speed: NaN, steer: Infinity, dt: NaN });
    expect(Number.isFinite(state.wheelAngle)).toBe(true);
    expect(Number.isFinite(state.steeringAngle)).toBe(true);
    advanceScooterMotion(state, { speed: -1, steer: -1, dt: 0.02 });
    expect(state.wheelAngle).toBeLessThan(0.5);
  });
});

describe("editable scooter mesh", () => {
  it("matches the reference dimensions and grounds both compact wheels", () => {
    const rig = createScooterRig();
    try {
      rig.group.updateMatrixWorld(true);
      const bounds = new THREE.Box3().setFromObject(rig.group);
      expect(bounds.min.y).toBeCloseTo(0, 5);
      expect(bounds.max.x - bounds.min.x).toBeCloseTo(0.58, 3);
      expect(bounds.max.z - bounds.min.z).toBeCloseTo(1.13, 2);
      expect(bounds.max.y).toBeGreaterThan(1.1);
      expect(bounds.max.y).toBeLessThan(1.14);
      const front = rig.frontWheel.getWorldPosition(new THREE.Vector3());
      expect(front.toArray()).toEqual([
        0,
        expect.closeTo(0.108, 5),
        expect.closeTo(0.44, 5),
      ]);
      expect(rig.rearWheel.position.toArray()).toEqual([
        ...SCOOTER_METRICS.rearAxle,
      ]);
      const deck = rig.group.getObjectByName("Deck_tape");
      expect(deck).toBeDefined();
      expect(new THREE.Box3().setFromObject(deck!).max.y).toBeCloseTo(
        SCOOTER_METRICS.deckTop,
        5,
      );
    } finally {
      rig.dispose();
    }
  });

  it("shares hub geometry and remains finite within a small prop budget", () => {
    const rig = createScooterRig();
    try {
      expect((rig.frontWheel.children[0] as THREE.Mesh).geometry).toBe(
        (rig.rearWheel.children[0] as THREE.Mesh).geometry,
      );
      let triangles = 0,
        meshes = 0;
      rig.group.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        meshes++;
        triangles +=
          (object.geometry.index?.count ??
            object.geometry.getAttribute("position").count) / 3;
        const positions = object.geometry.getAttribute("position");
        for (let i = 0; i < positions.count; i++) {
          if (
            ![positions.getX(i), positions.getY(i), positions.getZ(i)].every(
              Number.isFinite,
            )
          )
            throw new Error(`Non-finite mesh: ${object.name}`);
        }
      });
      expect(triangles).toBeLessThan(24000);
      expect(meshes).toBeLessThan(30);
      expect(
        rig.frontWheel.getObjectByName("FrontBrakeRotor_silver"),
      ).toBeDefined();
    } finally {
      rig.dispose();
    }
  });

  it("turns the grip mesh and the rider contact around the same sloping axis", () => {
    const rig = createScooterRig();
    try {
      rig.group.updateMatrixWorld(true);
      const neutral = new THREE.Vector3(...SCOOTER_METRICS.grips.right);
      const local = rig.steering.worldToLocal(neutral.clone());
      rig.steering.rotation.y = 0.3;
      rig.group.updateMatrixWorld(true);
      const turned = rig.steering.localToWorld(local);
      const contact = new THREE.Vector3(...scooterGripPosition("right", 0.3));
      expect(turned.distanceTo(contact)).toBeLessThan(0.00001);
    } finally {
      rig.dispose();
    }
  });
});
