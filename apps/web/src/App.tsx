import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import { Physics } from "@react-three/rapier";
import { GameIcon } from "./GameArt";
import * as THREE from "three";
import {
  Terrain,
  LakeWater,
  LakeBoundary,
  Roads,
  Vegetation,
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
import {
  displayedHomeIndex,
  readLocalHome,
  type NavigationSample,
} from "./home";
import { cabinSpots } from "./geography";
import {
  CabinGroundContacts,
  type GroundContactsSummary,
} from "./CabinGroundContacts";
import { Player, CameraRig, Crowd, type ViewMode } from "./player";
import { MultiplayerRoom } from "./multiplayer";
import { MultiplayerPlayers } from "./multiplayer-players";
import { ControlsHelp, GameHeader, GameMenu } from "./GameMenu";
import { captureGameKey, type GamePanel } from "./game-input";
import {
  DeveloperMeasurement,
  DeveloperTools,
  type RenderSample,
} from "./DeveloperTools";

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
        <h1>The lake couldn’t load.</h1>
        <p>{this.state.error}</p>
        <button onClick={() => location.reload()}>Try again</button>
      </div>
    ) : (
      this.props.children
    );
  }
}
const ignoreMovement = () => {};
function SceneReady({ onReady }: { onReady: () => void }) {
  const reported = useRef(false);
  useFrame(() => {
    if (!reported.current) {
      reported.current = true;
      onReady();
    }
  });
  return null;
}
export default function App() {
  const [room] = useState(() => new MultiplayerRoom());
  useEffect(() => room.connect(), [room]);
  const roomView = useSyncExternalStore(room.subscribe, room.getSnapshot);
  const [localHomeIndex] = useState(() =>
    readLocalHome(undefined, { roomId: room.roomId }),
  );
  const homeIndex = displayedHomeIndex(roomView.homeIndex, localHomeIndex);
  const [mode, setMode] = useState<ViewMode>("walk");
  const [flat, setFlat] = useState(false),
    [evening, setEvening] = useState(false),
    [crowd, setCrowd] = useState(false);
  const [metrics, setMetrics] = useState<RenderSample | null>(null);
  const [resetKey, setResetKey] = useState(0),
    [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<GamePanel>(null),
    [mapOpen, setMapOpen] = useState(false);
  const [foundationMetrics, setFoundationMetrics] =
    useState<GroundContactsSummary | null>(null);
  const [activityPrompt, setActivityPrompt] = useState<ActivityPrompt>(null),
    [activityBusy, setActivityBusy] = useState(false);
  const [vehicleMounted, setVehicleMounted] = useState(false),
    [scooterNear, setScooterNear] = useState(false);
  const [vehicleHintUntil, setVehicleHintUntil] = useState(0);
  const previousVehicleMounted = useRef(false);
  useEffect(() => {
    if (vehicleMounted && !previousVehicleMounted.current) {
      setVehicleHintUntil(Date.now() + 4500);
      const timer = setTimeout(() => setVehicleHintUntil(0), 4500);
      previousVehicleMounted.current = true;
      return () => clearTimeout(timer);
    }
    previousVehicleMounted.current = vehicleMounted;
    if (!vehicleMounted) setVehicleHintUntil(0);
  }, [vehicleMounted]);
  const [interiorIndex, setInteriorIndex] = useState<number | null>(null);
  const [focusedCabinIndex, setFocusedCabinIndex] = useState(homeIndex);
  const [doorTransition, setDoorTransition] = useState(false),
    [doorPromptVisible, setDoorPromptVisible] = useState(false);
  const homeResetKey = resetKey * cabinSpots.length + homeIndex;
  const [navigation, setNavigation] = useState<NavigationSample>({
    x: 45,
    z: 27,
    heading: 0,
  });
  const latestNavigation = useRef(navigation),
    mapVisible = useRef(mapOpen);
  mapVisible.current = mapOpen;
  useEffect(() => {
    if (mapOpen) setNavigation(latestNavigation.current);
  }, [mapOpen]);
  const fireOutput = useRef<HTMLOutputElement>(null),
    motionOutput = useRef<HTMLOutputElement>(null);
  const updateFireMetrics = useCallback((sample: unknown) => {
    fireOutput.current?.setAttribute("data-fire", JSON.stringify(sample));
  }, []);
  const updateMotion = useCallback(
    (sample: Record<string, unknown>) => {
      room.publishMotion(sample);
      motionOutput.current?.setAttribute("data-motion", JSON.stringify(sample));
      if (Array.isArray(sample.position) && Array.isArray(sample.facing)) {
        const next = {
          x: Number(sample.position[0]),
          z: Number(sample.position[2]),
          heading: Math.atan2(
            Number(sample.facing[0]),
            Number(sample.facing[2]),
          ),
        };
        latestNavigation.current = next;
        if (mapVisible.current) setNavigation(next);
      }
    },
    [room],
  );
  const onSceneReady = useCallback(() => setReady(true), []);
  const resetHome = useCallback(() => {
    setPanel(null);
    setMode("walk");
    setResetKey((key) => key + 1);
  }, []);
  const lookHome = useCallback(() => {
    setPanel(null);
    setMapOpen(false);
    setMode((current) => (current === "home" ? "walk" : "home"));
  }, []);
  useEffect(() => {
    const capture = (event: KeyboardEvent) => {
      const target = event.target;
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      const action = captureGameKey(event, {
        panel,
        mapOpen,
        homeView: mode === "home",
        indoors: interiorIndex !== null,
        typing,
      });
      if (action === "pass") return;
      if (action === "walk") {
        setMode("walk");
        return;
      }
      if (action === "block") return;
      if (action === "close-panel") setPanel(null);
      if (action === "close-map") setMapOpen(false);
      if (action === "map") setMapOpen((open) => !open);
      if (action === "controls")
        setPanel((current) => (current === "controls" ? null : "controls"));
      if (action === "home") lookHome();
      if (action === "reset") resetHome();
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [panel, mapOpen, mode, interiorIndex, lookHome, resetHome]);
  const displayedPrompt: ActivityPrompt =
    interiorIndex !== null || panel !== null
      ? null
      : vehicleMounted
        ? vehicleHintUntil > 0
          ? {
              main: "QuickVolt 9",
              detail: "W accelerate · S brake · A/D steer · V park",
              key: "V",
            }
          : null
        : (activityPrompt ??
          (scooterNear
            ? { main: "Ride QuickVolt 9", detail: "Electric scooter", key: "V" }
            : null));
  const menuHomeIndex =
    roomView.homeIndex ?? (roomView.status === "offline" ? homeIndex : null);
  return (
    <main
      className="game-shell"
      data-home={homeIndex + 1}
      data-home-source={roomView.homeIndex === null ? "local" : "assigned"}
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
              args={[evening ? "#becbc8" : "#cadfd8"]}
            />
            <fog
              attach="fog"
              args={[evening ? "#becbc8" : "#cadfd8", 380, 3300]}
            />
            <group>
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
              args={["#eef1db", "#7c8458", evening ? 0.55 : 0.75]}
            />
            <ambientLight intensity={0.08} />
            <directionalLight
              position={sunDirection(evening).multiplyScalar(150).toArray()}
              color={evening ? "#ffce98" : "#ffe2b3"}
              intensity={evening ? 2.4 : 3.3}
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
              <group>
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
              <group>
                <CabinGroundContacts
                  onReady={
                    import.meta.env.DEV ? setFoundationMetrics : undefined
                  }
                />
              </group>
              <Player
                homeIndex={homeIndex}
                mode={mode}
                resetKey={resetKey}
                paused={panel !== null || activityBusy || doorTransition}
                onMove={ignoreMovement}
                onMotion={updateMotion}
                onVehicleChange={setVehicleMounted}
                onVehicleHint={setScooterNear}
                indoors={interiorIndex !== null}
                doorTransition={doorTransition}
              />
              <group>
                {import.meta.env.DEV && <Crowd enabled={crowd} />}
                <MultiplayerPlayers room={room} />
                <ParkedScooter />
                <WorldActivities
                  room={room}
                  onFireMetrics={
                    import.meta.env.DEV ? updateFireMetrics : undefined
                  }
                  resetKey={homeResetKey}
                  paused={
                    panel !== null || mode !== "walk" || interiorIndex !== null
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
            <SceneReady onReady={onSceneReady} />
            {import.meta.env.DEV && (
              <DeveloperMeasurement onMetrics={setMetrics} />
            )}
          </Canvas>
        </Suspense>
      </SceneBoundary>
      {ready && (
        <div className="hud">
          <GameHeader
            room={room}
            menuOpen={panel !== null}
            onMenu={() => setPanel((current) => (current ? null : "menu"))}
          />
          <Minimap
            navigation={navigation}
            homeIndex={homeIndex}
            active={mapOpen && panel === null}
            onClose={() => setMapOpen(false)}
            onFocusHome={lookHome}
          />
          <CabinAccess
            interiorIndex={interiorIndex}
            homeIndex={homeIndex}
            focusedIndex={focusedCabinIndex}
            mode={import.meta.env.DEV ? mode : "walk"}
            resetKey={homeResetKey}
            paused={panel !== null || (!import.meta.env.DEV && mode !== "walk")}
            busy={activityBusy}
            vehicleMounted={vehicleMounted}
            onChange={setInteriorIndex}
            onTransition={setDoorTransition}
            onWalk={() => setMode("walk")}
            onPromptVisible={setDoorPromptVisible}
          />
          {mode === "home" && panel === null && (
            <button className="return-to-walk" onClick={() => setMode("walk")}>
              <GameIcon name="walk" size={25} />
              Back to walking
            </button>
          )}
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
          {panel === "menu" && (
            <GameMenu
              nickname={roomView.nickname}
              homeIndex={menuHomeIndex}
              mapOpen={mapOpen}
              canLookHome={interiorIndex === null}
              onRename={(name) => room.rename(name)}
              onMap={() => {
                setMapOpen((open) => !open);
                setPanel(null);
              }}
              onControls={() => setPanel("controls")}
              onHome={lookHome}
              onReset={resetHome}
              onClose={() => setPanel(null)}
            />
          )}
          {panel === "controls" && (
            <ControlsHelp
              onClose={() => setPanel(null)}
              onMenu={() => setPanel("menu")}
            />
          )}
          {import.meta.env.DEV && (
            <>
              <DeveloperTools
                mode={mode}
                onMode={setMode}
                flat={flat}
                onFlat={setFlat}
                evening={evening}
                onEvening={setEvening}
                crowd={crowd}
                onCrowd={setCrowd}
                metrics={metrics}
              />
              <SeatingMetrics />
              <output
                data-testid="foundation-metrics"
                data-foundations={JSON.stringify(foundationMetrics)}
                hidden
              />
              <output ref={fireOutput} data-testid="fire-metrics" hidden />
              <output
                ref={motionOutput}
                data-testid="movement-metrics"
                hidden
              />
            </>
          )}
        </div>
      )}
    </main>
  );
}
