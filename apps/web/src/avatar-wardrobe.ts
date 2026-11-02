import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  appearanceKey,
  normalizeAppearance,
  type Appearance,
  type MaleAppearance,
} from "../../../packages/shared/appearance";
import { bindWardrobePart, WardrobeTextureCache } from "./wardrobe-attachments";
import {
  wardrobeAssetIds,
  wardrobeAssetURL,
  type WardrobeAssetId,
} from "./wardrobe-catalog";
import approvedTextureHashes from "./wardrobe-approved-textures.json";

export type WardrobeLoader = (id: WardrobeAssetId) => Promise<THREE.Object3D>;
const loader = new GLTFLoader();
const pending = new Map<WardrobeAssetId, Promise<THREE.Object3D>>();
const textures = new WardrobeTextureCache();
const seeded = new WeakSet<THREE.Material>();
const hashManifest = approvedTextureHashes as Record<
  string,
  Record<string, string>
>;
const hairColors = {
  brown: [0.035, 0.022, 0.016],
  black: [0.008, 0.006, 0.005],
  blond: [0.24, 0.14, 0.045],
  auburn: [0.09, 0.025, 0.012],
  grey: [0.12, 0.125, 0.13],
} as const;
const clothColors = {
  navy: [0.04, 0.075, 0.13],
  sage: [0.16, 0.21, 0.13],
  charcoal: [0.065, 0.075, 0.085],
  cream: [0.62, 0.52, 0.36],
  rust: [0.27, 0.085, 0.04],
} as const;
function eachMaterial(
  mesh: THREE.Mesh,
  visit: (material: THREE.Material) => void,
) {
  (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).forEach(
    visit,
  );
}
export const loadWardrobeAsset: WardrobeLoader = (id) => {
  const saved = pending.get(id);
  if (saved) return saved;
  const promise = loader
    .loadAsync(wardrobeAssetURL(id))
    .then((gltf) => {
      gltf.scene.updateWorldMatrix(true, true);
      gltf.scene.traverse((node) => {
        if (node instanceof THREE.Mesh)
          eachMaterial(node, (material) => {
            if (material instanceof THREE.MeshStandardMaterial)
              textures.share(material);
          });
      });
      return gltf.scene;
    })
    .catch((error) => {
      pending.delete(id);
      throw error;
    });
  pending.set(id, promise);
  return promise;
};

const baseNames = [
  "Eyebrows",
  "Eyes",
  "Hairstyle_Hair_Beard",
  "Hairstyle_Hair_SimpleParted",
  "Male_Peasant_Arms",
  "Male_Peasant_Body",
  "Male_Peasant_Feet",
  "Male_Peasant_Legs",
  "SuperHero_Male",
] as const;
function baseName(mesh: THREE.Object3D) {
  let node: THREE.Object3D | null = mesh;
  while (node) {
    const found = baseNames.find(
      (name) => node!.name === name || node!.name.startsWith(name + "_"),
    );
    if (found) return found;
    node = node.parent;
  }
  return mesh.name;
}
function tint(
  material: THREE.Material,
  role: string,
  appearance: MaleAppearance,
) {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  const color = (rgb: readonly [number, number, number]) =>
    material.color.setRGB(rgb[0], rgb[1], rgb[2]);
  if (role === "hair" || role === "facialHair")
    color(hairColors[appearance.hairColor]);
  else if (
    role === "hat" &&
    appearance.hatColor !== "original" &&
    /^Wardrobe_Hat_(Cap_Navy|Beanie_Olive|Bucket_Olive)$/.test(material.name)
  ) {
    color(clothColors[appearance.hatColor]);
    // Neutral fabric maps retain their weave; compensate their base luminance
    // so the same swatch reads consistently across cotton and knit.
    material.color.multiplyScalar(
      1 / (material.name.includes("Cap_Navy") ? 0.313 : 0.195),
    );
  } else if (
    role === "top" &&
    appearance.topColor !== "original" &&
    /Knit|Overshirt_Navy/.test(material.name)
  )
    color(clothColors[appearance.topColor]);
  else if (role === "bottom" && appearance.bottomColor !== "original")
    color(clothColors[appearance.bottomColor]);
}

/** Owns one actor's visibility/materials. Geometry, textures and its existing
 * animation skeleton remain shared/cached according to their existing lifetimes.
 */
export class AvatarWardrobe {
  private sequence = 0;
  private disposed = false;
  private key = appearanceKey(normalizeAppearance(undefined));
  private originals: {
    mesh: THREE.SkinnedMesh;
    name: string;
    visible: boolean;
    material: THREE.Material | THREE.Material[];
  }[] = [];
  private baseMaterials = new Map<THREE.Material, THREE.Material>();
  private baseColors = new Map<THREE.MeshStandardMaterial, THREE.Color>();
  private parts: THREE.SkinnedMesh[] = [];
  private partMaterials = new Set<THREE.Material>();
  private reference: THREE.SkinnedMesh;

