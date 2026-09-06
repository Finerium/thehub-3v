// POST /api/ask (blueprint 9.8, 9.9, 9.10, 9.16; ARCHITECTURE section 7, in its order, each step stamped into the
// trace; AC-ANS-08, AC-ANS-19, AC-NFR-04, AC-NFR-15). Body { question, template?, mode?, include_superseded? }.
// authorize(ask_read); rate limits ask:<user_id> and addr:<ip>; the seeded path (both lines from storage, zero
// provider calls); the daily budget check for a live question (the designed 429, seeded chips untouched); the rule
// pack inbound before any provider call (defeat or permanent_change -> one refusal line and safety.request_refused;
// documented_bypass -> the lesson served verbatim under its hashes and safety.request_served; none -> continue);
// language and template; scope; retrieval; line 1 flushed before any provider call; typed facts and blocks; AG-2;
// AG-4 (question-blind); G2; one repair round when C6 or C3 dropped a sentence, never a third attempt; the outcome;
// the immutable trace and the audit event (never the question text or a span); line 2; close. maxDuration 120;
// x-request-id is the trace id. mode "search" streams line 1 and a partial packet with the fixed search-mode gap.
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { getSandbox, visibleVersionIds } from "@/auth/sandbox";
import type { SessionUser } from "@/auth/session";
import { compose, MAX_COMPOSER_CALLS, type ComposeInput } from "@/answer/compose";
import { confidenceBand, confidenceInputs } from "@/answer/confidence";
import {
  caveatFor,
  clusterFor,
  decide,
  escalationRole,
  nearestDocuments,
  procedureFor,
  pseudonymise,
  refusalFor,
  type AbstentionContext,
} from "@/answer/outcome";
import { retrieve } from "@/answer/retrieve";
import { resolveScope } from "@/answer/scope";
import { approvedLessonSpans, screenLines, type CitedText } from "@/answer/screen";
import { evidenceOf, findSeeded, seededTrace } from "@/answer/seeded";
import { ndjsonResponse, type Emit } from "@/answer/stream";
import { typedFacts } from "@/answer/templates";
import { gateResults, insertTrace, modelIdsOf, promptsOf } from "@/answer/trace";
import { RETRIEVAL_K, toTraceScope, type Scope, type Template } from "@/answer/types";
import { verify } from "@/answer/verify";
import { EvidencePacket, type Citation, type Claim, type Procedure } from "@/contracts/generated/evidence_packet";
import type { GatewayCall } from "@/contracts/generated/gateway";
import type { AnswerTrace } from "@/contracts/generated/serving";
import { db } from "@/db/client";
import { corpusVersion } from "@/db/schema";
import { runG2, type Dropped, type EvidenceSpan, type VerifierVerdict } from "@/gates/g2";
import { budgetStatus, embed } from "@/gateway";
import { utcDayStart } from "@/gateway/budget";
import { activeCorpusVersion, writeAudit, type AuditInput } from "@/lib/audit";
import { BudgetExhausted, HttpError, RateLimited } from "@/lib/errors";
import {
  AMBIGUOUS_LESSON_REASON,
  COMPOSER_FAILED_REASON,
  DOCUMENTED_BYPASS_NOTICE,
  ENTAILED,
  HISTORY_TOGGLE_BASIS,
  NO_ASSET_IN_SCOPE_REASON,
  NO_ENTAILED_CLAIM_REASON,
  NO_EVIDENCE_IN_SCOPE_REASON,
  PROVIDER_UNREACHABLE_REASON,
  SEARCH_MODE_GAP,
} from "@/lib/fixed-strings";
import { log } from "@/lib/log";
import { clientAddress, limit } from "@/lib/ratelimit";
import { requestIdOf } from "@/lib/request-id";
import { classify, entityRows, pack, packVersion, type Classification } from "@/rulepack";

export const maxDuration = 120;
export const dynamic = "force-dynamic";

const ROUTE = "/api/ask";
const TASKS = ["AG-2", "AG-4"] as const;

