/** Opt-in live table check. Never allocates homes; refuses an occupied table. */
import assert from "node:assert/strict";
import WebSocket from "ws";
import { CANONICAL_WORLD_ID } from "../../packages/shared/protocol.ts";
import {
  randomFleet,
  planeCells,
  targetUnavailable,
} from "../../packages/shared/planes.ts";
import {
  PLANES_SEATS,
  planesSeatPose,
} from "../../packages/shared/planes-station.ts";

const host = process.argv[2];
const origin = process.argv[3];
if (!host || !origin || !process.argv.includes("--exercise-empty-table")) {
  throw Error(
    "Pass host, allowed origin and --exercise-empty-table explicitly.",
  );
}
const clients = [];
const pause = () => new Promise((resolve) => setTimeout(resolve, 550));
let sequence = 0;
async function connect() {
  const socket = new WebSocket(
    `${host.replace(/^http/, "ws")}/parties/world-room/${CANONICAL_WORLD_ID}`,
    { origin },
  );
  const queue = [],
    waiters = [];
  const client = { socket, view: null, joined: false };
  clients.push(client);
  socket.on("message", (raw) => {
    const message = JSON.parse(raw.toString());
    if (message.type === "planes") client.view = message.view;
    if (message.type === "snapshot" && message.planes)
      client.view = message.planes;
    const index = waiters.findIndex((w) => w.matches(message));
    if (index >= 0) {
      const waiter = waiters.splice(index, 1)[0];
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else queue.push(message);
  });
  client.next = (matches, timeoutMs = 8000) =>
    new Promise((resolve, reject) => {
      const index = queue.findIndex(matches);
      if (index >= 0) {
        resolve(queue.splice(index, 1)[0]);
        return;
      }
      const waiter = {
        matches,
        resolve,
        timer: setTimeout(() => {
          waiters.splice(waiters.indexOf(waiter), 1);
          reject(Error("Table check timed out"));
        }, timeoutMs),
      };
      waiters.push(waiter);
    });
  client.send = (message) => socket.send(JSON.stringify(message));
  client.sync = async () => {
    await pause();
    client.send({ type: "sync" });
    return client.next((m) => m.type === "snapshot");
  };
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  client.initial = await client.next((m) => m.type === "snapshot");
  client.id = client.initial.selfId;
  client.action = async (action) => {
    await pause();
    const requestId = `table-check-${++sequence}`;
    client.send({
      type: "planes-action",
      requestId,
      revision: client.view.revision,
      action,
    });
    const reply = await client.next(
      (m) => m.type === "planes" && m.requestId === requestId,
    );
    assert.equal(reply.error, undefined);
    return reply.view;
  };
  return client;
}
async function join(client, side) {
  client.send({ type: "hello", nickname: `Table check ${side + 1}` });
  await client.next(
    (m) =>
      m.type === "pose" &&
      m.player.id === client.id &&
      m.player.nickname === `Table check ${side + 1}`,
  );
  await pause();
  client.send({
    type: "pose",
    pose: {
      ...planesSeatPose(side),
      animation: "Activity_Sit",
      activity: "sit",
      vehicle: "none",
    },
  });
  const requestId = `table-seat-${++sequence}`;
  client.send({ type: "seat", requestId, seatId: PLANES_SEATS[side] });
  const reply = await client.next(
    (m) => m.type === "seat-result" && m.requestId === requestId,
  );
  assert.equal(reply.accepted, true, reply.reason);
  client.joined = true;
  // The seat acknowledgement precedes the private board broadcast.
  await client.next((m) => m.type === "planes" && m.view.you === side);
}
try {
  const a = await connect(),
    b = await connect(),
    spectator = await connect();
  assert.ok(a.view, "Deploy the Planes backend first");
  assert.deepEqual(
    a.view.players,
    [null, null],
    "A real match occupies the table; leaving it untouched",
  );
  const before = a.initial;
  await join(a, 0);
  await join(b, 1);
  const fleets = [randomFleet(() => 0.371), randomFleet(() => 0.713)];
  await a.action({ kind: "ready", planes: fleets[0] });
  await b.action({ kind: "ready", planes: fleets[1] });
  const playing = await a.sync();
  assert.equal(playing.planes.phase, "playing");
  assert.deepEqual(playing.planes.ownPlanes, fleets[0]);
  assert.deepEqual(b.view.ownPlanes, fleets[1]);
  const publicView = (await spectator.sync()).planes;
  assert.equal(publicView.you, null);
  assert.equal(publicView.ownPlanes, null);
  assert.ok(!JSON.stringify(publicView).includes('"owner"'));
  const results = [];
  for (let step = 0; step < 8 && a.view.phase === "playing"; step++) {
    const side = a.view.turn,
      client = side === 0 ? a : b,
      target = fleets[1 - side],
      shots = a.view.shots[side];
    let point;
    if (step === 0)
      point = Array.from({ length: 100 }, (_, i) => ({
        x: i % 10,
        y: Math.floor(i / 10),
      })).find(
        (p) =>
          !target.flatMap(planeCells).some((c) => c.x === p.x && c.y === p.y),
      );
    else if (step === 1)
      point = planeCells(target[0]).find(
        (p) => p.x !== target[0].x || p.y !== target[0].y,
      );
    else point = target.find((p) => !targetUnavailable(p.x, p.y, shots));
    assert.ok(point);
    const result = await client.action({
      kind: "shot",
      x: point.x,
      y: point.y,
    });
    results.push(result.shots[side].at(-1).result);
    // Refresh a's view when b's acknowledgement wins a network race.
    if (side === 1) await a.sync();
  }
  assert.equal(a.view.phase, "finished");
  assert.ok(
    results.includes("miss") &&
      results.includes("body") &&
      results.includes("head"),
  );
  const finished = await spectator.sync();
  assert.equal(finished.planes.phase, "finished");
  assert.equal(finished.planes.ownPlanes, null);

  const timerChecks = [];
  if (process.argv.includes("--timers")) {
    await a.action({ kind: "rematch", planes: fleets[0] });
    await b.action({ kind: "rematch", planes: fleets[1] });
    const rematch = (await a.sync()).planes;
    assert.equal(rematch.phase, "playing");
    assert.deepEqual(rematch.shots, [[], []]);
    timerChecks.push("fresh-rematch");
    await new Promise((resolve) => {
      b.socket.once("close", resolve);
      b.socket.close(1000, "Testing reconnect expiry");
    });
    b.joined = false;
    const away = await a.next(
      (m) =>
        m.type === "planes" &&
        m.view.round === rematch.round &&
        m.view.players[1]?.online === false,
    );
    assert.equal(away.view.deadline, null);
    const expired = await a.next(
      (m) =>
        m.type === "planes" &&
        m.view.round === rematch.round &&
        m.view.phase === "finished" &&
        m.view.reason === "connection",
      35000,
    );
    assert.equal(expired.view.winner, 0);
    assert.equal(expired.view.players[1], null);
    timerChecks.push("30s-connection-alarm-without-traffic");
    const replacement = await connect();
    await join(replacement, 1);
    await a.action({ kind: "ready", planes: fleets[0] });
    await replacement.action({ kind: "ready", planes: fleets[1] });
    const timed = (await a.sync()).planes;
    const timeout = await a.next(
      (m) =>
        m.type === "planes" &&
        m.view.round === timed.round &&
        m.view.phase === "finished" &&
        m.view.reason === "timeout",
      65000,
    );
    assert.equal(timeout.view.players[timed.turn], null);
    assert.equal(timeout.view.winner, 1 - timed.turn);
    timerChecks.push("60s-turn-alarm-without-traffic");
    await replacement.action({ kind: "leave" });
    replacement.joined = false;
  }
  await a.action({ kind: "leave" });
  a.joined = false;
  if (b.socket.readyState === WebSocket.OPEN) await b.action({ kind: "leave" });
  b.joined = false;
  const after = await spectator.sync();
  assert.deepEqual(after.planes.players, [null, null]);
  assert.deepEqual(
    after.village,
    before.village,
    "Cabin roster changed during the check",
  );
  assert.deepEqual(after.fire, before.fire, "Fire changed during the check");
  assert.ok(clients.every((c) => c.initial.home === undefined));
  console.log(
    JSON.stringify(
      {
        ok: true,
        host,
        cabinCount: after.village.cabins.length,
        fire: after.fire,
        checks: [
          "two-real-websocket-players",
          "seat-acknowledgements",
          "ready-start",
          "private-fleets",
          "spectator-privacy",
          "alternating-turns",
          "miss-body-head",
          "full-round",
          "empty-table-cleanup",
          "no-home-allocation",
          "preserved-village-and-fire",
          ...timerChecks,
        ],
      },
      null,
      2,
    ),
  );
} finally {
  for (const c of clients) {
    if (c.joined && c.socket.readyState === WebSocket.OPEN) {
      try {
        await c.action({ kind: "leave" });
      } catch {
        /* Disconnect expiry remains the fallback. */
      }
    }
    if (c.socket.readyState !== WebSocket.CLOSED)
      await new Promise((resolve) => {
        c.socket.once("close", resolve);
        c.socket.close(1000, "Table check complete");
      });
  }
}