  constructor(
    private actor: THREE.Object3D,
    private load: WardrobeLoader = loadWardrobeAsset,
  ) {
    actor.traverse((node) => {
      if (!(node instanceof THREE.SkinnedMesh)) return;
      this.originals.push({
        mesh: node,
        name: baseName(node),
        visible: node.visible,
        material: node.material,
      });
      const clone = (source: THREE.Material) => {
        if (!seeded.has(source)) {
          const hashes = hashManifest[source.name];
          if (hashes && source instanceof THREE.MeshStandardMaterial) {
            const seed = source.clone();
            seed.userData = { ...seed.userData, wardrobeTextureHashes: hashes };
            textures.share(seed);
            seed.dispose();
          }
          seeded.add(source);
        }
        let owned = this.baseMaterials.get(source);
        if (!owned) {
          owned = source.clone();
          this.baseMaterials.set(source, owned);
          if (owned instanceof THREE.MeshStandardMaterial)
            this.baseColors.set(owned, owned.color.clone());
        }
        return owned;
      };
      node.material = Array.isArray(node.material)
        ? node.material.map(clone)
        : clone(node.material);
    });
    const reference = this.originals[0]?.mesh;
    if (!reference) throw Error("Approved character has no skinned meshes");
    this.reference = reference;
  }
  async update(value: Appearance): Promise<boolean> {
    if (this.disposed) return false;
    const sequence = ++this.sequence;
    const appearance = normalizeAppearance(value),
      key = appearanceKey(appearance);
    if (key === this.key) return true;
    let sources: THREE.Object3D[];
    try {
      sources = await Promise.all(
        wardrobeAssetIds(appearance).map((id) => this.load(id)),
      );
    } catch (error) {
      if (this.disposed || sequence !== this.sequence) return false;
      throw error;
    }
    if (this.disposed || sequence !== this.sequence) return false;
    const parts: THREE.SkinnedMesh[] = [];
    const materials = new Map<THREE.Material, THREE.Material>();
    try {
      for (const source of sources) {
        let count = 0;
        source.traverse((node) => {
          if (!(node instanceof THREE.SkinnedMesh)) return;
          count++;
          const part = bindWardrobePart(node, this.reference);
          const own = (original: THREE.Material) => {
            let material = materials.get(original);
            if (!material) {
              material = original.clone();
              materials.set(original, material);
              if (appearance.body === "male")
                tint(material, String(part.userData.wardrobeRole), appearance);
            }
            return material;
          };
          part.material = Array.isArray(node.material)
            ? node.material.map(own)
            : own(node.material);
          parts.push(part);
        });
        if (!count) throw Error("Wardrobe asset contains no skinned parts");
      }
    } catch (error) {
      materials.forEach((material) => material.dispose());
      throw error;
    }
    // Swap only after all requested pieces have loaded and passed binding checks.
    this.clearParts();
    for (const [material, color] of this.baseColors) material.color.copy(color);
    for (const original of this.originals) {
      let visible = original.visible;
      if (appearance.body === "female") visible = false;
      else {
        if (
          original.name === "Hairstyle_Hair_SimpleParted" &&
          (appearance.hair !== "parted" || appearance.hat !== "none")
        )
          visible = false;
        if (
          original.name === "Hairstyle_Hair_Beard" &&
          appearance.beard !== "full"
        )
          visible = false;
        if (
          appearance.top !== "lake-workshirt" &&
          ["Male_Peasant_Arms", "Male_Peasant_Body", "SuperHero_Male"].includes(
            original.name,
          )
        )
          visible = false;
        if (
          (appearance.bottom !== "classic" ||
            appearance.bottomColor !== "original" ||
            appearance.shoes !== "lake-boots") &&
          original.name === "Male_Peasant_Legs"
        )
          visible = false;
        if (
          appearance.shoes !== "lake-boots" &&
          original.name === "Male_Peasant_Feet"
        )
          visible = false;
        const role = [
          "Hairstyle_Hair_SimpleParted",
          "Hairstyle_Hair_Beard",
          "Eyebrows",
        ].includes(original.name)
          ? "hair"
          : original.name === "Male_Peasant_Legs"
            ? "bottom"
            : "";
        eachMaterial(original.mesh, (material) =>
          tint(material, role, appearance),
        );
      }
      original.mesh.visible = visible;
    }
    const parent = this.reference.parent ?? this.actor;
    for (const part of parts) parent.add(part);
    this.parts = parts;
    this.partMaterials = new Set(materials.values());
    this.key = key;
    return true;
  }
  private clearParts() {
    for (const part of this.parts) part.removeFromParent();
    this.partMaterials.forEach((material) => material.dispose());
    this.parts = [];
    this.partMaterials.clear();
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.sequence++;
    this.clearParts();
    for (const original of this.originals) {
      original.mesh.visible = original.visible;
      original.mesh.material = original.material;
    }
    this.baseMaterials.forEach((material) => material.dispose());
    this.baseMaterials.clear();
    this.baseColors.clear();
  }
}
