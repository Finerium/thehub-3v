// Structured JSON logging (AC-NFR-11, AC-NFR-14): pino, one line per request, per gate decision and per provider
// call, carrying the request id, the route and the role alias; never a retrieved span, never a question text
// outside the two safety audit events, never a stack trace toward a user. The `question` and `password` keys are
// redacted mechanically at one level of nesting as a guard beyond discipline.
import pino, { type Logger } from "pino";

export const log: Logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: null,
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: { level: (label) => ({ level: label }) },
  redact: { paths: ["question", "*.question", "password", "*.password"], censor: "[redacted]" },
});

export type RequestLine = {
  request_id: string;
  route: string;
  method: string;
  status: number;
  role_alias: string | null;
  duration_ms: number;
  trace_id?: string;
  gate_outcome?: string;
};

// The one line per request (routes go through withRoute in src/auth/authorize.ts, which emits it).
export function logRequest(line: RequestLine): void {
  log.info({ event: "request", ...line });
}

// The structured error event on every 5xx (ARCHITECTURE section 10): the stack stays in the log.
export function logError(requestId: string, route: string, error: unknown): void {
  const err = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) };
  log.error({ event: "error", request_id: requestId, route, err });
}
