import { createHash } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";

const { loadRig } = await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
);
const targetPath = new URL(
  "../public/assets/optimized/Lakeside_Man.glb",
  import.meta.url,
).pathname;
let target: Awaited<ReturnType<typeof loadRig>>;

beforeAll(async () => {
  target = await loadRig(targetPath);
});

function worldPosition(scene: THREE.Object3D, name: string) {
  return scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
}

function skinnedBounds(scene: THREE.Object3D) {
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const vertex = new THREE.Vector3();
  scene.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const positions = object.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      object.getVertexPosition(index, vertex);
      object.localToWorld(vertex);
      min.min(vertex);
      max.max(vertex);
    }
  });
  return { min, max };
}

function handBasis(scene: THREE.Object3D, side: "l" | "r") {
  const hand = worldPosition(scene, `hand_${side}`);
  const finger = worldPosition(scene, `middle_01_${side}`)
    .sub(hand)
    .normalize();
  const across = worldPosition(scene, `index_01_${side}`)
    .sub(worldPosition(scene, `pinky_01_${side}`))
    .normalize();
  across.addScaledVector(finger, -across.dot(finger)).normalize();
  return { finger, normal: finger.clone().cross(across).normalize() };
}

function bakedClips() {
  const baked = JSON.parse(
    readFileSync(
      new URL(
        "../../../assets/character-source/prone-retarget.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    source: string;
    sourceClip: string;
    targetSha256: string;
    groundLift: number;
    clips: Parameters<typeof THREE.AnimationClip.parse>[0][];
  };
  return {
    baked,
    clips: baked.clips.map((clip) => THREE.AnimationClip.parse(clip)),
  };
}

function assertTargetPose(scene: THREE.Object3D) {
  const head = worldPosition(scene, "Head");
  const pelvis = worldPosition(scene, "pelvis");
  const feet = [worldPosition(scene, "foot_l"), worldPosition(scene, "foot_r")];
  const hands = [
    worldPosition(scene, "hand_l"),
    worldPosition(scene, "hand_r"),
  ];
  const feetY = Math.min(...feet.map((point) => point.y));
  const bounds = skinnedBounds(scene);
  expect(head.z).toBeGreaterThan(pelvis.z + 0.35);
  expect(Math.abs(head.y - pelvis.y)).toBeLessThan(0.15);
  expect(Math.abs(head.y - feetY)).toBeLessThan(0.15);
  expect(Math.min(...hands.map((point) => point.z))).toBeGreaterThan(
    pelvis.z + 0.05,
  );
  for (const side of ["l", "r"] as const) {
    const basis = handBasis(scene, side);
    expect(basis.finger.dot(new THREE.Vector3(0, 0, 1))).toBeGreaterThan(0.85);
    expect(basis.normal.dot(new THREE.Vector3(0, 1, 0))).toBeGreaterThan(0.65);
  }
  expect(bounds.min.y).toBeGreaterThan(-0.48);
  expect(bounds.min.y).toBeLessThan(-0.44);
  expect(bounds.max.y).toBeLessThan(0.32);
  expect(bounds.max.y - bounds.min.y).toBeGreaterThan(0.25);
  scene.traverse((object) => {
    if (!(object instanceof THREE.Bone)) return;
    expect(object.quaternion.length()).toBeCloseTo(1, 3);
  });
}

describe("baked belly retarget on the approved target rig", () => {
  it("ships exactly the target-validated baked clips in the runtime action library", () => {
    const { baked } = bakedClips();
    const runtime = JSON.parse(
      readFileSync(
        new URL(
          "../public/assets/animations/character-actions.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    for (const clip of baked.clips) {
      const expected = {
        ...clip,
        name: clip.name.replace("Prone_Belly_", "Prone_"),
      };
      expect(
        runtime.clips.filter(
          (entry: { name: string }) => entry.name === expected.name,
        ),
      ).toEqual([expected]);
    }
  });

  it("keeps source provenance and the two offline clips", () => {
    const { baked, clips } = bakedClips();
    expect(baked.source).toBe("human_male.glb");
    expect(baked.sourceClip).toBe("LayToIdle@0");
    expect(baked.targetSha256).toBe(
      createHash("sha256").update(readFileSync(targetPath)).digest("hex"),
    );
    expect(baked.groundLift).toBe(0.46);
    expect(clips.map((clip) => clip.name)).toEqual([
      "Prone_Belly_Idle",
      "Prone_Belly_Crawl",
    ]);
  });

  it("renders grounded belly idle on a fresh approved target scene", () => {
    const { clips } = bakedClips();
    const mixer = new THREE.AnimationMixer(target.scene);
    mixer.clipAction(clips[0]).play();
    mixer.update(1e-4);
    target.scene.updateMatrixWorld(true);
    assertTargetPose(target.scene);
  });

  it("keeps every baked crawl phase forward, grounded and finite", () => {
    const { clips } = bakedClips();
    const mixer = new THREE.AnimationMixer(target.scene);
    const action = mixer.clipAction(clips[1]).play();
    for (const time of [0, 0.5, 1, 1.5, 2]) {
      action.reset().play();
      mixer.setTime(time);
      target.scene.updateMatrixWorld(true);
      assertTargetPose(target.scene);
    }
  });
});
