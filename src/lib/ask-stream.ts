// The client readers of the two entry points of surface 2 (blueprint 9.8, 9.9; ARCHITECTURE 7 steps 7 and 14;
// AC-NFR-04). POST /api/ask (answer mode): the
// application/x-ndjson two-line stream, line 1 { stage: "evidence" } rendered the moment it lands and line 2
// { stage: "packet" } closing the stream; a refusal is one packet line; a seeded chip is both lines from storage.
// Every line is parsed against the generated AskStream contract, so a field outside 9.8 never reaches the surface.
// A non-2xx answer is the designed JSON of src/lib/errors.ts ({ error, request_id, ...fields }) and becomes a typed
// AskFailure the surface renders as its 6.3 state; nothing here retypes a wording or a number. GET /api/search
// (search mode, deviation D-22): one JSON body carrying the line-1 shape plus the hits, retrieval only, no provider
// call, refusing exactly as /api/ask does. Browser-safe: no server import, fetch and the streams API only; both
// bodies are parsed against the generated contract before the surface sees them, so a field outside 9.8 never
// reaches a render (the route's own SearchResponse is declared beside server-only imports and cannot be imported
// here, so its shape is restated as the client's read of it).
import { z } from "zod";
import { AskStream, Citation, Refusal, type EvidencePacket } from "@/contracts/generated/evidence_packet";

export const ASK_ROUTE = "/api/ask";
export const SEARCH_ROUTE = "/api/search";
export const REQUEST_ID_HEADER = "x-request-id";

export type Template = NonNullable<EvidencePacket["template"]>;
export type Mode = "answer" | "search";

/** The body of 9.9: question, an optional moment template, the mode, the labelled history toggle. */
export type AskBody = { question: string; template?: Template; mode?: Mode; include_superseded?: boolean };

export type EvidenceLine = Extract<AskStream, { stage: "evidence" }>;
export type PacketLine = Extract<AskStream, { stage: "packet" }>;

/** The designed states of 6.3 a request can end in, typed by the error code the route wrote. */
export type AskFailure =
  | { kind: "rate_limited"; scope: string; limit: number; resets_at: string; request_id: string | null }
  | {
      kind: "budget_exhausted";
      role: string;
      budget: { tokens_per_day: number; spend_cap_idr_per_day: number };
      resets_at: string;
      request_id: string | null;
    }
  | { kind: "forbidden"; request_id: string | null }
  | { kind: "unauthenticated" }
  | { kind: "hash_mismatch"; opl_id: string; step_n: number | null; span_id: string | null; request_id: string | null }
  | { kind: "http"; status: number; code: string; request_id: string | null }
  | { kind: "network"; message: string }
  /** The stream closed, or carried a line outside the contract, before the packet line arrived. */
  | { kind: "stream"; message: string; trace_id: string | null }
  | { kind: "aborted" };

export class AskError extends Error {
  constructor(readonly failure: AskFailure) {
    super(failure.kind);
    this.name = "AskError";
  }
}

const ErrorBody = z.object({ error: z.string(), request_id: z.string().optional() }).loose();
const RateLimitedBody = z.object({ scope: z.string(), limit: z.number(), resets_at: z.string() }).loose();
const BudgetBody = z
  .object({ role: z.string(), budget: z.object({ tokens_per_day: z.number(), spend_cap_idr_per_day: z.number() }), resets_at: z.string() })
  .loose();
const HashBody = z.object({ opl_id: z.string(), step_n: z.number().int().nullable(), span_id: z.string().nullable() }).loose();

/** The typed failure behind a non-2xx response of the route (the designed JSON of src/lib/errors.ts). */
export async function failureOf(response: Response): Promise<AskFailure> {
  const headerId = response.headers.get(REQUEST_ID_HEADER);
  const json: unknown = await response.json().catch(() => null);
  const body = ErrorBody.safeParse(json);
  const requestId = body.success ? (body.data.request_id ?? headerId) : headerId;
  if (response.status === 401) return { kind: "unauthenticated" };
  if (!body.success) return { kind: "http", status: response.status, code: "unreadable", request_id: requestId };
  const code = body.data.error;
  if (code === "rate_limited") {
    const r = RateLimitedBody.safeParse(json);
    if (r.success) return { kind: "rate_limited", scope: r.data.scope, limit: r.data.limit, resets_at: r.data.resets_at, request_id: requestId };
  }
  if (code === "budget_exhausted") {
    const b = BudgetBody.safeParse(json);
    if (b.success) return { kind: "budget_exhausted", role: b.data.role, budget: b.data.budget, resets_at: b.data.resets_at, request_id: requestId };
  }
  if (code === "hash_mismatch") {
    const h = HashBody.safeParse(json);
    if (h.success) return { kind: "hash_mismatch", opl_id: h.data.opl_id, step_n: h.data.step_n, span_id: h.data.span_id, request_id: requestId };
  }
  if (code === "forbidden") return { kind: "forbidden", request_id: requestId };
  return { kind: "http", status: response.status, code, request_id: requestId };
}

