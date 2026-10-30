import * as THREE from "three";

export const BELLY_PRONE_CLIP_NAME = "Prone_Belly_Idle";
export const BELLY_PRONE_DURATION = 1.2;

type PoseOptions = {
  sampleTime?: number;
  openHandSource?: THREE.AnimationClip;
  duration?: number;
  /** Presentation lift used by the land visual root; normalizes the lowest vertex to floor. */
  groundLift?: number;
};

function sampleTrack(
  source: THREE.KeyframeTrack,
  sourceTime: number,
  duration: number,
) {
  const interpolant = source.InterpolantFactoryMethodLinear();
  const value = Array.from(interpolant.evaluate(sourceTime));
  const track = source.clone();
  track.times = new Float32Array([0, duration]);
  const values = Array.from(value);
  track.values = new Float32Array([...values, ...values]);
  return track;
}

function sampledClip(
  source: THREE.AnimationClip,
  sampleTime: number,
  duration: number,
) {
  return new THREE.AnimationClip(
    BELLY_PRONE_CLIP_NAME,
    duration,
    source.tracks.map((track) => sampleTrack(track, sampleTime, duration)),
  );
}

function replaceTrackValue(
  clip: THREE.AnimationClip,
  name: string,
  value: ArrayLike<number>,
) {
  const track = clip.tracks.find((candidate) => candidate.name === name);
  if (!track) return false;
  const size = track.getValueSize();
  if (value.length !== size) throw new Error(`${name} expects ${size} values`);
  const values = Array.from(value);
  track.values = new Float32Array([...values, ...values]);
  track.times = new Float32Array([0, clip.duration]);
  return true;
}

function evaluateClip(scene: THREE.Object3D, clip: THREE.AnimationClip) {
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip).play();
  mixer.update(1e-4);
  scene.updateMatrixWorld(true);
  return {
    dispose() {
      action.stop();
      mixer.uncacheClip(clip);
    },
  };
}

function setWorldRotation(joint: THREE.Object3D, rotation: THREE.Quaternion) {
  if (joint.parent) {
    const parent = joint.parent
      .getWorldQuaternion(new THREE.Quaternion())
      .invert();
    joint.quaternion.copy(parent).multiply(rotation).normalize();
  } else joint.quaternion.copy(rotation).normalize();
  joint.updateWorldMatrix(false, true);
}

function aimBone(
  joint: THREE.Object3D,
  child: THREE.Object3D,
  target: THREE.Vector3,
) {
  const start = joint.getWorldPosition(new THREE.Vector3());
  const end = child.getWorldPosition(new THREE.Vector3());
  const current = end.sub(start).normalize();
  const desired = target.clone().sub(start).normalize();
  const delta = new THREE.Quaternion().setFromUnitVectors(current, desired);
  const world = joint
    .getWorldQuaternion(new THREE.Quaternion())
    .premultiply(delta);
  setWorldRotation(joint, world);
}

function solveTwoBone(
  upper: THREE.Object3D,
  lower: THREE.Object3D,
  endpoint: THREE.Object3D,
  target: THREE.Vector3,
  pole: THREE.Vector3,
  bendY?: number,
) {
  const start = upper.getWorldPosition(new THREE.Vector3());
  const middle = lower.getWorldPosition(new THREE.Vector3());
  const end = endpoint.getWorldPosition(new THREE.Vector3());
  const a = start.distanceTo(middle);
  const b = middle.distanceTo(end);
  const direction = target.clone().sub(start);
  const distance = THREE.MathUtils.clamp(
    direction.length(),
    Math.abs(a - b) + 0.00001,
    a + b - 0.00001,
  );
  direction.normalize();
  const reachable = start.clone().addScaledVector(direction, distance);
  const poleDirection = pole
    .clone()
    .sub(start)
    .addScaledVector(direction, -pole.clone().sub(start).dot(direction));
  if (poleDirection.lengthSq() < 1e-10)
    poleDirection.set(1, 0, 0).cross(direction);
  if (poleDirection.lengthSq() < 1e-10)
    poleDirection.set(0, 1, 0).cross(direction);
  poleDirection.normalize();
  const along = (a * a - b * b + distance * distance) / (2 * distance);
  const height = Math.sqrt(Math.max(0, a * a - along * along));
  const bend = start
    .clone()
    .addScaledVector(direction, along)
    .addScaledVector(poleDirection, height);
  if (bendY !== undefined && height > 1e-5) {
    const center = start.clone().addScaledVector(direction, along);
    const vertical = new THREE.Vector3(0, 1, 0).addScaledVector(
      direction,
      -direction.y,
    );
    if (vertical.lengthSq() > 1e-8) {
      vertical.normalize();
      const lateral = direction.clone().cross(vertical).normalize();
      const cosine = THREE.MathUtils.clamp(
        (bendY - center.y) / (height * vertical.y),
        -1,
        1,
      );
      const sine = Math.sqrt(Math.max(0, 1 - cosine * cosine));
      const a = center
        .clone()
        .addScaledVector(vertical, height * cosine)
        .addScaledVector(lateral, height * sine);
      const b = center
        .clone()
        .addScaledVector(vertical, height * cosine)
        .addScaledVector(lateral, -height * sine);
      bend.copy(a.distanceToSquared(pole) < b.distanceToSquared(pole) ? a : b);
    }
  }
  aimBone(upper, lower, bend);
  aimBone(lower, endpoint, reachable);
}

