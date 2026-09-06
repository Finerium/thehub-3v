// Procedures and permit lines (blueprint 9.8 Procedure, 9.5 Opl.permit_lines, 9.10 documented bypass; AC-ANS-05,
// AC-ANS-15, AC-ANS-16): a lesson's steps render verbatim from opl_step under source_hash, recomputed here in the
// canonical form, and a step whose text no longer hashes throws the typed HashMismatch so the render is blocked and
// never paraphrased (the caller writes render.integrity_blocked); the permit block carries only the lesson's own
// permit_lines, each resolved to its span, and nothing generated. The functions a job or a bypass takes out of
// service are read from the asset's cause-and-effect rows and start permissives: the effects whose final element
// names an isolated tag, the effects that survive, and the standing permissive the isolation defeats.
import type { Citation, Procedure } from "@/contracts/generated/evidence_packet";
import type { Db } from "@/db/client";
import * as q from "@/db/queries/retrieval";
import { HashMismatch } from "@/lib/errors";
import { DOCUMENTED_BYPASS_NOTICE } from "@/lib/fixed-strings";
import { quoteHash } from "@/lib/hash";
import { tagsIn } from "@/rulepack";
import { citationOf } from "./retrieve";
import type {
  FunctionOutOfServiceItem,
  PermissiveItem,
  PermitItem,
  ResetNoteItem,
  ReturnToServiceItem,
  StepItem,
} from "./types";

/** The spans a set of typed rows cite, with the open findings of their documents. */
export type Sources = { spans: Map<string, q.SpanSource>; findings: Map<string, string[]> };

export async function loadSources(db: Db, spanIds: readonly string[]): Promise<Sources> {
  const spans = await q.spansByIds(db, spanIds);
  const findings = await q.openFindingRuleIds(db, [...new Set([...spans.values()].map((s) => s.documentId))]);
  return { spans, findings };
}

/** The Citation of a span id, or null when the id resolves to no span (the caller omits what it would have cited). */
export function cite(sources: Sources, spanId: string): Citation | null {
  const s = sources.spans.get(spanId);
  return s ? citationOf(s, sources.findings.get(s.documentId) ?? []) : null;
}

export function citeSource(s: q.SpanSource, findings: ReadonlyMap<string, string[]>): Citation {
  return citationOf(s, findings.get(s.documentId) ?? []);
}

function mentions(text: string, tags: readonly string[]): boolean {
  const upper = text.toUpperCase();
  return tags.some((t) => upper.includes(t.toUpperCase()));
}

/** Instrument and valve tags a lesson names in its title and related-interlock line (never a SEQ id). */
export function lessonTags(lesson: Pick<q.OplRow, "title" | "relatedInterlockText">): string[] {
  return [...new Set(tagsIn(`${lesson.title} ${lesson.relatedInterlockText}`))].filter((t) => !t.startsWith("SEQ-"));
}

export type ProcedureBundle = {
  lesson: q.OplRow;
  /** The lesson as a whole (its title-block span), for a lessons block or a chip on the procedure. */
  citation: Citation;
  procedure: Procedure;
  permit: PermitItem[];
  steps: StepItem[];
  functions_out_of_service: FunctionOutOfServiceItem[];
};

/**
 * The verbatim procedure of one lesson (AC-ANS-05, AC-ANS-15). `isolatedTags` are the tags the question names;
 * the lesson's own tags join them for the protective functions the procedure takes out of service.
 */
export async function procedureOf(db: Db, oplId: string, isolatedTags: readonly string[] = []): Promise<ProcedureBundle | null> {
  const [lesson] = await q.oplsByIds(db, [oplId]);
  if (!lesson) return null;
  const [steps, revisions, title] = await Promise.all([
    q.oplStepsOf(db, [oplId]),
    q.revisionsByIds(db, [lesson.documentRevisionId]),
    q.firstSpanOfRevisions(db, [lesson.documentRevisionId]),
  ]);
  const revision = revisions.get(lesson.documentRevisionId);
  const titleSpan = title.get(lesson.documentRevisionId);
  if (!revision || !titleSpan) return null;
  const sources = await loadSources(db, [...steps.map((s) => s.spanId), ...lesson.permitLines.map((l) => l.span_id)]);
  const findings = await q.openFindingRuleIds(db, [titleSpan.documentId]);

  const stepItems: StepItem[] = [];
  for (const s of steps) {
    if (quoteHash(s.actionText) !== s.sourceHash) throw new HashMismatch({ opl_id: oplId, step_n: s.n, span_id: s.spanId });
    const citation = cite(sources, s.spanId);
    if (!citation) throw new HashMismatch({ opl_id: oplId, step_n: s.n, span_id: s.spanId });
    stepItems.push({ n: s.n, text: s.actionText, acceptance_criterion: s.acceptanceCriterion, hash_ok: true, citation });
  }
  // Only lines that resolve to a span of this lesson render (AC-ANS-15); a line that does not is dropped, never rewritten.
  const permit: PermitItem[] = [];
  for (const l of lesson.permitLines) {
    const citation = cite(sources, l.span_id);
    if (citation && citation.document_id === titleSpan.documentId) permit.push({ text: l.text, source_section: l.source_section, citation });
  }
  const functions = await functionsOutOfService(db, [lesson.equipmentTag], [...new Set([...isolatedTags, ...lessonTags(lesson)])]);

  const procedure: Procedure = {
    opl_id: lesson.oplId,
    revision: revision.revision,
    permit_block: permit.map((p) => ({ text: p.text, span_id: p.citation.span_id })),
    steps: stepItems.map((s) => ({ n: s.n, text: s.text, hash_ok: true, span_id: s.citation.span_id })),
    protective_functions_affected:
      functions.length === 0
        ? null
        : functions.map((f) => ({
            seq_id: f.seq_id,
            sil: f.sil,
            effects_through_isolated_element: f.effects_through_isolated_element.map((e) => `${e.effect_id} ${e.final_element}`),
            surviving_effects: f.surviving_effects.map((e) => `${e.effect_id} ${e.final_element}`),
            standing_permissive_defeated: f.standing_permissive_defeated,
          })),
  };
  return { lesson, citation: citeSource(titleSpan, findings), procedure, permit, steps: stepItems, functions_out_of_service: functions };
}

