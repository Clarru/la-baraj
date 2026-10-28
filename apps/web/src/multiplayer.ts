import PartySocket from "partysocket";
import {
  CANONICAL_WORLD_ID,
  HOUSING_EPOCH,
  isResumeToken,
  type PublicCabin,
  type ClientMessage,
  type PlayerPose,
  type PlayerPresence,
  type ServerMessage,
} from "../../../packages/shared/protocol";
import { syncOnlineSeats } from "./bench-registry";
import { readPlayerName, savePlayerName } from "./player-name";
import { isHomeIndex, shouldSpawnAtHome } from "./home";

export type NetworkStatus =
  "connecting" | "online" | "reconnecting" | "full" | "error" | "offline";
type RoomView = {
  status: NetworkStatus;
  selfId: string;
  nickname: string;
  ids: string[];
  count: number;
  error: string;
  errorCode: string | null;
  fireLit: boolean;
  homeIndex: number | null;
  cabins: PublicCabin[];
};
export type RemotePlayer = {
  player: PlayerPresence;
  receivedAt: number;
  activityAt: number;
};
export function roomFromLocation() {
  const url = new URL(location.href);
  if (url.searchParams.has("room")) {
    url.searchParams.delete("room");
    history.replaceState(null, "", url);
  }
  return CANONICAL_WORLD_ID;
}
type HomeCredential = { resumeToken: string; createHome: boolean };
const homeCredentialKey = (roomId: string) =>
  `la-baraj-home-resume-v2:${roomId}`;
