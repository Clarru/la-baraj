import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import {
  CROUCH_POSE_CLIP_NAME,
  PRONE_CRAWL_CLIP_NAME,
  PRONE_IDLE_CLIP_NAME,
  createCrouchPoseClip,
  createProneClips,
  createStanceClips,
} from "./stance-clips";
import { cloneCharacter } from "./character-resources";

const { loadRig } = (await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
)) as { loadRig: (path: string) => Promise<GLTF> };

const rigPath = new URL(
  "../public/assets/optimized/Lakeside_Man.glb",
  import.meta.url,
).pathname;
const swimSource = JSON.parse(
  await (
    await import("node:fs/promises")
  ).readFile(
    new URL(
      "../public/assets/animations/character-actions.json",
      import.meta.url,
    ),
    "utf8",
  ),
) as { clips: Parameters<typeof THREE.AnimationClip.parse>[0][] };
const swimForward = THREE.AnimationClip.parse(
  swimSource.clips.find((clip) => clip.name === "Swim_Forward")!,
);

function worldPosition(scene: THREE.Object3D, name: string) {
  return scene.getObjectByName(name)!.getWorldPosition(new THREE.Vector3());
}

function assertFiniteBones(scene: THREE.Object3D) {
  scene.traverse((object) => {
    if (!(object instanceof THREE.Bone)) return;
    expect(object.quaternion.length()).toBeCloseTo(1, 4);
    expect(object.matrixWorld.elements.every(Number.isFinite)).toBe(true);
  });
}

function skinnedMinimumY(scene: THREE.Object3D) {
  let minimum = Infinity;
  let source = "";
  const local = new THREE.Vector3();
  scene.updateWorldMatrix(true, true);
  scene.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    object.skeleton.update();
    const position = object.geometry.getAttribute("position");
    for (let index = 0; index < position.count; index++) {
      object.getVertexPosition(index, local);
      object.localToWorld(local);
      if (local.y < minimum) {
        minimum = local.y;
        source = object.name;
      }
    }
  });
  return { minimum, source };
}

