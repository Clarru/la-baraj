import * as THREE from "three";
import {
  roads,
  inWater,
  shoreDistance,
  segmentDistance,
  terrainHeight,
  activityClearance,
  cabinSpots,
  fishingSpots,
  sharedGrounds,
  FISHING_CLEARANCE,
  SHARED_GROUND_CLEARANCE,
  southShore,
  rng,
} from "./geography";

export type MeadowTier = "off" | "low" | "high";
export type TierSettings = {
  chunk: number;
  ring: number;
  fullRadius: number;
  fadeRadius: number;
  grassPerChunk: number;
  flowersPerChunk: number;
};
export const TIERS: Record<Exclude<MeadowTier, "off">, TierSettings> = {
  high: { chunk: 16, ring: 7, fullRadius: 26, fadeRadius: 48, grassPerChunk: 400, flowersPerChunk: 96 },
  low: { chunk: 16, ring: 5, fullRadius: 14, fadeRadius: 30, grassPerChunk: 190, flowersPerChunk: 48 },
};

export function meadowTier(input: {
  override?: string | null;
  cores?: number;
  memoryGiB?: number;
  mobile: boolean;
  renderer: string;
}): MeadowTier {
  const o = input.override;
  if (o === "off" || o === "low" || o === "high") return o;
  if (
    input.mobile ||
    (input.cores !== undefined && input.cores <= 4) ||
    (input.memoryGiB !== undefined && input.memoryGiB <= 4) ||
    /intel|swiftshader|llvmpipe|mali|adreno/i.test(input.renderer)
  )
    return "low";
  return "high";
}

/** Same kinds landscape-geometry's road ribbon skips, plus pedestrian. */
const undrawnRoads = new Set(["path", "footway", "track", "steps", "pedestrian", "cycleway", "bridleway"]);
const drawnRoads = roads.filter((r) => !undrawnRoads.has(r.kind));
export function drawnRoadDistance(x: number, z: number): number {
  let d = Infinity;
  for (const r of drawnRoads)
    for (let i = 1; i < r.points.length; i++)
      d = Math.min(d, segmentDistance(x, z, r.points[i - 1], r.points[i]));
  return d;
}

/** `margin` inflates every exclusion radius; the chunk grid uses it so jittered points stay valid. */
function plantable(x: number, z: number, shore: number, wet: boolean, margin: number): boolean {
  if (wet || shore <= 4 + margin) return false;
  if (Math.hypot(x - 4, z - (southShore(0) + 12)) <= 16 + margin) return false;
  for (const c of cabinSpots) if (Math.hypot(x - c.x, z - c.z) < 7.5 + margin) return false;
  for (const p of fishingSpots) if (Math.hypot(x - p.x, z - p.z) < FISHING_CLEARANCE + margin) return false;
  for (const p of sharedGrounds) if (Math.hypot(x - p.x, z - p.z) < SHARED_GROUND_CLEARANCE + margin) return false;
  return drawnRoadDistance(x, z) > 3.2 + margin;
}
export const GRID_MARGIN = 1.5;
export function canMeadow(x: number, z: number, shore?: number, wet?: boolean): boolean {
  const w = wet ?? inWater(x, z);
  if (w) return false;
  return (
    activityClearance(x, z) &&
    plantable(x, z, shore ?? shoreDistance(x, z), false, 0)
  );
}

export type ChunkKey = string;
export function chunkWindow(camX: number, camZ: number, settings: TierSettings): ChunkKey[] {
  const cx = Math.floor(camX / settings.chunk), cz = Math.floor(camZ / settings.chunk);
  const half = (settings.ring - 1) / 2;
  const cells: { key: ChunkKey; d: number }[] = [];
  for (let dz = -half; dz <= half; dz++)
    for (let dx = -half; dx <= half; dx++)
      cells.push({ key: `${cx + dx},${cz + dz}`, d: dx * dx + dz * dz });
  cells.sort((a, b) => a.d - b.d);
  return cells.map((c) => c.key);
}

