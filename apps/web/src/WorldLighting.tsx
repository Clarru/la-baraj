import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { currentLighting } from "./day-night";

export function WorldLighting({
  evening,
  forceDay,
  shadows = true,
}: {
  evening: boolean;
  forceDay: boolean;
  shadows?: boolean;
}) {
  const sun = useRef<THREE.DirectionalLight>(null);
  const hemi = useRef<THREE.HemisphereLight>(null);
  const ambient = useRef<THREE.AmbientLight>(null);
  const last = useRef(-Infinity);
  useFrame(({ scene }) => {
    const now = performance.now();
    if (now - last.current < 250) return;
    last.current = now;
    const light = currentLighting(evening, forceDay);
    if (scene.background instanceof THREE.Color)
      scene.background.copy(light.colors.fog);
    if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(light.colors.fog);
    if (sun.current) {
      sun.current.position.copy(light.sunDirection).multiplyScalar(150);
      sun.current.color.copy(light.colors.sun);
      sun.current.intensity = light.sunIntensity;
    }
    if (ambient.current) {
      ambient.current.intensity =
        0.08 + Math.max(0, 3.3 - light.sunIntensity) * 0.38;
      ambient.current.color.copy(light.colors.hemi);
    }
    if (hemi.current) {
      hemi.current.color.copy(light.colors.hemi);
      hemi.current.intensity = light.hemiIntensity;
    }
  });
  return (
    <>
      <color attach="background" args={["#aec5b5"]} />
      <fog attach="fog" args={["#aec5b5", 480, 3300]} />
      <hemisphereLight ref={hemi} args={["#eef1db", "#7c8458", 0.75]} />
      <ambientLight ref={ambient} intensity={0.08} />
      <directionalLight
        ref={sun}
        position={[-80, 95, -110]}
        intensity={3.3}
        castShadow={shadows}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-110}
        shadow-camera-right={110}
        shadow-camera-top={90}
        shadow-camera-bottom={-90}
        shadow-camera-near={1}
        shadow-camera-far={240}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
    </>
  );
}