function alignHandForGroundBrace(scene: THREE.Object3D, suffix: "l" | "r") {
  const hand = scene.getObjectByName(`hand_${suffix}`);
  const middle = scene.getObjectByName(`middle_01_${suffix}`);
  const index = scene.getObjectByName(`index_01_${suffix}`);
  const pinky = scene.getObjectByName(`pinky_01_${suffix}`);
  if (!hand || !middle || !index || !pinky) return;
  const handPosition = hand.getWorldPosition(new THREE.Vector3());
  const finger = middle
    .getWorldPosition(new THREE.Vector3())
    .sub(handPosition)
    .normalize();
  const across = index
    .getWorldPosition(new THREE.Vector3())
    .sub(pinky.getWorldPosition(new THREE.Vector3()))
    .normalize();
  across.addScaledVector(finger, -across.dot(finger)).normalize();
  const normal = finger.clone().cross(across).normalize();
  const targetFinger = new THREE.Vector3(0, 0, 1);
  const targetAcross = new THREE.Vector3(suffix === "l" ? -1 : 1, 0, 0);
  const targetNormal = targetFinger.clone().cross(targetAcross).normalize();
  const currentBasis = new THREE.Matrix4().makeBasis(across, normal, finger);
  const targetBasis = new THREE.Matrix4().makeBasis(
    targetAcross,
    targetNormal,
    targetFinger,
  );
  const delta = targetBasis.multiply(currentBasis.invert());
  const correction = new THREE.Quaternion().setFromRotationMatrix(delta);
  const desired = correction
    .multiply(hand.getWorldQuaternion(new THREE.Quaternion()))
    .normalize();
  setWorldRotation(hand, desired);
}

function eyesCentroid(scene: THREE.Object3D) {
  const eyes = scene.getObjectByName("Eyes");
  const vertex = new THREE.Vector3();
  const centroid = new THREE.Vector3();
  if (!(eyes instanceof THREE.SkinnedMesh)) return centroid;
  const positions = eyes.geometry.getAttribute("position");
  for (let index = 0; index < positions.count; index++) {
    eyes.getVertexPosition(index, vertex);
    eyes.localToWorld(vertex);
    centroid.add(vertex);
  }
  return centroid.multiplyScalar(1 / Math.max(1, positions.count));
}

