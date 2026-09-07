// runDraft, the drafting work of one invocation (ADR-004, blueprint 9.6, 9.16 AG-3; ARCHITECTURE 8.2; AC-LOOP-04,
// AC-LOOP-05, AC-LOOP-15). POST /api/drafts inserts the draft in `proposed` and hands the draft id here through the
// invocation's waitUntil. Idempotent per draft id: a draft past `proposed` returns having called nothing, so a
// retried invocation never drafts twice. One pass is AG-3 with { cluster, evidence, template } -> draft_field rows
// (the element's provenance, or the fixed slot literal, with numeric_provenance derived from the evidence and never
// from the model) -> `drafted`; the verbatim and the numeric check; the AG-4 redline of the round -> `redlined`;
// pass -> `in_review`, block -> `drafted` and one more pass (round 2) -> `in_review` or `blocked`. The two
// deterministic checks decide with the redliner and never through it: their violations make the round a block
// whatever the model returned, and they name the field and the section that blocked the draft. The rounds run
// against a clock: every provider call the drafting starts has to fit the invocation, so a second round is opened
// only while the budget still holds one, and a draft the redliner blocked ends blocked with those reasons rather
// than stranded in `redlined` by a call that could not land.
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { DraftField, RedlineVerdict } from "@/contracts/generated/drafts";
import { AG3Output, type AG3Input } from "@/contracts/generated/gateway";
import { db } from "@/db/client";
import { draftDocument, draftField, redlineVerdict } from "@/db/schema";
import { saveTroubleshootingRows } from "./rows";
import { invoke } from "@/gateway";
import { SLOT_TEXT } from "@/lib/fixed-strings";
import { transition } from "@/loop/state";
import { evidenceRefs, loadCluster, loadEvidence, numeralSources, type NumeralSource } from "./evidence";
import { SYSTEM_ACTOR } from "./lease";
import { numeralsOf, numericViolations } from "./numeric";
import { redline, type RedlineRound } from "./redline";
import { HOUSE_TEMPLATE, TEMPLATE_RULES } from "./template";
import { verbatimViolations } from "./verbatim";

export { HOUSE_TEMPLATE } from "./template";

/** 9.16: AG-3 gets one retry per round; two replies that do not parse leave the draft to its lease. */
const AG3_ATTEMPTS = 2;
const ROUNDS: readonly RedlineRound[] = [1, 2];

/**
 * The drafting budget: the lease of src/loop/lease.ts, counted from the start of the drafting work inside the
 * invocation's 300 s (ADR-004). A round is one AG-3 reply plus the redline of it, and what it costs is measured
 * rather than assumed: the first round always runs, and a second is started only while the budget still holds a
 * round of the size the first one turned out to be. The same rule governs the retry inside a round. Live on the
 * seeded corpus a complete AG-3 reply took 39.4 to 60.6 s and its redline 7.1 to 16.2 s, so a round that went well
 * leaves room for another and a round that was fought for does not, which is the difference between a blocked
 * draft a person can act on and a draft the route kills mid-call and leaves to its lease.
 */
const DRAFT_BUDGET_MS = 240_000;

type Reason = RedlineVerdict["reasons"][number];

async function draftOnce(envelope: AG3Input, left: () => number): Promise<AG3Output | null> {
  let longestMs = 0; // zero before the first call, which is why the first call is never refused
  for (let attempt = 1; attempt <= AG3_ATTEMPTS; attempt++) {
    if (left() < longestMs) return null;
    const at = performance.now();
    const result = await invoke("AG-3", envelope, AG3Output);
    longestMs = Math.max(longestMs, performance.now() - at);
    if (result.outcome === "ok" && result.data) return result.data;
  }
  return null;
}

// A numeral is typed by the evidence item the element cites, or by any item that states it; a numeral no item
// states gets no entry, which is what the numeric check blocks on.
function numericProvenanceOf(
  text: string,
  ref: string | null,
  sources: readonly NumeralSource[],
): DraftField["numeric_provenance"] {
  const entries: DraftField["numeric_provenance"] = [];
  for (const numeral of new Set(numeralsOf(text))) {
    const cited = ref === null ? undefined : sources.find((s) => s.ref === ref && s.numerals.has(numeral));
    const stated = cited ?? sources.find((s) => s.numerals.has(numeral));
    if (stated) entries.push({ numeral, source_ref: stated.ref, unit: stated.unit });
  }
  return entries;
}

