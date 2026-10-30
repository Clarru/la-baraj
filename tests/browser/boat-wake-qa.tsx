/** Local QA observation/visibility control around the actual production component. */
import { useEffect, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BoatSpray as Actual } from "../../apps/web/src/boat-spray.tsx";
const sources = new Map<string, unknown>();
const nextSample = new WeakMap<THREE.Scene, number>();
function shown(object: THREE.Object3D) {
  for (let p: THREE.Object3D | null = object; p; p = p.parent)
    if (!p.visible) return false;
  return true;
}
export function BoatSpray(props: React.ComponentProps<typeof Actual>) {
  const ownSample = useRef(0);
  const root = useRef<THREE.Group>(null),
    hideRemote = useRef(false),
    point = useRef(new THREE.Vector3());
  useEffect(() => {
    const id = root.current?.uuid;
    const change = (e: Event) => {
      hideRemote.current = Boolean((e as CustomEvent).detail);
    };
    window.addEventListener("boat-qa-hide-remote-wake", change);
    return () => {
      window.removeEventListener("boat-qa-hide-remote-wake", change);
      if (id) sources.delete(id);
    };
  }, []);
  useFrame(({ scene, clock }) => {
    if (!root.current) return;
    let remote = false;
    for (let p: THREE.Object3D | null = root.current.parent; p; p = p.parent)
      if (p.name.startsWith("Online player ")) remote = true;
    root.current.visible = !(remote && hideRemote.current);
    const now = clock.elapsedTime;
    if (now >= ownSample.current) {
      ownSample.current = now + 0.15;
      root.current.getWorldPosition(point.current);
      sources.set(root.current.uuid, {
        remote,
        visible: shown(root.current),
        position: point.current.toArray(),
        speed: props.speed(),
        velocity: props.velocity?.() ?? null,
      });
    }
    if (now < (nextSample.get(scene) ?? 0)) return;
    nextSample.set(scene, now + 0.15);
    const meshes: unknown[] = [];
    scene.traverse((o) => {
      if (!(o instanceof THREE.Mesh)) return;
      const aux = o.geometry.getAttribute("aux"),
        positions = o.geometry.getAttribute("position");
      if (!aux || !positions) return;
      let active = 0;
      for (let i = 0; i < aux.count; i++) if (aux.getX(i) < 0.999) active++;
      const head = 145;
      meshes.push({
        id: o.geometry.uuid,
        visible: shown(o),
        activeVertices: active,
        vertices: positions.count,
        head: [
          positions.getX(head),
          positions.getY(head),
          positions.getZ(head),
        ],
        radius: o.geometry.boundingSphere?.radius,
      });
    });
    const out = document.querySelector("#boat-wake-state");
    out?.setAttribute(
      "data-wakes",
      JSON.stringify({ at: now, sources: [...sources.values()], meshes }),
    );
  });
  return (
    <group ref={root}>
      <Actual {...props} />
    </group>
  );
}
