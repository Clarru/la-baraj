import { useEffect, useMemo } from "react";
import * as THREE from "three";
import { makeHorizonLand } from "./landscape-geometry";

export const worldFog = (evening: boolean) => (evening ? "#9eafa7" : "#aec5b5");
let horizonGeometry: THREE.BufferGeometry | undefined;
const skyGeometry = new THREE.BoxGeometry(2, 2, 2);
const landMaterials = ["#ffffff", "#b8c0c4"].map(
  (color) =>
    new THREE.MeshBasicMaterial({
      vertexColors: true,
      fog: false,
      toneMapped: false,
      color,
      side: THREE.DoubleSide,
    }),
);
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
export function WorldBackdrop({ evening }: { evening: boolean }) {
  const geometry = (horizonGeometry ??= makeHorizonLand());
  const sky = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          topColor: { value: new THREE.Color("#82b0c7") },
          horizonColor: { value: new THREE.Color("#bed0be") },
          lowerColor: { value: new THREE.Color(worldFog(false)) },
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
  useEffect(() => {
    sky.uniforms.topColor.value.set(evening ? "#6b879d" : "#82b0c7");
    sky.uniforms.horizonColor.value.set(evening ? "#b5b9a6" : "#bed0be");
    sky.uniforms.lowerColor.value.set(worldFog(evening));
  }, [evening, sky]);
  useEffect(() => () => sky.dispose(), [sky]);
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
        material={landMaterials[evening ? 1 : 0]}
        dispose={null}
      />
    </group>
  );
}
