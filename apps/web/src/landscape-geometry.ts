import * as THREE from "three";
import {
  roads,
  terrainHeight,
  inWater,
  shoreDistance,
  activityClearance,
  segmentDistance,
  cabinSpots,
  rng,
  type Point,
} from "./geography";
import type { Placement } from "./assets";

const footpaths = new Set([
  "steps",
  "path",
  "track",
  "footway",
  "cycleway",
  "bridleway",
]);
const wideRoads = new Set(["tertiary", "secondary", "primary"]);
/** One continuous ribbon per OSM polyline. Shared cross-sections close the old corner gaps. */
export function makeRoadRibbon(
  lines: readonly { kind: string; points: Point[] }[] = roads,
  heightAt: (x: number, z: number) => number = terrainHeight,
) {
  const positions: number[] = [],
    uvs: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const across = [-1.12, -0.94, 0.94, 1.12];
  const append = (points: Point[], halfWidth: number) => {
    if (points.length < 2) return;
    let distance = 0;
    for (let i = 0; i < points.length; i++) {
      const p = points[i],
        before = points[Math.max(0, i - 1)],
        after = points[Math.min(points.length - 1, i + 1)];
      const px = p[0] - before[0],
        pz = p[1] - before[1],
        nx = after[0] - p[0],
        nz = after[1] - p[1];
      const pl = Math.hypot(px, pz),
        nl = Math.hypot(nx, nz);
      const previous = pl ? [-pz / pl, px / pl] : [-nz / nl, nx / nl];
      const next = nl ? [-nz / nl, nx / nl] : previous;
      let mx = previous[0] + next[0],
        mz = previous[1] + next[1],
        length = Math.hypot(mx, mz);
      if (length < 0.00001) {
        mx = next[0];
        mz = next[1];
        length = 1;
      }
      mx /= length;
      mz /= length;
      const miter = 1 / Math.max(0.6, mx * next[0] + mz * next[1]);
      if (i) distance += Math.hypot(px, pz);
      const row = positions.length / 3;
      across.forEach((side, column) => {
        const x = p[0] + mx * halfWidth * side * miter,
          z = p[1] + mz * halfWidth * side * miter;
        positions.push(x, heightAt(x, z) + 0.065, z);
        // Metre-based UVs: road length and corners never stretch the aggregate.
        uvs.push(((side + 1) * halfWidth) / 3, distance / 3);
        colors.push(1, 1, 1, column === 0 || column === 3 ? 0 : 1);
      });
      if (i)
        for (let j = 0; j < across.length - 1; j++) {
          const a = row - across.length + j,
            b = a + 1,
            c = row + j,
            d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
    }
  };
  for (const road of lines) {
    if (footpaths.has(road.kind)) continue;
    let chain: Point[] = [];
    const flush = () => {
      append(chain, wideRoads.has(road.kind) ? 2.8 : 1.8);
      chain = [];
    };
    for (let i = 1; i < road.points.length; i++) {
      const a = road.points[i - 1],
        b = road.points[i],
        dx = b[0] - a[0],
        dz = b[1] - a[1],
        length = Math.hypot(dx, dz);
      if (length < 0.00001) continue;
      if (
        !Number.isFinite(length) ||
        Math.abs((a[0] + b[0]) / 2 + 950) > 2175 ||
        Math.abs((a[1] + b[1]) / 2 + 50) > 1500
      ) {
        flush();
        continue;
      }
      if (!chain.length) chain.push(a);
      const steps = Math.max(1, Math.ceil(length / 4));
      for (let j = 1; j <= steps; j++)
        chain.push([a[0] + (dx * j) / steps, a[1] + (dz * j) / steps]);
    }
    flush();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 4));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

export const BACKGROUND_TREE_BUDGET = 2400;
/** Reuses the four baked tree sprites. No new GLBs or shadow passes; trunk collisions use the existing nearby-only system. */
export function makeBackgroundForest() {
  const groups: Record<string, Placement[]> = {
    Cincis_Oak_1: [],
    Cincis_Beech_1: [],
    Pine_2: [],
    Pine_4: [],
  };
  const ids = Object.keys(groups),
    random = rng(51941);
  const roadSegments = roads.flatMap((road) =>
    road.points.slice(1).map((b, i) => {
      const a = road.points[i];
      return {
        a,
        b,
        minX: Math.min(a[0], b[0]) - 2.2,
        maxX: Math.max(a[0], b[0]) + 2.2,
        minZ: Math.min(a[1], b[1]) - 2.2,
        maxZ: Math.max(a[1], b[1]) + 2.2,
      };
    }),
  );
  let count = 0;
  for (
    let attempt = 0;
    attempt < 12000 && count < BACKGROUND_TREE_BUDGET;
    attempt++
  ) {
    const x = -2700 + random() * 3800,
      z = -1400 + random() * 2650;
    if (
      (x - 36) ** 2 + (z - 40) ** 2 < 240 ** 2 ||
      cabinSpots.some((c) => (x - c.x) ** 2 + (z - c.z) ** 2 < 105 ** 2) ||
      inWater(x, z) ||
      !activityClearance(x, z)
    )
      continue;
    const distance = shoreDistance(x, z);
    if (
      distance <= 4 ||
      roadSegments.some(
        (s) =>
          x >= s.minX &&
          x <= s.maxX &&
          z >= s.minZ &&
          z <= s.maxZ &&
          segmentDistance(x, z, s.a, s.b) <= 2.2,
      )
    )
      continue;
    groups[ids[count % ids.length]].push({
      x,
      z,
      y: terrainHeight(x, z, distance, false),
      scale: 1.4 + random() * 0.8,
      rotation: random() * Math.PI * 2,
    });
    count++;
  }
  return groups;
}

/** A visual-only land apron extends beyond the playable terrain; no physics or DEM claim. */
export function makeHorizonLand() {
  const positions: number[] = [],
    colors: number[] = [],
    indices: number[] = [];
  const segments = 192,
    scales = [0.94, 1.12, 1.45, 1.8, 2.2];
  const palette = ["#405d43", "#55745c", "#73917d", "#8ea994", "#a7bdab"].map(
    (c) => new THREE.Color(c),
  );
  for (let ring = 0; ring < scales.length; ring++)
    for (let i = 0; i <= segments; i++) {
      const angle = (i / segments) * Math.PI * 2,
        dx = Math.cos(angle),
        dz = Math.sin(angle);
      const radius = 1 / Math.max(Math.abs(dx) / 2200, Math.abs(dz) / 1525);
      const x = -950 + dx * radius * scales[ring],
        z = -50 + dz * radius * scales[ring];
      const rolling =
        0.56 +
        0.24 * Math.sin(angle * 5 + 0.8) +
        0.14 * Math.cos(angle * 9 - 1.2) +
        0.06 * Math.sin(angle * 17);
      const height =
        terrainHeight(x, z) +
        (ring === 0 ? -10 : rolling * [0, 40, 90, 150, 235][ring]);
      positions.push(x, height, z);
      const color = palette[ring]
        .clone()
        .multiplyScalar(1 + Math.sin(angle * 7) * 0.025);
      color.toArray(colors, colors.length);
      if (ring && i) {
        const a = (ring - 1) * (segments + 1) + i - 1,
          b = a + 1,
          c = ring * (segments + 1) + i - 1,
          d = c + 1;
        indices.push(a, c, b, b, c, d);
      }
    }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
}
