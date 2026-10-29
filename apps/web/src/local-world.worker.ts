import { createLocalWorld } from "./local-world";
const world = createLocalWorld();
const scope = self as unknown as {
  onconnect: (event: MessageEvent) => void;
  close: () => void;
};
let connections = 0;
scope.onconnect = (event) => {
  const port = event.ports[0];
  let lastSeen = Date.now(),
    closed = false,
    pending = Promise.resolve();
  connections++;
  const client = world.connect((message) =>
    port.postMessage({ kind: "server", message }),
  );
  const disconnect = () => {
    if (closed) return;
    closed = true;
    clearInterval(timer);
    pending = pending.then(async () => {
      await client.disconnect();
      port.postMessage({ kind: "closed" });
      setTimeout(() => port.close(), 5000);
      connections--;
      if (!connections)
        setTimeout(() => {
          if (!connections) scope.close();
        }, 31_000);
    });
  };
  const timer = setInterval(() => {
    if (Date.now() - lastSeen > 90_000) disconnect();
  }, 10_000);
  port.onmessage = (e) => {
    lastSeen = Date.now();
    if (closed) return;
    if (e.data?.kind === "message" && typeof e.data.raw === "string") {
      const raw = e.data.raw;
      pending = pending
        .then(() => client.message(raw))
        .catch(() => {
          port.postMessage({
            kind: "server",
            message: {
              type: "error",
              code: "local-message-failed",
              message:
                "Acțiunea locală nu a putut fi procesată. Încearcă din nou.",
            },
          });
        });
    } else if (e.data?.kind === "disconnect") disconnect();
  };
  port.start();
  port.postMessage({ kind: "ready" });
};
setInterval(() => {
  void world.tick();
}, 200);