function saveHomeCredential(roomId: string, credential: HomeCredential) {
  try {
    localStorage.setItem(homeCredentialKey(roomId), JSON.stringify(credential));
  } catch {
    /* Current-session resume remains available when storage is blocked. */
  }
}
function loadHomeCredential(roomId: string): HomeCredential {
  try {
    const saved = JSON.parse(
      localStorage.getItem(homeCredentialKey(roomId)) ?? "null",
    );
    if (
      isResumeToken(saved?.resumeToken) &&
      typeof saved.createHome === "boolean"
    )
      return { resumeToken: saved.resumeToken, createHome: saved.createHome };
  } catch {
    /* A missing or corrupt preference starts an anonymous owner. */
  }
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const credential = {
    resumeToken: btoa(String.fromCharCode(...bytes))
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replace(/=+$/, ""),
    createHome: true,
  };
  // Persist before registration so a dropped acknowledgement can retry the same owner.
  saveHomeCredential(roomId, credential);
  return credential;
}
let activeRoom: MultiplayerRoom | null = null;
export function currentMultiplayerRoom() {
  return activeRoom;
}
export class MultiplayerRoom {
  readonly roomId = roomFromLocation();
  readonly remotes = new Map<string, RemotePlayer>();
  private listeners = new Set<() => void>();
  private worldListeners = new Set<() => void>();
  private socket: PartySocket | null = null;
  private homeCredential: HomeCredential | null = null;
  private homeAcknowledged = false;
  private lastPose: PlayerPose | null = null;
  private sentPose = "";
  private lastSentAt = 0;
  private sentPoses = 0;
  private receivedPoses = 0;
  private seats: Record<string, string> = {};
  private pending = new Map<
    string,
    {
      resolve: (accepted: boolean) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();
  private diagnostic: HTMLOutputElement | null = null;
  private lastDiagnosticAt = 0;
  private view: RoomView = {
    status: "connecting",
    selfId: "",
    nickname: readPlayerName() ?? "Guest",
    ids: [],
    count: 0,
    error: "",
    errorCode: null,
    fireLit: false,
    homeIndex: null,
    cabins: [],
  };
  constructor(initialName?: string) {
    if (initialName) this.view = { ...this.view, nickname: initialName };
  }
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  getSnapshot = () => this.view;
  subscribeWorld = (listener: () => void) => {
    this.worldListeners.add(listener);
    return () => {
      this.worldListeners.delete(listener);
    };
  };
  private publish(patch: Partial<RoomView> = {}) {
    this.view = { ...this.view, ...patch };
    this.listeners.forEach((listener) => listener());
    this.writeDiagnostics(true);
  }
  private publishWorld() {
    this.worldListeners.forEach((listener) => listener());
  }
  attachDiagnostics = (node: HTMLOutputElement | null) => {
    this.diagnostic = node;
    this.writeDiagnostics(true);
  };
  private writeDiagnostics(force = false) {
    if (!this.diagnostic) return;
    const now = performance.now();
    if (!force && now - this.lastDiagnosticAt < 100) return;
    this.lastDiagnosticAt = now;
    this.diagnostic?.setAttribute(
      "data-network",
      JSON.stringify({
        ...this.view,
        roomId: this.roomId,
        inviteUrl: location.href,
        remotes: [...this.remotes.values()].map(({ player }) => player),
        localPose: this.lastPose,
        sentPoses: this.sentPoses,
        receivedPoses: this.receivedPoses,
        pendingSeatClaims: this.pending.size,
        seats: this.seats,
      }),
    );
  }
  connect() {
    activeRoom = this;
    const configured = import.meta.env.VITE_ROOM_SERVER_URL as
      string | undefined;
    if (!configured) {
      this.publish({
        status: "offline",
        error: "Room server is not configured",
      });
      return () => {
        if (activeRoom === this) activeRoom = null;
      };
    }
    let url: URL;
    try {
      url = new URL(
        configured.includes("://") ? configured : `https://${configured}`,
      );
    } catch {
      this.publish({
        status: "error",
        error: "Room server address is invalid",
      });
      return () => {
        if (activeRoom === this) activeRoom = null;
      };
    }
    this.homeCredential ??= loadHomeCredential(this.roomId);
    const socket = new PartySocket({
      host: url.host,
      protocol:
        ["localhost", "127.0.0.1"].includes(url.hostname) &&
        ["http:", "ws:"].includes(url.protocol)
          ? "ws"
          : "wss",
      party: "world-room",
      room: this.roomId,
      maxEnqueuedMessages: 0,
    });
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket) return;
      this.homeAcknowledged = false;
      this.sendHello();
      this.send({ type: "sync" });
    });
    socket.addEventListener("message", (event) => {
      if (this.socket !== socket || typeof event.data !== "string") return;
      try {
        this.receive(JSON.parse(event.data) as ServerMessage);
      } catch {
        /* Ignore malformed frames without interrupting the world. */
      }
    });
    socket.addEventListener("close", () => {
      if (this.socket !== socket) return;
      this.homeAcknowledged = false;
      this.remotes.clear();
      this.seats = {};
      syncOnlineSeats({}, "");
      this.resolvePending();
      if (!["full", "error"].includes(this.view.status))
        this.publish({ status: "reconnecting", count: 0, ids: [] });
      this.publishWorld();
    });
    return () => {
      this.socket = null;
      socket.close();
      this.resolvePending();
      this.remotes.clear();
      this.seats = {};
      syncOnlineSeats({}, "");
      if (activeRoom === this) activeRoom = null;
    };
  }
  private sendHello() {
    const savedName = readPlayerName();
    if (savedName) this.view = { ...this.view, nickname: savedName };
    const credential = this.homeCredential;
    this.send({
      type: "hello",
      nickname: this.view.nickname,
      housingEpoch: HOUSING_EPOCH,
      ...(credential
        ? {
            requestHome: true as const,
            resumeToken: credential.resumeToken,
            ...(credential.createHome ? { createHome: true as const } : {}),
          }
        : {}),
    });
  }
  private send(message: ClientMessage) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }
  private updateRemote(player: PlayerPresence) {
    if (player.id === this.view.selfId) return;
    const old = this.remotes.get(player.id);
    const added = !old,
      renamed = old?.player.nickname !== player.nickname;
    this.remotes.set(player.id, {
      player,
      receivedAt: performance.now(),
      activityAt:
        old && old.player.activity === player.activity
          ? old.activityAt
          : performance.now(),
    });
    if (added || renamed)
      this.publish({
        ids: [...this.remotes.keys()],
        count: this.remotes.size + 1,
      });
  }
  private receive(message: ServerMessage) {
    switch (message.type) {
      case "village": {
        if (message.village.epoch === HOUSING_EPOCH)
          this.publish({ cabins: message.village.cabins });
        break;
      }
      case "snapshot": {
        if (message.village && message.village.epoch !== HOUSING_EPOCH) {
          this.publish({
            status: "error",
            error: "The village has changed. Reload to join.",
            errorCode: "world-updated",
          });
          this.socket?.close();
          return;
        }
        if (message.village)
          this.view = { ...this.view, cabins: message.village.cabins };
        const previousHome = this.view.homeIndex;
        if (
          message.home &&
          isHomeIndex(message.home.index) &&
          isResumeToken(message.home.resumeToken)
        ) {
          this.homeAcknowledged = true;
          this.homeCredential = {
            resumeToken: message.home.resumeToken,
            createHome: false,
          };
          saveHomeCredential(this.roomId, this.homeCredential);
          this.view = { ...this.view, homeIndex: message.home.index };
          // A pre-assignment local pose belongs to the preview arrival, not the assigned cabin.
          if (shouldSpawnAtHome(previousHome, message.home.index))
            this.lastPose = null;
        }
        this.remotes.clear();
        this.view = { ...this.view, selfId: message.selfId };
        for (const player of message.players) this.updateRemote(player);
        this.seats = message.seats;
        syncOnlineSeats(this.seats, message.selfId);
        this.publish({
          status: this.homeAcknowledged
            ? "online"
            : this.view.homeIndex === null
              ? "connecting"
              : "reconnecting",
          error: "",
          errorCode: null,
          count: message.players.length,
          ids: [...this.remotes.keys()],
          fireLit: message.fire.lit,
        });
        this.sentPose = "";
        if (this.lastPose) this.publishPose(this.lastPose, true);
        this.publishWorld();
        break;
      }
      case "joined":
      case "pose":
        this.receivedPoses++;
        this.updateRemote(message.player);
        break;
      case "left":
        this.remotes.delete(message.id);
        this.publish({
          ids: [...this.remotes.keys()],
          count: this.remotes.size + 1,
        });
        break;
      case "fire":
        this.publish({ fireLit: message.fire.lit });
        this.publishWorld();
        break;
      case "seats":
        this.seats = message.seats;
        syncOnlineSeats(this.seats, this.view.selfId);
        this.publishWorld();
        break;
      case "seat-result": {
        const pending = this.pending.get(message.requestId);
        if (pending) {
          clearTimeout(pending.timer);
          this.pending.delete(message.requestId);
          pending.resolve(message.accepted);
        }
        break;
      }
      case "error": {
        const homeError = [
          "homes-full",
          "invalid-resume",
          "world-updated",
          "name-save-failed",
        ].includes(message.code);
        this.publish({
          status:
            message.code === "ROOM_FULL" || message.code === "room-full"
              ? "full"
              : homeError
                ? "error"
                : this.view.status === "online"
                  ? "online"
                  : "error",
          error: message.message,
          errorCode: message.code,
        });
        if (homeError || this.view.status === "full") this.socket?.close();
        break;
      }
    }
    this.writeDiagnostics();
  }
  publishMotion(sample: Record<string, unknown>) {
    if (
      this.view.homeIndex !== null &&
      sample.homeIndex !== undefined &&
      sample.homeIndex !== this.view.homeIndex
    )
      return;
    if (!Array.isArray(sample.feet) || !Array.isArray(sample.facing)) return;
    const position = sample.feet.map(
      (v) => Math.round(Number(v) * 1000) / 1000,
    ) as [number, number, number];
    if (!position.every(Number.isFinite)) return;
    const pose: PlayerPose = {
      position,
      yaw:
        Math.round(
          Math.atan2(Number(sample.facing[0]), Number(sample.facing[2])) * 1000,
        ) / 1000,
      animation: String(sample.animation ?? "Idle_Neutral"),
      activity: String(sample.activity ?? "none"),
      vehicle: sample.vehicle ? "scooter" : "none",
      jumpPhase: String(sample.jumpPhase ?? "grounded"),
      speed: sample.vehicle
        ? Number(sample.vehicleSpeed ?? 0)
        : Array.isArray(sample.velocity)
          ? Math.round(
              Math.hypot(
                Number(sample.velocity[0]),
                Number(sample.velocity[2]),
              ) * 100,
            ) / 100
          : 0,
    };
    const ownSeat = Object.entries(this.seats).find(
      ([, id]) => id === this.view.selfId,
    )?.[0];
    if (ownSeat) pose.seatId = ownSeat;
    this.lastPose = pose;
    this.publishPose(pose);
    this.writeDiagnostics();
  }
  private publishPose(pose: PlayerPose, force = false) {
    if (
      this.view.status !== "online" ||
      this.view.homeIndex === null ||
      !this.homeAcknowledged
    )
      return;
    const key = JSON.stringify(pose),
      now = performance.now();
    if (!force && (key === this.sentPose || now - this.lastSentAt < 120))
      return;
    this.send({ type: "pose", pose });
    this.sentPose = key;
    this.lastSentAt = now;
    this.sentPoses++;
  }
  rename(nickname: string) {
    const name = nickname
      .trim()
      .replace(/[\p{C}<>]/gu, "")
      .slice(0, 24);
    if (!name) return;
    try {
      savePlayerName(name);
    } catch {
      /* Optional preference. */
    }
    this.publish({ nickname: name });
    this.sendHello();
  }
  claimSeat(seatId: string): Promise<boolean> {
    if (this.view.status !== "online") return Promise.resolve(false);
    this.resolvePending();
    const requestId = crypto.randomUUID();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // A cancelled or superseded claim must never release a later valid seat.
        if (!this.pending.delete(requestId)) return;
        resolve(false);
        this.releaseSeat();
      }, 5000);
      this.pending.set(requestId, { resolve, timer });
      this.send({ type: "seat", seatId, requestId });
    });
  }
  releaseSeat() {
    // Clear request lifetimes as well as the server lease when Escape/blur cancels.
    this.resolvePending();
    this.send({ type: "seat", seatId: null, requestId: crypto.randomUUID() });
  }
  setFire(lit: boolean) {
    if (this.view.status === "online") this.send({ type: "fire", lit });
  }
  toggleFire() {
    this.setFire(!this.view.fireLit);
  }
  private resolvePending() {
    this.pending.forEach(({ resolve, timer }) => {
      clearTimeout(timer);
      resolve(false);
    });
    this.pending.clear();
  }
}
