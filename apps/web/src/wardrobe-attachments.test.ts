import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { bindWardrobePart, WardrobeTextureCache } from "./wardrobe-attachments";

function fixture(reverse = false) {
  const bones = Array.from({ length: 65 }, (_, index) => {
    const bone = new THREE.Bone();
    bone.name = "joint_" + index;
    bone.position.y = index * .01;
    bone.updateMatrixWorld();
    return bone;
  });
  const inverses = bones.map(bone => bone.matrixWorld.clone().invert());
  if (reverse) { bones.reverse(); inverses.reverse(); }
  const skeleton = new THREE.Skeleton(bones, inverses);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0,0,0], 3));
  geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute([0,1,2,3], 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute([.5,.5,0,0], 4));
  const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshStandardMaterial());
  mesh.bind(skeleton, new THREE.Matrix4());
  return mesh;
}

describe("wardrobe skeleton attachment", () => {
  it("shares geometry and one actor skeleton while keeping actors independent", () => {
    const source = fixture(), first = fixture(), second = fixture();
    const part = bindWardrobePart(source, first);
    const other = bindWardrobePart(source, second);
    expect(part.geometry).toBe(source.geometry);
    expect(part.skeleton).toBe(first.skeleton);
    expect(other.skeleton).toBe(second.skeleton);
    expect(part.skeleton).not.toBe(other.skeleton);
    expect(source.skeleton).not.toBe(part.skeleton);
  });

  it("remaps index order once without mutating shared source attributes", () => {
    const source = fixture(true), actor = fixture();
    const part = bindWardrobePart(source, actor);
    const other = bindWardrobePart(source, fixture());
    expect(part.geometry).toBe(other.geometry);
    expect(part.geometry).not.toBe(source.geometry);
    expect(part.geometry.getAttribute("position")).toBe(source.geometry.getAttribute("position"));
    expect(part.geometry.getAttribute("skinIndex").getX(0)).toBe(64);
    expect(source.geometry.getAttribute("skinIndex").getX(0)).toBe(0);
  });

  it("rejects matching names with a different bind and unexpected transforms", () => {
    const source = fixture(), actor = fixture();
    source.skeleton.boneInverses[0].elements[12] = .2;
    expect(() => bindWardrobePart(source, actor)).toThrow("bind does not match");
    const transformed = fixture();
    transformed.position.y = .1;
    expect(() => bindWardrobePart(transformed, actor)).toThrow("node transform");
  });

  it("shares compatible texture objects and preserves different samplers", () => {
    const cache = new WardrobeTextureCache();
    const first = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const second = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    first.userData.wardrobeTextureHashes = second.userData.wardrobeTextureHashes = { map: "same-pixels" };
    cache.share(first);
    cache.share(second);
    expect(second.map).toBe(first.map);
    const transformed = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    transformed.map!.repeat.x = 2;
    transformed.userData.wardrobeTextureHashes = { map: "same-pixels" };
    cache.share(transformed);
    expect(transformed.map).not.toBe(first.map);
  });
});
