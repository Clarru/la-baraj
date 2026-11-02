/** Local-only acceptance harness using the real authority and two real clients. */
import React, {
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { useAnimations, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  RoomCore,
  type RoomConnection,
  type SessionState,
} from "../../apps/server/room-core";
import { HomeAssignments } from "../../apps/server/home-assignments";
import { AppearanceProfiles } from "../../apps/server/appearance-profiles";
import { MultiplayerRoom } from "../../apps/web/src/multiplayer";
import {
  HOUSING_EPOCH,
  type ClientMessage,
  type ServerMessage,
} from "../../packages/shared/protocol";
import {
  normalizeAppearance,
  DEFAULT_APPEARANCE,
  type Appearance,
} from "../../packages/shared/appearance";
import { AppearanceDialog } from "../../apps/web/src/AppearanceDialog";
import { assetUrl } from "../../apps/web/src/assets";
import {
  cloneCharacter,
  characterClips,
  disposeCharacterSkeletons,
} from "../../apps/web/src/character-resources";
import { useAvatarWardrobe } from "../../apps/web/src/use-avatar-wardrobe";
import "../../apps/web/src/style.css";
import "../../apps/web/src/game-art.css";
import "../../apps/web/src/mobile.css";

if (!["127.0.0.1", "localhost"].includes(location.hostname))
  throw Error("Wardrobe QA is localhost-only");
const connections: RoomConnection[] = [];
const stored = new Map<number, Appearance>();
const profiles = new AppearanceProfiles({
  save: async (owner, value) => {
    stored.set(owner, structuredClone(value));
  },
});
const core = new RoomCore({
  connections: () => connections,
  saveFire: async () => {},
  homes: new HomeAssignments({ save: async () => {} }),
  appearances: profiles,
});
const errors: string[] = [];
class PairedWardrobeRoom extends MultiplayerRoom {
  readonly connection: RoomConnection;
  constructor(
    readonly id: string,
    token: string,
  ) {
    super(id, false);
    this.connection = {
      state: null,
      setState(next: SessionState) {
        Object.assign(this, { state: structuredClone(next) });
      },
      send: (raw) => this.receive(JSON.parse(raw) as ServerMessage),
      close: (_code, reason) => {
        errors.push(reason);
      },
    };
    connections.push(this.connection);
    core.connect(this.connection, id);
    this.send({
      type: "hello",
      nickname: id,
      requestHome: true,
      createHome: true,
      resumeToken: token,
      housingEpoch: HOUSING_EPOCH,
    });
  }
  protected send(message: ClientMessage) {
    void core
      .message(this.connection, JSON.stringify(message))
      .catch((error) => errors.push(String(error)));
  }
}
const local = new PairedWardrobeRoom("Wardrobe local", "a".repeat(43));
const observer = new PairedWardrobeRoom("Wardrobe observer", "b".repeat(43));
type QA = {
  apply(value: unknown): Promise<string | null>;
  other(value: unknown): Promise<string | null>;
  inspect(): unknown;
  open(): void;
  animation(name: string): void;
  animations(): string[];
  crowd(count: number): void;
  stats(): unknown;
  view(kind: "full" | "head" | "rear" | "side"): void;
  models(): unknown;
};
declare global {
  interface Window {
    __wardrobeQA: QA;
  }
}
let setView = (_kind: "full" | "head" | "rear" | "side") => {};
const actorRoots = new Map<number, THREE.Object3D>();
let openEditor = () => {},
  setAnimation = (_name: string) => {},
  setCrowd = (_count: number) => {};
let animationNames: string[] = [];
let rendererStats: unknown = null;
window.__wardrobeQA = {
  apply: (value) => local.setAppearance(normalizeAppearance(value)),
  other: (value) => observer.setAppearance(normalizeAppearance(value)),
  inspect: () => ({
    local: local.getSnapshot().appearance,
    seenByObserver: observer.remotes.get(local.id)?.player.appearance,
    other: observer.getSnapshot().appearance,
    seenByLocal: local.remotes.get(observer.id)?.player.appearance,
    status: local.getSnapshot().status,
    stored: [...stored],
    errors,
  }),
  open: () => openEditor(),
  animation: (name) => setAnimation(name),
  animations: () => animationNames,
  crowd: (count) => setCrowd(Math.max(2, Math.min(50, Math.round(count)))),
  stats: () => rendererStats,
  view: (kind) => setView(kind),
  models: () =>
    [...actorRoots].map(([id, object]) => {
      const skeletons = new Set<THREE.Skeleton>();
      const materials: { name: string; color: number[] }[] = [];
      object.traverse((node) => {
        if (!(node instanceof THREE.SkinnedMesh) || !node.visible) return;
        skeletons.add(node.skeleton);
        for (const material of Array.isArray(node.material)
          ? node.material
          : [node.material])
          if (
            material instanceof THREE.MeshStandardMaterial &&
            /Hair|hair|Brunette/.test(material.name)
          )
            materials.push({
              name: material.name,
              color: material.color.toArray(),
            });
      });
      return { id, skeletons: skeletons.size, materials };
    }),
};
function Actor({
  id,
  appearance,
  x,
  z,
  animation,
}: {
  id: number;
  appearance: Appearance;
  x: number;
  z: number;
  animation: string;
}) {
  const { scene, animations } = useGLTF(assetUrl("Lakeside_Man"));
  const supplemental = useLoader(
    THREE.FileLoader,
    "/assets/animations/character-actions.json",
  );
  const object = useMemo(() => cloneCharacter(scene), [scene]);
  const clips = useMemo(
    () => characterClips(animations, String(supplemental)),
    [animations, supplemental],
  );
  const { actions } = useAnimations(clips, object);
  const { invalidate } = useThree();
  useAvatarWardrobe(object, appearance, (state) => {
    if (state.error) errors.push(state.error);
    invalidate();
  });
  useEffect(() => {
    animationNames = clips.map((clip) => clip.name);
  }, [clips]);
  useEffect(() => {
    const action = actions[animation] ?? actions.Idle_Neutral;
    action?.reset().play();
    return () => {
      action?.stop();
    };
  }, [actions, animation]);
  useEffect(() => () => disposeCharacterSkeletons(object), [object]);
  useEffect(() => {
    actorRoots.set(id, object);
    return () => {
      actorRoots.delete(id);
    };
  }, [id, object]);
  return (
    <group position={[x, 0, z]}>
      <primitive object={object} dispose={null} />
    </group>
  );
}
function InspectionCamera({
  kind,
}: {
  kind: "full" | "head" | "rear" | "side";
}) {
  const { camera } = useThree();
  useEffect(() => {
    const position: Record<typeof kind, [number, number, number]> = {
      full: [0, 2.5, 5.7],
      head: [0, 1.7, 2],
      rear: [0, 2.4, -5.7],
      side: [4.5, 1.7, 0],
    };
    camera.position.set(...position[kind]);
    camera.lookAt(0, kind === "head" ? 1.65 : kind === "full" ? 0 : 0.9, 0);
    camera.updateProjectionMatrix();
  }, [kind, camera]);
  return null;
}
function Metrics() {
  const { gl } = useThree();
  const last = useRef(performance.now()),
    frames = useRef<number[]>([]);
  useFrame(() => {
    const now = performance.now();
    frames.current.push(now - last.current);
    last.current = now;
    if (frames.current.length > 180) frames.current.shift();
    rendererStats = {
      ...gl.info.render,
      memory: { ...gl.info.memory },
      meanFrameMs:
        frames.current.reduce((sum, n) => sum + n, 0) / frames.current.length,
      canvas: [gl.domElement.width, gl.domElement.height],
    };
  });
  return null;
}
function Lab() {
  const localView = useSyncExternalStore(local.subscribe, local.getSnapshot);
  const otherView = useSyncExternalStore(
    observer.subscribe,
    observer.getSnapshot,
  );
  const remoteAppearance = useSyncExternalStore(
    observer.subscribeWorld,
    () =>
      observer.remotes.get(local.id)?.player.appearance ?? DEFAULT_APPEARANCE,
  );
  const [open, setOpen] = useState(false),
    [animation, setPose] = useState("Idle_Neutral"),
    [count, updateCount] = useState(2);
  const [view, updateView] = useState<"full" | "head" | "rear" | "side">(
    "full",
  );
  setView = updateView;
  openEditor = () => setOpen(true);
  setAnimation = setPose;
  setCrowd = updateCount;
  return (
    <div className="wardrobe-qa">
      <Canvas
        camera={{ position: [0, 2.5, 5.7], fov: 40 }}
        dpr={1}
        gl={{ antialias: true }}
      >
        <color attach="background" args={["#c7cebc"]} />
        <ambientLight intensity={1.2} />
        <directionalLight position={[3, 6, 4]} intensity={2.2} />
        {(view === "rear" || view === "side") && (
          <directionalLight position={[-3, 3, -4]} intensity={1.5} />
        )}
        <Suspense fallback={null}>
          {Array.from({ length: count }, (_, index) => (
            <Actor
              key={index}
              id={index}
              appearance={
                index === 1
                  ? remoteAppearance
                  : index === 2 && count === 3
                    ? otherView.appearance
                    : localView.appearance
              }
              x={
                count === 2
                  ? (index - 0.5) * 1.7
                  : count === 3
                    ? (index - 1) * 1.4
                    : ((index % 10) - 4.5) * 0.44
              }
              z={count <= 3 ? 0 : Math.floor(index / 10) * -0.55}
              animation={animation}
            />
          ))}
        </Suspense>
        <gridHelper args={[12, 12, "#a9b49c", "#b5bfaa"]} />
        <Metrics />
        <InspectionCamera kind={view} />
      </Canvas>
      <div className="wardrobe-qa-controls">
        <button
          onClick={() => setOpen(true)}
          disabled={localView.status !== "online"}
        >
          Open appearance
        </button>
        <span data-testid="wardrobe-network">{localView.status}</span>
      </div>
      {open && (
        <AppearanceDialog
          room={local}
          initial={localView.appearance}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
const style = document.createElement("style");
style.textContent =
  ".wardrobe-qa{position:fixed;inset:0;background:#c7cebc}.wardrobe-qa>div:first-child{height:100%}.wardrobe-qa-controls{position:absolute;left:16px;top:16px;display:flex;gap:12px;align-items:center}.wardrobe-qa-controls button{padding:12px 18px;background:#263b30;color:#fff5dc;font:600 16px var(--font-body);border-radius:6px}";
document.head.append(style);
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Lab />
  </React.StrictMode>,
);
