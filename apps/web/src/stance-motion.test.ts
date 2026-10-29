import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  STANCE_METRICS,
  postureFromAnimation,
  stanceBaseAnimation,
  stanceBottomExtent,
  stanceCandidateY,
  stanceColliderRotation,
  stanceControllerHeight,
  stanceExpansionAllowed,
  stanceForToggle,
  stanceRayOriginOffset,
  stanceVisualLift,
} from "./stance-motion";

describe("player stance contract", () => {
  it("uses progressively shorter real capsules and movement caps", () => {
    expect(stanceBottomExtent("standing")).toBeGreaterThan(
      stanceBottomExtent("crouching"),
    );
    expect(stanceBottomExtent("crouching")).toBeGreaterThan(
      stanceBottomExtent("prone"),
    );
    expect(STANCE_METRICS.crouching.walkSpeed).toBe(1.5);
    expect(STANCE_METRICS.prone.walkSpeed).toBe(0.65);
    expect(STANCE_METRICS.prone.runSpeed).toBe(0.65);
    expect(STANCE_METRICS.standing.rayRadius).toBe(0.22);
    expect(STANCE_METRICS.standing.floatHeight).toBe(0.3);
    expect(STANCE_METRICS.crouching.rayRadius).toBe(0.12);
    expect(STANCE_METRICS.crouching.floatHeight).toBe(0.16);
    expect(STANCE_METRICS.prone.rayRadius).toBe(0.08);
    expect(STANCE_METRICS.prone.floatHeight).toBe(0.17);
    expect(stanceRayOriginOffset("standing")).toBeCloseTo(-0.35);
    expect(stanceRayOriginOffset("crouching")).toBeCloseTo(-0.18);
    expect(stanceRayOriginOffset("prone")).toBeCloseTo(-0.1);
  });

  it("toggles C and Z without making prone a transient crouch", () => {
    expect(stanceForToggle("standing", "crouch")).toBe("crouching");
    expect(stanceForToggle("crouching", "crouch")).toBe("standing");
    expect(stanceForToggle("standing", "prone")).toBe("prone");
    expect(stanceForToggle("crouching", "prone")).toBe("prone");
    expect(stanceForToggle("prone", "prone")).toBe("standing");
  });

  it("uses explicit posture when available and aliases old remote animation packets", () => {
    expect(postureFromAnimation("prone", "Idle_Neutral")).toBe("prone");
    expect(postureFromAnimation(undefined, "Prone_Crawl")).toBe("prone");
    expect(postureFromAnimation(undefined, "Crouch_Walk")).toBe("crouching");
    expect(postureFromAnimation(undefined, "Swim_Forward")).toBe("standing");
    expect(stanceBaseAnimation("prone", false)).toBe("Prone_Idle");
    expect(stanceBaseAnimation("prone", true)).toBe("Prone_Crawl");
    expect(stanceBaseAnimation("crouching", true)).toBe("Crouch_Walk");
    expect(stanceBaseAnimation("crouching", false)).toBe("Crouch_Idle");
    expect(postureFromAnimation("standing", "Prone_Idle")).toBe("standing");
    expect(stanceVisualLift("prone")).toBeGreaterThan(0);
    expect(stanceVisualLift("crouching")).toBe(0);
  });

  it("uses the measured Ecctrl body envelopes and refuses a blocked stand", () => {
    const standingY = stanceControllerHeight("standing");
    const crouchingY = stanceCandidateY(standingY, "standing", "crouching");
    expect(standingY).toBeCloseTo(1.09);
    expect(crouchingY).toBeCloseTo(0.58);
    expect(stanceControllerHeight("prone")).toBeCloseTo(0.43);
    expect(stanceExpansionAllowed("crouching", "standing", false)).toBe(true);
    expect(stanceExpansionAllowed("crouching", "standing", true)).toBe(false);
    expect(stanceExpansionAllowed("prone", "crouching", true)).toBe(false);
    expect(stanceExpansionAllowed("prone", "crouching", false)).toBe(true);
    expect(stanceExpansionAllowed("crouching", "prone", true)).toBe(false);
  });

  it.each([
    [0, [0, 0, 1]],
    [Math.PI / 2, [1, 0, 0]],
    [Math.PI, [0, 0, -1]],
    [-Math.PI / 2, [-1, 0, 0]],
  ])(
    "rotates the prone capsule axis in the expected direction at yaw %s",
    (yaw, expected) => {
      const rotation = stanceColliderRotation("prone", yaw);
      const axis = new THREE.Vector3(0, 1, 0).applyQuaternion(
        new THREE.Quaternion(rotation.x, rotation.y, rotation.z, rotation.w),
      );
      expect(axis.x).toBeCloseTo(expected[0]);
      expect(axis.y).toBeCloseTo(expected[1]);
      expect(axis.z).toBeCloseTo(expected[2]);
    },
  );
});
