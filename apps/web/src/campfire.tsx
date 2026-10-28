import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
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

const tongues = [
  {
    x: -0.28,
    z: -0.08,
    width: 0.5,
    height: 1.12,
    bend: -0.12,
    color: "#ff6409",
    layer: 2,
  },
  {
    x: 0.23,
    z: -0.12,
    width: 0.5,
    height: 1.25,
    bend: 0.12,
    color: "#ff8606",
    layer: 2,
  },
  {
    x: -0.4,
    z: 0.08,
    width: 0.37,
    height: 0.82,
    bend: -0.1,
    color: "#ff7908",
    layer: 2,
  },
  {
    x: 0.37,
    z: 0.1,
    width: 0.37,
    height: 0.78,
    bend: 0.12,
    color: "#ff6409",
    layer: 2,
  },
  {
    x: -0.06,
    z: -0.15,
    width: 0.44,
    height: 1.48,
    bend: 0.09,
    color: "#ffb21b",
    layer: 3,
  },
  {
    x: 0.13,
    z: 0.07,
    width: 0.44,
    height: 1.13,
    bend: -0.12,
    color: "#ffc629",
    layer: 3,
  },
  {
    x: -0.13,
    z: 0.15,
    width: 0.47,
    height: 0.85,
    bend: -0.07,
    color: "#ffdc45",
    layer: 4,
  },
  {
    x: 0.12,
    z: 0.17,
    width: 0.41,
    height: 0.72,
    bend: 0.06,
    color: "#fff18a",
    layer: 4,
  },
  {
    x: 0,
    z: 0.2,
    width: 0.36,
    height: 1.01,
    bend: -0.05,
    color: "#fff5a0",
    layer: 4,
  },
];

/** Four hard facets around a shallow ridge, following the user's angular flame reference. */
function flameGeometry(
  width: number,
  height: number,
  bend: number,
  color: string,
) {
  const rim = [
    [0, 0, 0],
    [-width * 0.5, height * 0.34, 0],
    [bend, height, 0],
    [width * 0.5, height * 0.43, 0],
  ];
  const ridge = [bend * 0.15, height * 0.35, 0.045];
  const positions: number[] = [],
    colors: number[] = [];
  const base = new THREE.Color(color);
  for (let face = 0; face < 4; face++) {
    const shade = base.clone().multiplyScalar([0.94, 1, 0.85, 1][face]);
    for (const point of [rim[face], rim[(face + 1) % 4], ridge]) {
      positions.push(...point);
      colors.push(shade.r, shade.g, shade.b);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  return geometry;
}

/** Static radial logs remain visible when the fire is out. Coordinates are relative to pit floor. */
export function CampfireLogs() {
  const logs = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const angle = (i * Math.PI) / 3 + 0.22;
        const bottom = new THREE.Vector3(
          Math.sin(angle) * 0.72,
          0.12,
          Math.cos(angle) * 0.72,
        );
        const top = new THREE.Vector3(
          -Math.sin(angle) * 0.08,
          0.58 + (i % 2) * 0.06,
          -Math.cos(angle) * 0.08,
        );
        const direction = top.clone().sub(bottom);
        return {
          center: bottom.clone().add(top).multiplyScalar(0.5),
          length: direction.length(),
          rotation: new THREE.Quaternion().setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction.normalize(),
          ),
        };
      }),
    [],
  );
  return (
    <group>
      {logs.map((log, i) => (
        <mesh
          key={i}
          position={log.center}
          quaternion={log.rotation}
          castShadow
          receiveShadow
        >
          <cylinderGeometry args={[0.105, 0.14, log.length, 7]} />
          <meshStandardMaterial
            attach="material-0"
            color={i % 2 ? "#65331a" : "#713b1d"}
            roughness={1}
          />
          <meshStandardMaterial
            attach="material-1"
            color="#3d2414"
            roughness={1}
          />
          <meshStandardMaterial
            attach="material-2"
            color="#462615"
            roughness={1}
          />
        </mesh>
      ))}
    </group>
  );
}

