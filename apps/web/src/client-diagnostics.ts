import {
  diagnosticContext,
  redactDiagnostic,
  type DiagnosticContext,
  type DiagnosticEvent,
  type ClientDiagnostic,
} from "../../../packages/shared/client-diagnostics";
let sessionId = "",
  state: DiagnosticContext = {},
  installed = false;
const sent = new Map<string, number>();
const pendingKey = "la-baraj-pending-diagnostic";
const endpoint = () =>
  ["localhost", "127.0.0.1"].includes(location.hostname)
    ? "https://la-baraj.vercel.app/api/client-errors"
    : "/api/client-errors";
const asset = () => {
  const src = document.querySelector<HTMLScriptElement>(
    'script[type="module"][src]',
  )?.src;
  try {
    return src ? new URL(src).pathname : "unknown";
  } catch {
    return "unknown";
  }
};
async function transmit(report: ClientDiagnostic) {
  try {
    const response = await fetch(endpoint(), {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=UTF-8" },
      credentials: "omit",
      keepalive: true,
      body: JSON.stringify(report),
    });
    if (
      response.status === 204 &&
      sessionStorage.getItem(pendingKey)?.includes(report.reportId)
    )
      sessionStorage.removeItem(pendingKey);
  } catch {
    /* Retain one bounded report for the next load; never recurse through telemetry. */
  }
}
export function setClientDiagnosticState(next: DiagnosticContext) {
  state = diagnosticContext(next);
}
export function reportClientDiagnostic(
  event: DiagnosticEvent,
  context: DiagnosticContext = {},
  error?: unknown,
) {
  if (typeof window === "undefined" || import.meta.env.MODE === "test") return;
  try {
    sessionId ||= crypto.randomUUID();
    const message = redactDiagnostic(
        error instanceof Error
          ? error.message
          : typeof error === "string"
            ? error
            : event,
        300,
      ),
      stack = redactDiagnostic(
        error instanceof Error ? (error.stack ?? "") : "",
      );
    const fingerprint = `${event}:${message}:${context.revision ?? state.revision ?? ""}`,
      now = Date.now();
    if (
      now - (sent.get(fingerprint) ?? 0) < 15000 ||
      [...sent.values()].filter((v) => now - v < 60000).length >= 10
    )
      return;
    sent.set(fingerprint, now);
    if (sent.size > 50) sent.delete(sent.keys().next().value!);
    const report: ClientDiagnostic = {
      version: 1,
      event,
      reportId: crypto.randomUUID(),
      sessionId,
      time: now,
      asset: asset(),
      message,
      stack,
      context: diagnosticContext({
        ...state,
        ...context,
        environment: ["localhost", "127.0.0.1"].includes(location.hostname)
          ? "local"
          : "production",
      }),
    };
    try {
      sessionStorage.setItem(pendingKey, JSON.stringify(report));
    } catch {}
    void transmit(report);
    return report.reportId;
  } catch {
    /* Diagnostics must not break gameplay. */
  }
}
export function installClientDiagnostics() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) =>
    reportClientDiagnostic("browser_error", {}, event.error ?? event.message),
  );
  window.addEventListener("unhandledrejection", (event) =>
    reportClientDiagnostic("unhandled_rejection", {}, event.reason),
  );
  document.addEventListener(
    "webglcontextlost",
    () => reportClientDiagnostic("webgl_context_lost"),
    true,
  );
  let last = performance.now(),
    visible = document.visibilityState === "visible";
  document.addEventListener("visibilitychange", () => {
    last = performance.now();
    visible = document.visibilityState === "visible";
  });
  setInterval(() => {
    const now = performance.now(),
      current = document.visibilityState === "visible";
    if (visible && current && now - last > 5000)
      reportClientDiagnostic("ui_stall", { elapsedMs: Math.round(now - last) });
    last = now;
    visible = current;
  }, 1000);
  try {
    const pending = sessionStorage.getItem(pendingKey);
    if (pending) {
      const report = JSON.parse(pending) as ClientDiagnostic;
      if (Date.now() - report.time < 3600000) void transmit(report);
    }
  } catch {}
}
