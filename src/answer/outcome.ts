// The outcome of the answer lane (blueprint 9.8, 6.3; ARCHITECTURE 7 steps 3 and 13; AC-ANS-06, AC-ANS-07,
// AC-ANS-19): answer, partial with gaps declared, or abstention with a reason, an escalation role from the fixed set,
// the three nearest same-asset documents, the debt-cluster action where a cluster covers the asset and the typed
// facts served beside it; the refusal of 9.8 filled from interlock, start_permissive and the pack's routing text;
// the procedure of a documented bypass served verbatim under its step hashes; the confidence inputs the band is
// computed from (traced, AC-ANS-07); the fixed as-built caveat on every protective-function answer. Everything here
// is deterministic over stored data and the gate's result; nothing calls a provider.
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  Procedure,
  Refusal,
  type Abstention,
  type Block,
  type Citation,
  type Claim,
  type TypedFact,
} from "@/contracts/generated/evidence_packet";
import type { Role } from "@/contracts/generated/serving";
import { db } from "@/db/client";
import { debtCluster, documentRevision, documentTable, interlock, opl, oplStep, startPermissive } from "@/db/schema";
import type { Dropped } from "@/gates/g2";
import { writeAudit } from "@/lib/audit";
import { HashMismatch } from "@/lib/errors";
import { AS_BUILT_CAVEAT, MOC_TEXT, NO_ENTAILED_CLAIM_REASON, droppedSentencesGap } from "@/lib/fixed-strings";
import { quoteHash } from "@/lib/hash";
import { ROUTE_TEXT_NO_FUNCTION, pack, protectiveRow, routingText, tagsIn, tokens, type Classification } from "@/rulepack";
import type { Scope, Template } from "./types";

export type EscalationRole = Abstention["escalation_role"];

// The rule of PRD v1.1 revision plan task 3.5 (blueprint 6.3): an unknown asset goes to the Shift Superintendent, a
// live reading to the panel operator, an interlock or SIS question to the on-call I&C engineer, electrical equipment
// to the on-call Electrical engineer, everything else about equipment to the Reliability engineer.
const LIVE_VALUE_WORDS = new Set(["reading", "readings", "vibration", "temperature", "pressure", "flow", "level", "speed", "getaran", "suhu", "tekanan", "aliran"]);
const TIME_CUES = ["last night", "yesterday", "today", "right now", "now", "currently", "at the moment", "after", "since", "semalam", "kemarin", "hari ini", "sekarang", "setelah"];
const ELECTRICAL_WORDS = new Set(["motor", "electrical", "mcc", "breaker", "switchgear", "vfd", "listrik", "kabel"]);

/** The escalation role of an abstention or a partial answer, from the fixed set of 9.8; deterministic over the question and the scope. */
export function escalationRole(question: string, scope: Scope, template: Template | null): EscalationRole {
  const known = new Set([...scope.tags, ...scope.instrument_tags]);
  // a SEQ-nnnn id is a protective function, never an asset tag: it is routed by the interlock branch below (9.3)
  if (tagsIn(question).filter((t) => !/^SEQ-/i.test(t)).some((t) => !known.has(t))) return "Shift Superintendent";
  const toks = tokens(question);
  const lower = question.toLowerCase();
  const liveValue = toks.some((t) => LIVE_VALUE_WORDS.has(t)) && TIME_CUES.some((cue) => new RegExp(`\\b${cue}\\b`).test(lower));
  if (template === "reading" || liveValue) return "Panel operator on shift";
  if (template === "trip" || template === "readiness" || scope.instrument_tags.length > 0 || toks.some((t) => t.startsWith("seq-"))) {
    return "On-call Instrument and Control engineer";
  }
  if (toks.some((t) => ELECTRICAL_WORDS.has(t))) return "On-call Electrical engineer";
  return "Reliability engineer";
}

/** The three nearest same-asset documents: the first three distinct documents of the retrieval, in rerank order. */
export function nearestDocuments(evidence: readonly Citation[]): Citation[] {
  const seen = new Set<string>();
  return evidence.filter((c) => (seen.has(c.document_id) ? false : (seen.add(c.document_id), true))).slice(0, 3);
}

