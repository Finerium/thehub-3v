// The cluster's evidence bundle for AG-3 (blueprint 9.16 AG-3 input envelope; ARCHITECTURE 8.2). Six reads in the
// order the contract names them: the uncovered work orders of the cluster, then the asset's datasheet parameters,
// interlock rows, BOM items, lesson steps and published lessons. Every row is mapped back to the contract's own
// spelling and parsed against the generated Zod, so a column the schema renames or drops fails here rather than
// inside a provider request. Two derivations travel with the evidence: the reference list the redliner receives,
// and the numeral index that types a draft's numbers, which is why no number the drafter writes can come from the
// model (blueprint section 1, guarantee "no number is generated"). Two caps below bound what the six reads return,
// because an envelope the drafter cannot answer inside the route's 300 s is a draft that never completes.
import { desc, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { DebtCluster } from "@/contracts/generated/coverage";
import { AG3Input } from "@/contracts/generated/gateway";
import { db } from "@/db/client";
import { bomItem, datasheetParam, debtCluster, interlockRow, opl, oplStep, workOrder } from "@/db/schema";
import { numeralsOf } from "./numeric";

export type Evidence = AG3Input["evidence"];
export type EvidenceRef = { kind: string; ref: string };
export type NumeralSource = { ref: string; unit: string; numerals: ReadonlySet<string> };

// Drizzle hands a row back with the column names camel-cased; the contracts of section 9 spell them snake_case.
// One reverse of that, top level only, exactly as the nested values are already stored in the contract's spelling.
function snake(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), value]),
  );
}

/** The cluster a draft was requested for, in the spelling of 9.5. */
export async function loadCluster(clusterId: string): Promise<DebtCluster | null> {
  const [row] = await db.select().from(debtCluster).where(eq(debtCluster.id, clusterId)).limit(1);
  return row ? DebtCluster.parse(snake(row)) : null;
}

// What the envelope costs, measured on the seeded corpus (version v1): the GA-1201A cluster's whole envelope
// canonicalised to 63,228 bytes, which the provider counted with its prompt as 22,440 input tokens, split as work
// orders 2,441, datasheet parameters 9,161, interlock rows 5,753, BOM items 2,521, lesson steps 10,013, lessons
// 31,304, the cluster 349 and the template 1,584. Under the two caps below the same envelope is 38,565 bytes and
// 15,517 input tokens. Neither drops a provenance ref the numeric check needs: every numeral a drafter may write
// still travels with the item that states it.

/**
 * The uncovered work orders one envelope carries, most recent first, then the heaviest by labour hours. The
 * population is the cluster's own uncovered set, which is at most four rows anywhere in the seeded corpus
 * (YD-2301, the largest), so nothing is dropped today; a cluster with more than this many uncovered records loses
 * its oldest and lightest ones, which are the records a lesson written now is least likely to teach from.
 */
export const MAX_WORK_ORDERS = 8;

/**
 * The size at which the evidence sheds the one part of it a drafter cannot use. What costs a drafting round its
 * wall clock is not the reply, which measured 4,033 bytes of JSON, but the reasoning the envelope provokes: at
 * 22,345 input tokens one AG-3 call returned 5,684 to 6,528 completion tokens and took 122 to 146 s against a
 * 300 s route. An asset with many approved lessons is what pushes it there, and a lesson's six section bodies are
 * the one thing in the envelope the drafter is forbidden to use: it refers to an approved lesson by its `opl_id`
 * rather than restate it (9.16 AG-3 rule 5), sections 1, 2, 3, 4 and 6 may reproduce nothing verbatim, and what a
 * lesson teaches already travels step by step in `opl_steps` with its own span ids. Over this budget they go, and
 * the lesson keeps its header, its permit lines (which rule 5 does carry verbatim) and its footer. GA-1201A's
 * seven lessons carry 24,696 bytes of bodies, which is what the budget sheds; an asset small enough to stay under
 * it sends everything.
 */
export const MAX_EVIDENCE_BYTES = 40_000;

const withoutLessonBodies = (evidence: Evidence): Evidence => ({
  ...evidence,
  lessons: evidence.lessons.map((lesson) => ({ ...lesson, sections: [] })),
});

