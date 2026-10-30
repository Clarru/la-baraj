import { cruceWorldLab } from "./cruce-world-test";
import { CruceWorldLab } from "./CruceWorldLab";
import { LocalWorldRoom, localWorldEnabled } from "./LocalWorldRoom";
import {
  cruceSeatSide,
  CRUCE_SEATS,
} from "../../../packages/shared/cruce-station";
import { CruceEntry } from "./CruceEntry";
import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useMemo,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { WorldBackdrop } from "./WorldBackdrop";
import { WorldLighting } from "./WorldLighting";
import { Physics } from "@react-three/rapier";
import { GameIcon } from "./GameArt";
import * as THREE from "three";
import { Terrain, LakeWater, Roads, Vegetation } from "./environment";
import { Settlement } from "./settlement";
import { WorldActivities, type ActivityPrompt } from "./activities";
import { SceneLoading } from "./SceneLoading";
import { ParkedScooter } from "./scooter";
import { ParkedBoat } from "./boat";
import { RUNABOUT_IDS } from "./boat-geometry";
import { assetUrl } from "./assets";
import { useGLTF } from "@react-three/drei";
import { SeatingMetrics } from "./SeatingMetrics";
import { CabinInterior } from "./CabinInterior";
import { CabinAccess } from "./CabinAccess";
import { HomeMarker } from "./HomeMarker";
import { Minimap } from "./Minimap";
import { displayedHomeIndex, readLocalHome } from "./home";
import { cabinSpots } from "./geography";
import { createNavigationFeed } from "./navigation-feed";
import {
  CabinGroundContacts,
  type GroundContactsSummary,
} from "./CabinGroundContacts";
import { Player, CameraRig, Crowd, type ViewMode } from "./player";
import { MultiplayerRoom } from "./multiplayer";
import { MultiplayerPlayers } from "./multiplayer-players";
import { LocalBubbleChat } from "./BubbleChat";
import { ControlsHelp, GameHeader, GameMenu } from "./GameMenu";
import { captureGameKey, type GamePanel } from "./game-input";
import { planesSeatSide } from "../../../packages/shared/planes-station";
import { requestTableStand } from "./planes-activity";
import { PlanesEntry } from "./PlanesEntry";
import { planesLab, LocalPlanesRoom, PlanesLabControls } from "./PlanesLab";
import {
  performanceLab,
  PerformancePanel,
  PerformanceScene,
  PerformanceMeasurement,
  PerformanceCamera,
  type PerformanceScenario,
} from "./PerformanceLab";
import {
  DeveloperMeasurement,
  DeveloperTools,
  type RenderSample,
} from "./DeveloperTools";

