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
  return { scene, mixer };
}
describe("character-held Cruce cards", () => {
  it("raises real retained hands to chest level without changing limb lengths or accumulating pose", async () => {
    const { scene, mixer } = await rig();
    const cards = createCruceCharacterRig(scene);
    const h = scene.getObjectByName("hand_l")!;
    const baseline = h.quaternion.clone();
    const lengths = ["lowerarm_l", "hand_l", "lowerarm_r", "hand_r"].map((n) =>
      scene.getObjectByName(n)!.position.length(),
    );
    for (let i = 0; i < 150; i++) {
      cards.beginFrame();
      mixer.update(0.016);
      cards.update(view(), 0, 1000 + i * 16);
    }
    expect(cards.fan.visible).toBe(true);
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
});
