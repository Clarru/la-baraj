/** Test support: parse a shipped runabout GLB in Node with its real nodes and materials. */
import fs from "node:fs";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

/** Node has no image decoder; WebP textures resolve to blank stand-ins instead. */
const blankWebpTextures = () => ({
  name: "EXT_texture_webp",
  loadTexture: () => Promise.resolve(new THREE.Texture()),
});

export async function loadRunabout(
  id: "Lake_Runabout" | "Lake_Runabout_LOD",
): Promise<THREE.Object3D> {
  const bytes = fs.readFileSync(
    new URL(`../public/assets/optimized/${id}.glb`, import.meta.url),
  );
  const gltf = await new GLTFLoader()
    .register(blankWebpTextures)
    .parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
  return gltf.scene;
}
