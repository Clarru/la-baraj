import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
} from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { OrbitControls, useGLTF } from "@react-three/drei";
import * as THREE from "three";
import {
  appearanceKey,
  DEFAULT_APPEARANCE,
  type Appearance,
  type MaleAppearance,
} from "../../../packages/shared/appearance";
import type { MultiplayerRoom } from "./multiplayer";
import { GameDialog } from "./GameMenu";
import {
  cloneCharacter,
  disposeCharacterSkeletons,
} from "./character-resources";
import { assetUrl } from "./assets";
import {
  useAvatarWardrobe,
  type WardrobeLoadState,
} from "./use-avatar-wardrobe";
import "./appearance.css";

type Category = "hair" | "hat" | "top" | "bottom" | "shoes";
type Focus = Category | "full";
const categories: { id: Category; label: string }[] = [
  { id: "hair", label: "Hair" },
  { id: "hat", label: "Hats" },
  { id: "top", label: "Tops" },
  { id: "bottom", label: "Bottoms" },
  { id: "shoes", label: "Shoes" },
];
const options: Record<Category, readonly (readonly [string, string])[]> = {
  hair: [
    ["parted", "Side part"],
    ["buzzed", "Buzz cut"],
    ["long", "Layered"],
  ],
  hat: [
    ["none", "No hat"],
    ["panel-cap", "Panel cap"],
    ["knit-beanie", "Knit beanie"],
    ["stitched-bucket", "Bucket hat"],
  ],
  top: [
    ["lake-workshirt", "Lake workshirt"],
    ["trail-overshirt", "Trail overshirt"],
    ["weekend-knit", "Weekend knit"],
  ],
  bottom: [
    ["classic", "Classic trousers"],
    ["trail-cargo", "Cargo trousers"],
    ["weekend-shorts", "Knee shorts"],
  ],
  shoes: [
    ["lake-boots", "Lake boots"],
    ["trail-hikers", "Trail boots"],
    ["canvas-low", "Canvas lace-ups"],
  ],
};
const hairSwatches = [
  ["brown", "Brown", "#594237"],
  ["black", "Black", "#24211f"],
  ["blond", "Blonde", "#c5a068"],
  ["auburn", "Auburn", "#914b35"],
  ["grey", "Silver", "#a4aaa8"],
] as const;
const clothSwatches = [
  ["original", "Original", "#9a977e"],
  ["navy", "Navy", "#34485b"],
  ["sage", "Sage", "#7c8d65"],
  ["charcoal", "Charcoal", "#4c5358"],
  ["cream", "Cream", "#dbc79e"],
  ["rust", "Rust", "#aa6445"],
] as const;
function Choices({
  values,
  selected,
  onChange,
  label,
}: {
  values: readonly (readonly [string, string])[];
  selected: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="appearance-options" role="group" aria-label={label}>
      {values.map(([id, title]) => (
        <button
          type="button"
          key={id}
          aria-pressed={selected === id}
          onClick={() => onChange(id)}
        >
          {title}
        </button>
      ))}
    </div>
  );
}
function Swatches({
  values,
  selected,
  onChange,
  label,
}: {
  values: readonly (readonly [string, string, string])[];
  selected: string;
  onChange: (id: string) => void;
  label: string;
}) {
  return (
    <div className="appearance-swatches" role="group" aria-label={label}>
      {values.map(([id, title, color]) => (
        <button
          type="button"
          key={id}
          aria-label={label + ": " + title}
          aria-pressed={id === selected}
          onClick={() => onChange(id)}
        >
          <span aria-hidden="true" style={{ backgroundColor: color }} />
          {title}
        </button>
      ))}
    </div>
  );
}
class PreviewBoundary extends Component<
  { children: ReactNode; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}