/** Reference-led faceted flames and diamond embers; resources stay mounted across toggles. */
export function Campfire({
  position,
  active,
  onMetrics,
}: {
  position: [number, number, number];
  active: boolean;
  onMetrics?: (sample: FireMetrics) => void;
}) {
  const geometries = useMemo(
    () =>
      tongues.map((flame) =>
        flameGeometry(flame.width, flame.height, flame.bend, flame.color),
      ),
    [],
  );
  useEffect(
    () => () => geometries.forEach((geometry) => geometry.dispose()),
    [geometries],
  );
  const flames = useRef<(THREE.Mesh | null)[]>([]);
  const materials = useRef<(THREE.MeshBasicMaterial | null)[]>([]);
  const embers = useRef<THREE.InstancedMesh>(null);
  const emberMaterial = useRef<THREE.MeshBasicMaterial>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
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
  useFrame(({ camera, gl }, dt) => {
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
    const t = reduced.current ? 0 : time.current;
    const yaw = Math.atan2(
      camera.position.x - position[0],
      camera.position.z - position[2],
    );
    flames.current.forEach((mesh, i) => {
      if (!mesh) return;
      const phase = i * 1.73;
      mesh.rotation.set(
        0,
        yaw,
        reduced.current ? 0 : Math.sin(t * 3.7 + phase) * 0.035,
      );
      mesh.scale.set(
        1 + Math.sin(t * 4.1 + phase) * 0.055,
        1 + Math.sin(t * 3.4 + phase) * 0.075,
        1,
      );
      if (materials.current[i])
        materials.current[i]!.opacity = fade.current * 0.96;
    });
    if (embers.current) {
      for (let i = 0; i < 8; i++) {
        const life = (t * (0.27 + (i % 3) * 0.025) + i * 0.618034) % 1;
        const angle = i * 2.39996;
        transform.position.set(
          Math.sin(angle + life) * (0.21 + life * 0.28),
          0.48 + life * 1.6,
          Math.cos(angle + life) * (0.21 + life * 0.28),
        );
        const size = Math.sin(life * Math.PI) * (0.035 + (i % 3) * 0.008);
        transform.scale.set(size * 0.7, size * 1.4, size * 0.7);
        transform.rotation.set(0, yaw, 0.1 * Math.sin(i));
        transform.updateMatrix();
        embers.current.setMatrixAt(i, transform.matrix);
      }
      embers.current.instanceMatrix.needsUpdate = true;
    }
    if (emberMaterial.current)
      emberMaterial.current.opacity = reduced.current ? 0 : fade.current;
    // Keep this zero-intensity light mounted when off to avoid global shader recompilation.
    if (light.current)
      light.current.intensity =
        fade.current * (reduced.current ? 5 : 5 + Math.sin(t * 8.3) * 0.25);
  });
  return (
    <group position={position}>
      {tongues.map((flame, i) => (
        <mesh
          key={i}
          ref={(mesh) => {
            flames.current[i] = mesh;
          }}
          geometry={geometries[i]}
          position={[flame.x, 0, flame.z]}
          renderOrder={flame.layer}
        >
          <meshBasicMaterial
            ref={(material) => {
              materials.current[i] = material;
            }}
            vertexColors
            transparent
            opacity={0}
            depthWrite={false}
            side={THREE.DoubleSide}
            toneMapped={false}
          />
        </mesh>
      ))}
      <instancedMesh
        ref={embers}
        args={[undefined, undefined, 8]}
        frustumCulled={false}
      >
        <octahedronGeometry args={[1, 0]} />
        <meshBasicMaterial
          ref={emberMaterial}
          color="#ffb62e"
          transparent
          opacity={0}
          toneMapped={false}
        />
      </instancedMesh>
      <pointLight
        ref={light}
        position={[0, 0.1, 0]}
        color="#ff9b32"
        intensity={0}
        distance={8}
        decay={2}
        castShadow={false}
      />
    </group>
  );
}