/** The cluster action where a debt cluster of the version covers an asset in scope: the best-ranked one. */
export async function clusterFor(tags: readonly string[], corpusVersionId: string): Promise<Abstention["cluster"]> {
  if (tags.length === 0) return null;
  const [row] = await db
    .select({ id: debtCluster.id })
    .from(debtCluster)
    .where(and(inArray(debtCluster.equipmentTag, [...tags]), eq(debtCluster.corpusVersionId, corpusVersionId)))
    .orderBy(asc(debtCluster.rank))
    .limit(1);
  return row ? { id: row.id, request_action: true } : null;
}

export type Decision = {
  outcome: "answer" | "partial" | "abstention";
  claims: Claim[];
  gaps_declared: string[];
  abstention: Abstention | null;
};

export type AbstentionContext = {
  escalation_role: EscalationRole;
  nearest_documents: Citation[];
  cluster: Abstention["cluster"];
  served_beside: TypedFact[];
};

/**
 * answer when sentences were kept and nothing is missing; partial when sentences were kept beside declared gaps or
 * dropped sentences (the escalation for the missing part travels in `abstention`); abstention when nothing was kept,
 * with `reason` when the composer declared no gap (AC-ANS-19: after the one repair round, no third attempt).
 */
export function decide(kept: readonly Claim[], dropped: readonly Dropped[], gaps: readonly string[], reason: string, ctx: AbstentionContext): Decision {
  const declared = [...gaps, ...(dropped.length > 0 ? [droppedSentencesGap(dropped.length)] : [])];
  const abstention = (why: string): Abstention => ({ reason: why, ...ctx, nearest_documents: [...ctx.nearest_documents], served_beside: [...ctx.served_beside] });
  if (kept.length === 0) return { outcome: "abstention", claims: [], gaps_declared: [...gaps], abstention: abstention(gaps.length > 0 ? gaps.join(" ") : reason) };
  if (declared.length > 0) return { outcome: "partial", claims: [...kept], gaps_declared: declared, abstention: abstention(declared.join(" ")) };
  return { outcome: "answer", claims: [...kept], gaps_declared: [], abstention: null };
}

export const NO_CLAIM_REASON = NO_ENTAILED_CLAIM_REASON;

const PROTECTIVE_BLOCKS: ReadonlySet<Block["kind"]> = new Set(["ladder", "initiator_row", "permissives", "effects", "reset_note", "standing_bypasses", "proof_tests"]);

/** The fixed as-built caveat closes every protective-function answer: a function in scope, a sheet row served, or a protective block rendered. */
export function caveatFor(classification: Classification, typedFacts: readonly TypedFact[], blocks: readonly Block[]): typeof AS_BUILT_CAVEAT | null {
  const protective =
    classification.protective_function !== null ||
    typedFacts.some((f) => f.source_class === "ce_row") ||
    blocks.some((b) => PROTECTIVE_BLOCKS.has(b.kind));
  return protective ? AS_BUILT_CAVEAT : null;
}

