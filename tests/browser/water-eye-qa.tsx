/** Per-draw observation around the actual lake; never emitted in normal builds. */
import { useEffect } from "react";
import { addAfterEffect, useThree } from "@react-three/fiber";
import { Vector3 } from "three";
import { Water } from "three/examples/jsm/objects/Water.js";
import { LakeWater as Actual } from "../../apps/web/src/environment";
export { Terrain, Roads, Vegetation } from "../../apps/web/src/environment";

export function LakeWater(props: React.ComponentProps<typeof Actual>) {
  const { gl, camera, scene } = useThree();
  useEffect(() => {
    let water: Water | null = null;
    let last = 0,
      nextPublish = 0,
      reflections = 0;
    const samples: unknown[] = [];
    const point = new Vector3();
    const render = gl.render;
    gl.render = function (s, c) {
      if (c !== camera) reflections++;
      render.call(this, s, c);
    };
    const reset = () => {
      samples.length = 0;
      last = 0;
      reflections = 0;
    };
    window.addEventListener("water-qa-reset", reset);
    const stop = addAfterEffect((now) => {
      if (!water)
        scene.traverse((o) => {
          if (o instanceof Water) water = o;
        });
      if (!water) return;
      camera.getWorldPosition(point);
      const eye = water.material.uniforms.eye.value as Vector3;
      samples.push({
        at: now,
        dt: last ? (now - last) / 1000 : null,
        camera: point.toArray(),
        eye: eye.toArray(),
        lag: eye.distanceTo(point),
        reflections,
        waveTime: water.material.uniforms.time.value,
      });
      last = now;
      if (samples.length > 1800) samples.shift();
      if (now >= nextPublish) {
        nextPublish = now + 250;
        document
          .querySelector("#water-frame-trace")
          ?.setAttribute("data-frames", JSON.stringify(samples));
      }
    });
    return () => {
      stop();
      gl.render = render;
      window.removeEventListener("water-qa-reset", reset);
    };
  }, [gl, camera, scene]);
  return <Actual {...props} />;
}
