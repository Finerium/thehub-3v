// The operational-context read (PRD FR-114, blueprint 6.2 surfaces 5 and 6, 9.3, 9.4; AC-CTX-05). Everything the
// panel prints is read here from the seeded rows at request time and reconciled beside the fixture keys of
// blueprint 10.5 (`workbook.breakdown_kinds`, `workbook.lead_time`, `populations`); nothing is typed into the
// component. Four readings make the context, and each one is the plant's own record:
//
//   the breakdown split      failure_event rows by breakdown_kind: the unplanned and the planned-but-flagged
//                            populations with their recorded downtime and recorded maintenance cost.
//   the notification lead    work_order.notification_lead_hours, the Report_Date to Start_Date distance the
//                            workbook itself carries; the median is Postgres's own percentile, never a mean.
//   the protective function  the interlock the cause-and-effect sheet types for the asset (9.3 FR-106: read from
//                            source data only). An asset whose sheet is a control loop resolves to none, and the
//                            panel says so rather than rendering an empty field.
//   the demand history       stated as not recorded, never as none: Related_Interlock is one of the eleven
//                            outcome fields CD-4 finds empty, so no record types the function it demanded. A
//                            demand is inferred instead by the initiator tag the narrative names, and every
//                            inferred row carries that basis (`inferDemands` below is the whole rule).
//
// Nothing here predicts, ranks, assigns, chases or aggregates by person (Case 1).
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { Interlock } from "@/contracts/generated/asset";
import { db } from "@/db/client";
import { preferredVersion, versionLabel, type VersionLabel } from "@/db/queries/failures";
import { equipment, failureEvent, integrityFinding, interlock, interlockRow, workOrder } from "@/db/schema";
import { fixtures } from "@/lib/fixtures";
import { log } from "@/lib/log";

/** The lead-time bucket the fixture key `workbook.lead_time.at_least_24h` counts: a full day before work started. */
export const FULL_DAY_HOURS = 24;

/** The narrative fields a demand can be read from, in the order the workbook prints them. */
export const NARRATIVE_FIELDS = ["problem_description", "root_cause", "corrective_action", "remarks"] as const;
export type NarrativeField = (typeof NARRATIVE_FIELDS)[number];

/** The sheet's own vocabulary for a protective function acting: a record states a demand when it states a trip. */
const TRIP_WORD = /\btrip(?:s|ped|ping)?\b/i;

// ---------------------------------------------------------------------------------------------------------------
// The fixture slice this panel reconciles against (10.5). Loose objects: the harness may add keys, never rename one.
// ---------------------------------------------------------------------------------------------------------------
const KindTotals = z.looseObject({ rows: z.number().int(), hours: z.number(), cost_idr: z.number().int() });

export const ContextFixtures = z.looseObject({
  workbook: z.looseObject({
    rows: z.number().int(),
    breakdown_kinds: z.looseObject({ unplanned: KindTotals, planned_flagged: KindTotals }),
    lead_time: z.looseObject({
      median_h: z.number(),
      at_least_24h: z.number().int(),
      share: z.number(),
      min_h: z.number(),
      max_h: z.number(),
    }),
  }),
  populations: z.looseObject({
    unplanned_breakdowns: z.number().int(),
    planned_flagged: z.number().int(),
    all: z.number().int(),
  }),
});
export type ContextFixtures = z.infer<typeof ContextFixtures>;