/**
 * The protective functions of the assets that an isolation of `isolatedTags` takes out of service: per interlock
 * with a SEQ, the marked effects whose final element names an isolated tag, the marked effects that survive, and the
 * standing permissive whose text or signal tag names an isolated tag. Empty when nothing is affected.
 */
export async function functionsOutOfService(db: Db, tags: readonly string[], isolatedTags: readonly string[]): Promise<FunctionOutOfServiceItem[]> {
  if (tags.length === 0 || isolatedTags.length === 0) return [];
  const interlocks = (await q.interlocksOf(db, tags)).filter((i) => i.seqId !== null);
  if (interlocks.length === 0) return [];
  const [rows, permissives] = await Promise.all([q.interlockRowsOf(db, tags), q.permissivesOf(db, interlocks.map((i) => i.seqId ?? ""))]);
  const sources = await loadSources(db, [
    ...rows.map((r) => r.spanId),
    ...permissives.map((p) => p.spanId),
    ...interlocks.flatMap((i) => i.notes.map((n) => n.span_id)),
  ]);
  const out: FunctionOutOfServiceItem[] = [];
  for (const il of interlocks) {
    const seq = il.seqId;
    if (seq === null) continue;
    const tripRows = rows.filter((r) => r.equipmentTag === il.equipmentTag && r.rowKind === "trip" && (r.seqId === null || r.seqId === seq));
    const through: FunctionOutOfServiceItem["effects_through_isolated_element"] = [];
    const surviving: FunctionOutOfServiceItem["surviving_effects"] = [];
    const seen = new Set<string>();
    for (const r of tripRows) {
      for (const e of r.effects) {
        if (!e.marked || seen.has(e.effect_id)) continue;
        seen.add(e.effect_id);
        (mentions(e.final_element, isolatedTags) ? through : surviving).push({ effect_id: e.effect_id, final_element: e.final_element });
      }
    }
    const defeated = permissives.find((p) => p.seqId === seq && (mentions(p.text, isolatedTags) || (p.signalTag !== null && mentions(p.signalTag, isolatedTags))));
    if (through.length === 0 && !defeated) continue;
    const anchor = tripRows[0]?.spanId ?? il.notes[0]?.span_id ?? defeated?.spanId;
    const citation = anchor ? cite(sources, anchor) : null;
    if (!citation) continue;
    out.push({
      seq_id: seq,
      sil: il.silSheet,
      ce_doc_no: il.ceDocNo,
      isolated_elements: [...isolatedTags],
      effects_through_isolated_element: through,
      surviving_effects: surviving,
      standing_permissive_defeated: defeated ? defeated.text : null,
      permit_route: DOCUMENTED_BYPASS_NOTICE,
      citation,
    });
  }
  return out;
}

/** Per function with a SEQ: the permissives that must be TRUE and the latched-reset notes, each resolved to its span. */
export async function returnToService(db: Db, tags: readonly string[]): Promise<ReturnToServiceItem[]> {
  if (tags.length === 0) return [];
  const interlocks = (await q.interlocksOf(db, tags)).filter((i) => i.seqId !== null);
  if (interlocks.length === 0) return [];
  const permissives = await q.permissivesOf(db, interlocks.map((i) => i.seqId ?? ""));
  const sources = await loadSources(db, [...permissives.map((p) => p.spanId), ...interlocks.flatMap((i) => i.notes.map((n) => n.span_id))]);
  const out: ReturnToServiceItem[] = [];
  for (const il of interlocks) {
    const seq = il.seqId;
    if (seq === null) continue;
    const items = permissiveItems(permissives.filter((p) => p.seqId === seq), sources);
    const notes = resetNotes(il, sources);
    const citation = items[0]?.citation ?? notes[0]?.citation;
    if (!citation) continue;
    out.push({ seq_id: seq, permissive_gate: il.permissiveGate, permissives: items, reset_notes: notes, citation });
  }
  return out;
}

export function permissiveItems(rows: readonly q.PermissiveRow[], sources: Sources): PermissiveItem[] {
  const out: PermissiveItem[] = [];
  for (const p of rows) {
    const citation = cite(sources, p.spanId);
    if (!citation) continue;
    out.push({ seq_id: p.seqId, n: p.n, text: p.text, signal_tag: p.signalTag, standing_bypass_state: p.standingBypassState, span_id: p.spanId, citation });
  }
  return out;
}

/** The sheet notes that speak of the reset (the latched-reset note of 9.10), verbatim with their spans. */
export function resetNotes(il: q.InterlockRowType, sources: Sources): ResetNoteItem[] {
  const out: ResetNoteItem[] = [];
  for (const n of il.notes) {
    if (!/reset/i.test(n.text)) continue;
    const citation = cite(sources, n.span_id);
    if (citation) out.push({ n: n.n, text: n.text, citation });
  }
  return out;
}
