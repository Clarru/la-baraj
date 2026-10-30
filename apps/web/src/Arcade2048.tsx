import "./arcade2048.css";
import {
  Suspense,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useGLTF } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { RigidBody, CuboidCollider } from "@react-three/rapier";
import * as THREE from "three";
import {
  ARCADE_STATIONS,
  LEGACY_ARCADE_STATION,
  type ArcadeStation,
} from "../../../packages/shared/arcade2048-station";
import {
  arcadeOver,
  arcadeWon,
  type ArcadeDirection,
  type ArcadeStationView,
} from "../../../packages/shared/arcade2048";
import { terrainHeight } from "./geography";
import type { NavigationFeed } from "./navigation-feed";
import type { useArcade2048 } from "./use-arcade2048";
import {
  ARCADE_TILE_MS,
  drawArcadeScreen,
  hitArcadeScreen,
  makeTileAnimation,
  arcadeGpuTilesVisible,
  type TileAnimation,
  type ArcadeScreenState,
} from "./arcade2048-screen";
import {
  getBoatEnvironment,
  applyBoatEnvironment,
  boatEnvironmentIntensity,
} from "./boat-environment";
import { lastLighting } from "./day-night";
import { createArcadeTiles } from "./arcade2048-tiles";
import { createArcadeResourceLifetime } from "./arcade2048-resources";
type Controls = ReturnType<typeof useArcade2048> & { state: ArcadeScreenState };
export const arcadeGround = (station: ArcadeStation = LEGACY_ARCADE_STATION) =>
  terrainHeight(station.x, station.z);