describe("land stance clips", () => {
  it("creates a real additive crouch that lowers hips and keeps feet near the ground", async () => {
    const { scene, animations } = await loadRig(rigPath);
    const idle = animations.find((clip) => clip.name === "Idle_Neutral")!;
    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(idle).play();
    const crouch = createCrouchPoseClip();
    const action = mixer.clipAction(crouch).setLoop(THREE.LoopRepeat, Infinity);
    action.play();
    mixer.setTime(0.5);
    scene.updateMatrixWorld(true);
    const crouchPelvis = worldPosition(scene, "pelvis");
    const crouchHead = worldPosition(scene, "Head");
    const crouchFeet = [
      worldPosition(scene, "foot_l"),
      worldPosition(scene, "foot_r"),
    ];
    expect(crouch.blendMode).toBe(THREE.AdditiveAnimationBlendMode);
    expect(crouchPelvis.y).toBeLessThan(0.8);
    expect(crouchHead.y).toBeGreaterThan(crouchPelvis.y + 0.35);
    expect(Math.min(...crouchFeet.map((foot) => foot.y))).toBeGreaterThan(
      -0.08,
    );
    expect(Math.max(...crouchFeet.map((foot) => foot.y))).toBeLessThan(0.12);
    assertFiniteBones(scene);
  });

  it("derives prone idle/crawl from horizontal Swim_Forward, never upright Swim_Idle", async () => {
    const { scene } = await loadRig(rigPath);
    const [idle, crawl] = createProneClips(swimForward);
    expect(idle.name).toBe(PRONE_IDLE_CLIP_NAME);
    expect(crawl.name).toBe(PRONE_CRAWL_CLIP_NAME);
    expect(idle.duration).toBeCloseTo(1.2);
    expect(crawl.duration).toBeCloseTo(swimForward.duration);
    expect(createStanceClips(swimForward).map((clip) => clip.name)).toEqual([
      CROUCH_POSE_CLIP_NAME,
      PRONE_IDLE_CLIP_NAME,
      PRONE_CRAWL_CLIP_NAME,
    ]);
    expect(createProneClips(undefined)).toEqual([]);

    const mixer = new THREE.AnimationMixer(scene);
    mixer.clipAction(idle).setLoop(THREE.LoopRepeat, Infinity).play();
    mixer.setTime(0.6);
    scene.updateMatrixWorld(true);
    const lift = 0.46;
    const pelvis = worldPosition(scene, "pelvis");
    const chest = worldPosition(scene, "spine_03");
    const head = worldPosition(scene, "Head");
    const hands = [
      worldPosition(scene, "hand_l"),
      worldPosition(scene, "hand_r"),
    ];
    const feet = [
      worldPosition(scene, "foot_l"),
      worldPosition(scene, "foot_r"),
    ];
    expect(head.z - pelvis.z).toBeGreaterThan(0.35);
    expect(Math.abs(head.y - pelvis.y)).toBeLessThan(0.18);
    expect(pelvis.y + lift).toBeLessThan(0.25);
    expect(chest.y + lift).toBeLessThan(0.28);
    expect(head.y + lift).toBeGreaterThan(0.25);
    expect(Math.min(...hands.map((hand) => hand.y + lift))).toBeGreaterThan(
      0.04,
    );
    expect(Math.max(...hands.map((hand) => hand.y + lift))).toBeLessThan(
      head.y + lift,
    );
    expect(Math.min(...feet.map((foot) => foot.y + lift))).toBeGreaterThan(
      0.08,
    );
    for (const foot of feet) {
      expect(foot.y).toBeCloseTo(-0.36, 2);
      expect(foot.z).toBeLessThan(pelvis.z - 0.55);
    }
    for (const ball of [
      worldPosition(scene, "ball_l"),
      worldPosition(scene, "ball_r"),
    ])
      expect(ball.y).toBeCloseTo(-0.36, 2);
    assertFiniteBones(scene);

    mixer.stopAllAction();
    mixer.clipAction(crawl).setLoop(THREE.LoopRepeat, Infinity).play();
    for (const time of [0, 0.35, 0.7, 1.1]) {
      mixer.setTime(time);
      scene.updateMatrixWorld(true);
      const crawlHead = worldPosition(scene, "Head");
      const crawlPelvis = worldPosition(scene, "pelvis");
      expect(crawlHead.z - crawlPelvis.z).toBeGreaterThan(0.28);
      expect(crawlHead.y + lift).toBeGreaterThan(0.2);
      assertFiniteBones(scene);
    }

    // Runtime avatars coalesce the exact equivalent skeletons, including the
    // approved hair/beard meshes. Verify those attachments follow the prone
    // head instead of remaining at the standing bind pose.
    const cloned = cloneCharacter((await loadRig(rigPath)).scene);
    const attachedMixer = new THREE.AnimationMixer(cloned);
    attachedMixer.clipAction(crawl).setLoop(THREE.LoopRepeat, Infinity).play();
    attachedMixer.setTime(0.35);
    cloned.updateMatrixWorld(true);
    const attachedHead = worldPosition(cloned, "Head");
    for (const name of [
      "Hairstyle_Hair_Beard",
      "Hairstyle_Hair_SimpleParted",
    ]) {
      const mesh = cloned.getObjectByName(name)! as THREE.SkinnedMesh;
      mesh.skeleton.update();
      const bounds = new THREE.Box3().setFromObject(mesh);
      expect(
        bounds.getCenter(new THREE.Vector3()).distanceTo(attachedHead),
      ).toBeLessThan(0.2);
    }
    attachedMixer.stopAllAction();
    const attachedCrawl = new THREE.AnimationMixer(cloned);
    attachedCrawl.clipAction(crawl).setLoop(THREE.LoopRepeat, Infinity).play();
    for (const time of [0, 0.333, 0.666, 1.0]) {
      attachedCrawl.setTime(time);
      const lowest = skinnedMinimumY(cloned);
      const floorY = lowest.minimum + lift;
      expect(
        floorY,
        `crawl floor at ${time} (${lowest.source})`,
      ).toBeGreaterThan(-0.02);
      expect(floorY, `crawl floor at ${time} (${lowest.source})`).toBeLessThan(
        0.02,
      );
    }
    attachedCrawl.stopAllAction();
    const attachedIdle = new THREE.AnimationMixer(cloned);
    attachedIdle.clipAction(idle).setLoop(THREE.LoopRepeat, Infinity).play();
    attachedIdle.setTime(0);
    const idleFloor = skinnedMinimumY(cloned).minimum + lift;
    expect(idleFloor).toBeGreaterThan(-0.02);
    expect(idleFloor).toBeLessThan(0.02);
  });

  it("restores the source idle pose when the additive crouch is stopped", async () => {
    const baseline = await loadRig(rigPath);
    const baselineIdle = baseline.animations.find(
      (clip) => clip.name === "Idle_Neutral",
    )!;
    const baselineMixer = new THREE.AnimationMixer(baseline.scene);
    baselineMixer.clipAction(baselineIdle).play();
    baselineMixer.setTime(0.4);
    baseline.scene.updateMatrixWorld(true);

    const { scene, animations } = await loadRig(rigPath);
    const idle = animations.find((clip) => clip.name === "Idle_Neutral")!;
    const mixer = new THREE.AnimationMixer(scene);
    const idleAction = mixer.clipAction(idle).play();
    const crouch = mixer
      .clipAction(createCrouchPoseClip())
      .setLoop(THREE.LoopRepeat, Infinity)
      .play();
    mixer.setTime(0.4);
    scene.updateMatrixWorld(true);
    crouch.stop();
    mixer.setTime(0.4);
    scene.updateMatrixWorld(true);
    expect(idleAction.isRunning()).toBe(true);
    for (const name of ["pelvis", "Head", "foot_l", "foot_r"]) {
      const source = baseline.scene.getObjectByName(name)!;
      const restored = scene.getObjectByName(name)!;
      expect(restored.position.distanceTo(source.position)).toBeLessThan(0.001);
      expect(restored.quaternion.angleTo(source.quaternion)).toBeLessThan(
        0.001,
      );
    }
    assertFiniteBones(scene);
  });
});
