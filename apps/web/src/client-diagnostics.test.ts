import { afterEach, describe, expect, it, vi } from "vitest";
import endpoint from "../../../api/client-errors";
import {
  parseClientDiagnostic,
  redactDiagnostic,
} from "../../../packages/shared/client-diagnostics";
const payload = (sessionId = "test-session-unique") => ({
  version: 1,
  event: "cruce_stall",
  reportId: crypto.randomUUID(),
  sessionId,
  time: Date.now(),
  asset: "/assets/index-123.js?secret=no",
  message: "stalled",
  stack: "Error at https://example.test/a.js?token=private",
  context: {
    phase: "trick",
    revision: 12,
    trickCount: 2,
    resumeToken: "never-log",
    chat: "never-log",
    hand: [1, 2, 3],
  },
});
afterEach(() => vi.restoreAllMocks());
describe("bounded browser diagnostics", () => {
  it("strips private state and URL queries rather than logging gameplay credentials or chat", () => {
    const parsed = parseClientDiagnostic(payload())!;
    expect(parsed.context).toEqual({
      phase: "trick",
      revision: 12,
      trickCount: 2,
    });
    expect(parsed.stack).not.toContain("private");
    expect(parsed.asset).toBe("/assets/index-123.js");
    expect(redactDiagnostic("token=secret")).not.toContain("secret");
  });
  it("redacts quoted credential fields, bearer headers and URL userinfo before storage/logging", () => {
    for (const text of [
      '{"resumeToken":"DUMMY_SECRET"}',
      "Authorization: Bearer DUMMY_SECRET",
      "Authorization: Basic DUMMY_SECRET",
      JSON.stringify({
        url: "https://example.invalid/a.js",
        resumeToken: "DUMMY_SECRET",
      }),
      "wss://DUMMY_USER:DUMMY_SECRET@example.test/room?token=DUMMY_QUERY",
      "https://DUMMY_USER:DUMMY_SECRET@example.test/a.js?token=DUMMY_QUERY",
    ]) {
      const redacted = redactDiagnostic(text);
      expect(redacted).not.toMatch(/DUMMY_SECRET|DUMMY_USER|DUMMY_QUERY/);
    }
  });
  it("accepts a valid browser report into one structured Vercel log line", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await endpoint.fetch(
      new Request("https://la-baraj.vercel.app/api/client-errors", {
        method: "POST",
        headers: {
          origin: "https://la-baraj.vercel.app",
          "content-type": "text/plain",
        },
        body: JSON.stringify(payload("valid-session-unique")),
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(
      "https://la-baraj.vercel.app",
    );
    const report = JSON.parse(log.mock.calls[0][0]);
    expect(report.tag).toBe("la-baraj-client");
    expect(JSON.stringify(report)).not.toMatch(/never-log|resumeToken|"hand"/);
  });
  it("rejects foreign origins, oversize or malformed data before logging", async () => {
    const log = vi.spyOn(console, "warn").mockImplementation(() => {});
    const req = (body: string, origin = "https://la-baraj.vercel.app") =>
      new Request("https://la-baraj.vercel.app/api/client-errors", {
        method: "POST",
        headers: { origin },
        body,
      });
    expect(
      (await endpoint.fetch(req("{}", "https://foreign.test"))).status,
    ).toBe(403);
    expect((await endpoint.fetch(req("x".repeat(9000)))).status).toBe(413);
    expect((await endpoint.fetch(req("{}"))).status).toBe(400);
    expect(log).not.toHaveBeenCalled();
  });
  it("bounds a repeated session and supports localhost CORS preflight", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const pre = await endpoint.fetch(
      new Request("https://la-baraj.vercel.app/api/client-errors", {
        method: "OPTIONS",
        headers: { origin: "http://127.0.0.1:4173" },
      }),
    );
    expect(pre.status).toBe(204);
    for (let i = 0; i < 21; i++) {
      const response = await endpoint.fetch(
        new Request("https://la-baraj.vercel.app/api/client-errors", {
          method: "POST",
          headers: { origin: "https://la-baraj.vercel.app" },
          body: JSON.stringify(payload("rate-test-session")),
        }),
      );
      expect(response.status).toBe(i < 20 ? 204 : 429);
    }
  });
});
