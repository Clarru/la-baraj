import { createCruceCardGeometry } from "./cruce-card-geometry";
import * as T from "three";
import handPoses from "./cruce-hand-poses.json";
import { setWorldRotation, solveTwoBoneIK } from "./limb-ik";
import { cruceWorldLab, recordCruceContact } from "./cruce-world-test";
import { crucePlayTarget } from "../../../packages/shared/cruce-station";
import type { CruceSeat, CruceView } from "../../../packages/shared/cruce";
const faceTextures = new Map<number, T.Texture>();
export function cruceFaceTexture(card: number) {
  if (typeof document === "undefined") return null;
  let texture = faceTextures.get(card);
  if (!texture) {
    const suit = ["heart", "bell", "leaf", "acorn"][Math.floor(card / 6)],
      rank = ["unter", "ober", "king", "nine", "ten", "ace"][card % 6];
    texture = new T.TextureLoader().load(`/assets/cruce/${suit}-${rank}.webp`);
    texture.colorSpace = T.SRGBColorSpace;
    faceTextures.set(card, texture);
  }
  return texture;
}
/** Reversible card pose on the retained skeleton. Restore before the mixer each frame. */
export function createCruceCharacterRig(
  object: T.Object3D,
  back: T.Texture | null = null,
  _gripClip?: T.AnimationClip,
) {
  const names = [
    "upperarm_l",
    "lowerarm_l",
    "hand_l",
    "upperarm_r",
    "lowerarm_r",
    "hand_r",
    "spine_01",
    ...Object.keys(handPoses.poses.rest),
  ];
  const bones = names.map((n) => object.getObjectByName(n));
  const saved = bones.map((b) => b?.quaternion.clone() ?? new T.Quaternion());
  let applied = false;
  const geometries: T.BufferGeometry[] = [],
    materials: T.Material[] = [];
  const fan = new T.Group();
  fan.name = "Cruce hand fan";
  bones[2]?.add(fan);
  fan.position.set(0.042, 0.113, 0.01);
  fan.rotation.y = -Math.PI / 2;
  const cardGeometry = createCruceCardGeometry();
  geometries.push(cardGeometry);
  const sideMaterial = new T.MeshStandardMaterial({
    color: "#f9f2df",
    roughness: 0.8,
    map: back,
  });
  materials.push(sideMaterial);
  function card(parent: T.Object3D) {
    const group = new T.Group();
    const frontMaterial = sideMaterial.clone();
    materials.push(frontMaterial);
    const front = new T.Mesh(cardGeometry, frontMaterial);
    front.rotation.y = Math.PI;
    front.position.z = -0.001;
    const rear = new T.Mesh(cardGeometry, sideMaterial);
    rear.position.z = 0.001;
    group.add(front, rear);
    parent.add(group);
    group.userData.front = front;
    return group;
  }
  const cards = Array.from({ length: 10 }, () => card(fan));
  const held = card(new T.Group());
  held.name = "Cruce card in playing hand";
  bones[5]?.add(held);
  held.position.set(-0.042, 0.164, 0.01);
  held.rotation.y = -Math.PI / 2;
  const flight = card(object);
  flight.name = "Cruce card flight";
  fan.visible = held.visible = flight.visible = false;
  let handKey = "",
    round = -1,
    lastPlayed = "",
    initialized = false,
    started = -Infinity;
  const origin = new T.Vector3(),
    end = new T.Vector3(),
    target = new T.Vector3(),
    pole = new T.Vector3();
  const middle = new T.Vector3(),
    tip = new T.Vector3(),
    direction = new T.Vector3();
  const palm = new T.Vector3(),
    across = new T.Vector3(),
    frame = new T.Matrix4();
  const q = new T.Quaternion(),
    worldQ = new T.Quaternion();
  const fingerPoses = Object.entries(handPoses.poses.rest).map(
    ([name, values]) => ({
      bone: object.getObjectByName(name),
      left: name.endsWith("_l"),
      rest: new T.Quaternion().fromArray(values),
      pinch: new T.Quaternion().fromArray(
        handPoses.poses.pinch[name as keyof typeof handPoses.poses.pinch],
      ),
    }),
  );
  const beginFrame = () => {
    if (applied) bones.forEach((b, i) => b?.quaternion.copy(saved[i]));
    applied = false;
  };
  return {
    fan,
    flight,
    held,
    beginFrame,
    update(view: CruceView | null, seat: CruceSeat | null, now: number) {
      if (!view || seat === null) {
        fan.visible = held.visible = flight.visible = false;
        initialized = false;
        handKey = "";
        return;
      }
      const count = view.handCounts[seat],
        own = view.you === seat;
      if (round !== view.round) {
        round = view.round;
        lastPlayed = "";
        initialized = false;
        started = -Infinity;
      }
      const key = `${count}:${own ? view.hand.join(",") : "backs"}`;
      if (key !== handKey) {
        handKey = key;
        cards.forEach((c, i) => {
          c.visible = i < count;
          const angle = (i - (count - 1) / 2) * 0.13;
          c.position.set(
            Math.sin(angle) * 0.06,
            Math.cos(angle) * 0.06,
            i * 0.001,
          );
          c.rotation.z = -angle;
          const m = (c.userData.front as T.Mesh)
            .material as T.MeshStandardMaterial;
          m.map =
            own && view.hand[i] !== undefined
              ? cruceFaceTexture(view.hand[i])
              : back;
          m.needsUpdate = true;
        });
      }
      const played = view.trick.find((p) => p.seat === seat);
      const playKey = played ? `${round}:${played.card}` : "";
      let acceptedPlay = false;
      if (playKey && playKey !== lastPlayed) {
        if (initialized) {
          started = now;
          acceptedPlay = true;
          for (const c of [held, flight]) {
            const m = (c.userData.front as T.Mesh)
              .material as T.MeshStandardMaterial;
            m.map = cruceFaceTexture(played!.card);
            m.needsUpdate = true;
          }
        }
        lastPlayed = playKey;
      }
      initialized = true;
      const t = (now - started) / 1000;
      fan.visible = count > 0;
      held.visible = t >= 0 && t < 0.22;
      flight.visible = t >= 0.22 && t < 0.75;
      if (!fan.visible && t > 0.9) return;
      bones.forEach((b, i) => {
        if (b) saved[i].copy(b.quaternion);
      });
      applied = true;
      if (bones[6])
        bones[6].quaternion.multiply(q.setFromEuler(new T.Euler(0.12, 0, 0)));
      const releaseGrip =
        t >= 0 && t < 0.22
          ? T.MathUtils.smoothstep(t, 0, 0.08)
          : t >= 0.22 && t < 0.38
            ? 1 - (t - 0.22) / 0.16
            : 0;
      for (const pose of fingerPoses) {
        if (!pose.bone) continue;
        pose.bone.quaternion
          .copy(pose.rest)
          .slerp(pose.pinch, pose.left ? 1 : releaseGrip);
      }
      object.updateWorldMatrix(true, true);
      const reach = t >= 0 && t < 0.9 ? Math.sin((Math.PI * t) / 0.9) : 0;
      for (let side = 0; side < 2; side++) {
        const [upper, lower, hand] = bones.slice(side * 3, side * 3 + 3);
        if (!upper || !lower || !hand) continue;
        target.set(
          side === 0 ? 0.18 : -0.18,
          side === 0 ? 0.89 : 0.8735 + 0.08 * reach,
          side === 0 ? 0.08 : 0.182 + 0.08 * reach,
        );
        object.localToWorld(target);
        pole.set(side === 0 ? 0.44 : -0.44, side === 0 ? 0.72 : 0.84, -0.09);
        object.localToWorld(pole);
        solveTwoBoneIK(upper, lower, hand, target, pole);
        // Pronation belongs to the forearm, not a bent/twisted wrist. Local +Y
        // follows this rig's forearm and fingers; left/right palm normals mirror.
        lower.getWorldPosition(middle);
        hand.getWorldPosition(tip);
        direction.copy(tip).sub(middle).normalize();
        object.getWorldQuaternion(worldQ);
        palm
          .set(side === 0 ? -0.15 : 0, side === 0 ? 0 : 1, side === 0 ? -1 : 0)
          .applyQuaternion(worldQ);
        palm.addScaledVector(direction, -palm.dot(direction));
        if (palm.lengthSq() < 1e-8) {
          palm.set(1, 0, 0).applyQuaternion(worldQ);
          palm.addScaledVector(direction, -palm.dot(direction));
        }
        palm.normalize();
        across.crossVectors(palm, direction).normalize();
        palm.crossVectors(direction, across).normalize();
        q.setFromRotationMatrix(frame.makeBasis(palm, direction, across));
        setWorldRotation(lower, q);
        hand.quaternion.identity();
        hand.updateWorldMatrix(false, true);
      }
      object.updateWorldMatrix(true, true);
      if (acceptedPlay || (t >= 0 && t < 0.22)) {
        held.getWorldPosition(origin);
        object.worldToLocal(origin);
      }
      if (flight.visible) {
        end.fromArray(crucePlayTarget(seat));
        object.worldToLocal(end);
        const f = T.MathUtils.clamp((t - 0.22) / 0.53, 0, 1),
          ease = f * f * (3 - 2 * f);
        flight.position.lerpVectors(origin, end, ease);
        flight.position.y += 0.12 * Math.sin(Math.PI * f);
        object.getWorldQuaternion(worldQ).invert();
        q.setFromEuler(new T.Euler(Math.PI / 2, 0, seat * 0.1));
        flight.quaternion.copy(worldQ).multiply(q);
      }
    },
    dispose() {
      beginFrame();
      fan.removeFromParent();
      held.removeFromParent();
      flight.removeFromParent();
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
    },
  };
}