export type ChunkSample = {
  grass: Float32Array;
  grassCount: number;
  flowers: Float32Array;
  flowerCount: number;
};
export const FLOWER_COLOURS: readonly string[] = ["#f3e5c9", "#7e648d", "#a8622b", "#d8b85a"];

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
function hash2(x: number, z: number): number {
  const v = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return v - Math.floor(v);
}
const smooth = (t: number) => t * t * (3 - 2 * t);
function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x), iz = Math.floor(z);
  const fx = smooth(x - ix), fz = smooth(z - iz);
  const a = hash2(ix, iz), b = hash2(ix + 1, iz), c = hash2(ix, iz + 1), d = hash2(ix + 1, iz + 1);
  return a + (b - a) * fx + (c - a) * fz + (a - b - c + d) * fx * fz;
}
const lowNoise = (x: number, z: number) => valueNoise(x / 9, z / 9);
/** Patches roughly 15-25 m across. */
const flowerPatch = (x: number, z: number) => valueNoise(x / 20 + 11.3, z / 20 - 4.7);

type Grid = { height: Float32Array; ok: Uint8Array };
export type ChunkBuild = { key: ChunkKey; settings: TierSettings; grid: Grid; cursor: number; total: number; kx: number; kz: number };
const gridCache = new Map<ChunkKey, Grid>();
const GRID_CACHE_CAP = 512;

