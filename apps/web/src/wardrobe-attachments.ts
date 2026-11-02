import * as THREE from "three";

const geometryCache = new WeakMap<THREE.BufferGeometry, Map<string, THREE.BufferGeometry>>();
const epsilon = 0.0001;
const identity = new THREE.Matrix4();
function matrixNear(a: THREE.Matrix4, b: THREE.Matrix4) {
  return a.elements.every((value, index) => Math.abs(value - b.elements[index]) <= epsilon);
}

/** Keep one canonical animated skeleton per actor. Source geometry/textures stay
 * immutable and shared; only an index-order remap allocates cached geometry.
 */
export function bindWardrobePart(source: THREE.SkinnedMesh, reference: THREE.SkinnedMesh) {
  const target = reference.skeleton;
  const from = source.skeleton;
  if (target.bones.length !== 65 || from.bones.length !== 65)
    throw Error("Wardrobe requires the approved 65-bone skeleton");
  const targetIndexes = new Map(target.bones.map((bone, index) => [bone.name, index]));
  if (targetIndexes.size !== 65 || new Set(from.bones.map(bone => bone.name)).size !== 65)
    throw Error("Wardrobe has ambiguous joint names");
  const remap = from.bones.map((bone, sourceIndex) => {
    const index = targetIndexes.get(bone.name);
    if (index === undefined || !matrixNear(from.boneInverses[sourceIndex], target.boneInverses[index]))
      throw Error("Wardrobe bind does not match at " + bone.name);
    return index;
  });
  source.updateWorldMatrix(true, false);
  // Exported wardrobe nodes are flattened under the canonical identity armature.
  // Reject unexpected transforms rather than guessing an axis/scale correction.
  if (!matrixNear(source.matrixWorld, identity) || !matrixNear(source.bindMatrix, identity))
    throw Error("Wardrobe has an unexpected node transform");
  let geometry = source.geometry;
  if (remap.some((index, sourceIndex) => index !== sourceIndex)) {
    const key = remap.join(",");
    let entries = geometryCache.get(geometry);
    if (!entries) geometryCache.set(geometry, entries = new Map());
    const saved = entries.get(key);
    if (saved) geometry = saved;
    else {
      const indices = source.geometry.getAttribute("skinIndex");
      if (!indices || indices.itemSize !== 4) throw Error("Wardrobe has no joint indices");
      const values = new Uint16Array(indices.count * 4);
      for (let vertex = 0; vertex < indices.count; vertex++)
        for (let axis = 0; axis < 4; axis++) {
          const old = indices.getComponent(vertex, axis);
          if (!Number.isInteger(old) || old < 0 || old >= remap.length)
            throw Error("Wardrobe joint index is outside its skeleton");
          values[vertex * 4 + axis] = remap[old];
        }
      const next = new THREE.BufferGeometry();
      for (const name of Object.keys(source.geometry.attributes))
        next.setAttribute(name, source.geometry.getAttribute(name));
      next.setIndex(source.geometry.index);
      next.groups = source.geometry.groups.map(group => ({ ...group }));
      next.morphAttributes = source.geometry.morphAttributes;
      next.morphTargetsRelative = source.geometry.morphTargetsRelative;
      next.boundingBox = source.geometry.boundingBox?.clone() ?? null;
      next.boundingSphere = source.geometry.boundingSphere?.clone() ?? null;
      next.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(values, 4));
      entries.set(key, next);
      geometry = next;
    }
  }
  const result = source.clone(false);
  result.geometry = geometry;
  result.bindMode = reference.bindMode;
  result.bind(target, reference.bindMatrix);
  result.castShadow = true;
  result.receiveShadow = true;
  result.boundingSphere = reference.boundingSphere?.clone() ?? new THREE.Sphere(new THREE.Vector3(0, .8, 0), 2.5);
  result.frustumCulled = true;
  let ancestor: THREE.Object3D | null = source;
  while (ancestor) {
    if (typeof ancestor.userData.wardrobeRole === "string") {
      result.userData.wardrobeRole = ancestor.userData.wardrobeRole;
      break;
    }
    ancestor = ancestor.parent;
  }
  return result;
}

const textureSlots = ["map", "normalMap", "roughnessMap", "metalnessMap", "aoMap"] as const;
type TexturedMaterial = THREE.MeshStandardMaterial;
/** Session cache: avatar cleanup disposes only its cloned materials, never these textures. */
export class WardrobeTextureCache {
  private textures = new Map<string, THREE.Texture>();
  share(material: TexturedMaterial) {
    const hashes = material.userData.wardrobeTextureHashes as Record<string, string> | undefined;
    if (!hashes) return;
    for (const slot of textureSlots) {
      const texture = material[slot], hash = hashes[slot];
      if (!texture || !hash) continue;
      const key = [
        hash, texture.colorSpace, texture.flipY, texture.channel, texture.wrapS, texture.wrapT,
        texture.magFilter, texture.minFilter, texture.offset.toArray().join(","),
        texture.repeat.toArray().join(","), texture.center.toArray().join(","), texture.rotation,
      ].join(":");
      const cached = this.textures.get(key);
      if (cached) material[slot] = cached;
      else this.textures.set(key, texture);
    }
  }
}