function PreviewFallback({
  onState,
}: {
  onState: (state: WardrobeLoadState) => void;
}) {
  useEffect(() => {
    onState({ loading: false, error: "3D preview is unavailable. Try again." });
  }, [onState]);
  return null;
}
function PreviewModel({
  appearance,
  focus,
  onState,
  retry,
  viewReset,
}: {
  appearance: Appearance;
  focus: Focus;
  onState: (state: WardrobeLoadState) => void;
  retry: number;
  viewReset: number;
}) {
  const { scene, animations } = useGLTF(assetUrl("Lakeside_Man"));
  const object = useMemo(() => cloneCharacter(scene), [scene]);
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null);
  const { camera, invalidate } = useThree();
  const views: Record<Focus, [number, number]> = {
    full: [0.9, 4.2],
    hair: [1.62, 1.4],
    hat: [1.69, 1.4],
    top: [1.27, 2.2],
    bottom: [0.72, 2.3],
    shoes: [0.19, 1.25],
  };
  const [height, distance] = views[focus];
  useAvatarWardrobe(
    object,
    appearance,
    (state) => {
      onState(state);
      invalidate();
    },
    undefined,
    retry,
  );
  useEffect(() => {
    const mixer = new THREE.AnimationMixer(object);
    const clip = animations.find((clip) => clip.name === "Idle_Neutral");
    if (clip) {
      mixer.clipAction(clip).play();
      mixer.setTime(0.5);
    }
    invalidate();
    return () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(object);
      disposeCharacterSkeletons(object);
    };
  }, [object, animations, invalidate]);
  useEffect(() => {
    camera.position.set(
      distance * 0.4,
      height + distance * 0.14,
      distance * 0.9,
    );
    controls.current?.target.set(0, height, 0);
    controls.current?.update();
    invalidate();
  }, [height, distance, camera, invalidate, viewReset]);
  return (
    <>
      <ambientLight intensity={1.2} />
      <directionalLight position={[3, 5, 4]} intensity={2.2} />
      <directionalLight position={[-3, 2, -3]} intensity={1.1} />
      <primitive object={object} dispose={null} />
      <OrbitControls
        ref={controls}
        enablePan={false}
        enableZoom={false}
        enableDamping={false}
        minPolarAngle={0.65}
        maxPolarAngle={1.8}
        target={[0, height, 0]}
      />
    </>
  );
}
export function AppearanceDialog({
  room,
  initial,
  onClose,
}: {
  room: MultiplayerRoom;
  initial: Appearance;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState<Appearance>(() => initial);
  const male = useRef<MaleAppearance>(
    initial.body === "male" ? { ...initial } : { ...DEFAULT_APPEARANCE },
  );
  const [category, setCategory] = useState<Category>("hair");
  const [focus, setFocus] = useState<Focus>("full");
  const [retry, setRetry] = useState(0);
  const [viewReset, setViewReset] = useState(0);
  const [preview, setPreview] = useState<WardrobeLoadState>({
    loading: true,
    error: null,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  function change<K extends keyof MaleAppearance>(
    key: K,
    value: MaleAppearance[K],
  ) {
    if (draft.body !== "male") return;
    const next = { ...draft, [key]: value };
    male.current = next;
    setDraft(next);
    setSaveError(null);
  }
  function body(next: "male" | "female") {
    if (draft.body === "male") male.current = { ...draft };
    setDraft(
      next === "female" ? { version: 1, body: "female" } : { ...male.current },
    );
    setFocus("full");
    setSaveError(null);
  }
  const changed = appearanceKey(initial) !== appearanceKey(draft);
  const network = room.getSnapshot();
  async function apply() {
    setSaving(true);
    setSaveError(null);
    const error = await room.setAppearance(draft);
    if (!mounted.current) return;
    setSaving(false);
    if (error) setSaveError(error);
    else onClose();
  }
  const canSave = network.status === "online" && network.appearanceAvailable;
  return (
    <GameDialog
      title="Appearance"
      className="appearance-dialog"
      onClose={onClose}
      closeDisabled={saving}
    >
      <div className="appearance-body">
        <div className="appearance-preview" aria-label="Character preview">
          <PreviewBoundary
            key={retry}
            onError={() =>
              setPreview({
                loading: false,
                error: "The preview could not open. Try again.",
              })
            }
          >
            <Canvas
              frameloop="demand"
              dpr={[1, 1.5]}
              camera={{ position: [1.7, 1.5, 3.8], fov: 32 }}
              gl={{
                antialias: true,
                alpha: true,
                powerPreference: "low-power",
              }}
              fallback={<PreviewFallback onState={setPreview} />}
            >
              <Suspense fallback={null}>
                <PreviewModel
                  appearance={draft}
                  focus={focus}
                  onState={setPreview}
                  retry={retry}
                  viewReset={viewReset}
                />
              </Suspense>
            </Canvas>
          </PreviewBoundary>
          <p className="appearance-turn-hint">Drag to turn</p>
          <div className="appearance-preview-tools">
            <button type="button" onClick={() => setFocus("full")}>
              Full look
            </button>
            <button type="button" onClick={() => setViewReset((n) => n + 1)}>
              Reset view
            </button>
          </div>
          {(preview.loading || preview.error) && (
            <div className="appearance-preview-status" aria-live="polite">
              {preview.loading ? (
                "Loading look…"
              ) : (
                <>
                  <span>{preview.error}</span>
                  <button type="button" onClick={() => setRetry((n) => n + 1)}>
                    Retry
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        <div className="appearance-controls">
          <h3>Character</h3>
          <Choices
            label="Character"
            values={[
              ["male", "Male"],
              ["female", "Female"],
            ]}
            selected={draft.body}
            onChange={(id) => body(id as "male" | "female")}
          />
          {draft.body === "male" ? (
            <>
              <nav
                className="appearance-categories"
                aria-label="Appearance categories"
              >
                {categories.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    aria-pressed={category === item.id}
                    onClick={() => {
                      setCategory(item.id);
                      setFocus(item.id);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </nav>
              <h3>{categories.find((item) => item.id === category)!.label}</h3>
              <Choices
                label={category}
                values={options[category]}
                selected={draft[category]}
                onChange={(id) =>
                  change(category, id as MaleAppearance[Category])
                }
              />
              {category === "hair" && (
                <>
                  <h3>Facial hair</h3>
                  <Choices
                    label="Facial hair"
                    values={[
                      ["none", "Clean shaven"],
                      ["full", "Full beard"],
                      ["short", "Short beard"],
                      ["moustache", "Moustache"],
                    ]}
                    selected={draft.beard}
                    onChange={(id) =>
                      change("beard", id as MaleAppearance["beard"])
                    }
                  />
                  <h3>Hair color</h3>
                  <Swatches
                    label="Hair color"
                    values={hairSwatches}
                    selected={draft.hairColor}
                    onChange={(id) =>
                      change("hairColor", id as MaleAppearance["hairColor"])
                    }
                  />
                </>
              )}
              {category === "hat" && draft.hat !== "none" && (
                <>
                  <h3>Hat color</h3>
                  <Swatches
                    label="Hat color"
                    values={clothSwatches}
                    selected={draft.hatColor}
                    onChange={(id) =>
                      change("hatColor", id as MaleAppearance["hatColor"])
                    }
                  />
                </>
              )}
              {((category === "top" && draft.top !== "lake-workshirt") ||
                category === "bottom") && (
                <>
                  <h3>{category === "top" ? "Top color" : "Trouser color"}</h3>
                  <Swatches
                    label={category === "top" ? "Top color" : "Trouser color"}
                    values={clothSwatches}
                    selected={
                      category === "top" ? draft.topColor : draft.bottomColor
                    }
                    onChange={(id) =>
                      change(
                        category === "top" ? "topColor" : "bottomColor",
                        id as MaleAppearance["topColor"],
                      )
                    }
                  />
                </>
              )}
            </>
          ) : (
            <div className="appearance-female-details">
              <h3>Brunette</h3>
              <p>
                A tailored black blazer, high-neck top tucked into shorts, sheer
                tights and pointed heels.
              </p>
              <button type="button" onClick={() => setFocus("full")}>
                View full outfit
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="appearance-save-status" aria-live="polite">
        {saveError || (!canSave ? "Reconnect to apply your look." : "")}
      </div>
      <footer className="appearance-footer">
        <button
          className="appearance-reset"
          type="button"
          disabled={saving}
          onClick={() => {
            male.current = { ...DEFAULT_APPEARANCE };
            setDraft({ ...DEFAULT_APPEARANCE });
            setFocus("full");
            setSaveError(null);
          }}
        >
          Reset look
        </button>
        <button type="button" disabled={saving} onClick={onClose}>
          Cancel
        </button>
        <button
          className="appearance-apply"
          type="button"
          disabled={
            saving ||
            preview.loading ||
            Boolean(preview.error) ||
            !changed ||
            !canSave
          }
          onClick={() => void apply()}
        >
          {saving ? "Saving…" : "Apply look"}
        </button>
      </footer>
    </GameDialog>
  );
}