/** Starts a resumable chunk build; a cached grid makes the build complete immediately. */
export function beginChunk(key: ChunkKey, settings: TierSettings): ChunkBuild {
  const n = settings.chunk / 2 + 1;
  const [kx, kz] = key.split(",").map(Number);
  const cached = gridCache.get(key);
  if (cached) return { key, settings, grid: cached, cursor: n * n, total: n * n, kx, kz };
  return { key, settings, grid: { height: new Float32Array(n * n), ok: new Uint8Array(n * n) }, cursor: 0, total: n * n, kx, kz };
}
/** Evaluates grid samples until the deadline (clock checked every 9 samples); true when the grid is complete. */
export function stepChunk(build: ChunkBuild, deadlineMs: number): boolean {
  if (build.cursor >= build.total) return true;
  const { key, settings, grid } = build;
  const { kx, kz } = build;
  const size = settings.chunk, step = 2, n = size / step + 1;
  const x0 = kx * size, z0 = kz * size;
  while (build.cursor < build.total) {
    const k = build.cursor, i = k % n, j = (k - i) / n;
    const x = x0 + i * step, z = z0 + j * step;
    const wet = inWater(x, z), shore = shoreDistance(x, z);
    grid.height[k] = terrainHeight(x, z, shore, wet);
    grid.ok[k] = plantable(x, z, shore, wet, GRID_MARGIN) ? 1 : 0;
    build.cursor++;
    if (build.cursor % 9 === 0 && build.cursor < build.total && performance.now() >= deadlineMs) return false;
  }
  if (gridCache.size >= GRID_CACHE_CAP) gridCache.delete(gridCache.keys().next().value as ChunkKey);
  gridCache.set(key, grid);
  return true;
}
export function sampleChunk(key: ChunkKey, settings: TierSettings): ChunkSample {
  const b = beginChunk(key, settings);
  stepChunk(b, Infinity);
  return finishChunk(b);
}
export function finishChunk(build: ChunkBuild): ChunkSample {
  const { key, settings } = build;
  const { height, ok } = build.grid;
  const [kx, kz] = key.split(",").map(Number);
  const size = settings.chunk, step = 2, cells = size / step, n = cells + 1;
  const x0 = kx * size, z0 = kz * size;
  const random = rng(hashString(key));
  const grass = new Float32Array(settings.grassPerChunk * 6);
  const flowers = new Float32Array(settings.flowersPerChunk * 7);
  let grassCount = 0, flowerCount = 0;
  const grassPerCell = settings.grassPerChunk / (cells * cells);
  const flowersPerCell = (settings.flowersPerChunk / (cells * cells)) * 2.2;
  for (let j = 0; j < cells; j++)
    for (let i = 0; i < cells; i++) {
      const k = j * n + i;
      if (!(ok[k] && ok[k + 1] && ok[k + n] && ok[k + n + 1])) continue;
      const h00 = height[k], h10 = height[k + 1], h01 = height[k + n], h11 = height[k + n + 1];
      const heightAt = (u: number, v: number) =>
        h00 + (h10 - h00) * u + (h01 - h00) * v + (h00 - h10 - h01 + h11) * u * v - 0.04;
      const cx = x0 + i * step, cz = z0 + j * step;
      const noise = lowNoise(cx + step / 2, cz + step / 2);
      const density = 0.7 + 0.3 * noise;
      const gn = Math.floor(grassPerCell * density + random());
      for (let t = 0; t < gn && grassCount < settings.grassPerChunk; t++) {
        const u = random(), v = random();
        const o = grassCount++ * 6;
        grass[o] = cx + u * step;
        grass[o + 1] = heightAt(u, v);
        grass[o + 2] = cz + v * step;
        grass[o + 3] = random() * Math.PI * 2;
        grass[o + 4] = (0.8 + 0.6 * random()) * (0.85 + 0.3 * noise);
        grass[o + 5] = random();
      }
      const fn = Math.floor(flowersPerCell + random());
      for (let t = 0; t < fn && flowerCount < settings.flowersPerChunk; t++) {
        const u = random(), v = random();
        const x = cx + u * step, z = cz + v * step;
        const yaw = random() * Math.PI * 2, scale = 0.8 + 0.4 * random(), rnd = random(), other = random();
        if (flowerPatch(x, z) <= 0.5) continue;
        const dominant = Math.floor(hash2(Math.floor(x / 12), Math.floor(z / 12)) * FLOWER_COLOURS.length) % FLOWER_COLOURS.length;
        const o = flowerCount++ * 7;
        flowers[o] = x;
        flowers[o + 1] = heightAt(u, v);
        flowers[o + 2] = z;
        flowers[o + 3] = yaw;
        flowers[o + 4] = scale;
        flowers[o + 5] = rnd;
        flowers[o + 6] = other < 0.2 ? Math.floor(random() * FLOWER_COLOURS.length) : dominant;
      }
    }
  return { grass, grassCount, flowers, flowerCount };
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function densityAt(distance: number, settings: TierSettings): number {
  return 1 - smoothstep(settings.fullRadius, settings.fadeRadius, distance);
}

type Vert = { p: [number, number, number]; uv: [number, number] };
function build(tris: { v: [Vert, Vert, Vert]; n: [number, number, number] }[]): THREE.BufferGeometry {
  const pos: number[] = [], nor: number[] = [], uv: number[] = [];
  for (const t of tris)
    for (const v of t.v) {
      pos.push(...v.p);
      nor.push(...t.n);
      uv.push(...v.uv);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  return g;
}
/** normalize(up*0.8 + facing*0.2) */
const softNormal = (fx: number, fz: number): [number, number, number] => {
  const l = Math.hypot(0.2 * fx, 0.8, 0.2 * fz);
  return [(0.2 * fx) / l, 0.8 / l, (0.2 * fz) / l];
};

export function tuftGeometry(): THREE.BufferGeometry {
  const tris: Parameters<typeof build>[0] = [];
  const blades = 6, height = 0.42;
  for (let b = 0; b < blades; b++) {
    const yaw = (b / blades) * Math.PI * 2 + (b % 2) * 0.35;
    const dx = Math.cos(yaw), dz = Math.sin(yaw); // lean direction
    const rx = -dz, rz = dx; // blade width axis
    const baseR = 0.04 + (b % 3) * 0.015;
    const h = height * (0.7 + 0.3 * ((b * 5) % 6) / 5);
    const w = 0.07;
    const lean = (f: number) => baseR + h * 0.38 * f * f;
    const at = (f: number, side: number, wd: number): Vert => ({
      p: [dx * lean(f) + rx * side * wd, h * f, dz * lean(f) + rz * side * wd],
      uv: [side > 0 ? 1 : side < 0 ? 0 : 0.5, f],
    });
    const n = softNormal(-dz, dx);
    const bl = at(0, -1, w), br = at(0, 1, w), ml = at(0.5, -1, w * 0.6), mr = at(0.5, 1, w * 0.6), tip = at(1, 0, 0);
    tris.push({ v: [bl, br, ml], n }, { v: [br, mr, ml], n }, { v: [ml, mr, tip], n });
  }
  return build(tris);
}

export function flowerGeometry(): THREE.BufferGeometry {
  const tris: Parameters<typeof build>[0] = [];
  const top = 0.46, stem = 0.44, sw = 0.016;
  const sv = (x: number, y: number, z: number): Vert => ({ p: [x, y, z], uv: [0, y / top] });
  for (const [ax, az] of [[1, 0], [0, 1]]) {
    const n = softNormal(-az, ax);
    const a = sv(-ax * sw, 0, -az * sw), b = sv(ax * sw, 0, az * sw), c = sv(-ax * sw, stem, -az * sw), d = sv(ax * sw, stem, az * sw);
    tris.push({ v: [a, b, c], n }, { v: [b, d, c], n });
  }
  const centre: Vert = { p: [0, top, 0], uv: [1, 1] };
  const ringY = stem - 0.02;
  const ring = (k: number): Vert => {
    const a = (k / 6) * Math.PI * 2;
    return { p: [Math.cos(a) * 0.1, ringY, Math.sin(a) * 0.1], uv: [1, ringY / top] };
  };
  for (let k = 0; k < 6; k++) {
    const r0 = ring(k), r1 = ring(k + 1);
    const u = [r0.p[0] - centre.p[0], r0.p[1] - centre.p[1], r0.p[2] - centre.p[2]];
    const w = [r1.p[0] - centre.p[0], r1.p[1] - centre.p[1], r1.p[2] - centre.p[2]];
    let nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
    const len = Math.hypot(nx, ny, nz) || 1;
    const sign = ny < 0 ? -1 : 1;
    nx = (nx / len) * sign; ny = (ny / len) * sign; nz = (nz / len) * sign;
    tris.push({ v: [centre, r0, r1], n: [nx, ny, nz] });
  }
  return build(tris);
}

export const meadowUniforms = {
  uTime: { value: 0 },
  uWind: { value: 0.12 },
  uFull: { value: TIERS.high.fullRadius },
  uFade: { value: TIERS.high.fadeRadius },
};

export function meadowMaterial(kind: "grass" | "flower"): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    roughness: 0.95,
    metalness: 0,
    side: THREE.DoubleSide,
  });
  material.userData.meadowUniforms = meadowUniforms;
  material.customProgramCacheKey = () => "meadow-" + kind;
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, meadowUniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uTime;
uniform float uWind;
uniform float uFull;
uniform float uFade;
attribute float meadowRandom;
varying vec2 vMeadow;`,
      )
      .replace(
        "#include <project_vertex>",
        `vec3 origin = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