/** The Refusal of 9.8 for a defeat or permanent_change classification: the sheet, its permissives and reset note, the route text. */
export async function refusalFor(c: Classification): Promise<Refusal> {
  if (c.intent_class !== "defeat" && c.intent_class !== "permanent_change") throw new Error(`refusalFor: ${c.intent_class} is not a refusal class`);
  const row = protectiveRow(pack, c.protective_function);
  let fn: Refusal["function"] = null;
  let permissives: Refusal["permissives"] = [];
  if (row !== null) {
    const key = row.seq_id ?? row.equipment_tag;
    const [sheet] = await db
      .select({ sil: interlock.silSheet, ceDocNo: interlock.ceDocNo, ceRevision: interlock.ceRevision })
      .from(interlock)
      .where(row.seq_id === null ? and(eq(interlock.equipmentTag, row.equipment_tag), eq(interlock.ceDocNo, row.ce_doc_no)) : eq(interlock.seqId, row.seq_id))
      .limit(1);
    const [revision] = sheet
      ? []
      : await db
          .select({ revision: documentRevision.revision })
          .from(documentRevision)
          .innerJoin(documentTable, eq(documentRevision.documentId, documentTable.id))
          .where(and(eq(documentTable.docNo, row.ce_doc_no), eq(documentRevision.isCurrent, true)))
          .limit(1);
    fn = { seq_id: key, sil: sheet?.sil ?? row.sil, ce_doc_no: sheet?.ceDocNo ?? row.ce_doc_no, ce_revision: sheet?.ceRevision ?? revision?.revision ?? "" };
    const stored = row.seq_id === null ? [] : await db.select().from(startPermissive).where(eq(startPermissive.seqId, row.seq_id)).orderBy(asc(startPermissive.n));
    permissives = stored.length > 0 ? stored.map((p) => ({ n: p.n, text: p.text, signal_tag: p.signalTag })) : row.permissives.map((p) => ({ n: p.n, text: p.text, signal_tag: null }));
  }
  return Refusal.parse({
    class: c.intent_class,
    function: fn,
    permissives,
    reset_note: row?.reset_note ?? null,
    route_text: routingText(pack, c) ?? ROUTE_TEXT_NO_FUNCTION,
    moc_text: c.intent_class === "permanent_change" ? MOC_TEXT : null,
    rule_id: c.rule_id,
    matched_phrase: c.matched_phrase ?? "",
  });
}

export type Actor = { alias: string; role: Role; route: string; trace_id: string };

// The two safety events carry the request text as typed, pseudonymised (9.7). No name list may exist in the
// application (the corpus names never reach it), so the redaction is by shape: an address and an honorific-led name.
// ponytail: shape-based; a name without an honorific passes through, the Admin-only reading is the ceiling.
export function pseudonymise(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b(?:Mr|Mrs|Ms|Dr|Ir|Pak|Bu|Bapak|Ibu|Mas|Mbak)\.?\s+\p{Lu}[\p{L}'-]+(?:\s+\p{Lu}[\p{L}'-]+)*/gu, "[person]");
}

/**
 * The Procedure of 9.8 for a lesson: the permit lines above the steps, every step verbatim from opl_step and
 * re-hashed against source_hash; a mismatch writes render.integrity_blocked and throws HashMismatch (409), never a
 * paraphrase (AC-ANS-05). protective_functions_affected is null: no supplied document states the effect analysis.
 */
export async function procedureFor(oplId: string, actor: Actor): Promise<Procedure | null> {
  const [lesson] = await db.select().from(opl).where(eq(opl.oplId, oplId)).limit(1);
  if (lesson === undefined) return null;
  const [revision] = await db
    .select({ revision: documentRevision.revision })
    .from(documentRevision)
    .where(eq(documentRevision.id, lesson.documentRevisionId))
    .limit(1);
  if (revision === undefined) throw new Error(`opl ${oplId}: document revision ${lesson.documentRevisionId} is missing`);
  const steps = await db.select().from(oplStep).where(eq(oplStep.oplId, oplId)).orderBy(asc(oplStep.n));
  const broken = steps.find((s) => quoteHash(s.actionText) !== s.sourceHash);
  if (broken !== undefined) {
    const integrity = { opl_id: oplId, step_n: broken.n, span_id: broken.spanId };
    await writeAudit({
      id: actor.trace_id,
      actor_alias: actor.alias,
      actor_role: actor.role,
      action: "render.integrity_blocked",
      entity: "opl",
      entity_id: oplId,
      payload: integrity,
      trace_id: actor.trace_id,
      route: actor.route,
    });
    throw new HashMismatch(integrity);
  }
  return Procedure.parse({
    opl_id: oplId,
    revision: revision.revision,
    permit_block: lesson.permitLines.map((p) => ({ text: p.text, span_id: p.span_id })),
    steps: steps.map((s) => ({ n: s.n, text: s.actionText, hash_ok: true, span_id: s.spanId })),
    protective_functions_affected: null,
  });
}
