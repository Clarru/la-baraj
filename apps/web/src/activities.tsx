import { subscribeMobileActions, type ActionKey } from "./mobile-input";
import { cruceSeatSide } from "../../../packages/shared/cruce-station";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Model } from "./assets";
import { playerPosition } from "./player";
import { terrainHeight, fishingSpots } from "./geography";
import { fireCircleSpot } from "./settlement";
import { setActivityPose, type ActivityKind } from "./activity-state";
import { Campfire, type FireMetrics } from "./campfire";
import { Bench } from "./Bench";
import { fireIgnitionTime, fireLightingDuration } from "./character-actions";
import { vehicleOccupied } from "./boat-state";
import {
  activitySeatIsValid,
  advanceActivity,
  beginFishing,
  beginLightingFire,
  beginSitting,
  beginSeatMove,
  seatStepForKey,
  cancelActivity,
  idleActivity,
  reelActivity,
  type ActivityInteraction,
} from "./activity-interactions";
import {
  claimSeat,
  findAvailableSeat,
  findNearbyBench,
  getBench,
  getSeat,
  releaseSeat,
  moveSeat,
  finishSeatMove,
} from "./bench-registry";
import type { MultiplayerRoom } from "./multiplayer";
import type { RegisteredBench } from "./seating-types";
import { planesSeatSide } from "../../../packages/shared/planes-station";
import { takeTableStandRequest } from "./planes-activity";

export type ActivityPrompt = {
  main: string;
  detail: string;
  key?: string;
  secondary?: { main: string; key: "E" };
  shiftSeat?: boolean;
} | null;
export const localSeatedActorId = "local-player";
const catchStorageKey = "lake-cincis-catches";

