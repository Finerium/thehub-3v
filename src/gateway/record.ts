// Recorded replay (blueprint 9.16, ARCHITECTURE 9.4). With RECORD_DIR set, an ok call writes
// recordings/<case_id>/<role>.json = { request_sha256, request, response, model_id, prompt_version, recorded_at };
// the n-th call of the same case and role in one process (a composer repair round) goes to <role>.<n>.json.
// request_sha256 is over the hydrated canonical JSON of the envelope that was sent; the stored request is
// dehydrated so no corpus text is tracked: a text beside a span_id becomes { span_id, quote_hash }, beside a
// chunk_id { chunk_id, quote_hash }, and any other string over the citation limit { quote_hash, chars }. A response
// string over the limit is truncated at record time (ARCHITECTURE 9.4). RECORD_MODE=replay serves a recording
// whose request hash, prompt version and model id match; anything else is a ReplayMismatchError naming both sides.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Recording } from "@/contracts/generated/gateway";
import { ROLE_TABLE, canonicalJson, sha256Hex, type ChatTask } from "./config";
import { ReplayMismatchError } from "./errors";

export const CITATION_MAX_CHARS = 200; // the no-corpus-text rule (A7, AC-FND-07)

export type RecordMode = "off" | "record" | "replay";

export function recordMode(): RecordMode {
  if (!process.env.RECORD_DIR) return "off";
  return process.env.RECORD_MODE === "replay" ? "replay" : "record";
}

export function recordDir(): string {
  const dir = process.env.RECORD_DIR;
  if (!dir) throw new Error("RECORD_DIR is not set");
  return path.resolve(dir);
}

// ponytail: the canonical text form of 9.2 duplicated here in three lines; switch to src/lib/canonical.ts once that
// module lands (ARCHITECTURE 4), keeping sha256(utf8(canonical(s))) as the span identity.
export function canonicalText(s: string): string {
  return s.normalize("NFKC").replace(/\u00ad/g, "").replace(/\s+/g, " ").trim();
}

export function quoteHash(text: string): string {
  return sha256Hex(Buffer.from(canonicalText(text), "utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export function dehydrate(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dehydrate);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      if (key === "text" && typeof item === "string") {
        if (typeof value.span_id === "string") {
          out[key] = { span_id: value.span_id, quote_hash: quoteHash(item) };
          continue;
        }
        if (typeof value.chunk_id === "string") {
          out[key] = { chunk_id: value.chunk_id, quote_hash: quoteHash(item) };
          continue;
        }
      }
      out[key] = dehydrate(item);
    }
    return out;
  }
  if (typeof value === "string" && value.length > CITATION_MAX_CHARS) {
    return { quote_hash: quoteHash(value), chars: value.length };
  }
  return value;
}

export function truncateStrings(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(truncateStrings);
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) out[key] = truncateStrings(item);
    return out;
  }
  if (typeof value === "string" && value.length > CITATION_MAX_CHARS) return value.slice(0, CITATION_MAX_CHARS);
  return value;
}

const callCounters = new Map<string, number>();

function recordingFile(role: string, n: number): string {
  return n === 1 ? `${role}.json` : `${role}.${n}.json`;
}

export type RecordInput = {
  case_id: string;
  task: ChatTask;
  envelope: Record<string, unknown>;
  request_sha256: string;
  response: Record<string, unknown>;
};

/** Writes the recording and returns its path. */
export function record(input: RecordInput): string {
  const cfg = ROLE_TABLE[input.task];
  const counterKey = `${input.case_id}/${cfg.role}`;
  const n = (callCounters.get(counterKey) ?? 0) + 1;
  callCounters.set(counterKey, n);
  const dir = path.join(recordDir(), input.case_id);
  mkdirSync(dir, { recursive: true });
  const recording = Recording.parse({
    request_sha256: input.request_sha256,
    request: dehydrate(input.envelope),
    response: truncateStrings(input.response),
    model_id: cfg.model_id,
    prompt_version: cfg.prompt_version,
    recorded_at: new Date().toISOString(),
  });
  const file = path.join(dir, recordingFile(cfg.role, n));
  writeFileSync(file, `${JSON.stringify(recording, null, 1)}\n`);
  return file;
}

export function recordingsFor(caseId: string, role: string, dir: string = recordDir()): Recording[] {
  const caseDir = path.join(dir, caseId);
  if (!existsSync(caseDir)) return [];
  const pattern = new RegExp(`^${role.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(\\.\\d+)?\\.json$`);
  return readdirSync(caseDir)
    .filter((name) => pattern.test(name))
    .sort()
    .map((name) => Recording.parse(JSON.parse(readFileSync(path.join(caseDir, name), "utf8"))));
}

/** The recorded response for this envelope, or a ReplayMismatchError naming the recorded and recomputed hashes. */
export function replay(task: ChatTask, envelope: Record<string, unknown>, caseId: string): Record<string, unknown> {
  const cfg = ROLE_TABLE[task];
  const recomputed = sha256Hex(canonicalJson(envelope));
  const recordings = recordingsFor(caseId, cfg.role);
  const hit = recordings.find(
    (r) => r.request_sha256 === recomputed && r.prompt_version === cfg.prompt_version && r.model_id === cfg.model_id,
  );
  if (hit) return hit.response;
  throw new ReplayMismatchError({
    case_id: caseId,
    role: cfg.role,
    recomputed_sha256: recomputed,
    recorded_sha256: recordings.map((r) => r.request_sha256),
    recomputed_prompt_version: cfg.prompt_version,
    recorded_prompt_versions: recordings.map((r) => r.prompt_version),
  });
}
