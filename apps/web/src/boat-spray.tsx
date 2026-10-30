import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { BOAT_DIMENSIONS } from "./boat-geometry";
import { BOAT_TUNING } from "./boat-motion";
import { spraySize, sprayIntensity } from "./boat-spray.ts";
import { lastLighting } from "./day-night";
import { LAKE_LEVEL } from "./swim-motion";

// Jet stream off the transom: a V wake on the water and a rooster tail of foam.
// Geometry and materials are shared by every boat; each instance only owns its
// transforms and a 4-float state that onBeforeRender copies into the shared
// uniforms (uniformsNeedUpdate), so 30 boats stay 2 small draws each.

/** Foam lies this far above the water so it never z-fights the lake. */
const FOAM_LIFT = 0.03;
const WAKE_SEGMENTS = 10;
const TAIL_PARTICLES = 20;
/** Rooster-tail reach and peak height as fractions of the wake length. */
const TAIL_REACH = 0.32;
const TAIL_HEIGHT = 0.09;
/** Largest stream: a full boost, plus a 1 m margin on the bounding spheres. */
const MAX_SPRAY = spraySize(
  BOAT_TUNING.cruise * BOAT_TUNING.boostMultiplier,
  BOAT_TUNING.cruise,
);
const BOUNDS_MARGIN = 1;

const foam = new THREE.Color("#f6f2e6");
const time = { value: 0 };

/**
 * Wake: three strips (port arm, centre wash, starboard arm), three vertices
 * across each. `position` packs (along 0..1, across −1..1, arm −1/0/1); the
 * vertex shader lays them out from the per-boat length and spread.
 */
const wakeGeometry = (() => {
  const packed: number[] = [];
  const index: number[] = [];
  for (const arm of [-1, 0, 1]) {
    const base = packed.length / 3;
    for (let i = 0; i <= WAKE_SEGMENTS; i += 1)
      for (const across of [-1, 0, 1])
        packed.push(i / WAKE_SEGMENTS, across, arm);
    for (let i = 0; i < WAKE_SEGMENTS; i += 1)
      for (let j = 0; j < 2; j += 1) {
        const a = base + i * 3 + j,
          b = a + 3;
        index.push(a, b, a + 1, a + 1, b, b + 1);
      }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(packed, 3),
  );
  geometry.setIndex(index);
  // Packed positions are not metres: bound the largest (boosted) wake instead.
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0, -MAX_SPRAY.length / 2),
    MAX_SPRAY.length / 2 + MAX_SPRAY.width / 2 + BOUNDS_MARGIN,
  );
  return geometry;
})();

/** Rooster tail: `position` packs (phase 0..1, lateral −1..1, size). */
const tailGeometry = (() => {
  const packed: number[] = [];
  for (let i = 0; i < TAIL_PARTICLES; i += 1) {
    const phase = (i * 0.618034) % 1;
    const lateral = ((i * 0.414214) % 1) * 2 - 1;
    packed.push(phase, lateral, 0.7 + ((i * 0.732051) % 1) * 0.6);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(packed, 3),
  );
  geometry.boundingSphere = new THREE.Sphere(
    new THREE.Vector3(0, 0.8, -2.5),
    TAIL_REACH * MAX_SPRAY.length + BOUNDS_MARGIN,
  );
  return geometry;
})();

const instanceUniforms = () => ({
  uLength: { value: 0 },
  uSpread: { value: 0 },
  uOpacity: { value: 0 },
  uIntensity: { value: 1 },
  uTime: time,
  uColor: { value: foam },
});

