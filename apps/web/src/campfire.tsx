import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";

export type FireMetrics = {
  active: boolean;
  toggles: number;
  maxFrameMs: number;
  framesOver33ms: number;
  frames: number;
  programs: number;
  textures: number;
  geometries: number;
};
/** CC0 Ben Hickling flame atlases. Keep resources and light mounted across toggles. */
export function Campfire({
  position,
  active,
  onMetrics,
}: {
  position: [number, number, number];
  active: boolean;
  onMetrics?: (sample: FireMetrics) => void;
}) {
  const source = useTexture([
    "/assets/fire/fire1_64.png",
    "/assets/fire/fire5_64.png",
  ]);
  const textures = useMemo(
    () =>
      source.map((base) => {
        const texture = base.clone();
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.repeat.set(0.1, 1 / 6);
        texture.minFilter = texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = false;
        texture.needsUpdate = true;
        return texture;
      }),
    [source],
  );
  const planes = useRef<THREE.Group>(null);
  const light = useRef<THREE.PointLight>(null);
  const materials = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const fade = useRef(0),
    time = useRef(0);
  const reduced = useRef(
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const previous = useRef(active);
  const measurement = useRef({
    until: 0,
    toggles: 0,
    max: 0,
    slow: 0,
    frames: 0,
  });
  useEffect(
    () => () => textures.forEach((texture) => texture.dispose()),
    [textures],
  );
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reduced.current = query.matches;
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useFrame(({ camera, gl }, dt) => {
    if (document.hidden) return;
    const now = performance.now();
    const sample = measurement.current;
    if (previous.current !== active) {
      previous.current = active;
      sample.until = now + 1000;
      sample.toggles++;
      sample.max = 0;
      sample.slow = 0;
      sample.frames = 0;
    }
    if (sample.until) {
      sample.max = Math.max(sample.max, dt * 1000);
      sample.slow += dt > 0.033 ? 1 : 0;
      sample.frames++;
      if (now >= sample.until) {
        onMetrics?.({
          active,
          toggles: sample.toggles,
          maxFrameMs: Math.round(sample.max * 10) / 10,
          framesOver33ms: sample.slow,
          frames: sample.frames,
          programs: gl.info.programs?.length ?? 0,
          textures: gl.info.memory.textures,
          geometries: gl.info.memory.geometries,
        });
        sample.until = 0;
      }
    }
    time.current += Math.min(dt, 0.05);
    fade.current = THREE.MathUtils.damp(
      fade.current,
      active ? 1 : 0,
      10,
      Math.min(dt, 0.05),
    );
    if (planes.current)
      planes.current.rotation.y = Math.atan2(
        camera.position.x - position[0],
        camera.position.z - position[2],
      );
    textures.forEach((texture, i) => {
      const frame = reduced.current
        ? 23
        : (Math.floor(time.current * 30) + i * 19) % 60;
      texture.offset.set((frame % 10) / 10, (5 - Math.floor(frame / 10)) / 6);
      if (materials.current[i])
        materials.current[i]!.opacity = fade.current * (i ? 0.72 : 0.95);
    });
    // Zero intensity retains the same scene light count and shader variants while off.
    if (light.current)
      light.current.intensity =
        fade.current *
        (reduced.current ? 7 : 7 + Math.sin(time.current * 9) * 0.35);
  });
  return (
    <group position={position}>
      <group ref={planes}>
        <mesh position={[0, 0.64, 0.01]} renderOrder={2}>
          <planeGeometry args={[1.55, 1.5]} />
          <meshBasicMaterial
            ref={(m) => {
              materials.current[0] = m;
            }}
            map={textures[0]}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
        <mesh position={[-0.24, 0.43, -0.02]} renderOrder={1}>
          <planeGeometry args={[1.05, 1.1]} />
          <meshBasicMaterial
            ref={(m) => {
              materials.current[1] = m;
            }}
            map={textures[1]}
            transparent
            opacity={0}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
          />
        </mesh>
      </group>
      <pointLight
        ref={light}
        color="#ffae66"
        intensity={0}
        distance={12}
        decay={2}
        castShadow={false}
      />
    </group>
  );
}
