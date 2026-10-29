import * as T from "three";
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
/** Only arms/wrists are posed. beginFrame restores the authored mixer pose, avoiding accumulated IK. */
export function createCruceCharacterRig(
  object: T.Object3D,
  back: T.Texture | null = null,
  gripClip?: T.AnimationClip,
) {
  const names = [
    "upperarm_l",
    "lowerarm_l",
    "hand_l",
    "upperarm_r",
    "lowerarm_r",
    "hand_r",
    "spine_01",
    ...[
      ...new Set(
        (gripClip?.tracks ?? [])
          .filter(
            (t) =>
              /^(index|middle|ring|pinky|thumb)_/.test(t.name) &&
              t.name.endsWith(".quaternion"),
          )
          .map((t) => t.name.split(".")[0]),
      ),
    ],
  ];
  const bones = names.map((n) => object.getObjectByName(n));
  const saved = bones.map((b) => b?.quaternion.clone() ?? new T.Quaternion());
  let applied = false;
  const geometries: T.BufferGeometry[] = [],
    materials: T.Material[] = [];
  const fan = new T.Group();
  fan.name = "Cruce hand fan";
  bones[2]?.add(fan);
  fan.position.set(0, 0.085, 0);
  const cardGeometry = new T.PlaneGeometry(0.085, 0.137);
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
  held.position.set(0, 0.09, 0);
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
  const start = new T.Vector3(),
    middle = new T.Vector3(),
    tip = new T.Vector3(),
    direction = new T.Vector3(),
    bend = new T.Vector3(),
    from = new T.Vector3(),
    to = new T.Vector3(),
    reachable = new T.Vector3();
  const q = new T.Quaternion(),
    parentQ = new T.Quaternion(),
    worldQ = new T.Quaternion();
  function rotation(b: T.Object3D, world: T.Quaternion) {
    b.parent?.getWorldQuaternion(parentQ);
    b.quaternion.copy(parentQ.invert()).multiply(world).normalize();
    b.updateWorldMatrix(false, true);
  }
  function aim(b: T.Object3D, child: T.Object3D, point: T.Vector3) {
    b.getWorldPosition(start);
    child.getWorldPosition(tip);
    from.copy(tip).sub(start).normalize();
    to.copy(point).sub(start).normalize();
    q.setFromUnitVectors(from, to);
    b.getWorldQuaternion(worldQ).premultiply(q);
    rotation(b, worldQ);
  }
  function solve(upper: T.Object3D, lower: T.Object3D, hand: T.Object3D) {
    upper.getWorldPosition(start);
    lower.getWorldPosition(middle);
    hand.getWorldPosition(tip);
    const a = start.distanceTo(middle),
      b = middle.distanceTo(tip);
    direction.copy(target).sub(start);
    const d = T.MathUtils.clamp(
      direction.length(),
      Math.abs(a - b) + 1e-5,
      a + b - 1e-5,
    );
    direction.normalize();
    reachable.copy(start).addScaledVector(direction, d);
    to.copy(pole)
      .sub(start)
      .addScaledVector(direction, -to.dot(direction))
      .normalize();
    const along = (a * a - b * b + d * d) / (2 * d),
      height = Math.sqrt(Math.max(0, a * a - along * along));
    bend
      .copy(start)
      .addScaledVector(direction, along)
      .addScaledVector(to, height);
    aim(upper, lower, bend);
    aim(lower, hand, reachable);
  }
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
            Math.sin(angle) * 0.12,
            Math.cos(angle) * 0.025,
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
      for (const track of gripClip?.tracks ?? []) {
        if (
          !/^(index|middle|ring|pinky|thumb)_/.test(track.name) ||
          !track.name.endsWith(".quaternion")
        )
          continue;
        const bone = object.getObjectByName(track.name.split(".")[0]);
        if (bone) bone.quaternion.slerp(q.fromArray(track.values), 0.75);
      }
      object.updateWorldMatrix(true, true);
      const reach = t >= 0 && t < 0.9 ? Math.sin((Math.PI * t) / 0.9) : 0;
      for (let side = 0; side < 2; side++) {
        const [upper, lower, hand] = bones.slice(side * 3, side * 3 + 3);
        if (!upper || !lower || !hand) continue;
        target.set(
          side === 0 ? 0.12 : -0.12,
          side === 0 ? 0.9 : 0.8 + 0.04 * reach,
          side === 0 ? 0.14 : 0.25 + 0.08 * reach,
        );
        object.localToWorld(target);
        pole.set(side === 0 ? 0.48 : -0.48, 0.67, -0.04);
        object.localToWorld(pole);
        solve(upper, lower, hand);
        object.getWorldQuaternion(worldQ);
        q.setFromEuler(
          new T.Euler(
            side === 1 ? Math.PI / 2 : -0.15,
            side === 0 ? 0.3 : 0,
            side === 0 ? -0.1 : 0.1,
          ),
        );
        worldQ.multiply(q);
        rotation(hand, worldQ);
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