export function nearArcade(
  navigation: NavigationFeed,
  station: ArcadeStation = LEGACY_ARCADE_STATION,
) {
  const p = navigation.getSnapshot();
  return Math.hypot(p.x - station.x, p.z - station.z) < 2.3;
}
export function availableArcadeStations(
  supported: boolean,
): readonly ArcadeStation[] {
  return supported ? ARCADE_STATIONS : [LEGACY_ARCADE_STATION];
}
export function closestArcade(navigation: NavigationFeed, supported: boolean) {
  const p = navigation.getSnapshot();
  return [...availableArcadeStations(supported)].sort(
    (a, b) =>
      Math.hypot(p.x - a.x, p.z - a.z) - Math.hypot(p.x - b.x, p.z - b.z),
  )[0];
}
export function ArcadeCabinet({
  controls,
  navigation,
  enabled,
  onOpen,
  selected,
  stations,
  supported,
  selfId,
}: {
  controls: Controls;
  navigation: NavigationFeed;
  enabled: boolean;
  onOpen: (id: number) => void;
  selected: number | null;
  stations: ArcadeStationView[];
  supported: boolean;
  selfId: string;
}) {
  return (
    <>
      {availableArcadeStations(supported).map((station) => (
        <StationMachine
          key={station.id}
          station={station}
          data={stations.find((s) => s.id === station.id)}
          controls={controls}
          navigation={navigation}
          enabled={enabled}
          onOpen={() => onOpen(station.id)}
          active={selected === station.id}
          selfId={selfId}
        />
      ))}
    </>
  );
}
function StationMachine({
  station,
  data,
  controls,
  navigation,
  enabled,
  onOpen,
  active,
  selfId,
}: {
  station: ArcadeStation;
  data: ArcadeStationView | undefined;
  controls: Controls;
  navigation: NavigationFeed;
  enabled: boolean;
  onOpen: () => void;
  active: boolean;
  selfId: string;
}) {
  const [visible, setVisible] = useState(false),
    [near, setNear] = useState(false),
    last = useRef(0),
    direction = useRef<ArcadeDirection | null>(null),
    passiveHardware = useRef({ kind: "", at: 0 });
  direction.current = data?.direction ?? null;
  const occupied = !!data?.playerId && data.playerId !== selfId;
  const passiveState = useMemo(
    () => ({
      ...controls.state,
      active: false,
      page: "board" as const,
      pending: false,
      error: "",
      focused: false,
      occupantName: data?.name ?? "",
      view: data?.game
        ? {
            game: data.game,
            best: data.best,
            leaders: [],
            ranked: !controls.state.local,
          }
        : null,
    }),
    [data, controls.state.local],
  );
  const display = active
    ? controls
    : {
        ...controls,
        state: passiveState,
        direction,
        hardware: passiveHardware,
      };
  useFrame(({ clock }) => {
    if (clock.elapsedTime - last.current < 0.25) return;
    last.current = clock.elapsedTime;
    const p = navigation.getSnapshot(),
      distance = Math.hypot(p.x - station.x, p.z - station.z);
    setVisible(distance < 65);
    setNear(distance < 2.3);
  });
  return (
    <group
      position={[station.x, arcadeGround(station), station.z]}
      name={`2048 cabinet ${station.id + 1}`}
    >
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[0.38, 0.96, 0.36]} position={[0, 0.96, 0]} />
      </RigidBody>
      {(visible || active) && (
        <Suspense fallback={null}>
          <CabinetModel
            controls={display}
            near={near && enabled && !occupied}
            onOpen={onOpen}
          />
        </Suspense>
      )}
    </group>
  );
}
function CabinetModel({
  controls,
  near,
  onOpen,
}: {
  controls: Controls;
  near: boolean;
  onOpen: () => void;
}) {
  const { scene } = useGLTF("/assets/arcade2048/cabinet.glb"),
    { gl } = useThree();
  const owned = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.material = Array.isArray(o.material)
          ? o.material.map((m) => m.clone())
          : o.material.clone();
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    const screen = root.getObjectByName("Screen") as THREE.Mesh;
    const canvas = document.createElement("canvas");
    canvas.width = 768;
    canvas.height = 960;
    const context = canvas.getContext("2d")!;
    context.scale(1.5, 1.5);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.flipY = false;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    const screenGpuStats = { uploads: 0 };
    texture.onUpdate = () => {
      screenGpuStats.uploads++;
    };
    const original = screen.material;
    for (const material of [original].flat()) material.dispose();
    screen.material = new THREE.MeshBasicMaterial({
      map: texture,
      toneMapped: false,
    });
    screen.castShadow = false;
    screen.receiveShadow = false;
    applyBoatEnvironment(root, getBoatEnvironment(gl));
    const materials = new Set<THREE.MeshStandardMaterial>();
    root.traverse((o) => {
      if (o instanceof THREE.Mesh)
        for (const m of [o.material].flat())
          if (m instanceof THREE.MeshStandardMaterial) materials.add(m);
    });
    const tiles = createArcadeTiles(screen, gl);
    const retain = createArcadeResourceLifetime(() => {
      tiles.dispose();
      texture.dispose();
      root.traverse((o) => {
        if (o instanceof THREE.Mesh)
          for (const m of [o.material].flat()) m.dispose();
      });
    });
    return {
      materials: [...materials],
      root,
      screen,
      texture,
      context,
      screenGpuStats,
      tiles,
      retain,
      joystick: root.getObjectByName("Joystick"),
      buttonNew: root.getObjectByName("ButtonNew"),
      buttonScores: root.getObjectByName("ButtonScores"),
    };
  }, [scene, gl]);
  const current = useRef(controls);
  current.current = controls;
  const previous = useRef(controls.state.view),
    animation = useRef<TileAnimation | null>(null),
    dirty = useRef(true),
    reduced = useRef(false);
  const renderStats = useRef({
    screenUploads: 0,
    frames: new Float32Array(120),
    cpu: new Float32Array(120),
    cursor: 0,
    samples: 0,
    lastReport: 0,
  });
  const press = useRef<{
    x: number;
    y: number;
    u: number;
    v: number;
    screen: boolean;
    id: number;
  } | null>(null);
  useLayoutEffect(() => {
    dirty.current = true;
  }, [
    controls.state.active,
    controls.state.page,
    controls.state.error,
    controls.state.focused,
    controls.state.local,
    controls.state.occupantName,
    controls.state.view?.best,
    controls.state.page === "leaders" ? controls.state.view : null,
  ]);
  useLayoutEffect(() => {
    animation.current = reduced.current
      ? null
      : makeTileAnimation(
          previous.current,
          controls.state.view,
          controls.direction.current,
          performance.now(),
        );
    previous.current = controls.state.view;
    dirty.current = true;
  }, [controls.state.view?.game, controls.state.active]);
  const baseNew = useMemo(() => owned.buttonNew?.position.y ?? 0, [owned]),
    baseScores = useMemo(() => owned.buttonScores?.position.y ?? 0, [owned]);
  useEffect(() => {
    const release = owned.retain();
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      reduced.current = media.matches;
      animation.current = null;
      dirty.current = true;
    };
    update();
    media.addEventListener("change", update);
    let live = true;
    void Promise.all([
      document.fonts.load('400 36px "Bree Serif"'),
      document.fonts.load('700 24px "Alegreya Sans"'),
    ])
      .then(() => {
        if (live) {
          dirty.current = true;
          owned.tiles.redrawAtlas();
        }
      })
      .catch(() => {});
    return () => {
      live = false;
      media.removeEventListener("change", update);
      release();
    };
  }, [owned]);
  useFrame((_, dt) => {
    const now = performance.now();
    if (animation.current && now - animation.current.started > ARCADE_TILE_MS) {
      animation.current = null;
    }
    if (dirty.current) {
      drawArcadeScreen(owned.context, current.current.state, null, now, {
        omitTiles: arcadeGpuTilesVisible(current.current.state),
      });
      owned.texture.needsUpdate = true;
      dirty.current = false;
      renderStats.current.screenUploads++;
    }
    owned.tiles.update(current.current.state, animation.current, now);
    const intensity = boatEnvironmentIntensity(lastLighting());
    for (const m of owned.materials) m.envMapIntensity = intensity;
    const lean =
      animation.current && !reduced.current
        ? Math.max(0, 1 - (now - animation.current.started) / ARCADE_TILE_MS) *
          0.14
        : 0;
    if (owned.joystick) {
      owned.joystick.rotation.x =
        lean *
        (controls.direction.current === "up"
          ? -1
          : controls.direction.current === "down"
            ? 1
            : 0);
      owned.joystick.rotation.z =
        lean *
        (controls.direction.current === "left"
          ? 1
          : controls.direction.current === "right"
            ? -1
            : 0);
    }
    const hardware = controls.hardware.current,
      pulse = reduced.current
        ? 0
        : Math.sin(
            Math.min(1, Math.max(0, (now - hardware.at) / 140)) * Math.PI,
          ) * 0.004;
    if (owned.buttonNew)
      owned.buttonNew.position.y =
        baseNew - (["new", "confirm"].includes(hardware.kind) ? pulse : 0);
    if (owned.buttonScores)
      owned.buttonScores.position.y =
        baseScores - (hardware.kind === "scores" ? pulse : 0);
    if (current.current.state.active) {
      const stats = renderStats.current,
        i = stats.cursor;
      stats.frames[i] = dt * 1000;
      stats.cpu[i] = performance.now() - now;
      stats.cursor = (i + 1) % 120;
      stats.samples = Math.min(120, stats.samples + 1);
      if (now - stats.lastReport > 500) {
        const frames = Array.from(stats.frames.subarray(0, stats.samples)).sort(
            (a, b) => a - b,
          ),
          cpu = Array.from(stats.cpu.subarray(0, stats.samples)).sort(
            (a, b) => a - b,
          );
        document.querySelector("[data-arcade-render-metrics]")?.setAttribute(
          "data-sample",
          JSON.stringify({
            screenUploads: stats.screenUploads,
            screenGpuUploads: owned.screenGpuStats.uploads,
            ...owned.tiles.metrics(),
            tileDrawCalls: 1,
            frameMedianMs: frames[Math.floor(frames.length / 2)],
            frameP95Ms: frames[Math.floor(frames.length * 0.95)],
            cabinetCpuP95Ms: cpu[Math.floor(cpu.length * 0.95)],
            samples: stats.samples,
          }),
        );
        stats.lastReport = now;
      }
    }
  });
  const down = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!controls.state.active) {
      if (near) onOpen();
      return;
    }
    (e.target as Element).setPointerCapture(e.pointerId);
    press.current = {
      x: e.clientX,
      y: e.clientY,
      u: e.uv?.x ?? 0,
      v: e.uv?.y ?? 0,
      screen: e.object.name === "Screen",
      id: e.pointerId,
    };
  };
  const up = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    const p = press.current;
    press.current = null;
    if (!p || p.id !== e.pointerId) return;
    (e.target as Element).releasePointerCapture(e.pointerId);
    const dx = e.clientX - p.x,
      dy = e.clientY - p.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) {
      controls.move(
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0
            ? "right"
            : "left"
          : dy > 0
            ? "down"
            : "up",
      );
      return;
    }
    if (p.screen) {
      const action = hitArcadeScreen(controls.state, p.u * 512, p.v * 640);
      if (action) controls.action(action);
    } else if (e.object.name === "ButtonNew") controls.action("new");
    else if (e.object.name === "ButtonScores") controls.action("scores");
  };
  return (
    <primitive
      object={owned.root}
      dispose={null}
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={() => {
        press.current = null;
      }}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => e.stopPropagation()}
    />
  );
}
export function ArcadeEntry({
  navigation,
  enabled,
  onOpen,
  local,
  supported,
  stations,
  selfId,
  opening,
  error,
}: {
  navigation: NavigationFeed;
  enabled: boolean;
  onOpen: (id: number) => void;
  local: boolean;
  supported: boolean;
  stations: ArcadeStationView[];
  selfId: string;
  opening: boolean;
  error: string;
}) {
  const [station, setStation] = useState(() =>
      closestArcade(navigation, supported),
    ),
    [near, setNear] = useState(false);
  useEffect(() => {
    const update = () => {
      const s = closestArcade(navigation, supported);
      setStation(s);
      setNear(nearArcade(navigation, s));
    };
    update();
    return navigation.subscribe(update);
  }, [navigation, supported]);
  const occupant = stations.find((s) => s.id === station.id),
    blocked = !!occupant?.playerId && occupant.playerId !== selfId;
  useEffect(() => {
    if (!near || !enabled || blocked || opening) return;
    const key = (e: KeyboardEvent) => {
      if (e.code === "KeyE" && !e.repeat && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopImmediatePropagation();
        onOpen(station.id);
      }
    };
    window.addEventListener("keydown", key, true);
    return () => window.removeEventListener("keydown", key, true);
  }, [near, enabled, blocked, opening, onOpen, station.id]);
  return near && enabled ? (
    <div className="planes-entry">
      <button
        type="button"
        disabled={blocked || opening}
        onClick={() => onOpen(station.id)}
      >
        {blocked ? (
          "Occupied — blocked"
        ) : opening ? (
          "Opening…"
        ) : (
          <>
            <kbd>E</kbd> Play 2048
          </>
        )}
      </button>
      <span role="status">
        {blocked
          ? `${occupant!.name} is playing. Choose another cabinet.`
          : error ||
            (local
              ? "Local practice · Local records"
              : "Your game · Global records")}
      </span>
    </div>
  ) : null;
}
/** Same controller and actions as the physical screen, exposed to assistive technology. */
export function ArcadeAccessibility({
  controls,
  onExit,
}: {
  controls: Controls;
  onExit: () => void;
}) {
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!controls.state.active) return;
    const previous = document.activeElement;
    section.current?.focus({ preventScroll: true });
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [controls.state.active]);
  if (!controls.state.active) return null;
  const { game } = controls.state.view ?? { game: null };
  return (
    <section
      ref={section}
      tabIndex={0}
      onFocus={() => controls.setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null))
          controls.setFocused(false);
      }}
      data-arcade-controls
      className="arcade-assistive"
      aria-label="2048 arcade"
    >
      <output hidden data-arcade-render-metrics />
      <p>
        Arrow keys or WASD move tiles. N starts a new game. L shows records.
        Enter or Space confirms a new game, continues a win, or returns from
        records. Escape cancels or leaves the cabinet.
      </p>
      <p role="status" aria-live="polite">
        {controls.state.error ||
          `${controls.state.pending ? "Saving. " : ""}Score ${game?.score ?? 0}. Best ${controls.state.view?.best ?? 0}.`}
      </p>
      <table aria-label="2048 board">
        <tbody>
          {Array.from({ length: 4 }, (_, y) => (
            <tr key={y}>
              {Array.from({ length: 4 }, (_, x) => (
                <td key={x}>{game?.board[y * 4 + x] || "empty"}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {(["left", "right", "up", "down"] as ArcadeDirection[]).map((d) => (
        <button
          tabIndex={-1}
          key={d}
          disabled={controls.state.pending}
          onClick={() => controls.move(d)}
        >
          Move {d}
        </button>
      ))}
      <button tabIndex={-1} onClick={() => controls.action("new")}>
        New game
      </button>
      <button tabIndex={-1} onClick={() => controls.action("scores")}>
        {controls.state.local ? "Local records" : "Global leaderboard"}
      </button>
      {controls.state.page === "leaders" && (
        <ol
          aria-label={
            controls.state.local ? "Local records" : "Global leaderboard"
          }
        >
          {controls.state.view?.leaders.map((row) => (
            <li key={row.rank}>
              {row.rank}. {row.name}: {row.score}
            </li>
          ))}
        </ol>
      )}
      {controls.state.page === "confirm" && (
        <button tabIndex={-1} onClick={() => controls.action("confirm")}>
          Start fresh
        </button>
      )}
      {game && (arcadeOver(game) || (arcadeWon(game) && !game.continued)) && (
        <button tabIndex={-1} onClick={() => controls.action("continue")}>
          {arcadeWon(game) && !game.continued ? "Keep going" : "New game"}
        </button>
      )}
      <button tabIndex={-1} onClick={() => controls.action("back")}>
        {controls.state.page === "confirm" ? "Keep this game" : "Back to game"}
      </button>
      <button tabIndex={-1} onClick={onExit}>
        Leave cabinet
      </button>
    </section>
  );
}
