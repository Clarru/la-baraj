/** Observe final rendered transforms without changing the real frame loop. */
import { useEffect, useRef } from "react";
import { addAfterEffect, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { BoatSpray as Actual } from "./boat-wake-qa";
import { getBoatState } from "../../apps/web/src/boat-state";
import { playerViewPosition, playerPosition } from "../../apps/web/src/player";

export function BoatSpray(props: React.ComponentProps<typeof Actual>) {
  const root = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    const point = new THREE.Vector3();
    const samples: unknown[] = [];
    let last = 0, nextPublish = 0;
    return addAfterEffect((now) => {
      if (!root.current || !getBoatState().mounted) return;
      root.current.getWorldPosition(point);
      samples.push({ at: now, dt: (now - last) / 1000,
        source: point.toArray(), view: playerViewPosition.toArray(),
        body: playerPosition.toArray(), camera: camera.position.toArray(),
        speed: getBoatState().speed, yaw: getBoatState().yaw });
      last = now;
      if (samples.length > 1800) samples.shift();
      if (now >= nextPublish) {
        nextPublish = now + 250;
        document.querySelector("#boat-frame-trace")?.setAttribute("data-frames", JSON.stringify(samples));
      }
    });
  }, [camera]);
  return <group ref={root}><Actual {...props} /></group>;
}