float d = distance(origin.xz, cameraPosition.xz);
float density = 1.0 - smoothstep(uFull, uFade, d);
float vis = clamp((density * 1.12 - meadowRandom) / 0.12, 0.0, 1.0);
vMeadow = vec2(${kind === "grass" ? "uv.y" : "uv.x"}, vis);
float instScale = length(instanceMatrix[0].xyz);
vec4 worldPos = modelMatrix * instanceMatrix * vec4(transformed * vis, 1.0);
worldPos.xz += uWind * uv.y * uv.y * instScale * (sin(uTime * 1.3 + worldPos.x * 0.35 + worldPos.z * 0.2) * 0.6 + sin(uTime * 2.1 + worldPos.x * 0.9 + 1.7) * 0.4) * vec2(1.0, 0.6);
vec4 mvPosition = viewMatrix * worldPos;
gl_Position = projectionMatrix * mvPosition;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", `#include <common>\nvarying vec2 vMeadow;`)
      // Blades are lit with their authored (up-biased) normal from either side; valid because there is no normal/bump map.
      .replace(
        "#include <normal_fragment_begin>",
        `#include <normal_fragment_begin>
normal = normalize(vNormal);
nonPerturbedNormal = normal;`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n${
          kind === "grass"
            ? "diffuseColor.rgb *= mix(0.55, 0.98, vMeadow.x);"
            : "diffuseColor.rgb = mix(vec3(0.30, 0.42, 0.22), diffuseColor.rgb, vMeadow.x);"
        }`,
      );
  };
  return material;
}

export type SlotPlan = { build: { key: ChunkKey; slot: number }[]; clear: number[] };
/** Keys leaving the window free their slot; new keys take free slots nearest-first. Slots count === ring*ring. */
export function planChunkUpdates(current: Map<ChunkKey, number>, next: ChunkKey[], slotCount: number): SlotPlan {
  const wanted = new Set(next);
  const used = new Set<number>();
  const clear: number[] = [];
  for (const [key, slot] of current) {
    if (wanted.has(key)) used.add(slot);
    else clear.push(slot);
  }
  const free: number[] = [];
  for (let s = 0; s < slotCount; s++) if (!used.has(s)) free.push(s);
  const build: SlotPlan["build"] = [];
  let f = 0;
  for (const key of next) {
    if (current.has(key)) continue;
    if (f >= free.length) break;
    build.push({ key, slot: free[f++] });
  }
  return { build, clear };
}
export function windAmplitude(reducedMotion: boolean): number {
  return reducedMotion ? 0 : 0.09;
}
