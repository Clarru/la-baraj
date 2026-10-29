/** Local opt-in load fixture. Never connects fake players to the shared world. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import {
  useRapier,
  useBeforePhysicsStep,
  useAfterPhysicsStep,
} from "@react-three/rapier";
import { RemoteAvatar } from "./multiplayer-players";
import { RemoteScooterFleet } from "./RemoteScooterFleet";
import type { RemotePlayer } from "./multiplayer";
import { homeSpawn, homeWalkCameraOffset } from "./home";
import { terrainHeight, settlementRoadZ } from "./geography";
import * as THREE from "three";

export type PerformanceScenario =
  "solo" | "village" | "crowd" | "riders" | "distant" | "swimmers";
export const performanceLab =
  import.meta.env.VITE_PERFORMANCE_LAB === "1" &&
  ["127.0.0.1", "localhost"].includes(location.hostname);

type SceneView =
  "arrival" | "lake" | "road" | "north" | "east" | "south" | "west";
let sceneView: SceneView = "arrival";

export function PerformancePanel({
  scenario,
  onScenario,
}: {
  scenario: PerformanceScenario;
  onScenario: (value: PerformanceScenario) => void;
}) {
  const [view, setView] = useState<SceneView>("arrival");
  return (
    <aside
      style={{
        position: "absolute",
        right: 24,
        top: 100,
        zIndex: 100,
        background: "#eee5ce",
        color: "#203a2a",
        padding: 12,
        maxWidth: 420,
      }}
    >
      <label>
        Local performance scenario{" "}
        <select
          aria-label="Performance scenario"
          value={scenario}
          onChange={(e) => onScenario(e.target.value as PerformanceScenario)}
        >
          <option value="solo">1 cabin / solo</option>
          <option value="village">50 cabins / solo</option>
          <option value="crowd">50 cabins / 49 nearby walkers</option>
          <option value="riders">50 cabins / 49 nearby scooter riders</option>
          <option value="swimmers">50 cabins / 49 swimmers</option>
          <option value="distant">50 cabins / 49 distant players</option>
        </select>
      </label>
      <label>
        Scene view{" "}
        <select
          aria-label="Performance scene view"
          value={view}
          onChange={(e) => {
            const next = e.target.value as SceneView;
            sceneView = next;
            setView(next);
          }}
        >
          <option value="arrival">Arrival</option>
          <option value="lake">Across the lake</option>
          <option value="road">Road surface</option>
          <option value="north">North horizon</option>
          <option value="east">East horizon</option>
          <option value="south">South horizon</option>
          <option value="west">West horizon</option>
        </select>
      </label>
      <button
        onClick={() =>
          document
            .querySelector('[data-testid="performance-metrics"]')
            ?.setAttribute("data-reset", String(performance.now()))
        }
      >
        Reset measurement
      </button>
      <output
        data-testid="performance-metrics"
        style={{ display: "block", fontSize: 12, whiteSpace: "pre-wrap" }}
      />
    </aside>
  );
}

/** Fixed local-only views make before/after frame cost and captures comparable. */
export function PerformanceCamera() {
  const { camera, controls } = useThree();
  const points = useMemo(() => {
    const roadZ = settlementRoadZ(5),
      base = terrainHeight(0, 220),
      spawn = homeSpawn(0),
      offset = homeWalkCameraOffset(0);
    return {
      arrival: {
        position: spawn.position.map((v, i) => v + offset[i]),
        target: [
          spawn.position[0],
          spawn.position[1] + 0.65,
          spawn.position[2],
        ],
      },
      lake: { position: [-8, 3.6, 72], target: [-9, 2, 62] },
      road: {
        position: [5, terrainHeight(5, roadZ) + 2.7, roadZ],
        target: [
          15,
          terrainHeight(15, settlementRoadZ(15)) + 0.3,
          settlementRoadZ(15),
        ],
      },
      north: { position: [0, base + 3.2, 220], target: [0, base + 2, 210] },
      east: { position: [0, base + 3.2, 220], target: [10, base + 2, 220] },
      south: { position: [0, base + 3.2, 220], target: [0, base + 2, 230] },
      west: { position: [0, base + 3.2, 220], target: [-10, base + 2, 220] },
    };
  }, []);
  useFrame(() => {
    const point = points[sceneView];
    camera.position.fromArray(point.position);
    camera.lookAt(point.target[0], point.target[1], point.target[2]);
    const orbit = controls as unknown as {
      target: THREE.Vector3;
      update: () => void;
    } | null;
    if (orbit) {
      orbit.target.fromArray(point.target);
      orbit.update();
    }
  });
  return null;
}

