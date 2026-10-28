/** Coordinates and elevations are world-space metres; Y is up. */
export type GroundSample = { x: number; z: number; groundY: number };
export type Footprint = {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
};
export type FootprintPose = { x: number; z: number; yaw: number };
export type FoundationSupport = GroundSample & {
  bottomY: number;
  topY: number;
  centerY: number;
  length: number;
};
export type FoundationOptions = {
  /** Space between the highest sampled ground and the level building underside. */
  clearance?: number;
  /** Bury support feet slightly to hide numerical cracks at contact. */
  embedment?: number;
  /** Maximum variation between sampled ground elevations. */
  maxRise?: number;
  /** Maximum horizontal distance between any two sampled points. */
  maxSpan?: number;
  /** Maximum exposed support height, excluding buried embedment. */
  maxSupportHeight?: number;
};
export type FoundationPlan =
  | {
      ok: true;
      /** World Y of the level underside being supported, not the model origin. */
      baseY: number;
      groundRise: number;
      span: number;
      supports: FoundationSupport[];
    }
  | {
      ok: false;
      reason:
        | "invalid-options"
        | "invalid-samples"
        | "insufficient-footprint"
        | "rise-exceeded"
        | "span-exceeded"
        | "support-height-exceeded";
    };

/**
 * Sample the corners, edge midpoints, and centre of an explicit local footprint.
 * The yaw transform matches a Three.js group rotation about Y. Supply the height
 * of the visible terrain triangles (or a matching physics raycast), where possible.
 * Nine samples are a small-building approximation, not a survey of every triangle.
 */
export function sampleFootprintGround(
  footprint: Footprint,
  pose: FootprintPose,
  sampleGround: (worldX: number, worldZ: number) => number,
): GroundSample[] {
  if (
    !Object.values(footprint).every(Number.isFinite) ||
    !Object.values(pose).every(Number.isFinite) ||
    footprint.minX >= footprint.maxX ||
    footprint.minZ >= footprint.maxZ
  )
    return [];

  const xs = [
    footprint.minX,
    (footprint.minX + footprint.maxX) / 2,
    footprint.maxX,
  ];
  const zs = [
    footprint.minZ,
    (footprint.minZ + footprint.maxZ) / 2,
    footprint.maxZ,
  ];
  const cosine = Math.cos(pose.yaw),
    sine = Math.sin(pose.yaw);
  return xs.flatMap((localX) =>
    zs.map((localZ) => {
      const x = pose.x + cosine * localX + sine * localZ;
      const z = pose.z - sine * localX + cosine * localZ;
      return { x, z, groundY: sampleGround(x, z) };
    }),
  );
}

/** Keep a static building level and describe supports that reach sampled ground. */
export function planLevelFoundation(
  samples: readonly GroundSample[],
  {
    clearance = 0.04,
    embedment = 0.12,
    maxRise = 2,
    maxSpan = 16,
    maxSupportHeight = 2.5,
  }: FoundationOptions = {},
): FoundationPlan {
  if (
    ![clearance, embedment, maxRise, maxSpan, maxSupportHeight].every(
      (value) => Number.isFinite(value) && value >= 0,
    ) ||
    maxSpan === 0
  )
    return { ok: false, reason: "invalid-options" };
  if (
    samples.some(
      (sample) => ![sample.x, sample.z, sample.groundY].every(Number.isFinite),
    )
  )
    return { ok: false, reason: "invalid-samples" };
  if (samples.length < 3)
    return { ok: false, reason: "insufficient-footprint" };

  let spansArea = false,
    span = 0;
  const origin = samples[0];
  for (let i = 0; i < samples.length; i++) {
    for (let j = i + 1; j < samples.length; j++) {
      span = Math.max(
        span,
        Math.hypot(samples[i].x - samples[j].x, samples[i].z - samples[j].z),
      );
      const area =
        (samples[i].x - origin.x) * (samples[j].z - origin.z) -
        (samples[i].z - origin.z) * (samples[j].x - origin.x);
      if (Math.abs(area) > 1e-8) spansArea = true;
    }
  }
  if (!spansArea) return { ok: false, reason: "insufficient-footprint" };
  if (span > maxSpan) return { ok: false, reason: "span-exceeded" };

  const highest = Math.max(...samples.map((sample) => sample.groundY));
  const lowest = Math.min(...samples.map((sample) => sample.groundY));
  const groundRise = highest - lowest;
  if (groundRise > maxRise) return { ok: false, reason: "rise-exceeded" };
  const baseY = highest + clearance;
  if (baseY - lowest > maxSupportHeight)
    return { ok: false, reason: "support-height-exceeded" };

  return {
    ok: true,
    baseY,
    groundRise,
    span,
    supports: samples.map((sample) => {
      const bottomY = sample.groundY - embedment;
      return {
        ...sample,
        bottomY,
        topY: baseY,
        centerY: (bottomY + baseY) / 2,
        length: baseY - bottomY,
      };
    }),
  };
}
