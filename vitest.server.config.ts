import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: [
      "tests/protocol.test.ts",
      "tests/load.test.ts",
      "tests/planes.test.ts",
      "tests/planes-worker.test.ts",
    ],
    environment: "node",
  },
});