export function PerformanceScene({
  scenario,
}: {
  scenario: PerformanceScenario;
}) {
  const source = useMemo(() => {
    const remotes = new Map<string, RemotePlayer>();
    if (!["solo", "village"].includes(scenario))
      for (let i = 0; i < 49; i++) {
        const id = `fixture-${i}`;
        remotes.set(id, {
          player: {
            id,
            nickname: `Friend ${i + 1}`,
            position: [0, 0, 0],
            yaw: 0,
            animation: scenario === "swimmers" ? "Swim_Forward" : "Walk",
            activity: "none",
            vehicle: scenario === "riders" ? "scooter" : "none",
            speed: 3,
            jumpPhase: "grounded",
          },
          receivedAt: 0,
          activityAt: 0,
        });
      }
    return { remotes };
  }, [scenario]);
  const time = useRef(0),
    arrival = useMemo(() => homeSpawn(0), []);
  useFrame((_, dt) => {
    time.current += Math.min(dt, 0.1);
    let i = 0;
    for (const remote of source.remotes.values()) {
      const angle = (i * Math.PI * 2) / 49 + time.current * 0.07;
      const radius = scenario === "distant" ? 650 : 8 + (i % 3) * 3;
      const x =
        (scenario === "swimmers" ? -10 : arrival.position[0]) +
        Math.sin(angle) * radius;
      const z =
        (scenario === "swimmers" ? 40 : arrival.position[2]) +
        Math.cos(angle) * radius;
      remote.player.position = [
        x,
        scenario === "swimmers" ? 0.1 : terrainHeight(x, z),
        z,
      ];
      remote.player.yaw = angle + Math.PI / 2;
      i++;
    }
  }, -10);
  if (!source.remotes.size) return null;
  return (
    <RemoteScooterFleet>
      {[...source.remotes.keys()].map((id) => (
        <RemoteAvatar key={id} id={id} room={source} />
      ))}
    </RemoteScooterFleet>
  );
}