function applyBellySupportIK(
  scene: THREE.Object3D,
  stroke = 0,
  groundY = -0.46,
) {
  const pelvis = scene.getObjectByName("pelvis");
  const head = scene.getObjectByName("Head");
  if (!pelvis || !head) return;
  const forward = new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  const pelvisPosition = pelvis.getWorldPosition(new THREE.Vector3());
  const headPosition = head.getWorldPosition(new THREE.Vector3());
  const eyes = eyesCentroid(scene);
  const eyeDirection = eyes.sub(headPosition).normalize();
  const lookTarget = headPosition
    .clone()
    .addScaledVector(forward, 0.65)
    .addScaledVector(up, 0.16);
  const headRotation = head.getWorldQuaternion(new THREE.Quaternion());
  const headCorrection = new THREE.Quaternion().setFromUnitVectors(
    eyeDirection,
    lookTarget.clone().sub(headPosition).normalize(),
  );
  setWorldRotation(head, headCorrection.multiply(headRotation));

  const arms = [
    { side: 1, upper: "upperarm_l", lower: "lowerarm_l", hand: "hand_l" },
    { side: -1, upper: "upperarm_r", lower: "lowerarm_r", hand: "hand_r" },
  ];
  for (const arm of arms) {
    const upper = scene.getObjectByName(arm.upper);
    const lower = scene.getObjectByName(arm.lower);
    const hand = scene.getObjectByName(arm.hand);
    if (!upper || !lower || !hand) continue;
    const target = pelvisPosition
      .clone()
      .addScaledVector(forward, 0.68 + arm.side * stroke * 0.12)
      .addScaledVector(right, arm.side * 0.24)
      .setY(groundY + 0.04);
    const pole = pelvisPosition
      .clone()
      .addScaledVector(forward, 0.42)
      .addScaledVector(right, arm.side * 0.4)
      .setY(groundY + 0.12);
    let elbowY = groundY + 0.08;
    for (let attempt = 0; attempt < 5; attempt++) {
      solveTwoBone(upper, lower, hand, target, pole, elbowY);
      scene.updateMatrixWorld(true);
      const sleeve = scene.getObjectByName("Male_Peasant_Arms_1");
      if (!(sleeve instanceof THREE.SkinnedMesh)) break;
      const vertex = new THREE.Vector3();
      let minY = Infinity;
      for (
        let index = 0;
        index < sleeve.geometry.attributes.position.count;
        index++
      ) {
        sleeve.getVertexPosition(index, vertex);
        sleeve.localToWorld(vertex);
        if ((vertex.x - pelvisPosition.x) * arm.side > 0)
          minY = Math.min(minY, vertex.y);
      }
      if (minY >= groundY + 0.004) break;
      elbowY += groundY + 0.004 - minY;
    }
  }
  alignHandForGroundBrace(scene, "l");
  alignHandForGroundBrace(scene, "r");
  for (const side of ["l", "r"]) {
    // The thumb pad also rests in the palm plane rather than pointing into the floor.
    const direction = new THREE.Vector3(
      side === "l" ? -0.5 : 0.5,
      0,
      0.86,
    ).normalize();
    for (const [name, childName] of [
      ["01", "02"],
      ["02", "03"],
      ["03", "04_leaf"],
    ]) {
      const thumb = scene.getObjectByName(`thumb_${name}_${side}`);
      const child = scene.getObjectByName(`thumb_${childName}_${side}`);
      if (thumb && child)
        aimBone(
          thumb,
          child,
          thumb.getWorldPosition(new THREE.Vector3()).add(direction),
        );
    }
  }
}

/** Keep toes extending away from the hips while removing the source toe-down tilt. */
function levelFootToLongitudinalAxis(
  scene: THREE.Object3D,
  clip: THREE.AnimationClip,
  footName: string,
  ballName: string,
  longitudinal: THREE.Vector3,
) {
  const foot = scene.getObjectByName(footName);
  const ball = scene.getObjectByName(ballName);
  if (!foot || !ball || !foot.parent) return;
  const current = ball
    .getWorldPosition(new THREE.Vector3())
    .sub(foot.getWorldPosition(new THREE.Vector3()))
    .normalize();
  const target = longitudinal.clone().setY(0).normalize();
  if (current.dot(target) < 0) target.negate();
  const correction = new THREE.Quaternion().setFromUnitVectors(current, target);
  const worldRotation = foot.getWorldQuaternion(new THREE.Quaternion());
  const parentRotation = foot.parent
    .getWorldQuaternion(new THREE.Quaternion())
    .invert();
  const localRotation = parentRotation
    .multiply(correction)
    .multiply(worldRotation)
    .normalize();
  replaceTrackValue(clip, `${footName}.quaternion`, localRotation.toArray());
}

function lowestSkinnedVertexY(scene: THREE.Object3D) {
  const vertex = new THREE.Vector3();
  let minY = Infinity;
  scene.traverse((object) => {
    if (!(object instanceof THREE.SkinnedMesh)) return;
    const positions = object.geometry.getAttribute("position");
    for (let index = 0; index < positions.count; index++) {
      object.getVertexPosition(index, vertex);
      object.localToWorld(vertex);
      minY = Math.min(minY, vertex.y);
    }
  });
  return minY;
}

function normalizeCurrentSceneToGround(
  scene: THREE.Object3D,
  groundLift: number,
) {
  const root = scene.getObjectByName("root");
  const parent = root?.parent;
  if (!root || !parent) return;
  const minY = lowestSkinnedVertexY(scene);
  if (!Number.isFinite(minY)) return;
  parent.updateWorldMatrix(true, false);
  const parentInverse = parent.matrixWorld.clone().invert();
  const shiftedLocal = root
    .getWorldPosition(new THREE.Vector3())
    .add(new THREE.Vector3(0, -groundLift - minY, 0))
    .applyMatrix4(parentInverse);
  root.position.copy(shiftedLocal);
  root.updateWorldMatrix(false, true);
}