// Fetch both runabouts with the scene; the boat itself never blocks the world.
useGLTF.preload(assetUrl(RUNABOUT_IDS.full));
useGLTF.preload(assetUrl(RUNABOUT_IDS.lod));

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
const CruceBoard = lazy(() => import("./CruceBoard"));
const PlanesBoard = lazy(() => import("./PlanesBoard"));
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
export default function Game({ initialName }: { initialName: string }) {
  const [room] = useState<MultiplayerRoom>(() =>
    planesLab
      ? new LocalPlanesRoom(initialName)
      : !performanceLab && localWorldEnabled()
        ? new LocalWorldRoom(initialName)
        : new MultiplayerRoom(initialName),
  );
  const [performanceScenario, setPerformanceScenario] =
    useState<PerformanceScenario>("solo");
  useEffect(() => room.connect(performanceLab), [room]);
  useEffect(() => {
    const events = [
      "keydown",
      "pointerdown",
      "pointermove",
      "wheel",
      "touchstart",
    ] as const;
    for (const event of events)
      window.addEventListener(event, room.noteInput, {
        passive: true,
        capture: true,
      });
    return () => {
      for (const event of events)
        window.removeEventListener(event, room.noteInput, true);
      room.stopTrackingInput();
    };
  }, [room]);
  const roomView = useSyncExternalStore(room.subscribe, room.getSnapshot);
  const [localHomeIndex] = useState(() => readLocalHome());
  const homeIndex = displayedHomeIndex(roomView.homeIndex, localHomeIndex);
  const cabins = useMemo(
    () =>
      performanceLab && performanceScenario !== "solo"
        ? Array.from({ length: 50 }, (_, index) => ({
            index,
            ownerName: `Friend ${index + 1}`,
          }))
        : roomView.status === "offline"
          ? [{ index: 0, ownerName: roomView.nickname }]
          : roomView.cabins,
    [roomView.status, roomView.cabins, roomView.nickname, performanceScenario],
  );
  const cabinIndices = useMemo(() => cabins.map((c) => c.index), [cabins]);
  const hasHome = roomView.status === "offline" || roomView.homeIndex !== null;
  const [mode, setMode] = useState<ViewMode>("walk");
  const [flat, setFlat] = useState(false),
    [evening, setEvening] = useState(false),
    [crowd, setCrowd] = useState(false);
  const [metrics, setMetrics] = useState<RenderSample | null>(null);
  const [resetKey, setResetKey] = useState(0),
    [ready, setReady] = useState(false);
  const [panel, setPanel] = useState<GamePanel>(null);
  const [waveRequest, setWaveRequest] = useState(0);
  const [chatMode, setChatMode] = useState<"closed" | "editing" | "display">(
    "closed",
  );
  const chatOpen = chatMode === "editing";
  const closeChat = useCallback(() => setChatMode("closed"), []);
  const finishChat = useCallback(() => setChatMode("display"), []);
  const [planesOpen, setPlanesOpen] = useState(false);
  const ownGameSide = planesSeatSide(room.ownSeatId());
  const ownCruceSeat = cruceSeatSide(room.ownSeatId());
  const [cruceOpen, setCruceOpen] = useState(false);
  const [cruceLeaveRequest, setCruceLeaveRequest] = useState(0);
  const lastCruceSeat = useRef<number | null>(null);
  const openCruce = useCallback(() => {
    setPanel(null);
    setMode("walk");
    setPlanesOpen(false);
    setCruceOpen(true);
  }, []);
  useEffect(() => {
    if (ownCruceSeat !== null && lastCruceSeat.current !== ownCruceSeat)
      openCruce();
    lastCruceSeat.current = ownCruceSeat;
  }, [ownCruceSeat, openCruce]);
  const lastGameSeat = useRef<number | null>(null);
  const openPlanes = useCallback(() => {
    setPanel(null);
    setMode("walk");
    setPlanesOpen(true);
    setCruceOpen(false);
  }, []);
  useEffect(() => {
    if (ownGameSide !== null && lastGameSeat.current !== ownGameSide)
      openPlanes();
    lastGameSeat.current = ownGameSide;
  }, [ownGameSide, openPlanes]);
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
  const [boatMounted, setBoatMounted] = useState(false),
    [boatNear, setBoatNear] = useState(false);
  const [boatHintUntil, setBoatHintUntil] = useState(0);
  const previousBoatMounted = useRef(false);
  useEffect(() => {
    if (boatMounted && !previousBoatMounted.current) {
      setBoatHintUntil(Date.now() + 4500);
      const timer = setTimeout(() => setBoatHintUntil(0), 4500);
      previousBoatMounted.current = true;
      return () => clearTimeout(timer);
    }
    previousBoatMounted.current = boatMounted;
    if (!boatMounted) setBoatHintUntil(0);
  }, [boatMounted]);
  const [interiorIndex, setInteriorIndex] = useState<number | null>(null);
  const [focusedCabinIndex, setFocusedCabinIndex] = useState(homeIndex);
  const [doorTransition, setDoorTransition] = useState(false),
    [doorPromptVisible, setDoorPromptVisible] = useState(false);
  const homeResetKey = resetKey * cabinSpots.length + homeIndex;
  const [navigation] = useState(() =>
    createNavigationFeed({ x: 45, z: 27, heading: 0 }),
  );
  const [waveAvailable, setWaveAvailable] = useState(false);
  const waveAvailability = useRef(false);
  const fireOutput = useRef<HTMLOutputElement>(null),
    motionOutput = useRef<HTMLOutputElement>(null);
  const updateFireMetrics = useCallback((sample: unknown) => {
    fireOutput.current?.setAttribute("data-fire", JSON.stringify(sample));
  }, []);
  const updateMotion = useCallback(
    (sample: Record<string, unknown>) => {
      const available = sample.canWave === true;
      if (available !== waveAvailability.current) {
        waveAvailability.current = available;
        setWaveAvailable(available);
      }
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
        navigation.update(next);
      }
    },
    [room, navigation],
  );
  const onSceneReady = useCallback(() => setReady(true), []);
  const resetHome = useCallback(() => {
    setPlanesOpen(false);
    setCruceOpen(false);
    setPanel(null);
    setMode("walk");
    setResetKey((key) => key + 1);
  }, []);
  const lookHome = useCallback(() => {
    setPanel(null);
    setMode((current) => (current === "home" ? "walk" : "home"));
  }, []);
  useEffect(() => {
    const capture = (event: KeyboardEvent) => {
      if (
        (cruceOpen || ownCruceSeat !== null) &&
        event.repeat &&
        ["Escape", "KeyF"].includes(event.code)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        panel === null &&
        (cruceOpen || ownCruceSeat !== null) &&
        event.code === "Escape" &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest(".cruce-exit")
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setCruceOpen((o) => !o);
        return;
      }
      if (
        panel === null &&
        ownCruceSeat !== null &&
        event.code === "KeyF" &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest("input, select, textarea")
        )
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setCruceOpen(true);
        setCruceLeaveRequest((n) => n + 1);
        return;
      }
      if (panel === null && cruceOpen) {
        if (
          event.target instanceof HTMLElement &&
          event.target.closest(".cruce-board")
        )
          return;
        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          event.stopImmediatePropagation();
          return;
        }
      }
      if (
        chatMode !== "closed" &&
        event.code === "Escape" &&
        (chatOpen || (panel === null && !planesOpen && !cruceOpen))
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        closeChat();
        return;
      }
      if (chatOpen) return;
      const target = event.target;
      const isTypingTarget =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          Boolean(
            target.closest(
              "input, textarea, select, button, a, [role=button], [role=dialog]",
            ),
          ));
      if (
        event.key === "Enter" &&
        !event.repeat &&
        !event.isComposing &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        !isTypingTarget &&
        panel === null &&
        !planesOpen &&
        !cruceOpen &&
        mode === "walk" &&
        !doorTransition &&
        hasHome
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        setChatMode("editing");
        return;
      }
      if (
        event.repeat &&
        (planesOpen || ownGameSide !== null) &&
        ["Escape", "KeyF"].includes(event.code)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
      if (
        panel === null &&
        (planesOpen || ownGameSide !== null) &&
        event.code === "Escape"
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (planesOpen) setPlanesOpen(false);
        else openPlanes();
        return;
      }
      if (panel === null && planesOpen) {
        if (event.code === "KeyF" && ownGameSide !== null) {
          event.preventDefault();
          event.stopImmediatePropagation();
          setPlanesOpen(false);
          requestTableStand();
          return;
        }
        if (target instanceof HTMLElement && target.closest(".planes-notebook"))
          return;
        if (!event.ctrlKey && !event.metaKey && !event.altKey) {
          // Block game listeners while retaining native Tab/Enter/Space actions
          // on the surrounding UI, just as the other game panels do.
          event.stopImmediatePropagation();
          return;
        }
      }
      const typing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName));
      const action = captureGameKey(event, {
        panel,
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
      if (action === "controls")
        setPanel((current) => (current === "controls" ? null : "controls"));
      if (action === "home") lookHome();
      if (action === "reset") resetHome();
    };
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [
    panel,
    mode,
    interiorIndex,
    lookHome,
    resetHome,
    planesOpen,
    cruceOpen,
    ownCruceSeat,
    ownGameSide,
    openPlanes,
    chatOpen,
    chatMode,
    closeChat,
    doorTransition,
    hasHome,
  ]);
  useEffect(() => {
    if (
      chatOpen &&
      (panel !== null || planesOpen || cruceOpen || doorTransition || !hasHome)
    )
      closeChat();
  }, [
    chatOpen,
    closeChat,
    panel,
    planesOpen,
    cruceOpen,
    doorTransition,
    hasHome,
  ]);
  const displayedPrompt: ActivityPrompt =
    interiorIndex !== null ||
    panel !== null ||
    planesOpen ||
    cruceOpen ||
    ownCruceSeat !== null ||
    ownGameSide !== null
      ? null
      : vehicleMounted
        ? vehicleHintUntil > 0
          ? {
              main: "QuickVolt 9",
              detail: "W accelerate · S brake / reverse · A/D steer · V park",
              key: "V",
            }
          : null
        : boatMounted
          ? boatHintUntil > 0
            ? {
                main: "Motorboat",
                detail: "V near a bank to step out",
                key: "V",
              }
            : null
          : (activityPrompt ??
            (boatNear
              ? {
                  main: "Drive the motorboat",
                  detail: "W throttle · A/D steer · V step out",
                  key: "V",
                }
              : scooterNear
                ? {
                    main: "Ride QuickVolt 9",
                    detail: "Electric scooter",
                    key: "V",
                  }
                : null));
  const menuHomeIndex =
    roomView.homeIndex ?? (roomView.status === "offline" ? homeIndex : null);
  return (
    <main
      className="game-shell"
      style={
        performanceLab
          ? {
              width: 1707,
              height: 960,
              minHeight: 960,
              position: "absolute",
              left: 0,
              top: 0,
            }
          : undefined
      }
      data-cabin-count={cabins.length}
      data-cabins={JSON.stringify(cabins)}
      data-home={hasHome ? homeIndex + 1 : undefined}
      data-home-source={roomView.homeIndex === null ? "local" : "assigned"}
      data-view={mode}
      data-interior={interiorIndex !== null}
    >
      <SceneBoundary>
        <Suspense fallback={<SceneLoading />}>
          <Canvas
            shadows="percentage"
            dpr={performanceLab ? 1.5 : [1, 1.5]}
            camera={{ position: [58, 35, 72], fov: 48, near: 0.1, far: 6000 }}
            gl={{
              antialias: true,
              powerPreference: "high-performance",
              toneMapping: THREE.ACESFilmicToneMapping,
              toneMappingExposure: 0.92,
            }}
          >
            <WorldLighting evening={evening} forceDay={performanceLab} />
            <WorldBackdrop evening={evening} forceDay={performanceLab} />
            <Physics timeStep={1 / 60} gravity={[0, -12, 0]}>
              <group>
                <Terrain />
                <Roads />
                <LakeWater evening={evening} forceDay={performanceLab} />
                <Vegetation flat={flat} />
                <Settlement
                  flat={flat}
                  interiorIndex={interiorIndex}
                  cabins={cabins}
                  arrivalIndex={hasHome ? homeIndex : undefined}
                />
              </group>
              {interiorIndex !== null && (
                <CabinInterior index={interiorIndex} />
              )}
              <group>
                <CabinGroundContacts
                  indices={cabinIndices}
                  onReady={
                    import.meta.env.DEV ? setFoundationMetrics : undefined
                  }
                />
              </group>
              {hasHome && (
                <Player
                  homeIndex={homeIndex}
                  mode={mode}
                  resetKey={resetKey}
                  paused={
                    panel !== null ||
                    activityBusy ||
                    doorTransition ||
                    cruceOpen ||
                    planesOpen ||
                    chatOpen
                  }
                  waveRequest={waveRequest}
                  onMove={ignoreMovement}
                  onMotion={updateMotion}
                  onVehicleChange={setVehicleMounted}
                  onVehicleHint={setScooterNear}
                  onBoatChange={setBoatMounted}
                  onBoatHint={setBoatNear}
                  indoors={interiorIndex !== null}
                  doorTransition={doorTransition}
                />
              )}
              {chatMode !== "closed" && (
                <LocalBubbleChat
                  room={room}
                  editing={chatOpen}
                  onFinishEditing={finishChat}
                  onClose={closeChat}
                />
              )}
              <group>
                {import.meta.env.DEV && <Crowd enabled={crowd} />}
                <MultiplayerPlayers room={room} />
                {performanceLab && (
                  <PerformanceScene scenario={performanceScenario} />
                )}
                {hasHome && <ParkedScooter mounted={vehicleMounted} />}
                {hasHome && (
                  <Suspense fallback={null}>
                    <ParkedBoat />
                  </Suspense>
                )}
                <WorldActivities
                  room={room}
                  onFireMetrics={
                    import.meta.env.DEV ? updateFireMetrics : undefined
                  }
                  resetKey={homeResetKey}
                  paused={
                    !hasHome ||
                    panel !== null ||
                    mode !== "walk" ||
                    interiorIndex !== null ||
                    chatOpen
                  }
                  onPrompt={setActivityPrompt}
                  onBusy={setActivityBusy}
                />
              </group>
              {performanceLab && <PerformanceMeasurement />}
            </Physics>
            <HomeMarker
              index={homeIndex}
              visible={
                hasHome &&
                interiorIndex === null &&
                (mode === "walk" || mode === "home")
              }
            />
            <CameraRig
              tableSeat={planesOpen ? ownGameSide : null}
              cardTableSeat={cruceOpen ? ownCruceSeat : null}
              mode={mode}
              resetKey={resetKey}
              homeIndex={homeIndex}
              interiorIndex={interiorIndex}
              onFocusCabin={setFocusedCabinIndex}
              transitioning={doorTransition}
            />
            <SceneReady onReady={onSceneReady} />
            {performanceLab && <PerformanceCamera />}
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
            room={room}
            navigation={navigation}
            homeIndex={hasHome ? homeIndex : null}
            cabins={cabins}
          />
          {!planesOpen &&
            !cruceOpen &&
            panel === null &&
            interiorIndex === null &&
            !vehicleMounted && (
              <PlanesEntry
                navigation={navigation}
                view={roomView.planes}
                seated={ownGameSide !== null}
                onOpen={openPlanes}
              />
            )}
          {!cruceOpen &&
            !planesOpen &&
            panel === null &&
            interiorIndex === null &&
            !vehicleMounted && (
              <CruceEntry
                navigation={navigation}
                view={roomView.cruce}
                seated={ownCruceSeat !== null}
                onOpen={openCruce}
              />
            )}
          {(cruceOpen || ownCruceSeat !== null) && (
            <Suspense
              fallback={<div className="cruce-entry">Se deschide Cruce…</div>}
            >
              <CruceBoard
                open={cruceOpen && panel === null}
                view={roomView.cruce}
                leaveRequest={cruceLeaveRequest}
                connected={roomView.status === "online"}
                onAction={(a, revision) => room.cruceAction(a, revision)}
                onClose={() => setCruceOpen(false)}
                onLeave={() => {
                  setCruceOpen(false);
                  requestTableStand();
                }}
                onSit={(seat) => room.claimSeat(CRUCE_SEATS[seat])}
              />
            </Suspense>
          )}
          {(planesOpen || ownGameSide !== null) && (
            <Suspense
              fallback={<div className="planes-entry">Opening the paper…</div>}
            >
              <PlanesBoard
                open={planesOpen && panel === null}
                view={roomView.planes}
                connected={roomView.status === "online"}
                onAction={(action, revision) =>
                  room.planesAction(action, revision)
                }
                onClose={() => setPlanesOpen(false)}
                onLeave={() => {
                  setPlanesOpen(false);
                  requestTableStand();
                }}
              />
            </Suspense>
          )}
          {planesLab && <PlanesLabControls room={room} />}
          {cruceWorldLab && <CruceWorldLab room={room} />}
          {performanceLab && (
            <PerformancePanel
              scenario={performanceScenario}
              onScenario={setPerformanceScenario}
            />
          )}
          <CabinAccess
            cabinIndices={cabinIndices}
            interiorIndex={interiorIndex}
            homeIndex={homeIndex}
            focusedIndex={focusedCabinIndex}
            mode={import.meta.env.DEV ? mode : "walk"}
            resetKey={homeResetKey}
            paused={
              panel !== null ||
              cruceOpen ||
              planesOpen ||
              chatOpen ||
              (!import.meta.env.DEV && mode !== "walk")
            }
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
              weather={roomView.weather}
              nickname={roomView.nickname}
              homeOwnerName={
                cabins.find((c) => c.index === homeIndex)?.ownerName ?? null
              }
              homeIndex={menuHomeIndex}
              canLookHome={interiorIndex === null}
              onRename={(name) => room.rename(name)}
              onControls={() => setPanel("controls")}
              onHome={lookHome}
              canWave={
                !activityBusy &&
                !vehicleMounted &&
                !doorTransition &&
                !planesOpen &&
                !cruceOpen &&
                waveAvailable
              }
              onWave={() => {
                setMode("walk");
                setPanel(null);
                setWaveRequest((n) => n + 1);
              }}
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
          {(import.meta.env.DEV ||
            import.meta.env.VITE_GAME_DIAGNOSTICS === "1") && (
            <>
              {import.meta.env.DEV && (
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
              )}
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