/** The slice, or null when this runtime has no fixture or the file lacks a key (the panel says so, never a number). */
export function contextFixtures(): ContextFixtures | null {
  if (!fixtures) return null;
  const parsed = ContextFixtures.safeParse(fixtures);
  if (!parsed.success) {
    log.warn({ event: "fixtures.slice_invalid", slice: "operational_context", issues: parsed.error.issues.length });
    return null;
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------------------------
/** One breakdown kind of the flagged population, with the downtime and maintenance cost the records recorded. */
export type BreakdownTotals = { rows: number; hours: number; cost_idr: number };

/** The Report_Date to Start_Date distance over a record set; null on an empty set, never a zero. */
export type LeadTime = { records: number; median_h: number | null; at_least_24h: number; min_h: number | null; max_h: number | null };

export type RecordFigures = { unplanned: BreakdownTotals; planned_flagged: BreakdownTotals; lead_time: LeadTime };

/** One trip row of the function, as the cause-and-effect sheet types it. */
export type Initiator = { row_id: string; instrument_tag: string; initiator: string; setpoint_text: string; voting: string | null };

/** The protective function the asset resolves to; null where the sheet types a control loop and no LOGIC No. */
export type ProtectiveFunction = { seq_id: string; sil_sheet: number | null; ce_doc_no: string; ce_revision: string; initiators: Initiator[] };

/** A demand The Hub inferred; the plant's record types none. Every field here is the record's own. */
export type InferredDemand = {
  wo_number: string;
  report_date: string;
  initiator_tag: string;
  row_id: string;
  field: NarrativeField;
  /** The field's own words, quoted; the tag and the trip both stand in this text. */
  field_text: string;
};

export type DemandHistory = {
  /** Records of the asset whose Related_Interlock field is empty (the CD-4 reading, over the whole history). */
  empty_related_interlock: number;
  records: number;
  inferred: InferredDemand[];
};

export type OpenFindings = { total: number; by_rule: Array<{ rule_id: string; rule: string | null; n: number }>; version: VersionLabel | null };

export type OperationalContext = {
  tag: string;
  /** The verbatim LOGIC No text of the equipment row ("SEQ-1201", "N/A (control loop only)"). */
  interlock_ref: string;
  ce_doc_no: string;
  logic_kind: Interlock["logic_kind"] | null;
  protective_function: ProtectiveFunction | null;
  asset: RecordFigures;
  fleet: RecordFigures;
  demands: DemandHistory;
  findings: OpenFindings;
  fixture: ContextFixtures | null;
};

// ---------------------------------------------------------------------------------------------------------------
// The demand rule, stated once
// ---------------------------------------------------------------------------------------------------------------
export type DemandCandidate = {
  wo_number: string;
  report_date: string;
  related_interlock: string | null;
  problem_description: string;
  root_cause: string;
  corrective_action: string;
  remarks: string | null;
};

const escaped = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A tag stands in the text as its own word: neither an alphanumeric nor a hyphen may touch it. */
function namesTag(text: string, tag: string): boolean {
  return new RegExp(`(?<![A-Za-z0-9-])${escaped(tag)}(?![A-Za-z0-9-])`).test(text);
}

/**
 * The inference of FR-114, whole: a record demands the protective function when its Related_Interlock field is
 * empty, one of its narrative fields names an instrument tag the sheet types as a trip initiator of that
 * function, and the same field states a trip. It is an inference over the plant's words and never a recorded
 * link; the panel labels every row it returns as one. Over the seeded workbook it resolves the four records the
 * corpus leaves unlinked, one of them SEQ-1201's WO-240003 by VSHH-1201.
 */
export function inferDemands(records: readonly DemandCandidate[], initiators: readonly Initiator[]): InferredDemand[] {
  if (initiators.length === 0) return [];
  const out: InferredDemand[] = [];
  for (const r of records) {
    if (r.related_interlock !== null && r.related_interlock.trim().length > 0) continue;
    const texts: Array<[NarrativeField, string]> = [
      ["problem_description", r.problem_description],
      ["root_cause", r.root_cause],
      ["corrective_action", r.corrective_action],
      ["remarks", r.remarks ?? ""],
    ];
    for (const [field, text] of texts) {
      if (!TRIP_WORD.test(text)) continue;
      const hit = initiators.find((i) => namesTag(text, i.instrument_tag));
      if (!hit) continue;
      out.push({
        wo_number: r.wo_number,
        report_date: r.report_date,
        initiator_tag: hit.instrument_tag,
        row_id: hit.row_id,
        field,
        field_text: text,
      });
      break;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The read
// ---------------------------------------------------------------------------------------------------------------
// numeric and bigint sums come back as text from Postgres; float8 is exact for every figure in the workbook
const sumHours = sql<number>`coalesce(sum(${failureEvent.downtimeHours}), 0)::float8`;
const sumCost = sql<number>`coalesce(sum(${failureEvent.maintenanceCostIdr}), 0)::float8`;
const median = sql<number | null>`(percentile_cont(0.5) within group (order by ${workOrder.notificationLeadHours}))::float8`;
const atLeastFullDay = sql<number>`count(*) filter (where ${workOrder.notificationLeadHours} >= ${FULL_DAY_HOURS})::int`;
const minLead = sql<number | null>`min(${workOrder.notificationLeadHours})::float8`;
const maxLead = sql<number | null>`max(${workOrder.notificationLeadHours})::float8`;
const emptyInterlock = sql<number>`count(*) filter (where ${workOrder.relatedInterlock} is null or btrim(${workOrder.relatedInterlock}) = '')::int`;

const NO_TOTALS: BreakdownTotals = { rows: 0, hours: 0, cost_idr: 0 };

type EventRow = { kind: (typeof failureEvent.breakdownKind.enumValues)[number]; rows: number; hours: number; cost: number };

function totalsOf(rows: readonly EventRow[], kind: EventRow["kind"]): BreakdownTotals {
  const row = rows.find((r) => r.kind === kind);
  return row === undefined ? NO_TOTALS : { rows: row.rows, hours: Number(row.hours), cost_idr: Number(row.cost) };
}

type LeadRow = { records: number; median: number | null; atLeast: number; min: number | null; max: number | null };

function leadOf(row: LeadRow | undefined): LeadTime {
  if (row === undefined || row.records === 0) return { records: 0, median_h: null, at_least_24h: 0, min_h: null, max_h: null };
  return {
    records: row.records,
    median_h: row.median === null ? null : Number(row.median),
    at_least_24h: row.atLeast,
    min_h: row.min === null ? null : Number(row.min),
    max_h: row.max === null ? null : Number(row.max),
  };
}

/**
 * One asset's operational context, with the fleet totals it reconciles to and the fixture slice beside them.
 * Returns null when no equipment row carries the tag (the surface renders its 404).
 */
export async function operationalContext(tag: string, versionIds: readonly string[]): Promise<OperationalContext | null> {
  const [eq_] = await db
    .select({ tag: equipment.tag, interlockRef: equipment.interlockRef, ceDocNo: equipment.ceDocNo })
    .from(equipment)
    .where(eq(equipment.tag, tag))
    .limit(1);
  if (!eq_) return null;

  const [lock] = await db
    .select({
      seqId: interlock.seqId,
      logicKind: interlock.logicKind,
      silSheet: interlock.silSheet,
      ceDocNo: interlock.ceDocNo,
      ceRevision: interlock.ceRevision,
    })
    .from(interlock)
    .where(eq(interlock.equipmentTag, tag))
    .limit(1);
  const seqId = lock?.seqId ?? null;

  const findingsVersion = await preferredVersion(versionIds, integrityFinding, integrityFinding.corpusVersionId);

  const [assetEvents, fleetEvents, [assetLead], [fleetLead], tripRows, candidates, [emptyRow], findingRows] = await Promise.all([
    db
      .select({ kind: failureEvent.breakdownKind, rows: count(), hours: sumHours, cost: sumCost })
      .from(failureEvent)
      .where(eq(failureEvent.equipmentTag, tag))
      .groupBy(failureEvent.breakdownKind),
    db.select({ kind: failureEvent.breakdownKind, rows: count(), hours: sumHours, cost: sumCost }).from(failureEvent).groupBy(failureEvent.breakdownKind),
    db
      .select({ records: count(), median, atLeast: atLeastFullDay, min: minLead, max: maxLead })
      .from(workOrder)
      .where(eq(workOrder.equipmentTag, tag)),
    db.select({ records: count(), median, atLeast: atLeastFullDay, min: minLead, max: maxLead }).from(workOrder),
    seqId === null
      ? []
      : db
          .select({
            rowId: interlockRow.rowId,
            instrumentTag: interlockRow.instrumentTag,
            initiator: interlockRow.initiator,
            setpointText: interlockRow.setpointText,
            voting: interlockRow.voting,
          })
          .from(interlockRow)
          .where(and(eq(interlockRow.equipmentTag, tag), eq(interlockRow.seqId, seqId), eq(interlockRow.rowKind, "trip")))
          .orderBy(asc(interlockRow.rowId)),
    db
      .select({
        wo_number: workOrder.woNumber,
        report_date: workOrder.reportDate,
        related_interlock: workOrder.relatedInterlock,
        problem_description: workOrder.problemDescription,
        root_cause: workOrder.rootCause,
        corrective_action: workOrder.correctiveAction,
        remarks: workOrder.remarks,
      })
      .from(workOrder)
      .where(eq(workOrder.equipmentTag, tag))
      .orderBy(desc(workOrder.reportDate), asc(workOrder.woNumber)),
    db.select({ records: count(), empty: emptyInterlock }).from(workOrder).where(eq(workOrder.equipmentTag, tag)),
    findingsVersion === null
      ? []
      : db
          .select({ rule_id: integrityFinding.ruleId, rule: integrityFinding.rule, n: count() })
          .from(integrityFinding)
          .where(
            and(
              eq(integrityFinding.corpusVersionId, findingsVersion),
              eq(integrityFinding.state, "open"),
              eq(integrityFinding.observationOnly, false),
              sql`${integrityFinding.item} ->> 'tag' = ${tag}`,
            ),
          )
          .groupBy(integrityFinding.ruleId, integrityFinding.rule),
  ]);

  const initiators: Initiator[] = tripRows.map((r) => ({
    row_id: r.rowId,
    instrument_tag: r.instrumentTag,
    initiator: r.initiator,
    setpoint_text: r.setpointText,
    voting: r.voting,
  }));

  return {
    tag: eq_.tag,
    interlock_ref: eq_.interlockRef,
    ce_doc_no: lock?.ceDocNo ?? eq_.ceDocNo,
    logic_kind: lock?.logicKind ?? null,
    protective_function:
      lock === undefined || seqId === null
        ? null
        : { seq_id: seqId, sil_sheet: lock.silSheet, ce_doc_no: lock.ceDocNo, ce_revision: lock.ceRevision, initiators },
    asset: {
      unplanned: totalsOf(assetEvents, "unplanned"),
      planned_flagged: totalsOf(assetEvents, "planned_flagged"),
      lead_time: leadOf(assetLead),
    },
    fleet: {
      unplanned: totalsOf(fleetEvents, "unplanned"),
      planned_flagged: totalsOf(fleetEvents, "planned_flagged"),
      lead_time: leadOf(fleetLead),
    },
    demands: {
      empty_related_interlock: emptyRow?.empty ?? 0,
      records: emptyRow?.records ?? 0,
      inferred: inferDemands(candidates, initiators),
    },
    findings: {
      total: findingRows.reduce((s, r) => s + r.n, 0),
      by_rule: [...findingRows].sort((a, b) => Number(a.rule_id.slice(3)) - Number(b.rule_id.slice(3))),
      version: findingsVersion === null ? null : await versionLabel(findingsVersion),
    },
    fixture: contextFixtures(),
  };
}
