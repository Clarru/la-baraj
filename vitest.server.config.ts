import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tests/protocol.test.ts", "tests/load.test.ts"], environment: "node" } });