// One draft_field per element, in template order. A slot is stored as the fixed literal: the drafter never writes a
// slot's text and never types a slot's numbers (9.6, AC-LOOP-05, AC-LOOP-11).
function fieldsOf(draftId: string, output: AG3Output, sources: readonly NumeralSource[]): DraftField[] {
  const fields: DraftField[] = [];
  for (const section of [...output.sections].toSorted((a, b) => a.n - b.n)) {
    section.elements.forEach((element, index) => {
      const text = element.is_slot ? SLOT_TEXT : element.text;
      fields.push({
        id: randomUUID(),
        draft_id: draftId,
        section: section.n,
        ordinal: index + 1,
        text,
        provenance: element.provenance,
        numeric_provenance: element.is_slot ? [] : numericProvenanceOf(text, element.provenance.ref, sources),
        quarantined: false,
        is_slot: element.is_slot,
      });
    });
  }
  return fields;
}

function row(field: DraftField): typeof draftField.$inferInsert {
  return {
    id: field.id,
    draftId: field.draft_id,
    section: field.section,
    ordinal: field.ordinal,
    text: field.text,
    provenance: field.provenance,
    numericProvenance: field.numeric_provenance,
    quarantined: field.quarantined,
    isSlot: field.is_slot,
  };
}

// The deterministic checks as redline reasons: both are template conformance, both name the field and the section.
function deterministicReasons(fields: readonly DraftField[], evidence: AG3Input["evidence"]): Reason[] {
  return [
    ...verbatimViolations(fields, evidence.work_orders),
    ...numericViolations(fields),
  ].map((violation) => ({ category: "template_conformance", text: violation.text, field_id: violation.field_id }));
}

export async function runDraft(draftId: string): Promise<void> {
  const [draft] = await db
    .select({ state: draftDocument.state, clusterId: draftDocument.clusterId })
    .from(draftDocument)
    .where(eq(draftDocument.id, draftId))
    .limit(1);
  if (!draft || draft.state !== "proposed") return; // idempotent per draft id (ADR-004)
  const started = performance.now();

  const cluster = await loadCluster(draft.clusterId);
  if (!cluster) return;
  const evidence = await loadEvidence(cluster);
  const envelope: AG3Input = { cluster, evidence, template: HOUSE_TEMPLATE };
  const refs = evidenceRefs(evidence);
  const sources = numeralSources(evidence);

  const left = (): number => DRAFT_BUDGET_MS - (performance.now() - started);
  let block: { round: RedlineRound; reasons: Reason[] } | null = null;
  let longestRoundMs = 0; // zero before the first round, which is why the first round is never refused
  for (const round of ROUNDS) {
    const roundStarted = performance.now();
    if (left() < longestRoundMs) break;

    const output = await draftOnce(envelope, left);
    if (!output) break; // nothing usable twice: the block of the round before it, else the lease

    const fields = fieldsOf(draftId, output, sources);
    // The round rewrites the body: whatever a previous round or a died invocation left behind goes with it.
    await db.delete(draftField).where(eq(draftField.draftId, draftId));
    if (fields.length > 0) await db.insert(draftField).values(fields.map(row));
    // Section 5 quotes work-order rows (9.6, AC-LOOP-04). They are part of the body this round wrote, so they are
    // rewritten with it; saveTroubleshootingRows clears the round before it.
    await saveTroubleshootingRows(db, draftId, output.troubleshooting_rows);
    await transition(draftId, "drafted", SYSTEM_ACTOR, null);

    const deterministic = deterministicReasons(fields, evidence);
    const verdict = await redline(output, refs, TEMPLATE_RULES, round);
    const blocked = deterministic.length > 0 || verdict.verdict === "block";
    const reasons: Reason[] = [...deterministic, ...verdict.reasons];
    await db.insert(redlineVerdict).values({
      draftId,
      round,
      verdict: blocked ? "block" : "pass",
      reasons,
      modelId: verdict.call.model_id,
      promptVersion: verdict.call.prompt_version ?? "",
      createdAt: new Date(),
    });
    await transition(draftId, "redlined", SYSTEM_ACTOR, null);

    if (!blocked) {
      await transition(draftId, "in_review", SYSTEM_ACTOR, null);
      return;
    }
    block = { round, reasons };
    longestRoundMs = Math.max(longestRoundMs, performance.now() - roundStarted);
  }

  // A blocked draft is terminal and re-proposable, so the round that blocked it is written whether the loop ran out
  // of rounds or the clock ran out first; only a first round that produced nothing at all leaves the state to the
  // lease, which is the one path 9.6 lets reach `blocked` from `proposed`.
  if (!block) return;
  const why = block.reasons.map((reason) => reason.text).join(" ");
  await transition(draftId, "blocked", SYSTEM_ACTOR, why === "" ? `redline round ${block.round} blocked` : why);
}