export function PerformanceMeasurement() {
  const { gl, scene, camera } = useThree();
  const { world } = useRapier();
  const physics = useRef({ at: 0, times: [] as number[] });
  const longTasks = useRef<{ start: number; duration: number }[]>([]);
  useBeforePhysicsStep(() => {
    physics.current.at = performance.now();
  });
  useAfterPhysicsStep(() => {
    const times = physics.current.times;
    times.push(performance.now() - physics.current.at);
    if (times.length > 600) times.shift();
  });
  useEffect(() => {
    if (!PerformanceObserver.supportedEntryTypes.includes("longtask")) return;
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries())
        longTasks.current.push({
          start: entry.startTime,
          duration: entry.duration,
        });
      longTasks.current = longTasks.current.slice(-100);
    });
    observer.observe({ type: "longtask", buffered: true });
    return () => observer.disconnect();
  }, []);
  const output = useRef<HTMLOutputElement | null>(null);
  const frames = useRef<number[]>([]),
    draws = useRef<number[]>([]),
    triangles = useRef<number[]>([]);
  const publishAt = useRef(0),
    warmup = useRef(performance.now() + 3000);
  const lastReset = useRef<string | null>(null),
    readyAt = useRef(0);
  useEffect(() => {
    output.current = document.querySelector(
      '[data-testid="performance-metrics"]',
    );
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  // Read the COMPLETE previous frame, including reflection + shadow passes.
  useFrame((_, dt) => {
    const now = performance.now();
    output.current ??= document.querySelector(
      '[data-testid="performance-metrics"]',
    );
    readyAt.current ||= now;
    const reset = output.current?.getAttribute("data-reset") ?? null;
    if (reset !== lastReset.current) {
      lastReset.current = reset;
      frames.current = [];
      draws.current = [];
      triangles.current = [];
      warmup.current = now + 3000;
    }
    if (now > warmup.current && !document.hidden) {
      frames.current.push(dt * 1000);
      draws.current.push(gl.info.render.calls);
      triangles.current.push(gl.info.render.triangles);
      if (frames.current.length > 600) {
        frames.current.shift();
        draws.current.shift();
        triangles.current.shift();
      }
    }
    gl.info.reset();
    if (
      now - publishAt.current < 1000 ||
      !output.current ||
      !frames.current.length
    )
      return;
    publishAt.current = now;
    const sorted = [...frames.current].sort((a, b) => a - b);
    const mean = (items: number[]) =>
      items.reduce((a, b) => a + b, 0) / items.length;
    const memory = (
      performance as Performance & { memory?: { usedJSHeapSize: number } }
    ).memory;
    let objects = 0,
      meshes = 0,
      materials = new Set(),
      geometries = new Set();
    scene.traverse((o) => {
      objects++;
      if ("isMesh" in o) {
        meshes++;
        const m = o as import("three").Mesh;
        geometries.add(m.geometry);
        for (const mat of Array.isArray(m.material) ? m.material : [m.material])
          materials.add(mat);
      }
    });
    const resources = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    const sample = {
      frames: sorted.length,
      fps: 1000 / mean(frames.current),
      meanMs: mean(frames.current),
      p95Ms: sorted[Math.floor((sorted.length - 1) * 0.95)],
      over33Ms: frames.current.filter((v) => v > 33).length,
      calls: mean(draws.current),
      triangles: mean(triangles.current),
      gpuGeometries: gl.info.memory.geometries,
      gpuTextures: gl.info.memory.textures,
      programs: gl.info.programs?.length,
      sceneObjects: objects,
      meshes,
      materials: materials.size,
      geometries: geometries.size,
      heapMiB: memory ? memory.usedJSHeapSize / 1048576 : null,
      dpr: gl.getPixelRatio(),
      viewport: [gl.domElement.clientWidth, gl.domElement.clientHeight],
      camera: camera.position.toArray(),
      firstSceneFrameMs: readyAt.current,
      bodies: world.bodies.len(),
      colliders: world.colliders.len(),
      physicsMeanMs: physics.current.times.length
        ? mean(physics.current.times)
        : 0,
      physicsMaxMs: Math.max(0, ...physics.current.times),
      longTasks: longTasks.current,
      slowResources: resources
        .filter((r) => r.duration > 500)
        .map((r) => ({
          name: r.name.split("/").pop()?.split("?")[0],
          duration: r.duration,
          start: r.startTime,
        })),
      resources: resources
        .filter((r) => r.name.includes("/assets/"))
        .map((r) => ({
          name: r.name.split("/").pop(),
          bytes: r.encodedBodySize,
          duration: r.duration,
        })),
    };
    output.current.setAttribute("data-metrics", JSON.stringify(sample));
    output.current.textContent = `${sample.fps.toFixed(1)} fps · p95 ${sample.p95Ms.toFixed(1)}ms\n${Math.round(sample.calls)} draws · ${Math.round(sample.triangles).toLocaleString()} triangles\n${sample.gpuGeometries} GPU geometries · ${sample.gpuTextures} textures\n${sample.materials} materials · ${sample.frames} frames`;
  }, -100);
  return null;
}
