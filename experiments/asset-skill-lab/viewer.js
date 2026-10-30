import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";

const data = __MODEL_DATA__;
const canvas = document.querySelector("canvas");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1;
const camera = new THREE.PerspectiveCamera(38, 1, 0.01, 100);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
const scenes = [0, 1].map(() => {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#d4d6d7");
  scene.add(new THREE.HemisphereLight(0xffffff, 0x59595b, 2));
  const light = new THREE.DirectionalLight(0xffffff, 2.4);
  light.position.set(-3, 5, 4);
  scene.add(light);
  return scene;
});
const models = new Map();
let current = [];
let serial = 0;
async function decode(base64) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return (await loader.parseAsync(bytes.buffer, "")).scene;
}
async function select(id) {
  const request = ++serial;
  document.querySelector("#status").textContent = "Loading embedded GLBs…";
  if (!models.has(id))
    models.set(id, await Promise.all(data[id].glbs.map(decode)));
  if (request !== serial) return;
  current.forEach((model, i) => scenes[i].remove(model));
  current = models.get(id);
  const bounds = new THREE.Box3().setFromObject(current[0]);
  const center = bounds.getCenter(new THREE.Vector3());
  const span = Math.max(...bounds.getSize(new THREE.Vector3()).toArray());
  current.forEach((model, i) => {
    model.position.sub(center);
    scenes[i].add(model);
  });
  controls.target.set(0, 0, 0);
  camera.position.set(span * 1.8, span * 1.2, span * 2.3);
  controls.update();
  document.querySelector("#status").textContent =
    `${id}: ${data[id].reference.triangles.toLocaleString()} → ${data[id].candidate.triangles.toLocaleString()} triangles · ${data[id].reference.glb_bytes.toLocaleString()} → ${data[id].candidate.glb_bytes.toLocaleString()} GLB bytes`;
  document
    .querySelectorAll("button")
    .forEach((button) =>
      button.setAttribute("aria-pressed", String(button.dataset.asset === id)),
    );
}
document.querySelectorAll("button").forEach((button) =>
  button.addEventListener("click", () =>
    select(button.dataset.asset).catch((error) => {
      document.querySelector("#status").textContent = error.message;
      console.error(error);
    }),
  ),
);
function draw() {
  const width = canvas.clientWidth,
    height = canvas.clientHeight;
  if (
    canvas.width !== Math.round(width * renderer.getPixelRatio()) ||
    canvas.height !== Math.round(height * renderer.getPixelRatio())
  )
    renderer.setSize(width, height, false);
  camera.aspect = width / 2 / height;
  camera.updateProjectionMatrix();
  controls.update();
  renderer.setScissorTest(true);
  scenes.forEach((scene, i) => {
    renderer.setViewport((i * width) / 2, 0, width / 2, height);
    renderer.setScissor((i * width) / 2, 0, width / 2, height);
    renderer.render(scene, camera);
  });
  requestAnimationFrame(draw);
}
select("lantern")
  .then(() => {
    document.documentElement.dataset.ready = "true";
    draw();
  })
  .catch((error) => {
    document.querySelector("#status").textContent = error.message;
    console.error(error);
  });
