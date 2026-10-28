import { describe, it, expect } from "vitest";
import {
  advanceJumpMotion,
  initialJumpMotion,
  jumpAnimation,
} from "./locomotion-animation";
describe("jump clip lifecycle", () => {
  it("plays takeoff, airborne and landing before returning to walking", () => {
    let s = initialJumpMotion();
    s = advanceJumpMotion(s, {
      now: 1,
      grounded: true,
      verticalSpeed: 0,
      jumpStarted: true,
    });
    expect(jumpAnimation(s.phase)?.name).toBe("Jump_Start");
    s = advanceJumpMotion(s, {
      now: 1.12,
      grounded: false,
      verticalSpeed: 4,
      jumpStarted: false,
    });
    expect(s.phase).toBe("takeoff");
    s = advanceJumpMotion(s, {
      now: 1.22,
      grounded: false,
      verticalSpeed: 2,
      jumpStarted: false,
    });
    expect(jumpAnimation(s.phase)?.name).toBe("Jump_Loop");
    s = advanceJumpMotion(s, {
      now: 1.65,
      grounded: true,
      verticalSpeed: -1,
      jumpStarted: false,
    });
    expect(jumpAnimation(s.phase)?.name).toBe("Jump_Land");
    s = advanceJumpMotion(s, {
      now: 1.9,
      grounded: true,
      verticalSpeed: 0,
      jumpStarted: false,
    });
    expect(jumpAnimation(s.phase)).toBeNull();
  });
  it("does not let lingering ground contact cut off takeoff while rising", () => {
    let s = advanceJumpMotion(initialJumpMotion(), {
      now: 0,
      grounded: true,
      verticalSpeed: 0,
      jumpStarted: true,
    });
    s = advanceJumpMotion(s, {
      now: 0.21,
      grounded: true,
      verticalSpeed: 4.5,
      jumpStarted: false,
    });
    expect(s.phase).toBe("airborne");
    s = advanceJumpMotion(s, {
      now: 0.3,
      grounded: false,
      verticalSpeed: 3,
      jumpStarted: false,
    });
    expect(s.phase).toBe("airborne");
    expect(s.leftGround).toBe(true);
  });
  it("handles walking off ledges and permits a new jump after landing", () => {
    let s = advanceJumpMotion(initialJumpMotion(), {
      now: 2,
      grounded: false,
      verticalSpeed: -1,
      jumpStarted: false,
    });
    expect(s.phase).toBe("airborne");
    s = advanceJumpMotion(s, {
      now: 2.3,
      grounded: true,
      verticalSpeed: 0,
      jumpStarted: false,
    });
    expect(s.phase).toBe("landing");
    s = advanceJumpMotion(s, {
      now: 2.4,
      grounded: true,
      verticalSpeed: 0,
      jumpStarted: true,
    });
    expect(s.phase).toBe("takeoff");
  });
  it("clears animation for an anchored activity or reset", () => {
    const s = advanceJumpMotion(
      { phase: "airborne", startedAt: 1, leftGround: true },
      {
        now: 2,
        grounded: false,
        verticalSpeed: -4,
        jumpStarted: false,
        disabled: true,
      },
    );
    expect(s).toEqual(initialJumpMotion());
  });
});
