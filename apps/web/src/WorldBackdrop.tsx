import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { currentLighting } from "./day-night";
import * as THREE from "three";
import { makeHorizonLand } from "./landscape-geometry";

let horizonGeometry: THREE.BufferGeometry | undefined;
const skyGeometry = new THREE.BoxGeometry(2, 2, 2);

const vertexShader = `
varying vec3 skyDirection;
void main(){
  skyDirection=position;
  vec4 clip=projectionMatrix*mat4(mat3(viewMatrix))*vec4(position,1.0);
  gl_Position=clip.xyww;
}`;
const fragmentShader = `
uniform vec3 topColor;
uniform vec3 horizonColor;
uniform vec3 lowerColor;
varying vec3 skyDirection;
void main(){
  float height=normalize(skyDirection).y;
  vec3 sky=mix(horizonColor,topColor,pow(clamp(height,0.0,1.0),0.55));
  sky=mix(sky,lowerColor,(1.0-smoothstep(-0.8,-0.04,height)));
  gl_FragColor=vec4(sky,1.0);
  #include <colorspace_fragment>
}`;
/** Static gradient sky and one low-poly land mesh replace a white, finite-map horizon. */
export function WorldBackdrop({
  evening,
  forceDay,
}: {
  evening: boolean;
  forceDay: boolean;
}) {
  const geometry = (horizonGeometry ??= makeHorizonLand());
  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: new THREE.Color("#82b0c7") },
          horizonColor: { value: new THREE.Color("#bed0be") },
          lowerColor: { value: new THREE.Color("#aec5b5") },
        },
        vertexShader,
        fragmentShader,
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: true,
        toneMapped: false,
        fog: false,
      }),
    [],
  );
  const land = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        fog: false,
        toneMapped: false,
        side: THREE.DoubleSide,
      }),
    [],
  );
  const last = useRef(-Infinity);
  useFrame(() => {
    const now = performance.now();
    if (now - last.current < 250) return;
    last.current = now;
    const { colors } = currentLighting(evening, forceDay);
    sky.uniforms.topColor.value.copy(colors.sky);
    sky.uniforms.horizonColor.value.copy(colors.horizon);
    sky.uniforms.lowerColor.value.copy(colors.fog);
    land.color.copy(colors.land);
  });
  useEffect(
    () => () => {
      sky.dispose();
      land.dispose();
    },
    [sky, land],
  );
  return (
    <group name="Distant landscape">
      <mesh
        name="Atmospheric sky"
        geometry={skyGeometry}
        material={sky}
        frustumCulled={false}
        renderOrder={1000}
        dispose={null}
      />
      <mesh
        name="Distant rolling hills"
        geometry={geometry}
        material={land}
        dispose={null}
      />
    </group>
  );
}
