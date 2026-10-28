import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useFrame } from "@react-three/fiber";
import { Model } from "./assets";
import { playerPosition } from "./player";
import { terrainHeight, fishingSpots } from "./geography";
import { fireCircleSpot } from "./settlement";
import { setActivityPose, type ActivityKind } from "./activity-state";
import { Campfire } from "./campfire";
import { Bench } from "./Bench";
import { getBmxState } from "./bmx-state";
import {
  activitySeatIsValid,
  advanceActivity,
  beginFishing,
  beginSitting,
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
}: {
  room: MultiplayerRoom;
  paused: boolean;
  resetKey?: number;
  onPrompt: (p: ActivityPrompt) => void;
  onBusy: (busy: boolean) => void;
}) {
  const [localLit, setLocalLit] = useState(false);
  const network = useSyncExternalStore(room.subscribe, room.getSnapshot);
  const lit = network.status === "offline" ? localLit : network.fireLit;
  const seatAttempt = useRef(0);
  const seatPending = useRef(false);
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
      if (state.current.seatId) room.releaseSeat();
      releaseSeat(localSeatedActorId);
    }
    state.current = next;
    setPhase(next.kind);
    setActivityPose(next.kind, next.pose);
    callbacks.current.onBusy(next.kind !== "none");
  }, [room]);
  const clear = useCallback(() => {
    seatAttempt.current++;
    if (seatPending.current) {
      seatPending.current = false;
      room.releaseSeat();
      callbacks.current.onBusy(false);
    }
    commit(idleActivity());
    lastPrompt.current = "";
    callbacks.current.onPrompt(null);
  }, [commit, room]);

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
    if (room.getSnapshot().status !== "online" && room.getSnapshot().status !== "offline") clear();
    else if (state.current.seatId && !activitySeatIsValid(state.current, getSeat(state.current.seatId), localSeatedActorId)) clear();
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
      const seated = ["sit-down", "sit", "stand-up"].includes(current.kind);
      if (event.code === "Escape" || (event.code === "KeyF" && seated)) {
        if (current.kind !== "none") {
          event.preventDefault();
          commit(cancelActivity(current, now));
        }
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
          if (available && room.getSnapshot().status === "online") {
            const attempt = ++seatAttempt.current;
            seatPending.current = true;
            callbacks.current.onBusy(true);
            void room.claimSeat(available.id).then((accepted) => {
              if (attempt !== seatAttempt.current) {
                if (accepted && !seatPending.current && !state.current.seatId) room.releaseSeat();
                return;
              }
              seatPending.current = false;
              callbacks.current.onBusy(false);
              const seat = accepted ? claimSeat(available.id, localSeatedActorId) : undefined;
              if (seat) {
                messageUntil.current = 0;
                commit(beginSitting(seat, performance.now()));
              } else {
                if (accepted) room.releaseSeat();
                commit(idleActivity());
                message.current = `${bench.label} · Seat unavailable`;
                messageUntil.current = performance.now() + 2500;
              }
            });
          } else if (available && room.getSnapshot().status === "offline") {
            const seat = claimSeat(available.id, localSeatedActorId);
            if (seat) commit(beginSitting(seat, now));
          } else {
            // No claim means no pose change, even if another actor took the last seat.
            message.current = `${bench.label} · Full`;
            messageUntil.current = now + 2000;
          }
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
        if (room.getSnapshot().status === "offline") setLocalLit((value) => !value);
        else room.toggleFire();
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, [paused, commit, clear, room]);

  useFrame((_, dt) => {
    if (getBmxState().mounted) {
      if (state.current.kind !== "none" || lastPrompt.current) clear();
      return;
    }
    const now = performance.now();
    if (
      state.current.seatId &&
      !activitySeatIsValid(
        state.current,
        getSeat(state.current.seatId),
        localSeatedActorId,
      )
    )
      clear();
    if (!paused) {
      const next = advanceActivity(state.current, now);
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
      commit(next.state);
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
      bench.seats.filter((candidate) => candidate.occupantId === null).length;
    const seatDescription = occupiedBench?.label ?? "Bench";
    const secondaryAction = nearFishing
      ? "E to cast a line"
      : nearFire
        ? `E to ${lit ? "put out" : "light"} the fire`
        : "";
    if (!paused) {
      if (seatPending.current)
        prompt = { main: "Reserving a seat…", detail: "Waiting for the room · F or Escape to cancel", key: "F" };
      else if (current.kind === "sit-down")
        prompt = {
          main: seatDescription,
          detail: "Taking a seat… · F or Escape to stand",
          key: "F",
        };
      else if (current.kind === "sit")
        prompt = {
          main: seatDescription,
          detail: `F or Escape to stand${nearFire ? ` · E to ${lit ? "put out" : "light"} the fire` : ""}`,
          key: "F",
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
      {lit && (
        <Campfire
          position={[fireCircleSpot.x, ground + 0.26, fireCircleSpot.z]}
        />
      )}
    </>
  );
}