/** The six evidence kinds of the AG-3 envelope, read in the contract's order. */
export async function loadEvidence(cluster: DebtCluster): Promise<Evidence> {
  const tag = cluster.equipment_tag;

  const workOrders = await db
    .select()
    .from(workOrder)
    .where(inArray(workOrder.woNumber, [...cluster.uncovered_wo_numbers]))
    .orderBy(desc(workOrder.reportDate), sql`${workOrder.laborHours} desc nulls last`, workOrder.woNumber)
    .limit(MAX_WORK_ORDERS);
  const params = await db
    .select()
    .from(datasheetParam)
    .where(eq(datasheetParam.equipmentTag, tag))
    .orderBy(datasheetParam.id);
  const interlocks = await db
    .select()
    .from(interlockRow)
    .where(eq(interlockRow.equipmentTag, tag))
    .orderBy(interlockRow.id);
  const boms = await db.select().from(bomItem).where(eq(bomItem.equipmentTag, tag)).orderBy(bomItem.itemNo);
  const steps = await db
    .select(getTableColumns(oplStep))
    .from(oplStep)
    .innerJoin(opl, eq(opl.oplId, oplStep.oplId))
    .where(eq(opl.equipmentTag, tag))
    .orderBy(oplStep.oplId, oplStep.n);
  const lessons = await db.select().from(opl).where(eq(opl.equipmentTag, tag)).orderBy(opl.oplId);

  const evidence: Record<string, unknown> = {
    work_orders: workOrders.map(snake),
    datasheet_params: params.map(snake),
    interlock_rows: interlocks.map(snake),
    bom_items: boms.map(snake),
    opl_steps: steps.map(snake),
    lessons: lessons.map(snake),
  };
  const parsed = AG3Input.shape.evidence.parse(evidence);
  // The numeral index of this module is built from the object that is sent, never from a wider one, so a numeral a
  // shed body states stops being a source at the same moment it stops being visible to the drafter: what the
  // drafter cannot read it cannot cite, and what it cites is still typed by the item that states it.
  return Buffer.byteLength(JSON.stringify(parsed), "utf8") > MAX_EVIDENCE_BYTES ? withoutLessonBodies(parsed) : parsed;
}

const stepRef = (step: Evidence["opl_steps"][number]): string => `${step.opl_id}#${step.n}`;

/** What the redliner is shown of the evidence: identifiers, never the evidence text (9.16 AG-4 redline). */
export function evidenceRefs(evidence: Evidence): EvidenceRef[] {
  return [
    ...evidence.work_orders.map((w) => ({ kind: "work_order", ref: w.wo_number })),
    ...evidence.datasheet_params.map((p) => ({ kind: "datasheet_param", ref: p.id })),
    ...evidence.interlock_rows.map((r) => ({ kind: "interlock_row", ref: r.id })),
    ...evidence.bom_items.map((b) => ({ kind: "bom_item", ref: b.id })),
    ...evidence.opl_steps.map((s) => ({ kind: "opl_step", ref: stepRef(s) })),
    ...evidence.lessons.map((l) => ({ kind: "opl_section", ref: l.opl_id })),
  ];
}

function collect(value: unknown, into: Set<string>): void {
  if (typeof value === "string") {
    for (const numeral of numeralsOf(value)) into.add(numeral);
    return;
  }
  if (typeof value === "number") {
    into.add(String(value));
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collect(item, into);
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const item of Object.values(value)) collect(item, into);
  }
}

function source(ref: string, unit: string | null, row: unknown): NumeralSource {
  const numerals = new Set<string>();
  collect(row, numerals);
  return { ref, unit: unit ?? "", numerals };
}

/** Every numeral the evidence states, with the item that states it and that item's own unit. */
export function numeralSources(evidence: Evidence): NumeralSource[] {
  return [
    ...evidence.work_orders.map((w) => source(w.wo_number, null, w)),
    ...evidence.datasheet_params.map((p) => source(p.id, p.unit, p)),
    ...evidence.interlock_rows.map((r) => source(r.id, r.setpoint_unit, r)),
    ...evidence.bom_items.map((b) => source(b.id, null, b)),
    ...evidence.opl_steps.map((s) => source(stepRef(s), null, s)),
    ...evidence.lessons.map((l) => source(l.opl_id, null, l)),
  ];
}
