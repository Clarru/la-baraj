/** Shared local/remote posture contract for the player controller. */
export type Stance = "standing" | "crouching" | "prone";

export const STANCE_METRICS: Record<
  Stance,
  {
    capsuleHalfHeight: number;
    capsuleRadius: number;
    capsuleAxis: "vertical" | "horizontal";
    walkSpeed: number;
    runSpeed: number;
  }
> = {
  // Ecctrl's standing capsule is 1.3m high (2 * (halfHeight + radius)).
  standing: {
    capsuleHalfHeight: 0.35,
    capsuleRadius: 0.3,
    capsuleAxis: "vertical",
    walkSpeed: 3.8,
    runSpeed: 6.5,
  },
  // Keep the radius stable so posture changes do not make the character snag
  // on corners; only the vertical clearance and speed change.
  crouching: {
    capsuleHalfHeight: 0.18,
    capsuleRadius: 0.3,
    capsuleAxis: "vertical",
    walkSpeed: 1.5,
    runSpeed: 1.5,
  },
  prone: {
    // Horizontal capsule: the long axis follows the character's facing, so
    // prone shoulders/head/feet cannot pass through a wall as a short ball.
    capsuleHalfHeight: 0.65,
    capsuleRadius: 0.4,
    capsuleAxis: "horizontal",
    walkSpeed: 0.65,
    runSpeed: 0.65,
  },
};

export function postureFromAnimation(
  posture: unknown,
  animation: string,
): Stance {
  if (posture === "crouching" || posture === "prone") return posture;
  // Older rooms do not send posture yet. The explicit animation aliases keep
  // those clients from rendering a lowered pose as a normal swimmer.
  if (animation.startsWith("Prone_")) return "prone";
  if (animation.startsWith("Crouch_")) return "crouching";
  return "standing";
}

export function stanceForToggle(current: Stance, key: "crouch" | "prone") {
  if (key === "crouch")
    return current === "crouching" ? "standing" : "crouching";
  return current === "prone" ? "standing" : "prone";
}

/** A prone swim clip is authored below the root; lift it to keep its chest on land. */
export function stanceVisualLift(stance: Stance) {
  return stance === "prone" ? 0.46 : 0;
}

export function stanceCandidateY(currentY: number, from: Stance, to: Stance) {
  return currentY + stanceBottomExtent(to) - stanceBottomExtent(from);
}

export function stanceBottomExtent(stance: Stance) {
  const metrics = STANCE_METRICS[stance];
  return (
    metrics.capsuleRadius +
    (metrics.capsuleAxis === "vertical" ? metrics.capsuleHalfHeight : 0)
  );
}

/** Keep Ecctrl's spring origin at the same 30cm support gap for each stance. */
export function stanceRayOriginOffset(stance: Stance, floatHeight = 0.3) {
  return -(stanceBottomExtent(stance) - floatHeight);
}

/** Rapier capsules are Y-aligned; rotate the prone capsule onto local +Z. */
export function stanceColliderRotation(stance: Stance, yaw: number) {
  if (stance !== "prone") return { x: 0, y: 0, z: 0, w: 1 };
  const halfYaw = yaw / 2;
  const sy = Math.sin(halfYaw);
  const cy = Math.cos(halfYaw);
  const sx = Math.SQRT1_2;
  const qx = sx;
  const qw = sx;
  return {
    x: cy * qx,
    y: sy * qw,
    z: -sy * qx,
    w: cy * qw,
  };
}

/** The callback is a full-target-shape intersection, not a floor-only ray check. */
export function stanceExpansionAllowed(
  current: Stance,
  next: Stance,
  intersectsTargetSpace: boolean,
) {
  return current === next || !intersectsTargetSpace;
}

export function stanceBaseAnimation(
  stance: Stance,
  moving: boolean,
): string | null {
  if (stance !== "prone") return null;
  return moving ? "Prone_Crawl" : "Prone_Idle";
}
