import { useCallback, useEffect, useMemo, useRef } from "react";
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
/** A compact ImageGen flame with continuous flow, no frame swaps or toggle allocations. */
export function Campfire({
  position,
  active,
  onMetrics,
}: {
  position: [number, number, number];
  active: boolean;
  onMetrics?: (sample: FireMetrics) => void;
}) {
  const texture = useTexture("/assets/fire/campfire-v2.png");
  const flowTime = useMemo(() => ({ value: 0 }), []);
  const compileFlame = useCallback(
    (shader: THREE.WebGLProgramParametersWithUniforms) => {
      shader.uniforms.fireTime = flowTime;
      shader.vertexShader =
        "uniform float fireTime; varying vec3 fireNormal; varying vec3 firePosition;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
       float tip = uv.y * uv.y;
       transformed.x += sin(uv.y * 9.0 - fireTime * 3.6) * 0.025 * tip;
       transformed.y += sin(uv.x * 8.0 + fireTime * 4.3) * 0.018 * tip;
       fireNormal = normalize(mat3(modelMatrix) * normal);
       firePosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
        );
      shader.fragmentShader =
        "uniform float fireTime; varying vec3 fireNormal; varying vec3 firePosition;\n" +
        shader.fragmentShader.replace(
          "#include <map_fragment>",
          `#ifdef USE_MAP
       vec2 fireUv = vMapUv;
       float flameTip = smoothstep(0.12, 0.9, fireUv.y);
       fireUv.x += (sin(fireUv.y * 11.0 - fireTime * 3.6) +
         0.4 * sin(fireUv.y * 25.0 - fireTime * 5.9 + fireUv.x * 12.0)) * 0.018 * flameTip;
       fireUv.y += sin(fireUv.x * 12.0 + fireTime * 5.0 + fireUv.y * 8.0) * 0.012 * flameTip;
       vec4 flame = texture2D(map, clamp(fireUv, vec2(0.001), vec2(0.999)));
       flame.a = smoothstep(0.10, 0.78, flame.a);
       float face = abs(dot(normalize(cameraPosition - firePosition), normalize(fireNormal)));
       flame.a *= smoothstep(0.22, 0.62, face);
       diffuseColor *= flame;
       #endif`,
        );
    },
    [flowTime],
  );
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }, [texture]);
  const flameMaterials = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const coalMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const sparksMaterial = useRef<THREE.PointsMaterial>(null);
  const sparksAttribute = useRef<THREE.BufferAttribute>(null);
  const sparks = useMemo(() => new Float32Array(8 * 3), []);
  const light = useRef<THREE.PointLight>(null);
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
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reduced.current = query.matches;
    };
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useFrame(({ gl }, dt) => {
    if (document.hidden) return;
    const now = performance.now(),
      sample = measurement.current;
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
    flowTime.value = reduced.current ? 0 : time.current;
    flameMaterials.current.forEach((material) => {
      if (material) material.opacity = fade.current;
    });
    if (coalMaterial.current)
      coalMaterial.current.opacity = fade.current * 0.28;
    if (sparksMaterial.current)
      sparksMaterial.current.opacity = reduced.current ? 0 : fade.current * 0.7;
    for (let i = 0; i < 8; i++) {
      const life = (time.current * (0.42 + (i % 3) * 0.06) + i * 0.618) % 1;
      sparks[i * 3] = Math.sin(i * 2.4 + life) * (0.1 + life * 0.3);
      sparks[i * 3 + 1] = 0.35 + life * 1.0;
      sparks[i * 3 + 2] = Math.cos(i * 2.4 + life) * (0.1 + life * 0.3);
    }
    if (sparksAttribute.current) sparksAttribute.current.needsUpdate = true;
    // Zero intensity retains the same light count and StandardMaterial programs while off.
    if (light.current)
      light.current.intensity =
        fade.current *
        (reduced.current ? 3 : 3 + Math.sin(time.current * 9) * 0.15);
  });
  return (
    <group position={position}>
      {[0, Math.PI / 3, -Math.PI / 3].map((angle, index) => (
        <mesh
          key={angle}
          position={[0, 0.4, 0]}
          rotation={[0, angle, 0]}
          renderOrder={2}
        >
          <planeGeometry args={[1.42, 1.08, 8, 12]} />
          <meshBasicMaterial
            ref={(material) => {
              flameMaterials.current[index] = material;
            }}
            map={texture}
            transparent
            opacity={0}
            alphaTest={0.04}
            depthWrite={false}
            toneMapped={false}
            side={THREE.DoubleSide}
            onBeforeCompile={compileFlame}
            customProgramCacheKey={() => "lake-fire-flow-v2-angle-fade"}
          />
        </mesh>
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.1, 0]}>
        <circleGeometry args={[0.58, 20]} />
        <meshBasicMaterial
          ref={coalMaterial}
          color="#a63c12"
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
      <points>
        <bufferGeometry>
          <bufferAttribute
            ref={sparksAttribute}
            attach="attributes-position"
            args={[sparks, 3]}
          />
        </bufferGeometry>
        <pointsMaterial
          ref={sparksMaterial}
          color="#ffc779"
          size={0.018}
          transparent
          opacity={0}
          depthWrite={false}
          toneMapped={false}
        />
      </points>
      <pointLight
        ref={light}
        color="#ffae66"
        intensity={0}
        distance={7}
        decay={2}
        castShadow={false}
      />
    </group>
  );
}
