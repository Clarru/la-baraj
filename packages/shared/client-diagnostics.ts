export const DIAGNOSTIC_EVENTS = [
  "browser_error",
  "unhandled_rejection",
  "webgl_context_lost",
  "ui_stall",
  "cruce_stall",
  "cruce_sync",
  "scene_error",
  "unclean_reload",
  "diagnostic_test",
] as const;
export type DiagnosticEvent = (typeof DIAGNOSTIC_EVENTS)[number];
export type DiagnosticContext = Record<
  string,
  string | number | boolean | null
>;
export type ClientDiagnostic = {
  version: 1;
  event: DiagnosticEvent;
  reportId: string;
  sessionId: string;
  time: number;
  asset: string;
  message: string;
  stack: string;
  context: DiagnosticContext;
};
const keys = new Set([
  "phase",
  "revision",
  "mode",
  "turn",
  "deadline",
  "trickCount",
  "stockCount",
  "playerCount",
  "awayCount",
  "transport",
  "serverPhase",
  "serverRevision",
  "serverDeadline",
  "serverTrickCount",
  "serverAwayCount",
  "recovered",
  "serverError",
  "elapsedMs",
  "deadlineLagMs",
  "environment",
]);
export function redactDiagnostic(value: string, max = 2000) {
  return value
    .slice(0, max * 4)
    .replace(/https?:\/\/[^\s)]+/g, (raw) => {
      try {
        const url = new URL(raw);
        url.username = "";
        url.password = "";
        url.search = "";
        url.hash = "";
        return url.toString();
      } catch {
        return raw
          .split(/[?#]/)[0]
          .replace(/(https?:\/\/)[^/\s@]+@/g, "$1[redacted]@");
      }
    })
    .replace(
      /\b(?:authorization|resumeToken|access_token|token)\b["']?\s*[:=]\s*["']?(?:Bearer\s+)?[^\s"',;}]+/gi,
      "[redacted]",
    )
    .slice(0, max);
}
export function diagnosticContext(value: unknown): DiagnosticContext {
  const out: DiagnosticContext = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, v] of Object.entries(value)) {
    if (!keys.has(key)) continue;
    if (v === null || typeof v === "boolean") out[key] = v;
    else if (typeof v === "number" && Number.isFinite(v)) out[key] = v;
    else if (typeof v === "string") out[key] = redactDiagnostic(v, 100);
  }
  return out;
}
export function parseClientDiagnostic(value: unknown): ClientDiagnostic | null {
  if (!value || typeof value !== "object") return null;
  const r = value as ClientDiagnostic;
  const id = (v: unknown) =>
    typeof v === "string" && /^[A-Za-z0-9_-]{8,80}$/.test(v);
  if (
    r.version !== 1 ||
    !DIAGNOSTIC_EVENTS.includes(r.event) ||
    !id(r.reportId) ||
    !id(r.sessionId) ||
    !Number.isFinite(r.time) ||
    typeof r.asset !== "string" ||
    typeof r.message !== "string" ||
    typeof r.stack !== "string"
  )
    return null;
  return {
    version: 1,
    event: r.event,
    reportId: r.reportId,
    sessionId: r.sessionId,
    time: r.time,
    asset: r.asset.startsWith("/assets/")
      ? r.asset.split(/[?#]/)[0].slice(0, 180)
      : "unknown",
    message: redactDiagnostic(r.message, 300),
    stack: redactDiagnostic(r.stack),
    context: diagnosticContext(r.context),
  };
}
