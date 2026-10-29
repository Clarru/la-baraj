import { useEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { currentLighting } from "./day-night";
import * as THREE from "three";
import { makeHorizonLand } from "./landscape-geometry";

let horizonGeometry: THREE.BufferGeometry | undefined;
const skyGeometry = new THREE.BoxGeometry(2, 2, 2);
// One tiny tileable cloud-noise texture replaces costly per-pixel noise math.
function makeCloudNoise() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const hash = (x: number, y: number) => {
    let n = Math.imul(x + 17, 374761393) + Math.imul(y + 31, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x: number, y: number, frequency: number) => {
    const px = (x / size) * frequency,
      py = (y / size) * frequency;
    const ix = Math.floor(px),
      iy = Math.floor(py);
    const sx = (px - ix) ** 2 * (3 - 2 * (px - ix));
    const sy = (py - iy) ** 2 * (3 - 2 * (py - iy));
    const at = (dx: number, dy: number) =>
      hash((ix + dx) % frequency, (iy + dy) % frequency);
    const a = at(0, 0) * (1 - sx) + at(1, 0) * sx;
    const b = at(0, 1) * (1 - sx) + at(1, 1) * sx;
    return a * (1 - sy) + b * sy;
  };
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const value = Math.round(
        255 *
          (noise(x, y, 4) * 0.58 +
            noise(x, y, 8) * 0.28 +
            noise(x, y, 16) * 0.14),
      );
      const i = (y * size + x) * 4;
      data[i] = data[i + 1] = data[i + 2] = value;
      data[i + 3] = 255;
    }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.minFilter = texture.magFilter = THREE.LinearFilter;
  texture.needsUpdate = true;
  return texture;
}
const cloudNoise = makeCloudNoise();

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
uniform float cloudCover;
uniform vec3 cloudColor;
uniform float cloudTime;
uniform sampler2D cloudNoise;
varying vec3 skyDirection;
void main(){
  vec3 direction=normalize(skyDirection);
  float height=direction.y;
  vec3 sky=mix(horizonColor,topColor,pow(clamp(height,0.0,1.0),0.55));
  sky=mix(sky,lowerColor,(1.0-smoothstep(-0.8,-0.04,height)));
  if (cloudCover > 0.02) {
  vec2 cloudUV=direction.xz / max(0.24, height+0.3) * 2.1 + vec2(cloudTime*0.003,0.0);
  float n=texture2D(cloudNoise,cloudUV*0.40).r;
  float cloud=smoothstep(0.90-cloudCover*0.55,1.13-cloudCover*0.55,n);
  float cloudAlpha=cloud * smoothstep(0.03,0.22,height) * smoothstep(0.05,0.25,cloudCover) * 0.55;
  sky=mix(sky,cloudColor,cloudAlpha);
  }
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
          cloudCover: { value: 0 },
          cloudColor: { value: new THREE.Color("#e0e4e2") },
          cloudTime: { value: 0 },
          cloudNoise: { value: cloudNoise },
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
    const { colors, cloudCover } = currentLighting(evening, forceDay);
    sky.uniforms.topColor.value.copy(colors.sky);
    sky.uniforms.horizonColor.value.copy(colors.horizon);
    sky.uniforms.lowerColor.value.copy(colors.fog);
    sky.uniforms.cloudCover.value = cloudCover;
    sky.uniforms.cloudColor.value.copy(colors.horizon).lerp(colors.hemi, 0.42);
    sky.uniforms.cloudTime.value = now / 1000;
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