let sharedBack: T.Texture | null = null;
export function cruceBackTexture() {
  if (typeof document === "undefined") return null;
  if (!sharedBack) {
    sharedBack = new T.TextureLoader().load("/assets/cruce/back.svg");
    sharedBack.colorSpace = T.SRGBColorSpace;
  }
  return sharedBack;
}
/** No props/materials/geometries are created for idle avatars. Owned rig exists only while needed. */
export function createCruceCharacterController(
  object: T.Object3D,
  back: () => T.Texture | null = () => null,
  grip?: T.AnimationClip,
) {
  let rig: ReturnType<typeof createCruceCharacterRig> | null = null;
  const dispose = () => {
    rig?.dispose();
    rig = null;
  };
  return {
    beginFrame() {
      rig?.beginFrame();
    },
    update(view: CruceView | null, seat: CruceSeat | null, now: number) {
      const needed =
        view &&
        seat !== null &&
        (view.handCounts[seat] > 0 ||
          (rig && view.trick.some((p) => p.seat === seat)));
      if (!needed) {
        dispose();
        if (cruceWorldLab && seat !== null) recordCruceContact(object, seat);
        return;
      }
      rig ??= createCruceCharacterRig(object, back(), grip);
      rig.update(view, seat, now);
      if (cruceWorldLab && seat !== null)
        recordCruceContact(object, seat, rig.fan);
    },
    dispose,
  };
}
