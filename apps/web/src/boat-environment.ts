import * as THREE from "three";
import { lightingAt, type Lighting } from "./day-night";

// A fixed sky-over-water gradient: the boat reflects a lake, not the scene.
const ZENITH = new THREE.Color("#8fb9d2");
const HORIZON = new THREE.Color("#e2e4d8");
const WATER = new THREE.Color("#2b5b61");

function gradientScene() {
  const geometry = new THREE.SphereGeometry(10, 32, 16);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < position.count; i++) {
    const height = position.getY(i) / 10;
    if (height >= 0) color.lerpColors(HORIZON, ZENITH, Math.sqrt(height));
    else color.lerpColors(HORIZON, WATER, Math.min(1, -height * 4));
    color.toArray(colors, i * 3);
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    side: THREE.BackSide,
  });
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(geometry, material));
  return {
    scene,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}

const environments = new WeakMap<THREE.WebGLRenderer, THREE.Texture>();
/** One small prefiltered map per renderer; never assigned to scene.environment. */
export function getBoatEnvironment(
  renderer: THREE.WebGLRenderer,
): THREE.Texture {
  const cached = environments.get(renderer);
  if (cached) return cached;
  const generator = new THREE.PMREMGenerator(renderer);
  const source = gradientScene();
  const texture = generator.fromScene(source.scene, 0.04).texture;
  source.dispose();
  generator.dispose();
  environments.set(renderer, texture);
  return texture;
}

const brightness = (lighting: Lighting) =>
  lighting.sunIntensity + 2 * lighting.hemiIntensity;
const NIGHT = brightness(lightingAt(0));
const DAY = brightness(lightingAt(12));
const NIGHT_INTENSITY = 0.15;

/** Reflection strength: 0.15 at midnight's light to 1.0 at noon's, so chrome never glows at night. */
export function boatEnvironmentIntensity(lighting: Lighting): number {
  const day = THREE.MathUtils.clamp(
    (brightness(lighting) - NIGHT) / (DAY - NIGHT),
    0,
    1,
  );
  return THREE.MathUtils.lerp(NIGHT_INTENSITY, 1, day);
}

/** Sets the boat-only reflection map on every lit material under root. */
export function applyBoatEnvironment(
  root: THREE.Object3D,
  envMap: THREE.Texture,
): void {
  root.traverse((node) => {
    if (!(node instanceof THREE.Mesh)) return;
    for (const material of [node.material].flat())
      if (material instanceof THREE.MeshStandardMaterial)
        material.envMap = envMap;
  });
}
