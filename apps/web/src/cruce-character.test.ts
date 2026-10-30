import { describe, it, expect } from "vitest";
import * as T from "three";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import handPoses from "./cruce-hand-poses.json";
import contactProbes from "./cruce-contact-probes.json";
import { activitySeatLift } from "./character-actions";
import {
  CRUCE_TABLE,
  CRUCE_CHARACTER_SEAT_HEIGHT,
  cruceSeatPose,
} from "../../../packages/shared/cruce-station";
import {
  createCruceCharacterRig,
  createCruceCharacterController,
} from "./cruce-character";
import { freshCruce, type CruceView } from "../../../packages/shared/cruce";
const { loadRig } = await import(
  /* @vite-ignore */ new URL(
    "../../../scripts/extract-activity-clips.mjs",
    import.meta.url,
  ).href
);
function view() {
  return {
    ...freshCruce(),
    version: 1,
    revision: 1,
    you: 0,
    hand: [0, 1, 2, 3, 4, 5],
    handCounts: [6, 6, 6, 6],
    stockCount: 0,
    legalCards: [0, 1, 2, 3, 4, 5],
    players: [null, null, null, null],
    deadline: null,
    host: 0,
    phase: "playing",
    round: 1,
  } as CruceView;
}
async function rig() {
  const { scene } = await loadRig(
    new URL("../public/assets/optimized/Lakeside_Man.glb", import.meta.url)
      .pathname,
  );
  const json = JSON.parse(
    readFileSync(
      new URL(
        "../public/assets/animations/character-actions.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const mixer = new T.AnimationMixer(scene);
  mixer
    .clipAction(
      T.AnimationClip.parse(
        json.clips.find((c: { name: string }) => c.name === "Activity_Sit"),
      ),
    )
    .play();
  mixer.update(0.5);
  return {
    scene,
    mixer,
    grip: T.AnimationClip.parse(
      json.clips.find((c: { name: string }) => c.name === "Activity_HoldRod"),
    ),
  };
}
describe("character-held Cruce cards", () => {
  it("uses the exact retained rig for authored finger contact poses", () => {
    const file = new URL(
      "../public/assets/optimized/Lakeside_Man.glb",
      import.meta.url,
    );
    expect(handPoses.targetSha256).toBe(
      createHash("sha256").update(readFileSync(file)).digest("hex"),
    );
  });
  it("raises real retained hands to chest level without changing limb lengths or accumulating pose", async () => {
    const { scene, mixer, grip } = await rig();
    const reference = await rig();
    const cards = createCruceCharacterRig(scene, null, grip);
    const finger = scene.getObjectByName("index_02_l")!;
    const originalFinger = finger.quaternion.clone();
    const h = scene.getObjectByName("hand_l")!;
    const baseline = h.quaternion.clone();
    const lengths = ["lowerarm_l", "hand_l", "lowerarm_r", "hand_r"].map((n) =>
      scene.getObjectByName(n)!.position.length(),
    );
    for (let i = 0; i < 150; i++) {
      cards.beginFrame();
      mixer.update(0.016);
      reference.mixer.update(0.016);
      cards.update(view(), 0, 1000 + i * 16);
    }
    expect(cards.fan.visible).toBe(true);
    // A card grip must not turn the authored relaxed finger into a fist.
    expect(finger.quaternion.angleTo(originalFinger)).toBeLessThan(0.4);
    expect(cards.fan.children.filter((c) => c.visible)).toHaveLength(6);
    expect(h.getWorldPosition(new T.Vector3()).y).toBeGreaterThan(0.82);
    for (const [n, i] of ["lowerarm_l", "hand_l", "lowerarm_r", "hand_r"].map(
      (n, i) => [n, i] as const,
    ))
      expect(scene.getObjectByName(n)!.position.length()).toBeCloseTo(
        lengths[i],
        8,
      );
    cards.beginFrame();
    cards.update(null, null, 5000);
    expect(cards.fan.visible).toBe(false);
    expect(
      finger.quaternion
        .clone()
        .normalize()
        .angleTo(
          reference.scene
            .getObjectByName("index_02_l")!
            .quaternion.clone()
            .normalize(),
        ),
    ).toBeLessThan(1e-6);
    expect(h.quaternion.angleTo(baseline)).toBeLessThan(0.1);
    cards.dispose();
    expect(scene.getObjectByName("Cruce hand fan")).toBeUndefined();
  });
  it("keeps wrists aligned, free fingers relaxed and the thumb on the card plane throughout play", async () => {
    for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
      const { scene, mixer } = await rig();
      scene.rotation.y = yaw;
      const cards = createCruceCharacterRig(scene),
        v = view();
      cards.update(v, 0, 1000);
      v.trick = [{ seat: 0, card: 5, announcement: 0 }];
      v.hand = v.hand.slice(0, 5);
      v.handCounts[0] = 5;
      const position = (n: string) =>
        scene.getObjectByName(n)!.getWorldPosition(new T.Vector3());
      for (let frame = 0; frame <= 60; frame++) {
        cards.beginFrame();
        mixer.update(1 / 60);
        cards.update(v, 0, 2000 + (frame * 1000) / 60);
        scene.updateWorldMatrix(true, true);
        for (const side of ["l", "r"]) {
          const wrist = position(`hand_${side}`),
            forearm = wrist.clone().sub(position(`lowerarm_${side}`));
          const palm = position(`middle_01_${side}`).sub(wrist);
          expect(
            forearm.angleTo(palm),
            `${side} wrist at frame ${frame}`,
          ).toBeLessThan(0.2);
          for (const f of ["index", "middle", "ring", "pinky"]) {
            const knuckle = position(`${f}_01_${side}`);
            const finger = position(`${f}_04_leaf_${side}`)
              .sub(knuckle)
              .normalize();
            const palmDirection = knuckle.clone().sub(wrist).normalize();
            expect(
              finger.dot(palmDirection),
              `${side} ${f} at frame ${frame}`,
            ).toBeGreaterThan(side === "r" && frame > 24 ? 0.85 : 0.6);
          }
        }
        const thumbInFan = cards.fan.worldToLocal(position("thumb_04_leaf_l"));
        expect(
          Math.abs(thumbInFan.z),
          "thumb must contact the fan, not float beside it",
        ).toBeLessThan(0.012);
        expect(thumbInFan.y).toBeGreaterThan(-0.01);
        expect(thumbInFan.y).toBeLessThan(0.035);
      }
      cards.dispose();
    }
  });
  it("supports actual skinned hip and finger-pad patches on the furniture through rest and play", async () => {
    for (const seat of [0, 1, 2, 3] as const) {
      const { scene, mixer } = await rig();
      const rendered = cruceSeatPose(seat);
      const floor = CRUCE_TABLE.ground;
      const pose = {
        kind: "sit" as const,
        startedAt: 0,
        anchor: [rendered.position[0], floor, rendered.position[2]] as [
          number,
          number,
          number,
        ],
        seatHeight: floor + CRUCE_TABLE.seatSurface,
      };
      scene.position.set(
        rendered.position[0],
        floor +
          0.95 -
          0.95 +
          activitySeatLift(pose, 1, CRUCE_CHARACTER_SEAT_HEIGHT),
        rendered.position[2],
      );
      scene.rotation.y = rendered.yaw;
      const cards = createCruceCharacterRig(scene),
        v = view();
      v.you = seat;
      const pants = scene.getObjectByName(
          contactProbes.hip.mesh,
        ) as T.SkinnedMesh,
        hand = scene.getObjectByName(
          contactProbes.tableHand.mesh,
        ) as T.SkinnedMesh;
      const point = (mesh: T.SkinnedMesh, index: number) =>
        mesh
          .getVertexPosition(index, new T.Vector3())
          .applyMatrix4(mesh.matrixWorld);
      const check = (rest: boolean) => {
        scene.updateMatrixWorld(true);
        pants.skeleton.update();
        hand.skeleton.update();
        for (const side of ["left", "right"] as const) {
          const gap =
            Math.min(
              ...contactProbes.hip[side].map((p) => point(pants, p.index).y),
            ) -
            (floor + CRUCE_TABLE.seatSurface);
          expect(Math.abs(gap), `seat${seat} ${side} hip`).toBeLessThan(0.003);
        }
        const thumbGap = Math.min(
          ...contactProbes.gripThumb.points.map((p) =>
            Math.abs(cards.fan.worldToLocal(point(hand, p.index)).z),
          ),
        );
        expect(thumbGap, "actual thumb pad must meet card stock").toBeLessThan(
          0.003,
        );
        for (const [digit, probes] of Object.entries(
          contactProbes.tableHand.digits,
        )) {
          const points = probes.map((p) => point(hand, p.index));
          const gap =
            Math.min(...points.map((p) => p.y)) -
            (floor + CRUCE_TABLE.woodSurface);
          expect(gap, `seat${seat} ${digit} through tabletop`).toBeGreaterThan(
            -0.004,
          );
          if (rest) {
            expect(gap, `seat${seat} ${digit} floating`).toBeLessThan(0.006);
            for (const p of points) {
              expect(Math.abs(p.x - CRUCE_TABLE.x)).toBeLessThan(
                CRUCE_TABLE.halfWidth,
              );
              expect(Math.abs(p.z - CRUCE_TABLE.z)).toBeLessThan(
                CRUCE_TABLE.halfWidth,
              );
            }
          }
        }
      };
      cards.update(v, seat, 1000);
      check(true);
      v.trick = [{ seat, card: 5, announcement: 0 }];
      v.handCounts[seat] = 5;
      v.hand = v.hand.slice(0, 5);
      for (const time of [
        0, 0.02, 0.04, 0.06, 0.08, 0.15, 0.22, 0.4, 0.6, 0.9, 1,
      ]) {
        cards.beginFrame();
        mixer.setTime(0.4 + time);
        cards.update(v, seat, 2000 + time * 1000);
        check(time === 0 || time >= 0.9);
      }
      cards.dispose();
    }
  });
  it("shows only backs for a remote hand and animates each accepted play once", async () => {
    const { scene } = await rig(),
      back = new T.Texture(),
      cards = createCruceCharacterRig(scene, back),
      v = view();
    cards.update(v, 1, 1000);
    for (const c of cards.fan.children) {
      expect(
        ((c.userData.front as T.Mesh).material as T.MeshStandardMaterial).map,
      ).toBe(back);
    }
    v.trick = [{ seat: 1, card: 12, announcement: 0 }];
    v.handCounts[1] = 5;
    cards.beginFrame();
    cards.update(v, 1, 2000);
    expect(cards.held.visible).toBe(true);
    expect(
      cards.held.children[0].getWorldDirection(new T.Vector3()).y,
    ).toBeGreaterThan(0.8);
    cards.beginFrame();
    cards.update(v, 1, 2400);
    expect(cards.flight.visible).toBe(true);
    scene.updateWorldMatrix(true, true);
    expect(
      cards.flight.children[0].getWorldDirection(new T.Vector3()).y,
    ).toBeGreaterThan(0.99);
    const middle = cards.flight.position.clone();
    expect(middle.toArray().every(Number.isFinite)).toBe(true);
    cards.beginFrame();
    cards.update(v, 1, 2900);
    expect(cards.flight.visible).toBe(false);
    cards.beginFrame();
    cards.update(v, 1, 3100);
    expect(cards.held.visible).toBe(false);
    cards.dispose();
  });
  it("keeps a valid hand origin through a skipped release frame and cleans repeated mounts", async () => {
    const { scene } = await rig();
    scene.position.set(5, 0.8330894938951581, 69.64531356447997);
    scene.rotation.y = Math.PI;
    for (let cycle = 0; cycle < 2; cycle++) {
      const cards = createCruceCharacterRig(scene),
        v = view();
      cards.update(v, 0, 1000);
      v.trick = [{ seat: 0, card: 5, announcement: 0 }];
      v.handCounts[0] = 5;
      v.hand = v.hand.filter((c) => c !== 5);
      cards.beginFrame();
      cards.update(v, 0, 2000);
      cards.beginFrame();
      cards.update(v, 0, 2400);
      expect(cards.flight.visible).toBe(true);
      expect(cards.flight.position.length()).toBeLessThan(2);
      expect(cards.flight.position.y).toBeGreaterThan(0.7);
      let fans = 0;
      scene.traverse((o: T.Object3D) => {
        if (o.name === "Cruce hand fan") fans++;
      });
      expect(fans).toBe(1);
      cards.dispose();
      fans = 0;
      scene.traverse((o: T.Object3D) => {
        if (o.name === "Cruce hand fan") fans++;
      });
      expect(fans).toBe(0);
    }
  });
  it("allocates zero card nodes for idle characters and releases all resources on leaving", async () => {
    const { scene, grip } = await rig();
    let textures = 0;
    const controller = createCruceCharacterController(
      scene,
      () => {
        textures++;
        return null;
      },
      grip,
    );
    const count = () => {
      let n = 0;
      scene.traverse((o: T.Object3D) => {
        if (o instanceof T.Mesh) n++;
      });
      return n;
    };
    const base = count(),
      v = view();
    for (let i = 0; i < 50; i++) {
      controller.beginFrame();
      controller.update(v, null, i);
    }
    expect(count()).toBe(base);
    expect(textures).toBe(0);
    v.handCounts[0] = 0;
    controller.update(v, 0, 1000);
    expect(count()).toBe(base);
    for (let i = 0; i < 3; i++) {
      v.handCounts[0] = 6;
      controller.update(v, 0, 2000 + i * 1000);
      expect(count()).toBe(base + 24);
      const fan = scene.getObjectByName("Cruce hand fan")!,
        mesh = fan.children[0].children[0] as T.Mesh;
      let geometryDisposed = 0,
        materialDisposed = 0;
      mesh.geometry.addEventListener("dispose", () => geometryDisposed++);
      (mesh.material as T.Material).addEventListener(
        "dispose",
        () => materialDisposed++,
      );
      controller.beginFrame();
      controller.update(v, null, 2500 + i * 1000);
      expect(count()).toBe(base);
      expect(geometryDisposed).toBe(1);
      expect(materialDisposed).toBe(1);
    }
    controller.dispose();
    expect(count()).toBe(base);
    expect(textures).toBe(3);
  });
  it("keeps fifty idle avatars at their original mesh count without loading card resources", async () => {
    const { scene, grip } = await rig();
    let loads = 0;
    const avatars = Array.from({ length: 50 }, () => scene.clone(true));
    const meshes = () => {
      let count = 0;
      avatars.forEach((a) =>
        a.traverse((o: T.Object3D) => {
          if (o instanceof T.Mesh) count++;
        }),
      );
      return count;
    };
    const baseline = meshes();
    const controllers = avatars.map((a) =>
      createCruceCharacterController(
        a,
        () => {
          loads++;
          return null;
        },
        grip,
      ),
    );
    controllers.forEach((c) => {
      c.beginFrame();
      c.update(view(), null, 1000);
    });
    expect(meshes()).toBe(baseline);
    expect(loads).toBe(0);
    controllers.forEach((c) => c.dispose());
    expect(meshes()).toBe(baseline);
  });
});
