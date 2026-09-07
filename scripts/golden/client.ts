// The HTTP side of the golden runner: the demo session per role, POST /api/ask read as the two-line NDJSON stream
// of 9.8, and GET /api/trace/:id for the parts of the trace a check needs.
//
// The demo passwords come from the environment (dotenv on the build machine, the repository secret in CI) and are
// read straight out of process.env into the request body. No password is logged, printed, put in a URL or written
// into the report; a missing one is reported by the name of the variable alone.
//
// line1_ms is AC-NFR-04's instrument: the milliseconds from the request leaving the runner to the first newline of
// the response body, which is the moment the evidence list has reached the reader. latency_ms is the whole stream.
import { AskStream, type EvidencePacket } from "../../src/contracts/generated/evidence_packet";
import { AnswerTrace } from "../../src/contracts/generated/serving";

export type Role = "Engineer" | "Reviewing Supervisor" | "Manager";

const USERNAME: Record<Role, string> = {
  Engineer: "engineer_demo",
  "Reviewing Supervisor": "supervisor_demo",
  Manager: "manager_demo",
};

const PASSWORD_VARIABLE: Record<Role, string> = {
  Engineer: "DEMO_ENGINEER_PASSWORD",
  "Reviewing Supervisor": "DEMO_SUPERVISOR_PASSWORD",
  Manager: "DEMO_MANAGER_PASSWORD",
};

export class LoginFailed extends Error {}

function cookieHeader(response: Response, existing: string): string {
  const jar = new Map<string, string>();
  for (const pair of existing.split("; ").filter((s) => s.length > 0)) {
    const at = pair.indexOf("=");
    if (at > 0) jar.set(pair.slice(0, at), pair.slice(at + 1));
  }
  for (const raw of response.headers.getSetCookie()) {
    const first = raw.split(";")[0] ?? "";
    const at = first.indexOf("=");
    if (at > 0) jar.set(first.slice(0, at), first.slice(at + 1));
  }
  return [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
}

/** A session cookie for the role, or LoginFailed naming the status; the password is never part of the message. */
export async function login(baseUrl: string, role: Role): Promise<string> {
  const variable = PASSWORD_VARIABLE[role];
  const password = process.env[variable];
  if (!password) throw new LoginFailed(`${variable} is not set in the environment`);
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: USERNAME[role], password }),
    redirect: "manual",
  });
  if (response.status !== 200) throw new LoginFailed(`login as ${USERNAME[role]} returned ${response.status}`);
  await response.text();
  const cookie = cookieHeader(response, "");
  if (cookie.length === 0) throw new LoginFailed(`login as ${USERNAME[role]} set no cookie`);
  return cookie;
}

export type AskBody = { question: string; template?: string; mode?: string };

// The header the gateway needs to name a recording directory (9.16: recordings/<case_id>/<role>.json). The runner
// sends it on every ask; the ask lane forwards it to invoke() as `case_id` (open point: the plumbing through
// src/app/api/ask/route.ts is not the runner's to write). Without it a replay run cannot hit a recording.
export const CASE_HEADER = "x-golden-case";

export type AskResult = {
  status: number;
  line1: Extract<AskStream, { stage: "evidence" }> | null;
  packet: EvidencePacket | null;
  trace_id: string | null;
  latency_ms: number;
  line1_ms: number | null;
  error: string | null;
};

/** POST /api/ask, both stream lines parsed against the 9.8 contract, with the two timings. */
export async function ask(baseUrl: string, cookie: string, body: AskBody, caseId: string): Promise<AskResult> {
  const started = performance.now();
  const response = await fetch(`${baseUrl}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie, accept: "application/x-ndjson", [CASE_HEADER]: caseId },
    body: JSON.stringify(body),
  });
  const result: AskResult = {
    status: response.status,
    line1: null,
    packet: null,
    trace_id: response.headers.get("x-request-id"),
    latency_ms: 0,
    line1_ms: null,
    error: null,
  };
  if (!response.body) {
    result.latency_ms = Math.round(performance.now() - started);
    result.error = `no response body (status ${response.status})`;
    return result;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const lines: string[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (value) {
      buffer += decoder.decode(value, { stream: true });
      while (buffer.includes("\n")) {
        if (result.line1_ms === null) result.line1_ms = Math.round(performance.now() - started);
        const at = buffer.indexOf("\n");
        lines.push(buffer.slice(0, at));
        buffer = buffer.slice(at + 1);
      }
    }
    if (done) break;
  }
  if (buffer.trim().length > 0) lines.push(buffer);
  result.latency_ms = Math.round(performance.now() - started);

  if (response.status !== 200) {
    result.error = `status ${response.status}`;
    return result;
  }
  for (const line of lines) {
    if (line.trim().length === 0) continue;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      result.error = "a stream line is not JSON";
      return result;
    }
    const parsed = AskStream.safeParse(value);
    if (!parsed.success) {
      result.error = `a stream line is outside the 9.8 contract: ${parsed.error.issues[0]?.path.join(".")}`;
      return result;
    }
    if (parsed.data.stage === "evidence") result.line1 = parsed.data;
    else result.packet = parsed.data.packet;
  }
  if (result.packet === null) result.error = "the stream carried no packet line";
  if (result.packet && result.trace_id === null) result.trace_id = result.packet.trace_id;
  return result;
}

/** The stored trace, or null when it cannot be read (the checks that need it then report unsupported). */
export async function readTrace(baseUrl: string, cookie: string, traceId: string): Promise<AnswerTrace | null> {
  const response = await fetch(`${baseUrl}/api/trace/${encodeURIComponent(traceId)}`, { headers: { cookie } });
  if (response.status !== 200) return null;
  const parsed = AnswerTrace.safeParse(await response.json());
  return parsed.success ? parsed.data : null;
}

/** { corpus_version, commit } from GET /api/health; the run header binds to the version that answered. */
export async function health(baseUrl: string): Promise<{ corpus_version: string; commit: string }> {
  const response = await fetch(`${baseUrl}/api/health`);
  if (response.status !== 200) throw new Error(`GET /api/health returned ${response.status}`);
  const body: unknown = await response.json();
  const record = (body ?? {}) as Record<string, unknown>;
  return {
    corpus_version: typeof record.corpus_version === "string" ? record.corpus_version : "",
    commit: typeof record.commit === "string" ? record.commit : "",
  };
}
