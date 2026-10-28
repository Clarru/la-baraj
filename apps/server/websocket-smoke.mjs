/** Run a local or deployed worker check: node apps/server/websocket-smoke.mjs [http(s)://host] [allowed-origin] */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
// Node's standard WebSocket cannot supply an Origin header; ws is already in
// this project's dependency tree and gives this non-browser smoke test one.
import WebSocket from "ws";

const host = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const origin = process.argv[3] ?? "http://127.0.0.1:5173";
const room = randomBytes(18).toString("base64url");
const sockets = [];
async function connect(id = room) {
  const socket = new WebSocket(`${host.replace(/^http/, "ws")}/parties/world-room/${id}?_pk=same-client-id`, { origin });
  sockets.push(socket);
  const messages = [];
  const pending = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const index = pending.findIndex((waiter) => waiter.matches(message));
    if (index >= 0) { const waiter = pending.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(message); }
    else messages.push(message);
  });
  const next = (matches) => new Promise((resolve, reject) => {
    const index = messages.findIndex(matches);
    if (index >= 0) { resolve(messages.splice(index, 1)[0]); return; }
    const waiter = { matches, resolve, timer: setTimeout(() => { pending.splice(pending.indexOf(waiter), 1); reject(Error("Timed out waiting for room message")); }, 8000) };
    pending.push(waiter);
  });
  await new Promise((resolve, reject) => { socket.once("open", resolve); socket.once("error", reject); });
  return { socket, next, send: (message) => socket.send(JSON.stringify(message)), snapshot: await next((message) => message.type === "snapshot") };
}
async function close(client) {
  if (client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => { client.socket.once("close", resolve); client.socket.close(1000, "Smoke check complete"); });
}

try {
  const health = await fetch(`${host}/health`);
  assert.equal(health.status, 200);
  assert.equal((await health.json()).version, 1);
  assert.equal((await fetch(`${host}/parties/world-room/${room}`, { headers: { origin: "https://denied.invalid" } })).status, 403);
  assert.equal((await fetch(`${host}/parties/world-room/public`, { headers: { origin } })).status, 404);
  const a = await connect(), b = await connect(), isolated = await connect(randomBytes(18).toString("base64url"));
  const aId = a.snapshot.selfId, bId = b.snapshot.selfId;
  assert.notEqual(aId, bId, "server IDs must differ even with the same client _pk");
  assert.equal(b.snapshot.players.length, 2);
  assert.equal(isolated.snapshot.players.length, 1, "rooms must be isolated");
  assert.equal((await a.next((m) => m.type === "joined")).player.id, bId);
  a.send({ type: "hello", nickname: "Smoke friend A" });
  await b.next((m) => m.type === "pose" && m.player.nickname === "Smoke friend A");
  const pose = { position: [14, 2.5, -9], yaw: 1.2, animation: "walk", activity: "none", vehicle: "scooter", speed: 4 };
  a.send({ type: "pose", id: bId, pose });
  const received = await b.next((m) => m.type === "pose" && m.player.position[0] === 14);
  assert.equal(received.player.id, aId);
  assert.deepEqual(received.player.position, pose.position);
  a.send({ type: "seat", seatId: "campfire:seat:0", requestId: "seat-a" });
  assert.equal((await a.next((m) => m.type === "seat-result" && m.requestId === "seat-a")).accepted, true);
  b.send({ type: "seat", seatId: "campfire:seat:0", requestId: "seat-b" });
  assert.equal((await b.next((m) => m.type === "seat-result" && m.requestId === "seat-b")).accepted, false);
  a.send({ type: "fire", lit: false });
  const fire = await b.next((m) => m.type === "fire");
  assert.deepEqual(fire.fire, { lit: false, revision: 1 });
  await close(a);
  assert.equal((await b.next((m) => m.type === "left")).id, aId);
  assert.deepEqual((await b.next((m) => m.type === "seats" && Object.keys(m.seats).length === 0)).seats, {});
  b.send({ type: "seat", seatId: "campfire:seat:0", requestId: "seat-b-again" });
  assert.equal((await b.next((m) => m.type === "seat-result" && m.requestId === "seat-b-again")).accepted, true);
  await close(b);
  const reconnected = await connect();
  assert.equal(reconnected.snapshot.players.length, 1);
  assert.deepEqual(reconnected.snapshot.seats, {});
  assert.deepEqual(reconnected.snapshot.fire, { lit: false, revision: 1 });
  console.log(JSON.stringify({ ok: true, host, room, checks: ["health", "origin-policy", "private-room-id", "independent-connections", "server-identity", "presence", "pose", "room-isolation", "seat-conflict", "departure-seat-release", "shared-fire", "reconnect-snapshot"] }, null, 2));
} finally {
  for (const socket of sockets) if (socket.readyState !== WebSocket.CLOSED) socket.close(1000, "Smoke check complete");
}
