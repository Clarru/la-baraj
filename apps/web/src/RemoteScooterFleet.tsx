import {
  createContext,
  forwardRef,
  useContext,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  type ReactNode,
} from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { cloneScooterRig } from "./scooter-resources";
import { advanceScooterMotion, type ScooterRig } from "./scooter-geometry";
import type { ScooterHandle } from "./scooter";

export type FleetEntry = {
  anchor: THREE.Group;
  rig: ScooterRig;
  parts: THREE.Mesh[];
};
type Entry = FleetEntry;
const FleetContext = createContext<Set<Entry> | null>(null);
export function rigMeshes(rig: ScooterRig) {
  const meshes: THREE.Mesh[] = [];
  rig.group.traverse((node) => {
    if (node instanceof THREE.Mesh && node.parent !== rig.kickstand)
      meshes.push(node);
  });
  return meshes;
}

export function updateFleetInstances(
  entries: Iterable<Entry>,
  batches: (THREE.InstancedMesh | null)[],
  matrix: THREE.Matrix4,
) {
  let index = 0;
  for (const entry of entries) {
    if (index === 50) break;
    entry.anchor.updateWorldMatrix(true, false);
    entry.rig.group.updateMatrixWorld(true);
    entry.parts.forEach((part, i) => {
      matrix.multiplyMatrices(entry.anchor.matrixWorld, part.matrixWorld);
      batches[i]?.setMatrixAt(index, matrix);
    });
    index++;
  }
  for (const batch of batches) {
    if (!batch) continue;
    batch.visible = index > 0;
    batch.count = index;
    if (index) {
      batch.instanceMatrix.needsUpdate = true;
      batch.computeBoundingSphere();
    }
  }
}

/** Identical approved meshes, drawn once per material/part for the whole crowd.
 * Avatars update at -1; this pass uploads their interpolated transforms at 0.
 * Only remote decorative scooters use this; local controls/physics are unchanged.
 */
export function RemoteScooterFleet({ children }: { children: ReactNode }) {
  const entries = useMemo(() => new Set<Entry>(), []);
  const templates = useMemo(() => rigMeshes(cloneScooterRig()), []);
  const batches = useRef<(THREE.InstancedMesh | null)[]>([]);
  const matrix = useMemo(() => new THREE.Matrix4(), []);
  useLayoutEffect(() => {
    const owned = [...batches.current];
    owned.forEach((mesh) => {
      if (mesh) {
        mesh.count = 0;
        mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      }
    });
    return () => owned.forEach((mesh) => mesh?.dispose());
  }, []);
  useFrame(() => {
    updateFleetInstances(entries, batches.current, matrix);
  });
  return (
    <FleetContext.Provider value={entries}>
      {children}
      {templates.map((part, i) => (
        <instancedMesh
          key={i}
          ref={(mesh) => {
            batches.current[i] = mesh;
          }}
          name={`Remote scooter fleet ${part.name}`}
          args={[part.geometry, part.material, 50]}
          castShadow={part.castShadow}
          receiveShadow={part.receiveShadow}
          dispose={null}
        />
      ))}
    </FleetContext.Provider>
  );
}

export const RemoteScooter = forwardRef<ScooterHandle>(
  function RemoteScooter(_, ref) {
    const entries = useContext(FleetContext);
    const anchor = useRef<THREE.Group>(null);
    const rig = useMemo(cloneScooterRig, []);
    const motion = useRef({ wheelAngle: 0, steeringAngle: 0 });
    // Preserve the fixed template ordering; riding scooters have no deployed stand.
    const allParts = useMemo(() => rigMeshes(rig), [rig]);
    useLayoutEffect(() => {
      if (!anchor.current || !entries) return;
      const entry = { anchor: anchor.current, rig, parts: allParts };
      entries.add(entry);
      return () => {
        entries.delete(entry);
      };
    }, [entries, rig, allParts]);
    useImperativeHandle(
      ref,
      () => ({
        get steeringAngle() {
          return motion.current.steeringAngle;
        },
        update(sample) {
          advanceScooterMotion(motion.current, sample);
          rig.frontWheel.rotation.x = motion.current.wheelAngle;
          rig.rearWheel.rotation.x = motion.current.wheelAngle;
          rig.steering.rotation.y = motion.current.steeringAngle;
        },
      }),
      [rig],
    );
    return <group ref={anchor} />;
  },
);
