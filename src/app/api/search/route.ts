// GET /api/search?q=&include_superseded=&template= (blueprint 9.9; ARCHITECTURE 7 "mode search and GET /api/search
// are retrieval-only, steps 1, 3, 5, 6, no provider call"; AC-ANS-01, AC-ANS-02, AC-ANS-12, AC-ANS-14, AC-NFR-15).
// authorize(ask_read); rate limits ask:<user_id> and addr:<ip> (the designed 429); the rule pack inbound first, so a
// defeat or a permanent-change request is refused here exactly as on /api/ask (safety.request_refused, no evidence
// listed); scope (deterministic, traced); retrieval of k = 12 chunks of served current revisions with the labelled
// history toggle honoured only when asked and then traced; an immutable answer_trace row with outcome partial, no
// claims and the fixed search-mode gap; answer.issued (never the question text or a span). The response carries
// the scope, one Citation per hit and, for the search surface, the hit's kind, a snippet at citation length and
// the engine's rank; x-request-id is the trace id.
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { confidenceBand, confidenceInputs } from "@/answer/confidence";
import { pseudonymise, refusalFor } from "@/answer/outcome";
import { retrieve } from "@/answer/retrieve";
import { resolveScope } from "@/answer/scope";
import { gateResults, insertTrace } from "@/answer/trace";
import { RETRIEVAL_K, Scope, toTraceScope, type Template } from "@/answer/types";
import { withRoute } from "@/auth/authorize";
import { getSandbox, visibleVersionIds } from "@/auth/sandbox";
import type { SessionUser } from "@/auth/session";
import { Citation, EvidencePacket, Refusal } from "@/contracts/generated/evidence_packet";
import type { AnswerTrace } from "@/contracts/generated/serving";
import { db } from "@/db/client";
import { embed } from "@/gateway";
import { CITATION_MAX_CHARS } from "@/gateway/record";
import { activeCorpusVersion, writeAudit, type AuditInput } from "@/lib/audit";
import { HttpError, RateLimited } from "@/lib/errors";
import { HISTORY_TOGGLE_BASIS, SEARCH_MODE_GAP } from "@/lib/fixed-strings";
import { clientAddress, limit } from "@/lib/ratelimit";
import { REQUEST_ID_HEADER, requestIdOf } from "@/lib/request-id";
import { classify, pack, packVersion, type Classification } from "@/rulepack";

export const dynamic = "force-dynamic";

const ROUTE = "/api/search";

const Query = z
  .object({
    q: z.string().trim().min(1).max(2000),
    include_superseded: z.enum(["true", "false", "1", "0"]).default("false"),
    template: z.enum(["readiness", "trip", "job", "reading"]).optional(),
  })
  .strict();

const Hit = z
  .object({
    chunk_id: z.string(),
    unit_kind: z.string(),
    snippet: z.string().max(CITATION_MAX_CHARS),
    rank: z.object({ position: z.number().int().min(1), lexical: z.number().int().min(0).max(2), cosine: z.number() }).strict(),
    citation: Citation,
  })
  .strict();

export const SearchResponse = z
  .object({
    trace_id: z.string(),
    corpus_version: z.string(),
    scope: Scope,
    evidence: z.array(Citation),
    hits: z.array(Hit),
    refusal: Refusal.nullable(),
  })
  .strict();
export type SearchResponse = z.infer<typeof SearchResponse>;

const EMPTY_SCOPE: Scope = { tags: [], instrument_tags: [], document_ids: [], revision_ids: [], basis: [], family_ids: [] };

/** A snippet at citation length, cut at a word boundary (blueprint 8.3: nothing longer than a citation leaves). */
function snippetOf(text: string): string {
  if (text.length <= CITATION_MAX_CHARS) return text;
  const cut = text.lastIndexOf(" ", CITATION_MAX_CHARS);
  return text.slice(0, cut > 0 ? cut : CITATION_MAX_CHARS);
}

function searchAudit(user: SessionUser, trace: AnswerTrace): AuditInput {
  return {
    id: trace.id,
    actor_alias: user.alias,
    actor_role: user.role,
    action: "answer.issued",
    entity: "answer_trace",
    entity_id: trace.id,
    payload: {
      trace_id: trace.id,
      route: ROUTE,
      role_alias: user.alias,
      corpus_version: trace.corpus_version_id,
      rulepack: { class: trace.rulepack.class, version: trace.rulepack.version },
      gate_outcome: "search",
      band: trace.confidence.band,
      mode: trace.packet.mode,
    },
    trace_id: trace.id,
    route: ROUTE,
    corpus_version_id: trace.corpus_version_id,
  };
}

