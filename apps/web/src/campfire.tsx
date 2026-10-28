import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";

const flameVertex = `
  uniform float uTime;
  varying float vHeight;
  varying vec3 vPosition;
  void main() {
    vHeight = position.y / 1.6;
    vec3 p = position;
    float t = uTime * 3.1 + modelMatrix[3].x * 1.7 + modelMatrix[3].z;
    float tip = pow(max(vHeight, 0.0), 1.7);
    p.x += (sin(t + vHeight * 5.0) * 0.15 + sin(t * 1.73) * 0.055) * tip;
    p.z += cos(t * 0.83 + vHeight * 4.0) * 0.12 * tip;
    p.y *= 1.0 + sin(t * 1.29) * 0.055;
    vPosition = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const flameFragment = `
  varying float vHeight;
  varying vec3 vPosition;
  void main() {
    float h = clamp(vHeight, 0.0, 1.0);
    vec3 color = mix(vec3(1.0, 0.72, 0.18), vec3(1.0, 0.22, 0.025), smoothstep(0.1, 0.85, h));
    color = mix(vec3(1.0, 0.95, 0.62), color, smoothstep(0.0, 0.45, h));
    float alpha = (0.7 - h * 0.3) * (1.0 - smoothstep(0.85, 1.0, h));
    gl_FragColor = vec4(color, alpha);
  }
`;
const tongues = [
  { at: [0, 0, 0], scale: [0.76, 1, 0.76], turn: 0 },
  { at: [-0.34, 0, 0.14], scale: [0.6, 0.74, 0.57], turn: 1.9 },
  { at: [0.3, 0, 0.06], scale: [0.5, 0.86, 0.58], turn: 3.1 },
  { at: [-0.02, 0, -0.32], scale: [0.52, 0.66, 0.55], turn: 4.4 },
  { at: [0.04, 0.08, 0.16], scale: [0.4, 0.65, 0.4], turn: 0.8 },
];
const emberCount = 22;

/** Five small translucent flame volumes and one bounded ember draw call. */
export function Campfire({ position }: { position: [number, number, number] }) {
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const light = useRef<THREE.PointLight>(null);
  const particles = useRef<THREE.BufferAttribute>(null);
  const time = useRef(0);
  const uniforms = useMemo(() => ({ uTime: { value: 1.4 } }), []);
  const profile = useMemo(
    () => [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.3, 0.03),
      new THREE.Vector2(0.4, 0.25),
      new THREE.Vector2(0.3, 0.6),
      new THREE.Vector2(0.2, 0.94),
      new THREE.Vector2(0.09, 1.3),
      new THREE.Vector2(0, 1.6),
    ],
    [],
  );
  const emberPositions = useMemo(() => new Float32Array(emberCount * 3), []);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  useFrame((_, dt) => {
    if (document.hidden) return;
    if (reducedMotion) {
      uniforms.uTime.value = 1.4;
      if (light.current) light.current.intensity = 8;
      return;
    }
    time.current += Math.min(dt, 0.05);
    const t = time.current;
    uniforms.uTime.value = t;
    if (light.current)
      light.current.intensity =
        8 + Math.sin(t * 9.3) * 0.7 + Math.sin(t * 16.7) * 0.3;
    for (let i = 0; i < emberCount; i++) {
      const life = (t * (0.23 + (i % 5) * 0.025) + i * 0.618034) % 1;
      const angle = i * 2.39996;
      const radius = 0.12 + life * 0.5;
      emberPositions[i * 3] = Math.sin(angle + life * 2) * radius;
      emberPositions[i * 3 + 1] = 0.35 + life * 2.5;
      emberPositions[i * 3 + 2] = Math.cos(angle + life * 2) * radius;
    }
    if (particles.current) particles.current.needsUpdate = true;
  });
  return (
    <group position={position}>
      {Array.from({ length: 7 }, (_, i) => (
        <mesh
          key={i}
          position={[Math.sin(i * 2.4) * 0.48, 0, Math.cos(i * 2.4) * 0.48]}
          scale={[1, 0.45, 1]}
        >
          <dodecahedronGeometry args={[0.22, 0]} />
          <meshStandardMaterial
            color="#8b321b"
            emissive="#fb651c"
            emissiveIntensity={0.9}
            roughness={1}
          />
        </mesh>
      ))}
      {tongues.map((flame, i) => (
        <mesh
          key={i}
          position={flame.at as [number, number, number]}
          scale={flame.scale as [number, number, number]}
          rotation={[0, flame.turn, 0]}
          renderOrder={2}
        >
          <latheGeometry args={[profile, 12]} />
          <shaderMaterial
            uniforms={uniforms}
            vertexShader={flameVertex}
            fragmentShader={flameFragment}
            transparent
            depthWrite={false}
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </mesh>
      ))}
      {!reducedMotion && (
        <points frustumCulled={false}>
          <bufferGeometry>
            <bufferAttribute
              ref={particles}
              attach="attributes-position"
              args={[emberPositions, 3]}
            />
          </bufferGeometry>
          <pointsMaterial
            color="#ffd17b"
            size={0.045}
            transparent
            opacity={0.75}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </points>
      )}
      <pointLight
        ref={light}
        color="#ffa159"
        intensity={8}
        distance={12}
        decay={2}
        castShadow={false}
      />
    </group>
  );
}