const Body = z
  .object({
    question: z.string().trim().min(1).max(2000),
    template: z.enum(["readiness", "trip", "job", "reading"]).optional(),
    mode: z.enum(["answer", "search"]).default("answer"),
    include_superseded: z.boolean().default(false),
  })
  .strict();

type Version = { id: string; label: string };
type Rulepack = AnswerTrace["rulepack"];

function answerAudit(user: SessionUser, trace: AnswerTrace, gateOutcome: string): AuditInput {
  return {
    id: trace.id,
    actor_alias: user.alias,
    actor_role: user.role,
    action: trace.outcome === "abstention" ? "answer.abstained" : "answer.issued",
    entity: "answer_trace",
    entity_id: trace.id,
    payload: {
      trace_id: trace.id,
      route: ROUTE,
      role_alias: user.alias,
      corpus_version: trace.corpus_version_id,
      rulepack: { class: trace.rulepack.class, version: trace.rulepack.version },
      gate_outcome: gateOutcome,
      band: trace.confidence.band,
      mode: trace.packet.mode,
    },
    trace_id: trace.id,
    route: ROUTE,
    corpus_version_id: trace.corpus_version_id,
  };
}

const emptyGate = (): AnswerTrace["gate_results"] => gateResults([], false);

async function versionFor(sandboxVersionId: string | null): Promise<Version> {
  const active = await activeCorpusVersion();
  if (!active) throw new HttpError(503, "no_active_version");
  if (sandboxVersionId === null || sandboxVersionId === active.id) return active;
  const [own] = await db.select({ id: corpusVersion.id, label: corpusVersion.label }).from(corpusVersion).where(eq(corpusVersion.id, sandboxVersionId)).limit(1);
  return own ?? active;
}

