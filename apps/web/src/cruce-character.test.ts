import { describe, it, expect } from "vitest";
import * as T from "three";
import { readFileSync } from "node:fs";
import { createCruceCharacterRig } from "./cruce-character";
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
    expect(finger.quaternion.angleTo(originalFinger)).toBeGreaterThan(0.2);
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
});
