import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Model } from "./assets";
import { playerPosition } from "./player";
import { terrainHeight, fishingSpots } from "./geography";
import { fireCircleSpot } from "./settlement";
import { setActivityPose, type ActivityKind } from "./activity-state";
import { Campfire, type FireMetrics } from "./campfire";
import { Bench } from "./Bench";
import { fireIgnitionTime, fireLightingDuration } from "./character-actions";
import { getBmxState } from "./bmx-state";
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

export type ActivityPrompt = {
  main: string;
  detail: string;
  key?: string;
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
  const seatAttempt = useRef(0), seatPending = useRef(false), fireSent = useRef(false);
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

  const commit = useCallback((next: ActivityInteraction) => {
    if (next === state.current) return;
    if (next.kind === "none") {
      if (state.current.seatId || seatPending.current) room.releaseSeat();
      seatPending.current = false;
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
  }, [room]);
  const clear = useCallback(() => {
    seatAttempt.current++;
    pendingLight.current = false;
    commit(idleActivity());
    lastPrompt.current = "";
    callbacks.current.onPrompt(null);
  }, [commit]);

  const requestSeat = useCallback((seatId: string, accepted: () => void, rejected: () => void) => {
    const attempt = ++seatAttempt.current;
    seatPending.current = true;
    callbacks.current.onBusy(true);
    void room.claimSeat(seatId).then((ok) => {
      if (attempt !== seatAttempt.current) {
        if (ok && !seatPending.current && !state.current.seatId) room.releaseSeat();
        return;
      }
      seatPending.current = false;
      if (ok) accepted();
      else rejected();
      callbacks.current.onBusy(state.current.kind !== "none");
    });
  }, [room]);

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
  useEffect(() => room.subscribeWorld(() => {
    const status = room.getSnapshot().status;
    if (status !== "online" && status !== "offline") clear();
    else if (!seatPending.current && state.current.seatId && !activitySeatIsValid(state.current, getSeat(state.current.seatId), localSeatedActorId)) clear();
  }), [room, clear]);
  useEffect(() => {
    if (paused) clear();
  }, [paused, clear]);
  useEffect(() => {
    clear();
    messageUntil.current = 0;
  }, [resetKey, clear]);
  useEffect(() => {
    const onBlur = () => clear();
    const onVisibility = () => {
      if (document.hidden) clear();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [clear]);

  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      const target = event.target;
      if (
        event.repeat ||
        paused ||
        getBmxState().mounted ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)))
      )
        return;
      const now = performance.now();
      if (seatPending.current) {
        if (["Escape", "KeyF"].includes(event.code)) { event.preventDefault(); clear(); }
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
            commit(beginSeatMove(moved?.from ?? seat, moved?.to ?? destination!, performance.now()));
          } else {
            room.releaseSeat();
            clear();
          }
        };
        const blocked = () => { seatFeedback.current = { message: adjacent ? "That seat is taken." : "End of the bench.", until: performance.now() + 1200 }; };
        if (!adjacent || adjacent.occupantId !== null || adjacent.reservedBy) blocked();
        else if (room.getSnapshot().status === "online") requestSeat(adjacent.id, shift, blocked);
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
            const seat = available && claimSeat(available.id, localSeatedActorId);
            if (seat) {
              messageUntil.current = 0;
              commit(beginSitting(seat, performance.now()));
            } else {
              room.releaseSeat();
              clear();
            }
          };
          const blocked = () => {
            message.current = `${bench.label} · Seat unavailable`;
            messageUntil.current = performance.now() + 2500;
          };
          if (available && room.getSnapshot().status === "online") requestSeat(available.id, sit, blocked);
          else if (available && room.getSnapshot().status === "offline") sit();
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
        }
        else if (seated) {
          pendingLight.current = true;
          commit(cancelActivity(current, now));
        } else startLighting(now);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [paused, commit, camera, lit, startLighting, clear, room, requestSeat]);

  useFrame((_, dt) => {
    if (getBmxState().mounted) {
      if (state.current.kind !== "none" || lastPrompt.current) clear();
      return;
    }
    const now = performance.now();
    if (
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
        if (room.getSnapshot().status === "offline") { setLocalLit(true); fireSent.current = true; }
        else if (room.getSnapshot().status === "online") { room.setFire(true); fireSent.current = true; }
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
    const seatDescription = occupiedBench?.label ?? "Bench";
    const secondaryAction = nearFishing
      ? "E to cast a line"
      : nearFire
        ? `E to ${lit ? "put out" : "light"} the fire`
        : "";
    if (!paused) {
      if (seatPending.current)
        prompt = { main: "Reserving a seat…", detail: "Waiting for the room · F or Escape to cancel", key: "F" };
      else if (current.kind === "fire-approach")
        prompt = { main: "Walking to the fire…", detail: "Escape to cancel" };
      else if (current.kind === "light-fire")
        prompt = { main: "Lighting the fire…", detail: "Escape to cancel" };
      else if (current.kind === "sit-down")
        prompt = {
          main: seatDescription,
          detail: "Taking a seat… · F or Escape to stand",
          key: "F",
        };
      else if (current.kind === "sit")
        prompt = {
          main: seatDescription,
          detail: `${now < seatFeedback.current.until ? seatFeedback.current.message : "A/D to shift"} · F or Escape to stand${nearFire ? ` · E to ${lit ? "put out" : "light"} the fire` : ""}`,
          key: "F",
        };
      else if (current.kind === "scoot-left" || current.kind === "scoot-right")
        prompt = {
          main: seatDescription,
          detail: current.standAfterMove
            ? "Shifting over, then standing…"
            : "Shifting over…",
        };
      else if (current.kind === "stand-up")
        prompt = { main: seatDescription, detail: "Standing up…" };
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
                detail: secondaryAction || "Take a seat.",
                key: "F",
              }
            : {
                main: `${nearbyBench.label} · Full`,
                detail: secondaryAction || "All seats are taken.",
                ...(secondaryAction ? { key: "E" } : {}),
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