export const POST = withRoute(ROUTE, "ask_read", async (request: NextRequest, _context: unknown, user: SessionUser) => {
  const traceId = requestIdOf(request);
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "invalid_body");
  const { question, mode, include_superseded: includeSuperseded } = parsed.data;

  // 1. Rate limits: the account, then the address (9.9; the designed 429 names the limit and its reset).
  const perUser = await limit("ask", user.id);
  if (!perUser.allowed) throw new RateLimited("ask", perUser.limit, perUser.resets_at);
  const perAddr = await limit("addr", clientAddress(request));
  if (!perAddr.allowed) throw new RateLimited("addr", perAddr.limit, perAddr.resets_at);

  const startedAt = new Date();

  // 2. The seeded path: both lines from the stored packet, zero provider calls (AC-UI-05, AC-NFR-15).
  const seeded = await findSeeded(question);
  if (seeded !== null) {
    const trace = seededTrace(seeded, traceId, question, user.alias, startedAt);
    await insertTrace(trace);
    const isBypass = trace.rulepack.class === "documented_bypass";
    await writeAudit(
      isBypass
        ? {
            ...answerAudit(user, trace, "seeded"),
            action: "safety.request_served",
            payload: { request_text: pseudonymise(question), rule_id: trace.rulepack.rule_id, matched_phrase: trace.rulepack.matched_phrase, class: trace.rulepack.class, trace_id: trace.id },
          }
        : answerAudit(user, trace, "seeded"),
    );
    return ndjsonResponse(traceId, ROUTE, async (emit) => {
      emit({
        stage: "evidence",
        trace_id: traceId,
        corpus_version: trace.packet.corpus_version,
        scope: trace.scope,
        rulepack: trace.packet.rulepack,
        evidence: evidenceOf(trace.packet),
      });
      emit({ stage: "packet", packet: trace.packet });
    });
  }

  // 1 (continued). The daily budget of the live roles; search mode makes no provider call (ARCHITECTURE 9.3).
  if (mode === "answer") {
    for (const task of TASKS) {
      const budget = await budgetStatus(task);
      if (budget.exhausted) {
        const resetsAt = new Date(utcDayStart().getTime() + 24 * 60 * 60 * 1000);
        throw new BudgetExhausted(budget.role, { tokens_per_day: budget.tokens_per_day, spend_cap_idr_per_day: budget.spend_cap_idr_per_day }, resetsAt);
      }
    }
  }

  const jar = await cookies();
  const box = await getSandbox(jar);
  const version = await versionFor(box?.corpusVersionId ?? null);

  // 3. The rule pack inbound, before any provider call (AC-ANS-08).
  const classification: Classification = classify(pack, question);
  const rulepack: Rulepack = {
    version: packVersion,
    class: classification.intent_class,
    rule_id: classification.rule_id,
    matched_phrase: classification.matched_phrase,
    decided_at: classification.decided_at,
  };
  // 4. Language and template: the request's template, else the pack's moment keywords.
  const template: Template | null = parsed.data.template ?? classification.moment;
  const packetRulepack = { version: packVersion, class: classification.intent_class };

  if (classification.intent_class === "defeat" || classification.intent_class === "permanent_change") {
    const refusal = await refusalFor(classification);
    const packet = EvidencePacket.parse({
      trace_id: traceId,
      corpus_version: version.label,
      outcome: "refusal",
      template,
      rulepack: packetRulepack,
      claims: [],
      typed_facts: [],
      blocks: [],
      procedure: null,
      contradictions: [],
      abstention: null,
      refusal,
      gaps_declared: [],
      confidence: { band: confidenceBand({ question_coverage: 0, source_count: 0, approval_share: 0 }) },
      caveat: null,
      safety_notice: null,
      mode: "live",
    });
    const trace: AnswerTrace = {
      id: traceId,
      question,
      language_detected: classification.language_detected,
      template,
      scope: { tags: [], basis: "refused before scope resolution" },
      rulepack,
      retrieved_chunk_ids: [],
      prompts: [],
      verifier_verdicts: [],
      gate_results: emptyGate(),
      repair_rounds: 0,
      confidence: { band: packet.confidence.band, inputs: { question_coverage: 0, source_count: 0, approval_share: 0 } },
      outcome: "refusal",
      packet,
      model_ids: {},
      corpus_version_id: version.id,
      user_alias: user.alias,
      server_ts: startedAt.toISOString(),
    };
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
    return ndjsonResponse(traceId, ROUTE, async (emit) => {
      emit({ stage: "packet", packet });
    });
  }

  // 5. Scope (deterministic, traced) and the versions the sandbox may see.
  const scope: Scope = await resolveScope(db, question, box);
  const visible = await visibleVersionIds(box);
  const traceScope = toTraceScope(includeSuperseded ? { ...scope, basis: [...scope.basis, HISTORY_TOGGLE_BASIS] } : scope);

  // 3 (continued). A documented bypass: the named lesson served verbatim under its hashes (AC-ANS-05, AC-ANS-15).
  let procedure: Procedure | null = null;
  let safetyNotice: string | null = null;
  let bypassGap: string | null = null;
  if (classification.intent_class === "documented_bypass") {
    const rows = entityRows(pack, classification.entity ?? "", scope.tags);
    const oplIds = [...new Set(rows.map((r) => r.opl_id))];
    if (oplIds.length === 1 && oplIds[0] !== undefined) {
      procedure = await procedureFor(oplIds[0], { alias: user.alias, role: user.role, route: ROUTE, trace_id: traceId });
      if (procedure === null) bypassGap = NO_EVIDENCE_IN_SCOPE_REASON;
      else safetyNotice = DOCUMENTED_BYPASS_NOTICE;
      if (procedure !== null) await writeAudit({
        id: traceId,
        actor_alias: user.alias,
        actor_role: user.role,
        action: "safety.request_served",
        entity: "opl",
        entity_id: oplIds[0],
        payload: {
          request_text: pseudonymise(question),
          rule_id: classification.rule_id,
          matched_phrase: classification.matched_phrase,
          class: classification.intent_class,
          opl_id: oplIds[0],
          trace_id: traceId,
        },
        trace_id: traceId,
        route: ROUTE,
        corpus_version_id: version.id,
      });
    } else {
      bypassGap = AMBIGUOUS_LESSON_REASON;
    }
  }

  // 6. Retrieval: k = 12 chunks of served current revisions, deterministic rerank (AC-NFR-06).
  const [queryVector] = await embed([question], "query");
  if (queryVector === undefined) throw new Error("embedding: no vector was returned for the question");
  const retrieval = await retrieve(db, scope, question, queryVector, {
    k: RETRIEVAL_K,
    include_superseded: includeSuperseded,
    visible_version_ids: visible,
  });
  const evidence: Citation[] = retrieval.evidence;
  const chunks: CitedText[] = retrieval.chunks.map((c) => ({ citation: c.citation, text: c.text }));
  const spans: EvidenceSpan[] = retrieval.chunks.map((c) => ({ ...c.citation, text: c.text }));
  const spansById = new Map(spans.map((s) => [s.span_id, s] as const));

  const base = {
    trace_id: traceId,
    corpus_version: version.label,
    template,
    rulepack: packetRulepack,
    refusal: null,
    mode: "live" as const,
  };

  return ndjsonResponse(traceId, ROUTE, async (emit: Emit) => {
    // 7. Line 1, before any provider call (AC-NFR-04).
    emit({ stage: "evidence", trace_id: traceId, corpus_version: version.label, scope: traceScope, rulepack: packetRulepack, evidence });

    const finish = async (trace: AnswerTrace, gateOutcome: string): Promise<void> => {
      await insertTrace(trace);
      await writeAudit(answerAudit(user, trace, gateOutcome));
      emit({ stage: "packet", packet: trace.packet });
    };

    const traceOf = (fields: Omit<AnswerTrace, "id" | "question" | "language_detected" | "template" | "scope" | "rulepack" | "retrieved_chunk_ids" | "corpus_version_id" | "user_alias" | "server_ts">): AnswerTrace => ({
      id: traceId,
      question,
      language_detected: classification.language_detected,
      template,
      scope: traceScope,
      rulepack,
      retrieved_chunk_ids: retrieval.chunks.map((c) => c.chunk_id),
      corpus_version_id: version.id,
      user_alias: user.alias,
      server_ts: startedAt.toISOString(),
      ...fields,
    });

    if (mode === "search") {
      const inputs = { question_coverage: 0, source_count: 0, approval_share: 0 };
      const packet = EvidencePacket.parse({
        ...base,
        outcome: "partial",
        claims: [],
        typed_facts: [],
        blocks: [],
        procedure: null,
        contradictions: [],
        abstention: null,
        gaps_declared: [SEARCH_MODE_GAP],
        confidence: { band: confidenceBand(inputs) },
        caveat: null,
        safety_notice: null,
      });
      await finish(
        traceOf({ prompts: [], verifier_verdicts: [], gate_results: emptyGate(), repair_rounds: 0, confidence: { band: packet.confidence.band, inputs }, outcome: "partial", packet, model_ids: {} }),
        "search",
      );
      return;
    }

    // 8. Typed facts and blocks in the template's order (AC-ANS-16).
    const facts = await typedFacts(db, scope, template, { retrieval, question });
    const served = procedure ?? facts.procedure;
    const whitelist = approvedLessonSpans(chunks, served);
    const ctx: AbstentionContext = {
      escalation_role: escalationRole(question, scope, template),
      nearest_documents: nearestDocuments(evidence),
      cluster: await clusterFor(scope.tags, version.id),
      served_beside: facts.typed_facts,
    };

    // 9 to 12. Compose, verify, gate, one repair round (AC-ANS-19).
    const calls: GatewayCall[] = [];
    const verdictsAll: VerifierVerdict[] = [];
    let composerCalls = 0;
    let repairRounds: 0 | 1 = 0;
    let providerDown = false;
    let composerFailed = false;
    let gaps: string[] = [];
    let dropped: Dropped[] = [];
    let kept: Claim[] = [];

    const input: ComposeInput = { question, template, scope, chunks, typed_facts: facts.typed_facts, repair: null };
    const round = async (repair: ComposeInput["repair"], n: 0 | 1) => {
      const composed = await compose({ ...input, repair }, n);
      composerCalls += 1;
      calls.push(composed.call);
      return composed;
    };

    let composed = await round(null, 0);
    if (composed.outcome === "parse_failed" && composerCalls < MAX_COMPOSER_CALLS) composed = await round(null, 0);
    if (composed.outcome === "parse_failed") composerFailed = true;
    else if (composed.outcome !== "ok") providerDown = true;

    const gateRound = async (claims: typeof composed.claims) => {
      const verified = await verify(claims, spansById);
      if (verified.call !== null) calls.push(verified.call);
      if (verified.outcome === "timeout" || verified.outcome === "provider_error") providerDown = true;
      verdictsAll.push(...verified.verdicts);
      const result = runG2({
        claims,
        evidence: spans,
        typed_facts: facts.typed_facts,
        verdicts: verified.verdicts,
        pack,
        whitelisted_spans: whitelist,
        include_superseded: includeSuperseded,
      });
      log.info({ event: "gate", gate: "G2", trace_id: traceId, kept: result.kept.length, dropped: result.dropped.map((d) => [d.claim.id, d.check]) });
      return result;
    };

    if (composed.outcome === "ok") {
      let gate = await gateRound(composed.claims);
      gaps = composed.gaps;
      const repairable = gate.dropped.filter((d) => d.check === "C6" || d.check === "C3");
      if (repairable.length > 0 && !providerDown && composerCalls < MAX_COMPOSER_CALLS) {
        const verdicts = repairable.map((d) => verdictsAll.find((v) => v.sentence_id === d.claim.id && v.verdict !== ENTAILED) ?? { sentence_id: d.claim.id, verdict: "not_entailed" as const, span_id: null, reason: d.reason });
        const repaired = await round({ verdicts }, 1);
        repairRounds = 1;
        if (repaired.outcome === "ok") {
          gate = await gateRound(repaired.claims);
          gaps = repaired.gaps;
        } else if (repaired.outcome !== "parse_failed") providerDown = true;
      }
      kept = gate.kept;
      dropped = gate.dropped;
    }

    // 13. The outcome, the caveat, the band from its traced inputs.
    const screenedGaps = screenLines(gaps, whitelist).kept;
    const declared = [...screenedGaps, ...(bypassGap === null ? [] : [bypassGap])];
    const reason = providerDown
      ? PROVIDER_UNREACHABLE_REASON
      : composerFailed
        ? COMPOSER_FAILED_REASON
        : scope.tags.length === 0 && scope.instrument_tags.length === 0
          ? NO_ASSET_IN_SCOPE_REASON
          : evidence.length === 0
            ? NO_EVIDENCE_IN_SCOPE_REASON
            : NO_ENTAILED_CLAIM_REASON;
    const decision = decide(kept, dropped, declared, reason, ctx);
    const inputs = confidenceInputs(question, retrieval.chunks, decision.claims.flatMap((c) => c.citations));
    const band = confidenceBand(inputs);
    const packet = EvidencePacket.parse({
      ...base,
      outcome: decision.outcome,
      claims: decision.claims,
      typed_facts: facts.typed_facts,
      blocks: facts.blocks,
      procedure: served,
      contradictions: facts.contradictions,
      abstention: decision.abstention,
      gaps_declared: decision.gaps_declared,
      confidence: { band },
      caveat: caveatFor(classification, facts.typed_facts, facts.blocks),
      safety_notice: safetyNotice,
    });

    // 14. Persist the immutable trace and the audit event, then line 2.
    const used = TASKS.filter((task) => calls.some((c) => c.role === task));
    const trace = traceOf({
      prompts: promptsOf(used),
      verifier_verdicts: verdictsAll,
      gate_results: gateResults(dropped, composed.outcome === "ok"),
      repair_rounds: repairRounds,
      confidence: { band, inputs },
      outcome: decision.outcome,
      packet,
      model_ids: { ...modelIdsOf(used), gateway_calls: String(calls.length) },
    });
    await finish(trace, `${decision.claims.length} kept, ${dropped.length} dropped, repair ${repairRounds}${providerDown ? ", provider unreachable" : ""}`);
  });
});