const wakeMaterial = new THREE.ShaderMaterial({
  uniforms: { ...instanceUniforms(), uBeam: { value: BOAT_DIMENSIONS.beam } },
  vertexShader: /* glsl */ `
    uniform float uLength;
    uniform float uSpread;
    uniform float uBeam;
    varying float vAlong;
    varying float vAcross;
    void main() {
      float along = position.x, across = position.y, arm = position.z;
      float halfBeam = uBeam * 0.5;
      // Arms open from the transom corners; the centre wash keeps near the hull's width.
      float centre = arm * (halfBeam * 0.85 + 0.5 * uSpread * along);
      float width = arm == 0.0
        ? mix(uBeam * 0.55, uBeam * 0.8, along)
        : 0.3 + 0.18 * uSpread * along;
      vec3 local = vec3(centre + across * width * 0.5, 0.0, -uLength * along);
      vAlong = along;
      vAcross = across;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(local, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uIntensity;
    uniform float uTime;
    varying float vAlong;
    varying float vAcross;
    void main() {
      float edge = 1.0 - abs(vAcross);
      float fade = pow(1.0 - vAlong, 1.6) * smoothstep(0.0, 0.06, vAlong + 0.02);
      float streak = 0.72 + 0.28 * sin(vAlong * 46.0 - uTime * 7.0 + vAcross * 3.0);
      float alpha = edge * fade * streak * uOpacity * uIntensity;
      gl_FragColor = vec4(uColor * uIntensity, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthWrite: false,
  side: THREE.DoubleSide,
  fog: false,
});

const tailMaterial = new THREE.ShaderMaterial({
  uniforms: { ...instanceUniforms(), uPixels: { value: 600 } },
  vertexShader: /* glsl */ `
    uniform float uLength;
    uniform float uSpread;
    uniform float uTime;
    uniform float uPixels;
    varying float vAlpha;
    void main() {
      float t = fract(uTime * 0.85 + position.x);
      float reach = uLength * ${TAIL_REACH.toFixed(3)};
      float height = uLength * ${TAIL_HEIGHT.toFixed(3)};
      // Thrown up and back from the transom, falling as it spreads.
      vec3 local = vec3(
        position.y * (0.15 + 0.12 * uSpread) * t,
        height * 4.0 * t * (1.0 - t),
        -reach * t
      );
      vec4 view = modelViewMatrix * vec4(local, 1.0);
      vAlpha = (1.0 - t) * min(1.0, t * 6.0);
      gl_PointSize = position.z * (0.25 + 0.5 * t) * (0.5 + 0.06 * uLength)
        * uPixels / max(-view.z, 0.5);
      gl_Position = projectionMatrix * view;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uIntensity;
    varying float vAlpha;
    void main() {
      float d = length(gl_PointCoord - 0.5);
      float alpha = smoothstep(0.5, 0.15, d) * vAlpha * 0.8 * uOpacity * uIntensity;
      gl_FragColor = vec4(uColor * uIntensity, alpha);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }
  `,
  transparent: true,
  depthWrite: false,
  fog: false,
});

// Per-boat state slots in a Float32Array.
const LENGTH = 0,
  SPREAD = 1,
  OPACITY = 2,
  INTENSITY = 3;

function applyState(material: THREE.ShaderMaterial, state: Float32Array) {
  const u = material.uniforms;
  u.uLength.value = state[LENGTH];
  u.uSpread.value = state[SPREAD];
  u.uOpacity.value = state[OPACITY];
  u.uIntensity.value = state[INTENSITY];
  material.uniformsNeedUpdate = true;
}

/**
 * Jet stream behind a boat. Mount it as a child of the yawing boat root; it
 * anchors itself at the transom on the waterline. `speed` is read every frame
 * (no React re-render): the local boat's motion speed or a remote pose's.
 */
export function BoatSpray({ speed }: { speed: () => number }) {
  const group = useRef<THREE.Group>(null);
  const wake = useRef<THREE.Mesh>(null);
  const tail = useRef<THREE.Points>(null);
  const world = useMemo(() => new THREE.Vector3(), []);
  const state = useMemo(() => new Float32Array(4), []);
  const spray = useMemo(() => spraySize(0, BOAT_TUNING.cruise), []);
  useLayoutEffect(() => {
    if (wake.current)
      wake.current.onBeforeRender = () => applyState(wakeMaterial, state);
    if (tail.current)
      tail.current.onBeforeRender = () => applyState(tailMaterial, state);
  }, [state]);
  useFrame(({ clock, size, viewport }) => {
    const root = group.current;
    if (!root?.parent) return;
    time.value = clock.elapsedTime;
    tailMaterial.uniforms.uPixels.value = size.height * viewport.dpr * 0.5;
    spraySize(speed(), BOAT_TUNING.cruise, spray);
    root.visible = spray.opacity > 0;
    if (!root.visible) return;
    root.parent.getWorldPosition(world);
    root.position.set(
      0,
      LAKE_LEVEL + FOAM_LIFT - world.y,
      -BOAT_DIMENSIONS.sternExtent,
    );
    state[LENGTH] = spray.length;
    state[SPREAD] = spray.width;
    state[OPACITY] = spray.opacity;
    state[INTENSITY] = sprayIntensity(lastLighting());
  });
  return (
    <group ref={group} visible={false}>
      <mesh
        ref={wake}
        geometry={wakeGeometry}
        material={wakeMaterial}
        renderOrder={2}
        dispose={null}
      />
      <points
        ref={tail}
        geometry={tailGeometry}
        material={tailMaterial}
        renderOrder={3}
        dispose={null}
      />
    </group>
  );
}
