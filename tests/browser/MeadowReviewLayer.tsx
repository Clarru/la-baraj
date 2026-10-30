import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { Meadow as Actual } from "../../apps/web/src/MeadowLayer";
export function Meadow(props: React.ComponentProps<typeof Actual>) {
  const next = useRef(0);
  useFrame(({ scene, clock }) => {
    if (clock.elapsedTime < next.current) return;
    next.current = clock.elapsedTime + 1;
    const rows: unknown[] = [];
    scene.traverse((o) => {
      if (
        !(o instanceof THREE.InstancedMesh) ||
        !o.geometry.getAttribute("meadowRandom")
      )
        return;
      let active = 0;
      for (let i = 0; i < o.instanceMatrix.count; i++)
        if (o.instanceMatrix.array[i * 16 + 15] !== 0) active++;
      const triangles =
        (o.geometry.index?.count ?? o.geometry.getAttribute("position").count) /
        3;
      rows.push({
        capacity: o.instanceMatrix.count,
        submittedInstances: o.count,
        activeInstances: active,
        visible: o.visible,
        trianglesPerInstance: triangles,
        submittedTriangles: o.visible ? triangles * o.count : 0,
        collidersAdded: 0,
      });
    });
    document
      .querySelector("#meadow-review-metrics")
      ?.setAttribute(
        "data-meadow",
        JSON.stringify({ at: clock.elapsedTime, meshes: rows }),
      );
  });
  return <Actual {...props} />;
}
