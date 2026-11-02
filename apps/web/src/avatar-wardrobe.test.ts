import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { AvatarWardrobe, type WardrobeLoader } from "./avatar-wardrobe";
import { DEFAULT_APPEARANCE } from "../../../packages/shared/appearance";
function skin(
  skeleton: THREE.Skeleton,
  material: THREE.Material,
  name: string,
) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute([0, 0, 0], 3),
  );
  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute([0, 0, 0, 0], 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute([1, 0, 0, 0], 4),
  );
  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.name = name;
  mesh.bind(skeleton, new THREE.Matrix4());
  return mesh;
}
function rig() {
  const root = new THREE.Group(),
    armature = new THREE.Group();
  root.add(armature);
  const bones = Array.from({ length: 65 }, (_, index) => {
    const bone = new THREE.Bone();
    bone.name = "joint_" + index;
    armature.add(bone);
    return bone;
  });
  const skeleton = new THREE.Skeleton(
    bones,
    bones.map(() => new THREE.Matrix4()),
  );
  return { root, armature, skeleton };
}
function actor(sharedHair?: THREE.MeshStandardMaterial) {
  const result = rig();
  const hair =
    sharedHair ??
    new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.035, 0.022, 0.016),
    });
  for (const name of [
    "Eyebrows",
    "Eyes",
    "Hairstyle_Hair_Beard",
    "Hairstyle_Hair_SimpleParted",
    "Male_Peasant_Arms",
    "Male_Peasant_Body",
    "Male_Peasant_Feet",
    "Male_Peasant_Legs",
    "SuperHero_Male",
  ]) {
    const material =
      name.includes("Hairstyle") || name === "Eyebrows"
        ? hair
        : new THREE.MeshStandardMaterial();
    result.armature.add(skin(result.skeleton, material, name));
  }
  return { ...result, hair };
}
function asset(name: string, role = "hair") {
  const result = rig();
  const mesh = skin(
    result.skeleton,
    new THREE.MeshStandardMaterial({ color: 0.3 }),
    name,
  );
  mesh.userData.wardrobeRole = role;
  result.armature.add(mesh);
  return { ...result, mesh };
}
const originalHair = (root: THREE.Object3D) =>
  root.getObjectByName("Hairstyle_Hair_SimpleParted") as THREE.SkinnedMesh;
