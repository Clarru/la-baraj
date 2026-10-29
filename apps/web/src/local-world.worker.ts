import { createLocalWorld } from "./local-world";
const world = createLocalWorld();
const scope = self as unknown as { onconnect: (event: MessageEvent) => void };
scope.onconnect = (event) => {
  const port = event.ports[0];
  let lastSeen = Date.now();
  const client = world.connect((message) =>
    port.postMessage({ kind: "server", message }),
  );
  const timer = setInterval(() => {
    if (Date.now() - lastSeen > 90_000) {
      clearInterval(timer);
      void client.disconnect();
      port.close();
    }
  }, 10_000);
  port.onmessage = (e) => {
    lastSeen = Date.now();
    if (e.data?.kind === "message" && typeof e.data.raw === "string")
      void client.message(e.data.raw);
    else if (e.data?.kind === "disconnect") {
      clearInterval(timer);
      void client.disconnect();
      port.close();
    }
  };
  port.start();
  port.postMessage({ kind: "ready" });
};
setInterval(() => {
  void world.tick();
}, 200);
