// The reads behind surfaces 2 and 3 (blueprint 6.2, 9.7 AnswerTrace and GatewayCall, 9.13, 9.17; AC-ANS-11,
// AC-UI-05): the immutable answer_trace row as the generated AnswerTrace, the label of the corpus version it was
// computed against, the gateway_call rows written while the trace ran, and the seeded chip a Home link names.
// Drizzle only, parameterised throughout; every row leaves through the generated Zod (ARCHITECTURE 1.4). Nothing
// here writes, and nothing returns an envelope text: a gateway_call row carries hashes, ids, tokens and latency.
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { toAnswerTrace } from "@/answer/trace";
import { GatewayCall } from "@/contracts/generated/gateway";
import type { AnswerTrace } from "@/contracts/generated/serving";
import { db } from "@/db/client";
import { answerTrace, auditLog, corpusVersion, gatewayCall, seededChip } from "@/db/schema";

/** One gateway_call row as the trace page lists it: the 9.13 record with the row id and its write time. */
export type TraceGatewayCall = GatewayCall & { id: string; created_at: string };

export type TraceReplay = {
  trace: AnswerTrace;
  /** The version the trace was computed against; null only if the row's version has gone (it never does). */
  version: { id: string; label: string } | null;
  calls: TraceGatewayCall[];
  /** How the calls were bound to the trace, stated on the surface: the row carries no trace id (9.13). */
  calls_window: { from: string; to: string; basis: "audit_event" | "route_max_duration" };
  /** The count the lane stamped into model_ids.gateway_calls, or null when the trace carries none (seeded, search, refusal). */
  calls_expected: number | null;
};

/** POST /api/ask's maxDuration (ARCHITECTURE 7): the window's end when no audit event closes the trace. */
const ASK_MAX_DURATION_MS = 120 * 1000;

function toCall(row: typeof gatewayCall.$inferSelect): TraceGatewayCall {
  const call = GatewayCall.parse({
    role: row.role,
    request_sha256: row.requestSha256,
    response_sha256: row.responseSha256,
    model_id: row.modelId,
    prompt_version: row.promptVersion,
    gateway_config_sha256: row.gatewayConfigSha256,
    corpus_version_id: row.corpusVersionId,
    latency_ms: row.latencyMs,
    input_tokens: row.inputTokens,
    output_tokens: row.outputTokens,
    outcome: row.outcome,
  });
  return { ...call, id: row.id, created_at: new Date(row.createdAt).toISOString() };
}

/** The stored trace with its version label and the gateway calls of its run, or null for an unknown id. */
export async function traceReplay(id: string): Promise<TraceReplay | null> {
  const [row] = await db.select().from(answerTrace).where(eq(answerTrace.id, id)).limit(1);
  if (!row) return null;
  const trace = toAnswerTrace(row);

  const [version] = await db
    .select({ id: corpusVersion.id, label: corpusVersion.label })
    .from(corpusVersion)
    .where(eq(corpusVersion.id, trace.corpus_version_id))
    .limit(1);

  // The lane writes the trace row, then its audit event, after the last gateway call; the event's server_ts closes
  // the window that server_ts (the request's start) opens. Without an event the route's maxDuration closes it.
  const [closing] = await db
    .select({ at: sql<string | null>`max(${auditLog.serverTs})` })
    .from(auditLog)
    .where(eq(auditLog.traceId, trace.id));
  const from = new Date(trace.server_ts);
  const closedBy = closing?.at ? new Date(closing.at) : null;
  const to = closedBy && closedBy.getTime() >= from.getTime() ? closedBy : new Date(from.getTime() + ASK_MAX_DURATION_MS);

  const rows = await db
    .select()
    .from(gatewayCall)
    .where(and(eq(gatewayCall.corpusVersionId, trace.corpus_version_id), gte(gatewayCall.createdAt, from), lte(gatewayCall.createdAt, to)))
    .orderBy(asc(gatewayCall.createdAt), asc(gatewayCall.id));

  const stamped = trace.model_ids.gateway_calls;
  const expected = stamped !== undefined && /^\d+$/.test(stamped) ? Number.parseInt(stamped, 10) : null;

  return {
    trace,
    version: version ?? null,
    calls: rows.map(toCall),
    calls_window: { from: from.toISOString(), to: to.toISOString(), basis: closedBy ? "audit_event" : "route_max_duration" },
    calls_expected: expected,
  };
}

export type SeededChipRow = { id: string; equipment_tag: string; question: string; golden_case_id: string | null; trace_id: string };

/** The seeded chip a `/ask?chip=<id>` link names (9.17), or null while the chips have not been seeded. */
export async function seededChipById(id: string): Promise<SeededChipRow | null> {
  const [row] = await db.select().from(seededChip).where(eq(seededChip.id, id)).limit(1);
  return row ? { id: row.id, equipment_tag: row.equipmentTag, question: row.question, golden_case_id: row.goldenCaseId, trace_id: row.traceId } : null;
}
