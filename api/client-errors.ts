import { parseClientDiagnostic } from "../packages/shared/client-diagnostics.js";
const windows = new Map<string, { at: number; count: number }>();
export default {
  async fetch(request: Request): Promise<Response> {
    const allowed = new Set([
      "https://la-baraj.vercel.app",
      "http://127.0.0.1:4173",
      "http://localhost:4173",
      ...[process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL]
        .filter(Boolean)
        .map((host) => `https://${host}`),
    ]);
    const origin = request.headers.get("origin") ?? "";
    if (!allowed.has(origin)) return new Response("Forbidden", { status: 403 });
    const headers = {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Cache-Control": "no-store",
      Vary: "Origin",
    };
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return new Response(null, { status: 405, headers });
    if (Number(request.headers.get("content-length")) > 8192)
      return new Response(null, { status: 413, headers });
    try {
      const reader = request.body?.getReader();
      let size = 0,
        body = "";
      const decoder = new TextDecoder();
      if (reader)
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > 8192) {
            await reader.cancel();
            return new Response(null, { status: 413, headers });
          }
          body += decoder.decode(value, { stream: true });
        }
      body += decoder.decode();
      const report = parseClientDiagnostic(JSON.parse(body));
      if (!report) return new Response(null, { status: 400, headers });
      const now = Date.now(),
        previous = windows.get(report.sessionId),
        window =
          previous && now - previous.at < 60000
            ? previous
            : { at: now, count: 0 };
      if (++window.count > 20)
        return new Response(null, {
          status: 429,
          headers: { ...headers, "Retry-After": "60" },
        });
      windows.set(report.sessionId, window);
      if (windows.size > 512) windows.delete(windows.keys().next().value!);
      console.warn(
        JSON.stringify({
          tag: "la-baraj-client",
          serverBuild: process.env.VERCEL_GIT_COMMIT_SHA ?? "local",
          ...report,
        }),
      );
      return new Response(null, { status: 204, headers });
    } catch {
      return new Response(null, { status: 400, headers });
    }
  },
};
