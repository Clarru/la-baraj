/** Water is the same horizontal surface used by the lake shader. */
export const LAKE_LEVEL = 0.05;
export const SWIM_OFFSET = -0.45;
const ENTER_DEPTH = 0.62;
const EXIT_DEPTH = 0.42;

/** Stay on land, on a dock, or in the shallows until actually immersed. */
export function swimmingState(input: {
  swimming: boolean;
  inLake: boolean;
  depth: number;
  bodyY: number;
  indoors: boolean;
  occupied: boolean;
}): boolean {
  if (input.indoors || input.occupied || !input.inLake) return false;
  if (input.swimming)
    return input.depth > EXIT_DEPTH && input.bodyY < LAKE_LEVEL + 1.8;
  return input.depth > ENTER_DEPTH && input.bodyY < LAKE_LEVEL + 1.05;
}

/** Smooth camera-relative horizontal motion and a damped surface float. */
export function swimVelocity(input: {
  velocity: { x: number; y: number; z: number };
  direction: { x: number; z: number };
  bodyY: number;
  groundY: number;
  time: number;
  dt: number;
}) {
  const dt = Math.max(0, Math.min(input.dt, 0.05));
  const length = Math.hypot(input.direction.x, input.direction.z);
  const speed = 2.5;
  const tx = length ? (input.direction.x / length) * speed : 0;
  const tz = length ? (input.direction.z / length) * speed : 0;
  const blend = 1 - Math.exp(-4 * dt);
  const floatY = Math.max(
    LAKE_LEVEL + 0.5 + Math.sin(input.time * 1.8) * 0.025,
    input.groundY + 0.95,
  );
  const desiredY = Math.max(-1.6, Math.min(1.6, (floatY - input.bodyY) * 4));
  return {
    x: input.velocity.x + (tx - input.velocity.x) * blend,
    y:
      input.velocity.y +
      (desiredY - input.velocity.y) * (1 - Math.exp(-8 * dt)),
    z: input.velocity.z + (tz - input.velocity.z) * blend,
  };
}
