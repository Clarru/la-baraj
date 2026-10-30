import { useEffect, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import {
  TIERS,
  meadowDrawCount,
  setMeadowDrawCount,
  createMeadowFrameGuard,
  advanceMeadowFrameGuard,
  resetMeadowFrameGuard,
  FLOWER_COLOURS,
  meadowTier,
  chunkWindow,
  beginChunk,
  stepChunk,
  finishChunk,
  type ChunkBuild,
  type ChunkSample,
  planChunkUpdates,
  windAmplitude,
  tuftGeometry,
  flowerGeometry,
  meadowMaterial,
  meadowUniforms,
  TIME_PERIOD,
  type ChunkKey,
  type MeadowTier,
} from "./meadow";

type ActiveTier = Exclude<MeadowTier, "off">;

/** Page-lifetime singletons: never disposed. */
let shared: {
  grassGeometry: THREE.BufferGeometry;
  flowerGeometry: THREE.BufferGeometry;
  grassMaterial: THREE.MeshStandardMaterial;
  flowerMaterial: THREE.MeshStandardMaterial;
} | null = null;
function sharedAssets() {
  return (shared ??= {
    grassGeometry: tuftGeometry(),
    flowerGeometry: flowerGeometry(),
    grassMaterial: meadowMaterial("grass"),
    flowerMaterial: meadowMaterial("flower"),
  });
}

const transform = new THREE.Object3D();
const colour = new THREE.Color();
const grassLow = new THREE.Color("#4a6636");
const grassHigh = new THREE.Color("#6b8545");
const flowerColours = FLOWER_COLOURS.map((c) => new THREE.Color(c));

const FRAME_BUDGET_MS = 3;

type Build = { key: ChunkKey; slot: number };

function makeInstanced(
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  capacity: number,
) {
  const mesh = new THREE.InstancedMesh(geometry, material, capacity);
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.instanceColor = new THREE.InstancedBufferAttribute(
    new Float32Array(capacity * 3),
    3,
  );
  mesh.instanceColor.setUsage(THREE.DynamicDrawUsage);
  const random = new THREE.InstancedBufferAttribute(
    new Float32Array(capacity).fill(1),
    1,
  );
  random.setUsage(THREE.DynamicDrawUsage);
  // Per-mesh attribute: instanced attributes on a shared geometry would collide, so use the mesh's own geometry clone.
  mesh.geometry = geometry.clone();
  mesh.geometry.setAttribute("meadowRandom", random);
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.count = 0;
  mesh.visible = false;
  mesh.instanceMatrix.array.fill(0);
  return mesh;
}

function MeadowMeshes({ tier }: { tier: ActiveTier }) {
  const settings = TIERS[tier];
  const slotCount = settings.ring * settings.ring;
  const { grass, flowers } = useMemo(() => {
    const a = sharedAssets();
    return {
      grass: makeInstanced(
        a.grassGeometry,
        a.grassMaterial,
        slotCount * settings.grassPerChunk,
      ),
      flowers: makeInstanced(
        a.flowerGeometry,
        a.flowerMaterial,
        slotCount * settings.flowersPerChunk,
      ),
    };
  }, [settings, slotCount]);
  useEffect(
    () => () => {
      for (const m of [grass, flowers]) {
        m.dispose();
        m.geometry.dispose(); // per-mesh clone only; the shared source geometry stays alive
      }
    },
    [grass, flowers],
  );
  useEffect(() => {
    meadowUniforms.uFull.value = settings.fullRadius;
    meadowUniforms.uFade.value = settings.fadeRadius;
  }, [settings]);

  const state = useMemo(
    () => ({
      grassCounts: new Uint16Array(slotCount),
      flowerCounts: new Uint16Array(slotCount),
      cx: NaN,
      cz: NaN,
      slots: new Map<ChunkKey, number>(),
      queue: [] as Build[],
      head: 0,
      current: null as { build: ChunkBuild; slot: number } | null,
    }),
    [slotCount],
  );

  useFrame(({ camera }) => {
    let changed = false;
    const frameStart = performance.now();
    const s = state;
    const cx = Math.floor(camera.position.x / settings.chunk);
    const cz = Math.floor(camera.position.z / settings.chunk);
    if (cx !== s.cx || cz !== s.cz) {
      s.cx = cx;
      s.cz = cz;
      const plan = planChunkUpdates(
        s.slots,
        chunkWindow(camera.position.x, camera.position.z, settings),
        slotCount,
      );
      for (const slot of plan.clear) {
        zeroSlot(grass, flowers, settings, slot);
        s.grassCounts[slot] = s.flowerCounts[slot] = 0;
        changed = true;
      }
      for (const [key, slot] of s.slots)
        if (plan.clear.includes(slot)) s.slots.delete(key);
      s.queue = plan.build;
      s.head = 0;
      if (s.current) {
        // Keep the in-progress builder if its chunk is still wanted; it may have been given a new slot.
        const idx = s.queue.findIndex((b) => b.key === s.current!.build.key);
        if (idx >= 0) {
          s.current.slot = s.queue[idx].slot;
          s.queue.splice(idx, 1);
        } else s.current = null;
      }
    }
    const deadline = frameStart + FRAME_BUDGET_MS;
    while (performance.now() < deadline) {
      if (!s.current) {
        if (s.head >= s.queue.length) break;
        const next = s.queue[s.head++];
        s.current = { build: beginChunk(next.key, settings), slot: next.slot };
      }
      if (!stepChunk(s.current.build, deadline)) break;
      const sample = finishChunk(s.current.build);
      writeSlot(grass, flowers, settings, s.current.slot, sample);
      s.grassCounts[s.current.slot] = sample.grassCount;
      s.flowerCounts[s.current.slot] = sample.flowerCount;
      changed = true;
      s.slots.set(s.current.build.key, s.current.slot);
      s.current = null;
    }
    if (changed) {
      setMeadowDrawCount(
        grass,
        meadowDrawCount(s.grassCounts, settings.grassPerChunk),
      );
      setMeadowDrawCount(
        flowers,
        meadowDrawCount(s.flowerCounts, settings.flowersPerChunk),
      );
    }
  });

  return (
    <>
      <primitive object={grass} dispose={null} />
      <primitive object={flowers} dispose={null} />
    </>
  );
}

function markRange(mesh: THREE.InstancedMesh, start: number, count: number) {
  const random = mesh.geometry.getAttribute(
    "meadowRandom",
  ) as THREE.InstancedBufferAttribute;
  mesh.instanceMatrix.addUpdateRange(start * 16, count * 16);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.instanceColor!.addUpdateRange(start * 3, count * 3);
  mesh.instanceColor!.needsUpdate = true;
  random.addUpdateRange(start, count);
  random.needsUpdate = true;
}

function zeroRange(mesh: THREE.InstancedMesh, start: number, end: number) {
  if (end <= start) return;
  mesh.instanceMatrix.array.fill(0, start * 16, end * 16);
  (mesh.geometry.getAttribute("meadowRandom").array as Float32Array).fill(
    1,
    start,
    end,
  );
}

function zeroSlot(
  grass: THREE.InstancedMesh,
  flowers: THREE.InstancedMesh,
  t: (typeof TIERS)[ActiveTier],
  slot: number,
) {
  zeroRange(grass, slot * t.grassPerChunk, (slot + 1) * t.grassPerChunk);
  markRange(grass, slot * t.grassPerChunk, t.grassPerChunk);
  zeroRange(flowers, slot * t.flowersPerChunk, (slot + 1) * t.flowersPerChunk);
  markRange(flowers, slot * t.flowersPerChunk, t.flowersPerChunk);
}

function writeSlot(
  grass: THREE.InstancedMesh,
  flowers: THREE.InstancedMesh,
  t: (typeof TIERS)[ActiveTier],
  slot: number,
  sample: ChunkSample,
) {
  const gStart = slot * t.grassPerChunk;
  const gRandom = grass.geometry.getAttribute("meadowRandom")
    .array as Float32Array;
  const gColour = grass.instanceColor!.array as Float32Array;
  for (let i = 0; i < sample.grassCount; i++) {
    const o = i * 6,
      at = gStart + i;
    transform.position.set(
      sample.grass[o],
      sample.grass[o + 1],
      sample.grass[o + 2],
    );
    transform.rotation.set(0, sample.grass[o + 3], 0);
    transform.scale.setScalar(sample.grass[o + 4]);
    transform.updateMatrix();
    transform.matrix.toArray(
      grass.instanceMatrix.array as Float32Array,
      at * 16,
    );
    gRandom[at] = sample.grass[o + 5];
    colour
      .lerpColors(grassLow, grassHigh, sample.grass[o + 5])
      .toArray(gColour, at * 3);
  }
  zeroRange(grass, gStart + sample.grassCount, gStart + t.grassPerChunk);
  markRange(grass, gStart, t.grassPerChunk);

  const fStart = slot * t.flowersPerChunk;
  const fRandom = flowers.geometry.getAttribute("meadowRandom")
    .array as Float32Array;
  const fColour = flowers.instanceColor!.array as Float32Array;
  for (let i = 0; i < sample.flowerCount; i++) {
    const o = i * 7,
      at = fStart + i;
    transform.position.set(
      sample.flowers[o],
      sample.flowers[o + 1],
      sample.flowers[o + 2],
    );
    transform.rotation.set(0, sample.flowers[o + 3], 0);
    transform.scale.setScalar(sample.flowers[o + 4]);
    transform.updateMatrix();
    transform.matrix.toArray(
      flowers.instanceMatrix.array as Float32Array,
      at * 16,
    );
    fRandom[at] = sample.flowers[o + 5];
    flowerColours[sample.flowers[o + 6]].toArray(fColour, at * 3);
  }
  zeroRange(flowers, fStart + sample.flowerCount, fStart + t.flowersPerChunk);
  markRange(flowers, fStart, t.flowersPerChunk);
}

export function Meadow({ forceHigh = false }: { forceHigh?: boolean }) {
  const gl = useThree((s) => s.gl);
  const initial = useMemo<MeadowTier>(() => {
    const diagnostics = import.meta.env.VITE_GAME_DIAGNOSTICS === "1";
    const override = diagnostics
      ? new URLSearchParams(location.search).get("meadow")
      : null;
    if (forceHigh && !override) return "high";
    const context = gl.getContext();
    const info = context.getExtension("WEBGL_debug_renderer_info");
    return meadowTier({
      override,
      cores: navigator.hardwareConcurrency,
      memoryGiB: (navigator as Navigator & { deviceMemory?: number })
        .deviceMemory,
      mobile:
        /Mobi|Android|iPhone|iPad/.test(navigator.userAgent) ||
        window.matchMedia("(pointer: coarse)").matches,
      renderer: info
        ? String(context.getParameter(info.UNMASKED_RENDERER_WEBGL))
        : "",
    });
  }, [gl, forceHigh]);
  const [tier, setTier] = useState<MeadowTier>(initial);
  const active = tier;

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      meadowUniforms.uWind.value = windAmplitude(query.matches);
    };
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  const guard = useMemo(createMeadowFrameGuard, []);
  useEffect(() => {
    const visible = () => {
      if (!document.hidden) resetMeadowFrameGuard(guard);
    };
    document.addEventListener("visibilitychange", visible);
    return () => document.removeEventListener("visibilitychange", visible);
  }, [guard]);
  useFrame((_, dt) => {
    meadowUniforms.uTime.value =
      (meadowUniforms.uTime.value + Math.min(dt, 0.1)) % TIME_PERIOD;
    if (forceHigh || active !== "high" || document.hidden) return;
    if (advanceMeadowFrameGuard(guard, dt)) setTier("low");
  });

  if (active === "off") return null;
  return <MeadowMeshes key={active} tier={active} />;
}