/**
 * Retarget the sampled opening pose of LayToIdle from supine to belly-down.
 *
 * The roll is authored in world space around the sampled pelvis-to-head/feet
 * longitudinal axis, then converted back into the root bone's parent space.
 * This avoids applying a world Euler offset to a root that already carries
 * the armature's -90-degree basis rotation.
 */
export function createBellyProneClip(
  scene: THREE.Object3D,
  source: THREE.AnimationClip,
  options: PoseOptions = {},
) {
  const sampleTime = Math.max(
    0,
    Math.min(source.duration, options.sampleTime ?? 0),
  );
  const duration = options.duration ?? BELLY_PRONE_DURATION;
  const handBones = ["l", "r"].flatMap((side) =>
    ["index", "middle", "ring", "pinky", "thumb"].flatMap((finger) =>
      ["01", "02", "03"].map((joint) => `${finger}_${joint}_${side}`),
    ),
  );
  const openHands = new Map(
    handBones.map((name) => {
      const track = options.openHandSource?.tracks.find(
        (track) => track.name === `${name}.quaternion`,
      );
      if (!track) throw new Error(`Open-hand reference missing ${name}`);
      return [
        name,
        new THREE.Quaternion().fromArray(
          track.InterpolantFactoryMethodLinear().evaluate(0),
        ),
      ];
    }),
  );
  const clip = sampledClip(source, sampleTime, duration);
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(clip).play();
  mixer.update(0);
  scene.updateMatrixWorld(true);

  const root = scene.getObjectByName("root");
  const pelvis = scene.getObjectByName("pelvis");
  const head = scene.getObjectByName("Head");
  const footL = scene.getObjectByName("foot_l");
  const footR = scene.getObjectByName("foot_r");
  if (!root || !pelvis || !head || !footL || !footR)
    throw new Error("Approved rig is missing the belly retarget bones");
  const parent = root.parent;
  if (!parent) throw new Error("Root bone has no parent space");

  const pivot = pelvis.getWorldPosition(new THREE.Vector3());
  const feetMidpoint = footL
    .getWorldPosition(new THREE.Vector3())
    .add(footR.getWorldPosition(new THREE.Vector3()))
    .multiplyScalar(0.5);
  const longitudinal = head
    .getWorldPosition(new THREE.Vector3())
    .sub(feetMidpoint)
    .normalize();
  if (longitudinal.lengthSq() < 0.5)
    throw new Error("LayToIdle sample has no stable longitudinal axis");

  const roll = new THREE.Quaternion().setFromAxisAngle(longitudinal, Math.PI);
  // Existing locomotion faces +Z. The source lying pose faces the opposite
  // longitudinal direction, so yaw the rolled body 180° before baking.
  const faceForward = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    Math.PI,
  );
  const retargetRotation = faceForward.clone().multiply(roll);
  const rootWorldPosition = root.getWorldPosition(new THREE.Vector3());
  const retargetedRootPosition = rootWorldPosition
    .sub(pivot)
    .applyQuaternion(retargetRotation)
    .add(pivot);
  const rootWorldRotation = root.getWorldQuaternion(new THREE.Quaternion());
  const retargetedRootRotation = retargetRotation
    .clone()
    .multiply(rootWorldRotation);

  parent.updateWorldMatrix(true, false);
  const parentWorldRotation = parent.getWorldQuaternion(new THREE.Quaternion());
  const parentInverse = parentWorldRotation.clone().invert();
  const localPosition = parent.worldToLocal(retargetedRootPosition.clone());
  const localRotation = parentInverse
    .multiply(retargetedRootRotation)
    .normalize();
  replaceTrackValue(clip, "root.position", localPosition.toArray());
  replaceTrackValue(clip, "root.quaternion", localRotation.toArray());

  const footPose = evaluateClip(scene, clip);
  levelFootToLongitudinalAxis(scene, clip, "foot_l", "ball_l", longitudinal);
  levelFootToLongitudinalAxis(scene, clip, "foot_r", "ball_r", longitudinal);
  footPose.dispose();

  const pose = evaluateClip(scene, clip);
  const groundLift = options.groundLift ?? 0.46;
  normalizeCurrentSceneToGround(scene, groundLift);
  // A slight downward chest pitch settles the upper torso instead of arching above the floor.
  const spine = scene.getObjectByName("spine_01");
  if (spine)
    setWorldRotation(
      spine,
      spine
        .getWorldQuaternion(new THREE.Quaternion())
        .premultiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0),
            0.16,
          ),
        ),
    );
  for (const [name, rotation] of openHands)
    scene.getObjectByName(name)!.quaternion.copy(rotation);
  applyBellyStrokeIK(scene, 0, -groundLift);
  scene.updateMatrixWorld(true);
  normalizeCurrentSceneToGround(scene, groundLift);
  for (const track of clip.tracks)
    replaceTrackValue(clip, track.name, readTrackValue(scene, track));
  pose.dispose();

  action.stop();
  mixer.uncacheClip(clip);
  return clip;
}