export const GET = withRoute(ROUTE, "ask_read", async (request: NextRequest, _context: unknown, user: SessionUser) => {
  const traceId = requestIdOf(request);
  const query = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) throw new HttpError(400, "invalid_query");
  const question = query.data.q;
  const includeSuperseded = query.data.include_superseded === "true" || query.data.include_superseded === "1";

  // 1. Rate limits: the account, then the address (9.9).
  const perUser = await limit("ask", user.id);
  if (!perUser.allowed) throw new RateLimited("ask", perUser.limit, perUser.resets_at);
  const perAddr = await limit("addr", clientAddress(request));
  if (!perAddr.allowed) throw new RateLimited("addr", perAddr.limit, perAddr.resets_at);

  const startedAt = new Date();
  const version = await activeCorpusVersion();
  if (!version) throw new HttpError(503, "no_active_version");

  // 3. The rule pack inbound, before anything else (AC-ANS-08).
  const classification: Classification = classify(pack, question);
  const rulepack: AnswerTrace["rulepack"] = {
    version: packVersion,
    class: classification.intent_class,
    rule_id: classification.rule_id,
    matched_phrase: classification.matched_phrase,
    decided_at: classification.decided_at,
  };
  const template: Template | null = query.data.template ?? classification.moment;
  const packetRulepack = { version: packVersion, class: classification.intent_class };
  const headers = { [REQUEST_ID_HEADER]: traceId, "cache-control": "private, no-store" };

  const packetOf = (fields: Pick<EvidencePacket, "outcome" | "refusal" | "gaps_declared" | "confidence">): EvidencePacket =>
    EvidencePacket.parse({
      trace_id: traceId,
      corpus_version: version.label,
      template,
      rulepack: packetRulepack,
      claims: [],
      typed_facts: [],
      blocks: [],
      procedure: null,
      contradictions: [],
      abstention: null,
      caveat: null,
      safety_notice: null,
      mode: "live",
      ...fields,
    });

  const traceOf = (fields: Pick<AnswerTrace, "scope" | "retrieved_chunk_ids" | "confidence" | "outcome" | "packet">): AnswerTrace => ({
    id: traceId,
    question,
    language_detected: classification.language_detected,
    template,
    rulepack,
    prompts: [],
    verifier_verdicts: [],
    gate_results: gateResults([], false),
    repair_rounds: 0,
    model_ids: {},
    corpus_version_id: version.id,
    user_alias: user.alias,
    server_ts: startedAt.toISOString(),
    ...fields,
  });

  if (classification.intent_class === "defeat" || classification.intent_class === "permanent_change") {
    const refusal = await refusalFor(classification);
    const inputs = { question_coverage: 0, source_count: 0, approval_share: 0 };
    const packet = packetOf({ outcome: "refusal", refusal, gaps_declared: [], confidence: { band: confidenceBand(inputs) } });
    const trace = traceOf({
      scope: { tags: [], basis: "refused before scope resolution" },
      retrieved_chunk_ids: [],
      confidence: { band: packet.confidence.band, inputs },
      outcome: "refusal",
      packet,
    });
    await insertTrace(trace);
    await writeAudit({
      id: traceId,
      actor_alias: user.alias,
      actor_role: user.role,
      action: "safety.request_refused",
      entity: "answer_trace",
      entity_id: traceId,
      payload: {
        request_text: pseudonymise(question),
        rule_id: classification.rule_id,
        matched_phrase: classification.matched_phrase,
        class: classification.intent_class,
        protective_function: classification.protective_function,
        trace_id: traceId,
      },
      trace_id: traceId,
      route: ROUTE,
      corpus_version_id: version.id,
    });
    const body: SearchResponse = { trace_id: traceId, corpus_version: version.label, scope: EMPTY_SCOPE, evidence: [], hits: [], refusal };
    return NextResponse.json(SearchResponse.parse(body), { headers });
  }

  // 5 and 6. Scope, then retrieval over the versions this visitor sees; the toggle is traced when used (AC-ANS-14).
  const box = await getSandbox(await cookies());
  const resolved = await resolveScope(db, question, box);
  const scope: Scope = includeSuperseded ? { ...resolved, basis: [...resolved.basis, HISTORY_TOGGLE_BASIS] } : resolved;
  const visible = await visibleVersionIds(box);
  const [queryVector] = await embed([question], "query");
  if (queryVector === undefined) throw new Error("embedding: no vector was returned for the question");
  const retrieval = await retrieve(db, scope, question, queryVector, { k: RETRIEVAL_K, include_superseded: includeSuperseded, visible_version_ids: visible });

  const inputs = confidenceInputs(question, retrieval.chunks, retrieval.evidence);
  const band = confidenceBand(inputs);
  const packet = packetOf({ outcome: "partial", refusal: null, gaps_declared: [SEARCH_MODE_GAP], confidence: { band } });
  const trace = traceOf({
    scope: toTraceScope(scope),
    retrieved_chunk_ids: retrieval.chunks.map((c) => c.chunk_id),
    confidence: { band, inputs },
    outcome: "partial",
    packet,
  });
  await insertTrace(trace);
  await writeAudit(searchAudit(user, trace));

  const body: SearchResponse = {
    trace_id: traceId,
    corpus_version: version.label,
    scope,
    evidence: retrieval.evidence,
    hits: retrieval.chunks.map((c, i) => ({
      chunk_id: c.chunk_id,
      unit_kind: c.unit_kind,
      snippet: snippetOf(c.text),
      rank: { position: i + 1, lexical: c.rank.lexical, cosine: c.rank.cosine },
      citation: c.citation,
    })),
    refusal: null,
  };
  return NextResponse.json(SearchResponse.parse(body), { headers });
});