export function WorldActivities({
  room,
  paused,
  resetKey = 0,
  onPrompt,
  onBusy,
  onFireMetrics,
}: {
  room: MultiplayerRoom;
  paused: boolean;
  resetKey?: number;
  onPrompt: (p: ActivityPrompt) => void;
  onBusy: (busy: boolean) => void;
  onFireMetrics?: (sample: FireMetrics) => void;
}) {
  const camera = useThree((state) => state.camera);
  const seatFeedback = useRef({ message: "", until: 0 });
  const [localLit, setLocalLit] = useState(false);
  const network = useSyncExternalStore(room.subscribe, room.getSnapshot);
  const lit = network.status === "offline" ? localLit : network.fireLit;
  const seatAttempt = useRef(0),
    seatPending = useRef(false),
    fireSent = useRef(false);
  const pendingLight = useRef(false);
  const [phase, setPhase] = useState<ActivityKind>("none");
  const state = useRef<ActivityInteraction>(idleActivity());
  const callbacks = useRef({ onPrompt, onBusy });
  callbacks.current = { onPrompt, onBusy };
  const message = useRef("");
  const messageUntil = useRef(0);
  const catchCount = useRef(0);
  const sessionCatches = useRef<unknown[]>([]);
  const storageAvailable = useRef(true);
  const lastPrompt = useRef("");
  const promptTick = useRef(0);
  const ground = terrainHeight(fireCircleSpot.x, fireCircleSpot.z);
  const previousReset = useRef(resetKey);
  const tableExitPending = useRef(false),
    pendingTableSeat = useRef(false),
    pendingCruceSeat = useRef(false);
  const isTableSeat = () =>
    planesSeatSide(state.current.seatId) !== null ||
    cruceSeatSide(state.current.seatId) !== null;

  const commit = useCallback(
    (next: ActivityInteraction) => {
      if (next === state.current) return;
      if (next.kind === "none") {
        if (
          planesSeatSide(state.current.seatId) !== null ||
          cruceSeatSide(state.current.seatId) !== null ||
          pendingTableSeat.current
        )
          tableExitPending.current = true;
        if (state.current.seatId || seatPending.current) room.releaseSeat();
        seatPending.current = false;
        pendingCruceSeat.current = false;
        releaseSeat(localSeatedActorId);
      }
      const previous = state.current;
      const preserveShiftClock =
        (next.kind === "scoot-left" || next.kind === "scoot-right") &&
        next.kind === previous.kind &&
        next.pose === previous.pose;
      state.current = next;
      setPhase(next.kind);
      if (!preserveShiftClock) setActivityPose(next.kind, next.pose);
      callbacks.current.onBusy(next.kind !== "none");
    },
    [room],
  );
  const clear = useCallback(() => {
    seatAttempt.current++;
    pendingLight.current = false;
    commit(idleActivity());
    lastPrompt.current = "";
    callbacks.current.onPrompt(null);
  }, [commit]);

  // Variant changes can move an occupied seat atomically; never release the
  // newly assigned seat merely because the old registry socket became empty.
  const adoptCruceReseat = useCallback(
    (now: number) => {
      const own = room.ownSeatId();
      if (
        !own ||
        own === state.current.seatId ||
        cruceSeatSide(own) === null ||
        cruceSeatSide(state.current.seatId) === null
      )
        return false;
      if (state.current.kind === "stand-up" || state.current.standAfterMove) {
        clear();
        return true;
      }
      const claimed = claimSeat(own, localSeatedActorId);
      if (claimed)
        commit({
          ...beginSitting(claimed, now),
          kind: "sit",
          deadline: Infinity,
        });
      return true; // Wait for a late-mounted socket instead of relinquishing it.
    },
    [room, commit, clear],
  );
  const requestSeat = useCallback(
    (seatId: string, accepted: () => void, rejected: () => void) => {
      pendingTableSeat.current =
        planesSeatSide(seatId) !== null || cruceSeatSide(seatId) !== null;
      pendingCruceSeat.current = cruceSeatSide(seatId) !== null;
      if (pendingTableSeat.current) tableExitPending.current = false;
      const attempt = ++seatAttempt.current;
      seatPending.current = true;
      callbacks.current.onBusy(true);
      void room.claimSeat(seatId).then((ok) => {
        if (attempt !== seatAttempt.current) {
          if (ok && !seatPending.current && !state.current.seatId)
            room.releaseSeat();
          return;
        }
        seatPending.current = false;
        pendingTableSeat.current = false;
        pendingCruceSeat.current = false;
        if (ok) accepted();
        else rejected();
        callbacks.current.onBusy(state.current.kind !== "none");
      });
    },
    [room],
  );

  const startLighting = useCallback(
    (now: number) => {
      pendingLight.current = false;
      fireSent.current = false;
      if (state.current.seatId) room.releaseSeat();
      releaseSeat(localSeatedActorId);
      commit(
        beginLightingFire(
          [
            playerPosition.x,
            terrainHeight(playerPosition.x, playerPosition.z),
            playerPosition.z,
          ],
          [fireCircleSpot.x, ground, fireCircleSpot.z],
          now,
        ),
      );
    },
    [commit, ground, room],
  );

  useEffect(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem(catchStorageKey) ?? "[]",
      );
      sessionCatches.current = Array.isArray(saved) ? saved : [];
      catchCount.current = sessionCatches.current.length;
    } catch {
      catchCount.current = 0;
      storageAvailable.current = false;
    }
    return () => {
      seatAttempt.current++;
      room.releaseSeat();
      releaseSeat(localSeatedActorId);
      setActivityPose("none");
      callbacks.current.onBusy(false);
      callbacks.current.onPrompt(null);
    };
  }, []);
  useEffect(() => {
    const sync = () => {
      if (!room.ownSeatId()) tableExitPending.current = false;
      const status = room.getSnapshot().status;
      if (status !== "online" && status !== "offline") clear();
      else if (
        status === "online" &&
        !seatPending.current &&
        adoptCruceReseat(performance.now())
      )
        return;
      else if (
        !seatPending.current &&
        state.current.seatId &&
        !activitySeatIsValid(
          state.current,
          getSeat(state.current.seatId),
          localSeatedActorId,
        )
      )
        clear();
      else if (
        status === "online" &&
        !state.current.seatId &&
        !seatPending.current &&
        !tableExitPending.current
      ) {
        const own = room.ownSeatId();
        if (
          (planesSeatSide(own) !== null || cruceSeatSide(own) !== null) &&
          own
        ) {
          const seat = getSeat(own);
          if (seat) {
            const claimed = claimSeat(own, localSeatedActorId);
            if (claimed) commit(beginSitting(claimed, performance.now()));
          }
        }
      }
    };
    sync();
    return room.subscribeWorld(sync);
  }, [room, clear, commit, adoptCruceReseat]);
  useEffect(() => {
    if (paused && !isTableSeat()) clear();
  }, [paused, clear]);
  useEffect(() => {
    if (previousReset.current === resetKey) return;
    previousReset.current = resetKey;
    clear();
    messageUntil.current = 0;
  }, [resetKey, clear]);
  useEffect(() => {
    const onBlur = () => {
      if (!isTableSeat()) clear();
    };
    const onVisibility = () => {
      if (document.hidden && !isTableSeat()) clear();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clear]);

  useEffect(() => {
    const handle = (event: ActionKey) => {
      const target = event.target;
      if (
        event.repeat ||
        paused ||
        vehicleOccupied() ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
      )
        return;
      const now = performance.now();
      if (seatPending.current) {
        if (["Escape", "KeyF"].includes(event.code)) {
          event.preventDefault();
          clear();
        }
        return;
      }
      const current = state.current;
      const seated = [
        "sit-down",
        "sit",
        "scoot-left",
        "scoot-right",
        "stand-up",
      ].includes(current.kind);
      if (event.code === "Escape" || (event.code === "KeyF" && seated)) {
        if (current.kind !== "none") {
          event.preventDefault();
          pendingLight.current = false;
          commit(cancelActivity(current, now));
        }
        return;
      }
      if (isTableSeat()) return;
      if (
        (event.code === "KeyA" || event.code === "KeyD") &&
        current.kind === "sit" &&
        current.seatId
      ) {
        event.preventDefault();
        const seat = getSeat(current.seatId);
        if (!seat) return;
        const step = seatStepForKey(event.code, seat.facing, {
          x: camera.matrixWorld.elements[0],
          z: camera.matrixWorld.elements[2],
        });
        const adjacent = getBench(seat.benchId)?.seats[seat.index + step];
        const shift = () => {
          const moved = moveSeat(localSeatedActorId, step);
          const destination = adjacent && getSeat(adjacent.id);
          if (moved || destination?.occupantId === localSeatedActorId) {
            seatFeedback.current.until = 0;
            commit(
              beginSeatMove(
                moved?.from ?? seat,
                moved?.to ?? destination!,
                performance.now(),
              ),
            );
          } else {
            room.releaseSeat();
            clear();
          }
        };
        const blocked = () => {
          seatFeedback.current = {
            message: adjacent ? "That seat is taken." : "End of the bench.",
            until: performance.now() + 1200,
          };
        };
        if (!adjacent || adjacent.occupantId !== null || adjacent.reservedBy)
          blocked();
        else if (room.getSnapshot().status === "online")
          requestSeat(adjacent.id, shift, blocked);
        else if (room.getSnapshot().status === "offline") shift();
        else blocked();
        return;
      }
      if (event.code === "KeyF" && current.kind === "none") {
        const bench = findNearbyBench(playerPosition);
        if (bench) {
          event.preventDefault();
          const available = findAvailableSeat(
            bench.id,
            playerPosition,
            localSeatedActorId,
          );
          const sit = () => {
            const seat =
              available && claimSeat(available.id, localSeatedActorId);
            if (seat) {
              messageUntil.current = 0;
              commit(beginSitting(seat, performance.now()));
            } else {
              room.releaseSeat();
              clear();
            }
          };
          const blocked = () => {
            message.current = bench.id.startsWith("cruce-")
              ? room.getSnapshot().status === "online"
                ? "Masa de Cruce · Loc indisponibil"
                : "Masa de Cruce · Reconectează-te ca să poți ocupa un loc"
              : `${bench.label} · Seat unavailable`;
            messageUntil.current = performance.now() + 2500;
          };
          if (available && room.getSnapshot().status === "online")
            requestSeat(available.id, sit, blocked);
          else if (
            available &&
            room.getSnapshot().status === "offline" &&
            !bench.id.startsWith("cruce-")
          )
            sit();
          else blocked();
        }
        return;
      }
      if (event.code !== "KeyE") return;
      if (current.kind === "fish-wait") {
        event.preventDefault();
        commit(idleActivity());
        return;
      }
      if (current.kind === "bite") {
        event.preventDefault();
        const next = reelActivity(current, now);
        if (next) commit(next);
        return;
      }
      if (current.kind !== "none" && !seated) return;
      const fish = fishingSpots.findIndex(
        (p) => Math.hypot(playerPosition.x - p.x, playerPosition.z - p.z) < 5.5,
      );
      if (fish >= 0 && !seated) {
        event.preventDefault();
        const spot = fishingSpots[fish];
        messageUntil.current = 0;
        commit(
          beginFishing(
            fish,
            {
              // Stay where the cast began; the float is six metres lakeward of the station.
              anchor: [
                playerPosition.x,
                terrainHeight(playerPosition.x, playerPosition.z),
                playerPosition.z,
              ],
              lineTarget: [spot.x, 0.07, spot.z - 6],
              facing: Math.atan2(
                spot.x - playerPosition.x,
                spot.z - 6 - playerPosition.z,
              ),
            },
            now,
            Math.random(),
          ),
        );
      } else if (
        Math.hypot(
          playerPosition.x - fireCircleSpot.x,
          playerPosition.z - fireCircleSpot.z,
        ) < 6.5
      ) {
        event.preventDefault();
        if (lit) {
          if (room.getSnapshot().status === "offline") setLocalLit(false);
          else room.setFire(false);
        } else if (seated) {
          pendingLight.current = true;
          commit(cancelActivity(current, now));
        } else startLighting(now);
      }
    };
    const unbindMobile = subscribeMobileActions(handle);
    window.addEventListener("keydown", handle);
    return () => {
      unbindMobile();
      window.removeEventListener("keydown", handle);
    };
  }, [paused, commit, camera, lit, startLighting, clear, room, requestSeat]);

  useFrame((_, dt) => {
    if (vehicleOccupied()) {
      if (state.current.kind !== "none" || lastPrompt.current) clear();
      return;
    }
    const now = performance.now();
    if (!room.ownSeatId()) tableExitPending.current = false;
    if (takeTableStandRequest() && isTableSeat())
      commit(cancelActivity(state.current, now));
    const reseating =
      !seatPending.current &&
      room.getSnapshot().status === "online" &&
      adoptCruceReseat(now);
    // The server can restore a saved match before the bench assets finish mounting.
    if (
      !state.current.seatId &&
      !seatPending.current &&
      !tableExitPending.current &&
      room.getSnapshot().status === "online"
    ) {
      const own = room.ownSeatId();
      if (
        own &&
        (planesSeatSide(own) !== null || cruceSeatSide(own) !== null)
      ) {
        const seat = getSeat(own);
        if (seat) {
          const claimed = claimSeat(own, localSeatedActorId);
          if (claimed) commit(beginSitting(claimed, now));
        }
      }
    }
    if (
      !reseating &&
      !seatPending.current &&
      state.current.seatId &&
      !activitySeatIsValid(
        state.current,
        getSeat(state.current.seatId),
        localSeatedActorId,
      )
    )
      clear();
    if (!paused) {
      const current = state.current;
      if (
        current.kind === "light-fire" &&
        !lit &&
        !fireSent.current &&
        now >=
          current.deadline - (fireLightingDuration - fireIgnitionTime) * 1000
      ) {
        if (room.getSnapshot().status === "offline") {
          setLocalLit(true);
          fireSent.current = true;
        } else if (room.getSnapshot().status === "online") {
          room.setFire(true);
          fireSent.current = true;
        }
      }
      const next = advanceActivity(current, now);
      if (next.outcome === "seat-moved") finishSeatMove(localSeatedActorId);
      if (next.outcome === "caught") {
        const species = ["Perch", "Carp", "Roach", "Pike"][
          Math.floor(Math.random() * 4)
        ];
        const kg = Number((0.3 + Math.random() * 3).toFixed(1));
        let catches: unknown[] = [...sessionCatches.current];
        try {
          const saved: unknown = JSON.parse(
            localStorage.getItem(catchStorageKey) ?? "[]",
          );
          if (Array.isArray(saved) && storageAvailable.current) catches = saved;
        } catch {
          /* Browser storage may be unavailable. */
        }
        catches.push({ species, kg, at: new Date().toISOString() });
        sessionCatches.current = catches.slice(-50);
        catchCount.current = sessionCatches.current.length;
        try {
          localStorage.setItem(
            catchStorageKey,
            JSON.stringify(sessionCatches.current),
          );
          storageAvailable.current = true;
        } catch {
          storageAvailable.current = false;
          /* Keep fishing usable when storage is blocked. */
        }
        message.current = `${species} · ${kg.toFixed(1)} kg`;
        messageUntil.current = now + 4500;
      } else if (next.outcome === "escaped") {
        message.current = "It got away. Try another cast.";
        messageUntil.current = now + 3500;
      }
      if (next.state.kind === "none" && pendingLight.current)
        startLighting(now);
      else commit(next.state);
    }
    promptTick.current += dt;
    if (promptTick.current < 0.1) return;
    promptTick.current = 0;
    const current = state.current;
    let prompt: ActivityPrompt = null;
    const seat = current.seatId ? getSeat(current.seatId) : undefined;
    const occupiedBench = seat ? getBench(seat.benchId) : undefined;
    const nearbyBench = findNearbyBench(playerPosition);
    const nearFishing = fishingSpots.some(
      (p) => Math.hypot(playerPosition.x - p.x, playerPosition.z - p.z) < 5.5,
    );
    const nearFire =
      Math.hypot(
        playerPosition.x - fireCircleSpot.x,
        playerPosition.z - fireCircleSpot.z,
      ) < 6.5;
    const freeCount = (bench: RegisteredBench) =>
      bench.seats.filter(
        (candidate) => candidate.occupantId === null && !candidate.reservedBy,
      ).length;
    const atCruce =
      cruceSeatSide(current.seatId) !== null || pendingCruceSeat.current;
    const seatDescription = atCruce
      ? "Masa de Cruce"
      : (occupiedBench?.label ?? "Bench");
    const secondaryAction = nearFishing
      ? "E to cast a line"
      : nearFire
        ? `E to ${lit ? "put out" : "light"} the fire`
        : "";
    if (!paused) {
      if (seatPending.current)
        prompt = {
          main: atCruce ? "Se rezervă locul…" : "Reserving a seat…",
          detail: atCruce
            ? "Așteptăm confirmarea · F sau Esc pentru anulare"
            : "Waiting for the room · F or Escape to cancel",
          key: "F",
        };
      else if (current.kind === "fire-approach")
        prompt = { main: "Walking to the fire…", detail: "Escape to cancel" };
      else if (current.kind === "light-fire")
        prompt = { main: "Lighting the fire…", detail: "Escape to cancel" };
      else if (current.kind === "sit-down")
        prompt = {
          main: seatDescription,
          detail: atCruce
            ? "Te așezi la masă… · F ca să te ridici"
            : "Taking a seat… · F or Escape to stand",
          key: "F",
        };
      else if (current.kind === "sit")
        prompt = {
          main: seatDescription,
          detail: atCruce
            ? "Deschide Cruce ca să joci · F ca să te ridici de la masă"
            : isTableSeat()
              ? "Open the paper to play · F leaves the table"
              : `${now < seatFeedback.current.until ? seatFeedback.current.message : "A/D to shift"} · F or Escape to stand${nearFire ? ` · E to ${lit ? "put out" : "light"} the fire` : ""}`,
          key: "F",
          shiftSeat: !isTableSeat(),
          ...(nearFire && !isTableSeat()
            ? {
                secondary: {
                  main: lit ? "Put out the campfire" : "Light the campfire",
                  key: "E" as const,
                },
              }
            : {}),
        };
      else if (current.kind === "scoot-left" || current.kind === "scoot-right")
        prompt = {
          main: seatDescription,
          detail: current.standAfterMove
            ? atCruce
              ? "Schimbi locul, apoi te ridici…"
              : "Shifting over, then standing…"
            : atCruce
              ? "Schimbi locul…"
              : "Shifting over…",
        };
      else if (current.kind === "stand-up")
        prompt = {
          main: seatDescription,
          detail: atCruce ? "Te ridici de la masă…" : "Standing up…",
        };
      else if (current.kind === "cast")
        prompt = { main: "Casting…", detail: "Escape to cancel" };
      else if (current.kind === "fish-wait")
        prompt = {
          main: "Waiting for a bite…",
          detail: "Watch the float. E or Escape cancels.",
          key: "E",
        };
      else if (current.kind === "bite")
        prompt = { main: "Bite! Reel it in", detail: "Press E now.", key: "E" };
      else if (current.kind === "reel")
        prompt = { main: "Reeling it in…", detail: "Keep the line steady." };
      else if (current.kind === "catch")
        prompt = {
          main: message.current,
          detail: storageAvailable.current
            ? "Caught! Saved on this browser."
            : "Caught! Browser storage unavailable; kept for this session.",
        };
      else if (nearbyBench) {
        const free = freeCount(nearbyBench);
        prompt =
          free > 0
            ? {
                main: `Sit · ${nearbyBench.label}`,
                ...(nearbyBench.id.startsWith("cruce-")
                  ? { main: "Joacă Cruce" }
                  : {}),
                ...(nearbyBench.id.startsWith("planes-")
                  ? { main: "Play Planes" }
                  : {}),
                detail: nearbyBench.id.startsWith("cruce-")
                  ? "Așază-te ca să joci sau deschide masa ca spectator."
                  : secondaryAction || "Take a seat.",
                key: "F",
              }
            : {
                main: nearbyBench.id.startsWith("cruce-")
                  ? "Masa de Cruce · Loc ocupat"
                  : `${nearbyBench.label} · Full`,
                detail: nearbyBench.id.startsWith("cruce-")
                  ? "Alege alt loc liber sau urmărește partida ca spectator."
                  : secondaryAction || "All seats are taken.",
                ...(secondaryAction && !nearbyBench.id.startsWith("cruce-")
                  ? { key: "E" }
                  : {}),
              };
      } else if (message.current && now < messageUntil.current)
        prompt = {
          main: message.current,
          detail: `${catchCount.current} ${catchCount.current === 1 ? "catch" : "catches"} ${storageAvailable.current ? "saved on this browser" : "kept for this session"}`,
        };
      else if (nearFishing)
        prompt = {
          main: "Cast a line",
          detail: `${catchCount.current} ${catchCount.current === 1 ? "catch" : "catches"} · ${storageAvailable.current ? "saved on this browser" : "browser storage unavailable"}`,
          key: "E",
        };
      else if (nearFire)
        prompt = {
          main: lit ? "Put out the campfire" : "Light the campfire",
          detail: "Walk to a bench and press F to sit",
          key: "E",
        };
    }
    if (
      prompt &&
      nearbyBench &&
      current.kind === "none" &&
      !nearbyBench.id.startsWith("cruce-") &&
      !nearbyBench.id.startsWith("planes-")
    ) {
      if (nearFishing) prompt.secondary = { main: "Cast a line", key: "E" };
      else if (nearFire)
        prompt.secondary = {
          main: lit ? "Put out the campfire" : "Light the campfire",
          key: "E",
        };
    }
    const text = JSON.stringify(prompt);
    if (text !== lastPrompt.current) {
      lastPrompt.current = text;
      callbacks.current.onPrompt(prompt);
    }
  });
  return (
    <>
      {fishingSpots.map((p, i) => {
        const y = terrainHeight(p.x, p.z);
        const biting = phase === "bite" && state.current.station === i;
        return (
          <group key={i} position={[p.x, y, p.z]}>
            <Bench
              benchId={`fishing-${i}`}
              facing={0}
              bench={{ id: `fishing-${i}`, label: "Fishing bench" }}
              height={0.5}
              position={[1.8, 0, 1.5]}
              rotation={Math.PI}
            />
            <Model id="Crate_Wooden" height={0.42} position={[-1, 0, 0.4]} />
            <mesh position={[0, 0.07 - y, -6]}>
              <sphereGeometry args={[biting ? 0.15 : 0.09, 10, 8]} />
              <meshStandardMaterial color={biting ? "#f5d775" : "#ad624c"} />
            </mesh>
          </group>
        );
      })}
      <Campfire
        active={lit}
        onMetrics={onFireMetrics}
        position={[fireCircleSpot.x, ground + 0.26, fireCircleSpot.z]}
      />
    </>
  );
}