function readTrackValue(scene: THREE.Object3D, track: THREE.KeyframeTrack) {
  const separator = track.name.indexOf(".");
  if (separator < 0)
    return Array.from(track.values.slice(0, track.getValueSize()));
  const object = scene.getObjectByName(track.name.slice(0, separator));
  const property = track.name.slice(separator + 1) as
    "position" | "quaternion" | "scale";
  const value = object?.[property];
  return value && typeof value.toArray === "function"
    ? value.toArray()
    : Array.from(track.values.slice(0, track.getValueSize()));
}

function applyBellyStrokeIK(
  scene: THREE.Object3D,
  stroke: number,
  groundY = -0.46,
) {
  applyBellySupportIK(scene, stroke, groundY);
  const pelvis = scene.getObjectByName("pelvis");
  if (!pelvis) return;
  const pelvisPosition = pelvis.getWorldPosition(new THREE.Vector3());
  const forward = new THREE.Vector3(0, 0, 1);
  const right = new THREE.Vector3(1, 0, 0);
  const up = new THREE.Vector3(0, 1, 0);
  for (const side of [-1, 1]) {
    const thigh = scene.getObjectByName(`thigh_${side > 0 ? "l" : "r"}`);
    const calf = scene.getObjectByName(`calf_${side > 0 ? "l" : "r"}`);
    const foot = scene.getObjectByName(`foot_${side > 0 ? "l" : "r"}`);
    if (!thigh || !calf || !foot) continue;
    const target = pelvisPosition
      .clone()
      .addScaledVector(forward, -0.79 + side * stroke * 0.025)
      .addScaledVector(right, side * 0.12)
      .setY(groundY + 0.1);
    const pole = pelvisPosition
      .clone()
      .addScaledVector(forward, -0.4)
      .addScaledVector(right, side * 0.16)
      .setY(groundY + 0.08);
    solveTwoBone(thigh, calf, foot, target, pole, groundY + 0.1);
    const ball = scene.getObjectByName(`ball_${side > 0 ? "l" : "r"}`);
    if (ball)
      aimBone(
        foot,
        ball,
        foot
          .getWorldPosition(new THREE.Vector3())
          .add(new THREE.Vector3(0, 0, -1)),
      );
  }
}

/** Bake a slow, bounded alternating crawl from the accepted static belly pose. */
export function createBellyProneCrawlClip(
  scene: THREE.Object3D,
  idleClip: THREE.AnimationClip,
  duration = 2,
) {
  const times = Array.from(
    { length: 17 },
    (_, index) => (duration * index) / 16,
  );
  const mixer = new THREE.AnimationMixer(scene);
  const action = mixer.clipAction(idleClip).play();
  const frames: number[][] = [];
  for (let index = 0; index < times.length; index++) {
    action.reset().play();
    mixer.update(1e-4);
    scene.updateMatrixWorld(true);
    applyBellyStrokeIK(
      scene,
      Math.sin((times[index] / duration) * Math.PI * 2),
    );
    scene.updateMatrixWorld(true);
    idleClip.tracks.forEach((track, trackIndex) => {
      const value = readTrackValue(scene, track);
      (frames[trackIndex] ??= []).push(...value);
    });
  }
  const tracks = idleClip.tracks.map((source, trackIndex) => {
    const track = source.clone();
    track.times = new Float32Array(times);
    track.values = new Float32Array(frames[trackIndex]);
    return track;
  });
  action.stop();
  mixer.uncacheClip(idleClip);
  return new THREE.AnimationClip(
    "Prone_Belly_Crawl",
    duration,
    tracks,
  ).optimize();
}