describe("atomic per-actor wardrobe changes", () => {
  it.each([
    ["weekend-knit", "Wardrobe_Knit_Charcoal_Fitted", 0.195],
    ["trail-overshirt", "Wardrobe_Overshirt_Navy_Fitted", 0.313],
    ["weekend-knit", "Wardrobe_Knit_Charcoal", 1],
    ["trail-overshirt", "Wardrobe_Overshirt_Navy", 1],
  ] as const)(
    "dyes %s cloth while retaining source detail and actor isolation (%s)",
    async (top, name, luminance) => {
      const first = actor(),
        second = actor(),
        garment = asset("fitted-top", "top"),
        support = asset("covered-neck", "skin");
      const source = garment.mesh.material as THREE.MeshStandardMaterial;
      source.name = name;
      source.color.setRGB(0.089354, 0.134031, 0.210619);
      source.map = new THREE.Texture();
      source.normalMap = new THREE.Texture();
      const original = source.color.clone();
      const load: WardrobeLoader = async (id) =>
        id === "male-custom-top-skin" ? support.root : garment.root;
      const wardrobe = new AvatarWardrobe(first.root, load),
        other = new AvatarWardrobe(second.root, load);
      try {
        await other.update({ ...DEFAULT_APPEARANCE, top });
        await wardrobe.update({
          ...DEFAULT_APPEARANCE,
          top,
          topColor: "cream",
        });
        const material = (
          first.root.getObjectByName("fitted-top") as THREE.Mesh
        ).material as THREE.MeshStandardMaterial;
        const untouched = (
          second.root.getObjectByName("fitted-top") as THREE.Mesh
        ).material as THREE.MeshStandardMaterial;
        expect(material.color.r).toBeCloseTo(0.62 / luminance);
        expect(material.color.g).toBeCloseTo(0.52 / luminance);
        expect(material.color.b).toBeCloseTo(0.36 / luminance);
        expect(material.map).toBe(source.map);
        expect(material.normalMap).toBe(source.normalMap);
        expect(source.color.equals(original)).toBe(true);
        expect(untouched.color.equals(original)).toBe(true);
        await wardrobe.update({ ...DEFAULT_APPEARANCE, top });
        const restored = (
          first.root.getObjectByName("fitted-top") as THREE.Mesh
        ).material as THREE.MeshStandardMaterial;
        expect(restored.color.equals(original)).toBe(true);
      } finally {
        wardrobe.dispose();
        other.dispose();
      }
    },
  );
  it("dyes hat cloth per player, preserves texture detail and restores the original", async () => {
    const base = actor(),
      hat = asset("dyed-hat", "hat"),
      hair = asset("under-hat-hair");
    const source = hat.mesh.material as THREE.MeshStandardMaterial;
    source.name = "Wardrobe_Hat_Cap_Navy";
    source.color.setRGB(0.089354, 0.134031, 0.210619);
    source.map = new THREE.Texture();
    source.normalMap = new THREE.Texture();
    const original = source.color.clone();
    const wardrobe = new AvatarWardrobe(base.root, async (id) =>
      id.startsWith("hair-") ? hair.root : hat.root,
    );
    await wardrobe.update({
      ...DEFAULT_APPEARANCE,
      hat: "panel-cap",
      hatColor: "cream",
    });
    const dyed = (base.root.getObjectByName("dyed-hat") as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    expect(dyed).not.toBe(source);
    expect(dyed.color.r).toBeCloseTo(0.62 / 0.313);
    expect(dyed.map).toBe(source.map);
    expect(dyed.normalMap).toBe(source.normalMap);
    expect(source.color.equals(original)).toBe(true);
    await wardrobe.update({
      ...DEFAULT_APPEARANCE,
      hat: "panel-cap",
      hatColor: "original",
    });
    const restored = (base.root.getObjectByName("dyed-hat") as THREE.Mesh)
      .material as THREE.MeshStandardMaterial;
    expect(restored.color.equals(original)).toBe(true);
    wardrobe.dispose();
  });
  it("keeps the approved default and does not load additional assets", async () => {
    const base = actor(),
      load = vi.fn<WardrobeLoader>(),
      wardrobe = new AvatarWardrobe(base.root, load);
    expect(await wardrobe.update(DEFAULT_APPEARANCE)).toBe(true);
    expect(load).not.toHaveBeenCalled();
    expect(originalHair(base.root).visible).toBe(true);
    wardrobe.dispose();
  });
  it("isolates dye materials between actors while sharing immutable source textures", async () => {
    const shared = new THREE.MeshStandardMaterial({
      color: new THREE.Color(0.035, 0.022, 0.016),
      map: new THREE.Texture(),
    });
    const first = actor(shared),
      second = actor(shared);
    const wardrobe = new AvatarWardrobe(first.root);
    const other = new AvatarWardrobe(second.root);
    await wardrobe.update({ ...DEFAULT_APPEARANCE, hairColor: "grey" });
    const material = originalHair(first.root)
      .material as THREE.MeshStandardMaterial;
    expect(material).not.toBe(shared);
    expect(material.map).toBe(shared.map);
    expect(material.color.toArray()).toEqual([0.12, 0.125, 0.13]);
    expect(shared.color.toArray()).toEqual([0.035, 0.022, 0.016]);
    expect(
      (
        originalHair(second.root).material as THREE.MeshStandardMaterial
      ).color.toArray(),
    ).toEqual([0.035, 0.022, 0.016]);
    wardrobe.dispose();
    other.dispose();
  });
  it("keeps the previous actor visible on download or binding failure", async () => {
    const base = actor();
    const wardrobe = new AvatarWardrobe(base.root, async () => {
      throw Error("download");
    });
    await expect(
      wardrobe.update({ version: 1, body: "female" }),
    ).rejects.toThrow("download");
    expect(originalHair(base.root).visible).toBe(true);
    wardrobe.dispose();
    const broken = asset("broken");
    broken.skeleton.boneInverses[0].elements[12] = 0.2;
    const invalid = new AvatarWardrobe(base.root, async () => broken.root);
    await expect(
      invalid.update({ ...DEFAULT_APPEARANCE, hair: "buzzed" }),
    ).rejects.toThrow("bind does not match");
    expect(originalHair(base.root).visible).toBe(true);
    invalid.dispose();
  });
  it("ignores a slow older selection and binds the latest mesh to the existing actor skeleton", async () => {
    const base = actor(),
      buzz = asset("buzz"),
      long = asset("long");
    let finish!: (value: THREE.Object3D) => void;
    const blocked = new Promise<THREE.Object3D>((resolve) => {
      finish = resolve;
    });
    const wardrobe = new AvatarWardrobe(base.root, (id) =>
      id === "hair-buzzed" ? blocked : Promise.resolve(long.root),
    );
    const stale = wardrobe.update({ ...DEFAULT_APPEARANCE, hair: "buzzed" });
    await wardrobe.update({ ...DEFAULT_APPEARANCE, hair: "long" });
    finish(buzz.root);
    expect(await stale).toBe(false);
    expect(base.root.getObjectByName("buzz")).toBeUndefined();
    const part = base.root.getObjectByName("long") as THREE.SkinnedMesh;
    expect(part.skeleton).toBe(base.skeleton);
    expect(part.geometry).toBe(long.mesh.geometry);
    expect(part.material).not.toBe(long.mesh.material);
    wardrobe.dispose();
  });
  it("can revert to the current default while a different selection is still loading", async () => {
    const base = actor(),
      replacement = asset("late");
    let finish!: (value: THREE.Object3D) => void;
    const wardrobe = new AvatarWardrobe(
      base.root,
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const pending = wardrobe.update({ ...DEFAULT_APPEARANCE, hair: "long" });
    await wardrobe.update(DEFAULT_APPEARANCE);
    finish(replacement.root);
    expect(await pending).toBe(false);
    expect(originalHair(base.root).visible).toBe(true);
    wardrobe.dispose();
  });
  it("restores base materials/visibility on disposal without disposing shared assets", async () => {
    const base = actor(),
      female = asset("female", "skin");
    const original = originalHair(base.root).material;
    const materialDispose = vi.spyOn(
      female.mesh.material as THREE.Material,
      "dispose",
    );
    const geometryDispose = vi.spyOn(female.mesh.geometry, "dispose");
    const texture = new THREE.Texture(),
      textureDispose = vi.spyOn(texture, "dispose");
    (female.mesh.material as THREE.MeshStandardMaterial).map = texture;
    const wardrobe = new AvatarWardrobe(base.root, async () => female.root);
    await wardrobe.update({ version: 1, body: "female" });
    expect(originalHair(base.root).visible).toBe(false);
    const clone = base.root.getObjectByName("female") as THREE.SkinnedMesh;
    const ownedDispose = vi.spyOn(clone.material as THREE.Material, "dispose");
    wardrobe.dispose();
    expect(originalHair(base.root).visible).toBe(true);
    expect(originalHair(base.root).material).toBe(original);
    expect(ownedDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).not.toHaveBeenCalled();
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(textureDispose).not.toHaveBeenCalled();
  });
});