/** The newline-delimited JSON values of a byte stream, one at a time, as they arrive; a trailing unterminated line counts. */
export async function* ndjsonValues(stream: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (line.length > 0) yield JSON.parse(line) as unknown;
        newline = buffer.indexOf("\n");
      }
      if (done) break;
    }
    const tail = buffer.trim();
    if (tail.length > 0) yield JSON.parse(tail) as unknown;
  } finally {
    reader.releaseLock();
  }
}

export type AskHandlers = {
  onEvidence?: (line: EvidenceLine) => void;
  onPacket?: (line: PacketLine) => void;
};

/**
 * Posts the question and plays the stream into the handlers as each line lands. Resolves with the trace id once
 * the packet line has been handled; throws AskError with the typed failure otherwise (the surface keeps whatever
 * line 1 it already rendered, so an evidence list never disappears behind a failure).
 */
export async function askStream(body: AskBody, handlers: AskHandlers, signal?: AbortSignal): Promise<{ trace_id: string }> {
  let response: Response;
  try {
    // egress: none (same-origin route of this application; the provider is reached only by src/gateway)
    response = await fetch(ASK_ROUTE, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/x-ndjson" },
      body: JSON.stringify(body),
      credentials: "same-origin",
      signal,
    });
  } catch (error) {
    if (signal?.aborted) throw new AskError({ kind: "aborted" });
    throw new AskError({ kind: "network", message: error instanceof Error ? error.message : String(error) });
  }
  if (!response.ok) throw new AskError(await failureOf(response));
  const traceHeader = response.headers.get(REQUEST_ID_HEADER);
  if (response.body === null) throw new AskError({ kind: "stream", message: "the response carried no body", trace_id: traceHeader });

  let traceId: string | null = traceHeader;
  let packetSeen = false;
  try {
    for await (const value of ndjsonValues(response.body)) {
      const line = AskStream.safeParse(value);
      if (!line.success) throw new AskError({ kind: "stream", message: "a line outside the 9.8 contract arrived", trace_id: traceId });
      if (line.data.stage === "evidence") {
        traceId = line.data.trace_id;
        handlers.onEvidence?.(line.data);
      } else {
        traceId = line.data.packet.trace_id;
        packetSeen = true;
        handlers.onPacket?.(line.data);
      }
    }
  } catch (error) {
    if (error instanceof AskError) throw error;
    if (signal?.aborted) throw new AskError({ kind: "aborted" });
    throw new AskError({ kind: "stream", message: error instanceof Error ? error.message : String(error), trace_id: traceId });
  }
  if (!packetSeen || traceId === null) {
    throw new AskError({ kind: "stream", message: "the stream closed before the packet line", trace_id: traceId });
  }
  return { trace_id: traceId };
}

/* Search mode: GET /api/search (D-22) ---------------------------------------------------------------------------- */

/** One retrieved unit as the search route returns it: the chunk's kind, its text at citation length, its rerank key. */
const SearchHit = z
  .object({
    chunk_id: z.string(),
    unit_kind: z.string(),
    snippet: z.string(),
    rank: z.object({ position: z.number().int(), lexical: z.number().int(), cosine: z.number() }),
    citation: Citation,
  })
  .loose();
export type SearchHit = z.infer<typeof SearchHit>;

/** The body of GET /api/search: the line-1 shape (trace, version, scope, evidence) plus the hits and any refusal. */
const SearchBody = z
  .object({
    trace_id: z.string(),
    corpus_version: z.string(),
    scope: z.object({ tags: z.array(z.string()), basis: z.array(z.string()) }).loose(),
    evidence: z.array(Citation),
    hits: z.array(SearchHit),
    refusal: Refusal.nullable(),
  })
  .loose();
export type SearchResult = z.infer<typeof SearchBody>;

/**
 * Runs one search-mode question. Resolves with the parsed body; throws AskError with the typed failure otherwise,
 * so search mode renders the same designed states of 6.3 as the answer mode. No provider call is made on this path,
 * which is why it keeps working when the daily budget is spent.
 */
export async function searchQuery(body: AskBody, signal?: AbortSignal): Promise<SearchResult> {
  const params = new URLSearchParams({ q: body.question });
  if (body.template) params.set("template", body.template);
  if (body.include_superseded) params.set("include_superseded", "true");
  let response: Response;
  try {
    response = await fetch(`${SEARCH_ROUTE}?${params.toString()}`, { headers: { accept: "application/json" }, credentials: "same-origin", signal });
  } catch (error) {
    if (signal?.aborted) throw new AskError({ kind: "aborted" });
    throw new AskError({ kind: "network", message: error instanceof Error ? error.message : String(error) });
  }
  if (!response.ok) throw new AskError(await failureOf(response));
  const parsed = SearchBody.safeParse(await response.json().catch(() => null));
  if (!parsed.success) {
    throw new AskError({ kind: "stream", message: "the search body did not match the contract", trace_id: response.headers.get(REQUEST_ID_HEADER) });
  }
  return parsed.data;
}
