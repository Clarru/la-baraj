import {
  Component,
  Suspense,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import {
  ArrowDown as ArrowDownToLine,
  ArrowLeft,
  ArrowUpRight,
  Check,
  CaretRight as ChevronRight,
  PersonSimpleWalk as Footprints,
  UserFocus,
  HouseLine,
  Stack as Layers,
  Leaf,
  MapTrifold as Map,
  ArrowsOutSimple as Maximize2,
  Minus,
  Plus,
  ArrowCounterClockwise as RotateCcw,
  Sun,
  SunHorizon as Sunset,
  UsersThree as Users,
  X,
} from "@phosphor-icons/react";
import * as THREE from "three";
import {
  Terrain,
  LakeWater,
  LakeBoundary,
  Roads,
  Vegetation,
  environmentCounts,
  sunDirection,
} from "./environment";
import { Settlement } from "./settlement";
import { WorldActivities, type ActivityPrompt } from "./activities";
import { SceneLoading } from "./SceneLoading";
import { ParkedScooter } from "./scooter";
import { SeatingMetrics } from "./SeatingMetrics";
import { CabinInterior } from "./CabinInterior";
import { CabinAccess } from "./CabinAccess";
import { HomeMarker } from "./HomeMarker";
import { Minimap } from "./Minimap";
import { readLocalHome, type NavigationSample } from "./home";
import {
  CabinGroundContacts,
  type GroundContactsSummary,
} from "./CabinGroundContacts";
import { Player, CameraRig, Crowd, type ViewMode } from "./player";
import { MultiplayerRoom } from "./multiplayer";
import { MultiplayerPlayers } from "./multiplayer-players";
import { MultiplayerHud } from "./multiplayer-hud";
export const inventory = [
  ["Terrain", "Procedural height proxy over the real lake layout", "custom"],
  ["Shore", "Geographic water edge and terrain color transition", "custom"],
  ["Water", "Reflective water · procedural normals · matched sun", "custom"],
  ["Roads", "Real OpenStreetMap centerlines, rendered locally", "data"],
  ["Footpaths", "Purpose-built cabin access routes", "pending"],
  ["Broadleaf trees", "Quaternius Nature · CommonTree 1 and 3", "imported"],
  ["Conifers", "Quaternius Nature · Pine 2 and 4", "imported"],
  ["Shrubs", "Quaternius Nature · Bush Common", "imported"],
  [
    "Grass and ground plants",
    "Quaternius Nature · grass, fern, flowers",
    "imported",
  ],
  ["Rocks", "Quaternius Nature · two textured rock variants", "imported"],
  ["Fallen timber", "Logs and stumps for the forest floor", "pending"],
  [
    "Cabins",
    "Three Blender cabin archetypes reconstructed from imagegen references",
    "custom",
  ],
  ["Docks", "Custom plank and pillar assembly", "custom"],
  ["Fences", "Quaternius Village · wooden fence", "imported"],
  ["Benches", "Quaternius Props · bench", "imported"],
  ["Outdoor tables", "Quaternius Props · large table", "imported"],
  ["Exterior lights", "Quaternius Props · wall lantern", "imported"],
  ["Fire pit", "Shared campfire circle · press E nearby", "custom"],
  ["Storage props", "Quaternius Props · barrel and wooden crate", "imported"],
  ["Signs", "Stable cabin numbers", "custom"],
] as const;
export type Metrics = {
  fps: number;
  frameMs: number;
  p95: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  pixelRatio: number;
  width: number;
  height: number;
  samples: number;
};
const initialMetrics: Metrics = {
  fps: 0,
  frameMs: 0,
  p95: 0,
  calls: 0,
  triangles: 0,
  geometries: 0,
  textures: 0,
  pixelRatio: 1,
  width: 0,
  height: 0,
  samples: 0,
};
function Measurement({ onMetrics }: { onMetrics: (m: Metrics) => void }) {
  const frames = useRef<number[]>([]),
    elapsed = useRef(0);
  const { gl, size } = useThree();
  useEffect(() => {
    gl.info.autoReset = false;
    return () => {
      gl.info.autoReset = true;
    };
  }, [gl]);
  useFrame((_, delta) => {
    if (document.hidden) return;
    if (delta > 0 && delta < 0.5) {
      frames.current.push(delta * 1000);
      if (frames.current.length > 600) frames.current.shift();
      elapsed.current += delta;
    }
    if (elapsed.current >= 1) {
      elapsed.current = 0;
      const sorted = [...frames.current].sort((a, b) => a - b);
      const avg =
        frames.current.reduce((a, b) => a + b, 0) / frames.current.length;
      onMetrics({
        fps: 1000 / avg,
        frameMs: avg,
        p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
        calls: gl.info.render.calls,
        triangles: gl.info.render.triangles,
        geometries: gl.info.memory.geometries,
        textures: gl.info.memory.textures,
        pixelRatio: gl.getPixelRatio(),
        width: size.width,
        height: size.height,
        samples: frames.current.length,
      });
    }
    gl.info.reset();
  });
  return null;
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { error: string | null }
> {
  state = { error: null as string | null };
  static getDerivedStateFromError(error: Error) {
    return { error: error.message };
  }
  render() {
    return this.state.error ? (
      <div className="loading-screen">
        <h1>The lake couldn't load.</h1>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
function format(n: number) {
  return Intl.NumberFormat("en", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(n);
}
export default function App() {
  const [room] = useState(() => new MultiplayerRoom());
  useEffect(() => room.connect(), [room]);
  const [mode, setMode] = useState<ViewMode>("walk"),
    [flat, setFlat] = useState(false),
    [evening, setEvening] = useState(false),
    [crowd, setCrowd] = useState(false),
    [inventoryOpen, setInventoryOpen] = useState(false),
    [metrics, setMetrics] = useState(initialMetrics),
    [resetKey, setResetKey] = useState(0),
    [moving, setMoving] = useState(false),
    [ready, setReady] = useState(false),
    [info, setInfo] = useState(false);
  const [foundationMetrics, setFoundationMetrics] =
    useState<GroundContactsSummary | null>(null);
  const [activityPrompt, setActivityPrompt] = useState<ActivityPrompt>(null);
  const [activityBusy, setActivityBusy] = useState(false);
  const [vehicleMounted, setVehicleMounted] = useState(false),
    [scooterNear, setScooterNear] = useState(false);
  const [interiorIndex, setInteriorIndex] = useState<number | null>(null);
  const [focusedCabinIndex, setFocusedCabinIndex] = useState(18);
  const [doorTransition, setDoorTransition] = useState(false);
  const [doorPromptVisible, setDoorPromptVisible] = useState(false);
  const displayedPrompt: ActivityPrompt =
    interiorIndex !== null
      ? null
      : vehicleMounted
        ? {
            main: "QuickVolt 9",
            detail: "W accelerate · S brake · A/D steer · V park",
            key: "V",
          }
        : (activityPrompt ??
          (scooterNear
            ? {
                main: "Ride QuickVolt 9",
                detail: "Electric scooter · faster travel",
                key: "V",
              }
            : null));
  const runId = useMemo(
    () => crypto.randomUUID(),
    [mode, flat, evening, crowd, resetKey],
  );
  const [homeIndex] = useState(() => readLocalHome());
  const [navigation, setNavigation] = useState<NavigationSample>({
    x: 45,
    z: 27,
    heading: 0,
  });
  const fireOutput = useRef<HTMLOutputElement>(null);
  const updateFireMetrics = useCallback((sample: unknown) => {
    fireOutput.current?.setAttribute("data-fire", JSON.stringify(sample));
  }, []);
  const motionOutput = useRef<HTMLOutputElement>(null);
  const updateMotion = useCallback((sample: Record<string, unknown>) => {
    room.publishMotion(sample);
    motionOutput.current?.setAttribute("data-motion", JSON.stringify(sample));
    if (Array.isArray(sample.position) && Array.isArray(sample.facing)) {
      const p = sample.position,
        f = sample.facing;
      setNavigation({
        x: Number(p[0]),
        z: Number(p[2]),
        heading: Math.atan2(Number(f[0]), Number(f[2])),
      });
    }
  }, [room]);
  const integrated = inventory.filter((i) => i[2] !== "pending").length;
  const updateMetrics = useCallback((m: Metrics) => {
    setMetrics(m);
    setReady(true);
  }, []);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        setInventoryOpen(false);
        setInfo(false);
      }
      if (
        e.code === "KeyH" &&
        interiorIndex === null &&
        !(e.target instanceof HTMLInputElement)
      )
        setMode("home");
      if (e.code === "KeyR" && !(e.target instanceof HTMLInputElement))
        setResetKey((k) => k + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [interiorIndex]);
  function download() {
    const result = {
      runId,
      counters:
        "Previous complete frame across main/reflection/shadow passes; timing is a rolling window",
      sampleSeconds: (metrics.samples * metrics.frameMs) / 1000,
      capturedAt: new Date().toISOString(),
      scope:
        "Local environment rendering test, not multiplayer load or final hardware certification",
      userAgent: navigator.userAgent,
      mode,
      textures: !flat,
      lighting: evening ? "evening" : "afternoon",
      avatars: crowd ? 30 : 1,
      localRenderTestAvatars: crowd ? 30 : 1,
      onlinePlayerCount: room.getSnapshot().count,
      coverage: {
        integrated,
        total: inventory.length,
        fraction: integrated / inventory.length,
      },
      metrics,
      environmentCounts,
    };
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "la-baraj-feasibility-metrics.json";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main
      className="game-shell"
      data-view={mode}
      data-interior={interiorIndex !== null}
    >
      <SceneBoundary>
        <Suspense fallback={<SceneLoading />}>
          <Canvas
            shadows
            dpr={[1, 1.5]}
            camera={{ position: [58, 35, 72], fov: 48, near: 0.1, far: 6000 }}
            gl={{
              antialias: true,
              powerPreference: "high-performance",
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 0.92,
            }}
          >
            <color
              attach="background"
              args={[
                interiorIndex !== null
                  ? "#121918"
                  : evening
                    ? "#becbc8"
                    : "#cadfd8",
              ]}
            />
            <fog
              attach="fog"
              args={[evening ? "#becbc8" : "#cadfd8", 380, 3300]}
            />
            <group visible={interiorIndex === null}>
              <Sky
                distance={10000}
                sunPosition={sunDirection(evening)
                  .multiplyScalar(1000)
                  .toArray()}
                inclination={0.5}
                azimuth={0.25}
                turbidity={2.8}
                rayleigh={1.9}
              />
            </group>
            <hemisphereLight
              args={[
                "#eef1db",
                "#7c8458",
                interiorIndex !== null ? 0.65 : evening ? 0.55 : 0.75,
              ]}
            />
            <ambientLight intensity={0.08} />
            <directionalLight
              position={sunDirection(evening).multiplyScalar(150).toArray()}
              color={evening ? "#ffce98" : "#ffe2b3"}
              intensity={interiorIndex !== null ? 1.3 : evening ? 2.4 : 3.3}
              castShadow
              shadow-mapSize={[2048, 2048]}
              shadow-camera-left={-110}
              shadow-camera-right={110}
              shadow-camera-top={90}
              shadow-camera-bottom={-90}
              shadow-camera-near={1}
              shadow-camera-far={240}
              shadow-bias={-0.0004}
              shadow-normalBias={0.04}
            />
            <Physics timeStep={1 / 60} gravity={[0, -12, 0]}>
              <group visible={interiorIndex === null}>
                <Terrain />
                <Roads />
                <LakeWater evening={evening} />
                <LakeBoundary />
                <Vegetation flat={flat} />
                <Settlement flat={flat} interiorIndex={interiorIndex} />
              </group>
              {interiorIndex !== null && (
                <CabinInterior index={interiorIndex} />
              )}
              <group visible={interiorIndex === null}>
                <CabinGroundContacts onReady={setFoundationMetrics} />
              </group>
              <Player
                mode={mode}
                resetKey={resetKey}
                paused={inventoryOpen || info || activityBusy || doorTransition}
                onMove={setMoving}
                onMotion={updateMotion}
                onVehicleChange={setVehicleMounted}
                onVehicleHint={setScooterNear}
                indoors={interiorIndex !== null}
              />
              <group visible={interiorIndex === null}>
                <Crowd enabled={crowd} />
                <MultiplayerPlayers room={room} />
                <ParkedScooter />
                <WorldActivities
                  room={room}
                  onFireMetrics={updateFireMetrics}
                  resetKey={resetKey}
                  paused={
                    inventoryOpen ||
                    info ||
                    mode !== "walk" ||
                    interiorIndex !== null
                  }
                  onPrompt={setActivityPrompt}
                  onBusy={setActivityBusy}
                />
              </group>
            </Physics>
            <HomeMarker
              index={homeIndex}
              visible={
                interiorIndex === null && (mode === "walk" || mode === "home")
              }
            />
            <CameraRig
              mode={mode}
              resetKey={resetKey}
              homeIndex={homeIndex}
              interiorIndex={interiorIndex}
              onFocusCabin={setFocusedCabinIndex}
              transitioning={doorTransition}
            />
            <Measurement key={runId} onMetrics={updateMetrics} />
          </Canvas>
        </Suspense>
      </SceneBoundary>
      {ready && (
        <div className="hud">
          <MultiplayerHud room={room} />
          <Minimap
            navigation={navigation}
            homeIndex={homeIndex}
            active={
              interiorIndex === null &&
              (mode === "walk" || mode === "home") &&
              !inventoryOpen &&
              !info
            }
            onFocusHome={() => setMode("home")}
          />
          <CabinAccess
            interiorIndex={interiorIndex}
            homeIndex={homeIndex}
            focusedIndex={focusedCabinIndex}
            mode={mode}
            resetKey={resetKey}
            paused={inventoryOpen || info}
            busy={activityBusy}
            vehicleMounted={vehicleMounted}
            onChange={setInteriorIndex}
            onTransition={setDoorTransition}
            onWalk={() => setMode("walk")}
            onPromptVisible={setDoorPromptVisible}
          />
          <header className="topbar">
            <div className="place-plaque">
              <div className="place-icon">
                <Map size={29} weight="duotone" />
              </div>
              <div>
                <h1>
                  {interiorIndex === null
                    ? "La Baraj"
                    : `Cabin ${String(interiorIndex + 1).padStart(2, "0")}`}
                </h1>
                <p>
                  {interiorIndex === null ? "Lake Cinciș" : "Inside"}{" "}
                  <span>/</span>{" "}
                  {interiorIndex === null
                    ? "World study"
                    : interiorIndex === homeIndex
                      ? "Your cabin"
                      : "Cabin interior"}
                </p>
              </div>
            </div>
            <div className="top-actions">
              <div className="test-badge">WORLD TEST</div>
              <button
                className={`icon-button ${inventoryOpen ? "selected" : ""}`}
                aria-label="Open asset inventory"
                onClick={() => {
                  setInventoryOpen((v) => !v);
                  setInfo(false);
                }}
                title="Asset inventory"
              >
                <Layers size={19} />
              </button>
              <button
                className="icon-button"
                aria-label="Reset position and camera"
                onClick={() => setResetKey((k) => k + 1)}
                title="Reset position and camera"
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </header>
          <div className="side-tools">
            <button
              className={evening ? "tool active" : "tool"}
              aria-label={
                evening
                  ? "Switch to afternoon light"
                  : "Switch to evening light"
              }
              onClick={() => setEvening((v) => !v)}
              title="Change light"
            >
              {evening ? <Sunset size={19} /> : <Sun size={19} />}
            </button>
            <button
              className={crowd ? "tool active" : "tool"}
              aria-label={
                crowd ? "Disable local 30-character rendering test" : "Enable local 30-character rendering test"
              }
              aria-pressed={crowd}
              onClick={() => setCrowd((v) => !v)}
              title="Local 30-character rendering test · 29 extra characters, excluded from Online"
            >
              <Users size={19} />
              <span>{crowd ? "30" : "1"}</span>
            </button>
            <button
              className={flat ? "tool active" : "tool"}
              aria-label={
                flat ? "Enable textured materials" : "Compare without textures"
              }
              aria-pressed={!flat}
              onClick={() => setFlat((v) => !v)}
              title="Compare with / without textures"
            >
              <Layers size={19} />
            </button>
          </div>
          <div className="location-readout">
            <strong>SOUTH SHORE</strong>
            <span>5× larger geography / Human-scale buildings</span>
            <button
              className="text-link"
              onClick={() => {
                setInfo(true);
                setInventoryOpen(false);
              }}
            >
              Scene notes <ArrowUpRight size={15} />
            </button>
          </div>
          <div className="navigation-dock">
            <div className="view-switch" aria-label="Camera mode">
              <button
                className={mode === "overview" ? "active" : ""}
                aria-pressed={mode === "overview"}
                onClick={() => setMode("overview")}
              >
                <Map size={17} />
                Survey view
              </button>
              <button
                className={mode === "settlement" ? "active" : ""}
                aria-pressed={mode === "settlement"}
                onClick={() => setMode("settlement")}
              >
                <HouseLine size={17} />
                Cabins
              </button>
              <button
                className={mode === "home" ? "active" : ""}
                aria-pressed={mode === "home"}
                onClick={() => setMode("home")}
                title="H to look at your cabin"
              >
                <HouseLine size={17} />
                Home
              </button>
              <button
                className={mode === "walk" ? "active" : ""}
                aria-pressed={mode === "walk"}
                onClick={() => setMode("walk")}
              >
                <Footprints size={17} />
                On foot
              </button>
              <button
                className={mode === "study" ? "active" : ""}
                aria-pressed={mode === "study"}
                onClick={() => setMode("study")}
              >
                <UserFocus size={17} />
                Character
              </button>
            </div>
            <p className="controls-hint">
              {mode === "walk" ? (
                vehicleMounted ? (
                  <>
                    <kbd>W</kbd>
                    <span>accelerate</span>
                    <kbd>S</kbd>
                    <span>brake</span>
                    <kbd>A</kbd>
                    <kbd>D</kbd>
                    <span>steer</span>
                    <kbd>Shift</kbd>
                    <span>boost</span>
                    <kbd>V</kbd>
                    <span>park</span>
                  </>
                ) : (
                  <>
                    <kbd>W</kbd>
                    <kbd>A</kbd>
                    <kbd>S</kbd>
                    <kbd>D</kbd>
                    <span>move</span>
                    <kbd>Shift</kbd>
                    <span>run</span>
                    <kbd>Space</kbd>
                    <span>jump</span>
                    {interiorIndex === null && (
                      <>
                        <kbd>V</kbd>
                        <span>scooter</span>
                      </>
                    )}
                    <span className="hint-break">Drag to look</span>
                  </>
                )
              ) : (
                <>
                  {mode === "settlement" ? (
                    <>
                      <kbd>1</kbd>
                      <kbd>2</kbd>
                      <kbd>3</kbd>
                      <kbd>4</kbd>
                      <kbd>5</kbd>
                      <kbd>6</kbd>
                      <span>choose cabin</span>
                      <span>·</span>
                    </>
                  ) : null}
                  Drag to orbit <span>·</span> Scroll to zoom
                </>
              )}
            </p>
          </div>
          <button
            className="coverage-pill"
            onClick={() => setInventoryOpen((v) => !v)}
            aria-label="View feasibility coverage"
          >
            <span className="coverage-ring">
              {(integrated / 20) * 100}
              <small>%</small>
            </span>
            <span>
              <strong>{integrated} of 20 asset families</strong>
              <small>Feasibility coverage</small>
            </span>
            <ChevronRight size={17} />
          </button>
          {displayedPrompt && !doorPromptVisible && (
            <div
              className="activity-prompt"
              role="status"
              data-testid="activity-prompt"
            >
              {displayedPrompt.key && <kbd>{displayedPrompt.key}</kbd>}
              <div>
                <strong>{displayedPrompt.main}</strong>
                <span>{displayedPrompt.detail}</span>
              </div>
            </div>
          )}
          <SeatingMetrics />
          <output
            data-testid="foundation-metrics"
            data-foundations={JSON.stringify(foundationMetrics)}
            hidden
          />
          <output ref={fireOutput} data-testid="fire-metrics" hidden />
          <output ref={motionOutput} data-testid="movement-metrics" hidden />
          <footer className="world-footer">
            <span>
              Local prototype <span>·</span>{" "}
              {interiorIndex === null ? "Elevation proxy" : "Cabin interior"}
            </span>
            <a
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer"
            >
              © OpenStreetMap contributors
            </a>
            <output
              aria-label="Live rendering metrics"
              data-testid="render-metrics"
              data-sample-ready={metrics.samples >= 600 ? "true" : "false"}
              data-metrics={JSON.stringify(metrics)}
              data-run={JSON.stringify({
                runId,
                mode,
                sample: {
                  kind: "rolling latest 600 settled frames",
                  samples: metrics.samples,
                  seconds: (metrics.samples * metrics.frameMs) / 1000,
                  excludeStallsAboveMs: 500,
                },
                counters:
                  "previous complete frame across main, reflection and shadow passes",
                cameraPreset: mode,
                textured: !flat,
                evening,
                avatars: crowd ? 30 : 1,
                userAgent: navigator.userAgent,
              })}
            >
              {Math.round(metrics.fps)} fps <span>·</span>{" "}
              {format(metrics.triangles)} triangles <span>·</span>{" "}
              {metrics.calls} draws <span>·</span>{" "}
              {crowd ? "30 local test avatars" : "1 local avatar"}
            </output>
          </footer>
          {inventoryOpen && (
            <aside
              className="inventory-panel"
              aria-label="Asset feasibility inventory"
            >
              <div className="panel-heading">
                <div>
                  <h2>World inventory</h2>
                  <p>{integrated}/20 families assembled in this scene.</p>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close inventory"
                  onClick={() => setInventoryOpen(false)}
                >
                  <X size={19} />
                </button>
              </div>
              <div className="inventory-legend">
                <span>
                  <i className="import-dot" />
                  Imported
                </span>
                <span>
                  <i className="custom-dot" />
                  Built
                </span>
                <span>
                  <i className="mixed-dot" />
                  Mixed
                </span>
                <span>
                  <i className="map-dot" />
                  Map data
                </span>
                <span>
                  <i className="pending-dot" />
                  Untested
                </span>
              </div>
              <div className="inventory-list">
                {inventory.map(([name, detail, status]) => (
                  <div className={`inventory-row ${status}`} key={name}>
                    <div className="inventory-check">
                      {status === "pending" ? (
                        <Minus size={13} />
                      ) : (
                        <Check size={13} />
                      )}
                    </div>
                    <div>
                      <strong>{name}</strong>
                      <p>{detail}</p>
                    </div>
                    <span className="inventory-tag">
                      {
                        {
                          data: "Map data",
                          imported: "Imported",
                          custom: "Built",
                          mixed: "Mixed",
                          pending: "Untested",
                        }[status]
                      }
                    </span>
                  </div>
                ))}
              </div>
              <div className="panel-foot">
                <p>
                  Quaternius assets · Blender character and tree bakes.
                  <br />
                  This measures environment coverage, not game completion.
                </p>
                <button onClick={download}>
                  <ArrowDownToLine size={16} />
                  Save test metrics
                </button>
              </div>
            </aside>
          )}
          {info && (
            <aside className="info-panel" aria-label="About this scene">
              <button
                className="icon-button"
                aria-label="Close scene notes"
                onClick={() => setInfo(false)}
              >
                <X size={19} />
              </button>
              <Leaf size={24} />
              <h2>
                Scene notes.
                <br />
                Asset feasibility test.
              </h2>
              <p>
                This is a real-time asset experiment for La Baraj: imported
                trees, rocks, furniture, cabin parts, and an animated character,
                assembled in one light and scale.
              </p>
              <p>
                The lake and roads come from the actual map. The terrain heights
                are a procedural stand-in. Distances use uniform 0.75× real
                horizontal scale, five times the first test. Cabins sit only on
                the south side.
              </p>
              <p>
                The 30-character button adds local rendering test characters.
                The Online count shows real friends in this room. Invite friends
                with Copy invite. Fishing catches stay in this browser; cabin
                ownership and punches are not implemented.
              </p>
              <button
                className="primary-button"
                onClick={() => {
                  setInfo(false);
                  setMode("walk");
                }}
              >
                Take a walk <Footprints size={17} />
              </button>
            </aside>
          )}
        </div>
      )}
    </main>
  );
}
