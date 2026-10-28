/** Safe shared-world check: node apps/server/websocket-smoke.mjs [http(s)://host] [allowed-origin] */
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import WebSocket from "ws";
import {
  CANONICAL_WORLD_ID,
  HOUSING_EPOCH,
} from "../../packages/shared/protocol.ts";

const host = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const origin = process.argv[3] ?? "http://127.0.0.1:4173";
const sockets = [];

// Every accepted alias reaches the real shared world. This harness never
// allocates a home, supplies a private credential, claims a seat, moves a
// player, or changes the campfire. Exhaustive mutation tests live in Vitest.
async function connect(id = CANONICAL_WORLD_ID) {
  // ws permits the browser Origin header; Node's standard constructor does not.
  const socket = new WebSocket(
    `${host.replace(/^http/, "ws")}/parties/world-room/${id}?_pk=same-client-id`,
    { origin },
  );
  sockets.push(socket);
  const messages = [],
    pending = [];
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    const index = pending.findIndex((waiter) => waiter.matches(message));
    if (index >= 0) {
      const waiter = pending.splice(index, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else messages.push(message);
  });
  const next = (matches) =>
    new Promise((resolve, reject) => {
      const index = messages.findIndex(matches);
      if (index >= 0) {
        resolve(messages.splice(index, 1)[0]);
        return;
      }
      const waiter = {
        matches,
        resolve,
        timer: setTimeout(() => {
          pending.splice(pending.indexOf(waiter), 1);
          reject(Error("Timed out waiting for a shared-world message"));
        }, 8000),
      };
      pending.push(waiter);
    });
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return {
    socket,
    next,
    sync: () => socket.send(JSON.stringify({ type: "sync" })),
    snapshot: await next((message) => message.type === "snapshot"),
  };
}
async function close(client) {
  if (client.socket.readyState === WebSocket.CLOSED) return;
  await new Promise((resolve) => {
    client.socket.once("close", resolve);
    client.socket.close(1000, "Connection check complete");
  });
}
const contains = (snapshot, id) =>
  snapshot.players.some((player) => player.id === id);

try {
  const health = await fetch(`${host}/health`);
  assert.equal(health.status, 200);
  const healthData = await health.json();
  assert.equal(healthData.version, 1);
  assert.equal(healthData.worldId, CANONICAL_WORLD_ID);
  assert.equal(healthData.housingEpoch, HOUSING_EPOCH);
  assert.equal(
    (
      await fetch(`${host}/parties/world-room/${CANONICAL_WORLD_ID}`, {
        headers: { origin: "https://denied.invalid" },
      })
    ).status,
    403,
  );
  assert.equal(
    (await fetch(`${host}/parties/world-room/public`, { headers: { origin } }))
      .status,
    404,
  );
  const a = await connect(),
    b = await connect(randomBytes(18).toString("base64url")),
    c = await connect(randomBytes(18).toString("base64url"));
  assert.equal(
    a.snapshot.village?.epoch,
    HOUSING_EPOCH,
    "the deployed housing generation must be current",
  );
  assert.ok(
    a.snapshot.village.cabins.every((c, index) => c.index === index),
    "cabins must be densely numbered",
  );
  const aId = a.snapshot.selfId,
    bId = b.snapshot.selfId,
    cId = c.snapshot.selfId;
  assert.equal(
    new Set([aId, bId, cId]).size,
    3,
    "client-supplied _pk values must not control public identity",
  );
  assert.ok(
    contains(b.snapshot, aId),
    "a legacy link must join the canonical world",
  );
  assert.ok(
    contains(c.snapshot, aId) && contains(c.snapshot, bId),
    "all accepted legacy links must share presence",
  );
  await a.next(
    (message) => message.type === "joined" && message.player.id === bId,
  );
  await b.next(
    (message) => message.type === "joined" && message.player.id === cId,
  );
  for (const client of [a, b, c]) {
    assert.ok(
      client.snapshot.home === undefined,
      "a connection check must not allocate a cabin",
    );
    assert.ok(
      typeof client.snapshot.fire.lit === "boolean" &&
        Number.isSafeInteger(client.snapshot.fire.revision),
      "the shared fire snapshot must be valid",
    );
    assert.ok(
      client.snapshot.seats && typeof client.snapshot.seats === "object",
      "the shared seats snapshot must be valid",
    );
  }
  a.sync();
  const synced = await a.next((message) => message.type === "snapshot");
  assert.ok(
    contains(synced, bId) && contains(synced, cId),
    "sync must contain clients from every legacy link",
  );
  await close(a);
  await b.next((message) => message.type === "left" && message.id === aId);
  b.sync();
  const afterLeave = await b.next((message) => message.type === "snapshot");
  assert.ok(
    !contains(afterLeave, aId) && contains(afterLeave, cId),
    "disconnect cleanup must preserve other clients",
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        host,
        worldId: CANONICAL_WORLD_ID,
        housingEpoch: a.snapshot.village.epoch,
        cabinCount: a.snapshot.village.cabins.length,
        fire: a.snapshot.fire,
        checks: [
          "health",
          "origin-policy",
          "path-validation",
          "server-identity",
          "canonical-world",
          "legacy-link-aliases",
          "shared-presence",
          "read-only-fire-snapshot",
          "read-only-seats-snapshot",
          "no-home-allocation",
          "sequential-cabin-roster",
          "snapshot-sync",
          "departure-cleanup",
        ],
      },
      null,
      2,
    ),
  );
} finally {
  await Promise.all(sockets.map((socket) => close({ socket })));
}
