// Failure Memory reads (blueprint 6.2 surface 6, 9.4, 9.9 GET /api/assets/:tag/failures, 10.3; AC-FM-01 to 07).
// Every figure comes from work_order and failure_event rows or from the package artefacts (causal_link,
// failure_family, proof_test, bom_match); the fixture slice is read beside them for the reconciliation the surface
// prints and never in their place. Links are never computed here (9.4: a package artefact). Recorded maintenance
// cost is the workbook's own labour plus material (total_cost_idr, failure_event.maintenance_cost_idr) and no other
// cost class exists (AC-FM-04). Nothing here predicts, ranks, assigns or aggregates by person (Case 1).
import { and, asc, count, desc, eq, inArray, sql, type ColumnBaseConfig, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import { z } from "zod";
import { BomItem, BomMatch, CausalLink, FailureEvent, FailureFamily, ProofTest, WorkOrder } from "@/contracts/generated/operations";
import { db } from "@/db/client";
import {
  area,
  bomItem,
  bomMatch,
  causalLink,
  corpusVersion,
  coverageAssessment,
  debtCluster,
  documentRevision,
  equipment,
  failureEvent,
  failureFamily,
  integrityFinding,
  opl,
  proofTest,
  troubleshootingRow,
  workOrder,
} from "@/db/schema";
import { fixtures } from "@/lib/fixtures";
import { log } from "@/lib/log";

/** The register rule that carries an incomplete closeout (6.4 ClosedoutChip links a record to its own finding). */
export const CD4_RULE = "CD-4";

export const WORK_TYPES = WorkOrder.shape.work_type.options;
export const TEST_CLASSES = ProofTest.shape.test_class.options;
export type WorkType = WorkOrder["work_type"];
export type TestClass = ProofTest["test_class"];

// ---------------------------------------------------------------------------------------------------------------
// The fixture slice this surface reconciles against (10.5: workbook, equipment_master, chains, families,
// proof_tests, demo). Loose objects: the harness may add keys and never renames one.
// ---------------------------------------------------------------------------------------------------------------
const Totals = z.looseObject({ rows: z.number().int(), hours: z.number(), cost_idr: z.number().int() });
const KindTotals = z.looseObject({ count: z.number().int(), hours: z.number(), cost_idr: z.number().int() });
const Counts = z.record(z.string(), z.number().int());

export const EquipmentMasterRow = z.looseObject({
  tag: z.string(),
  name: z.string(),
  work_orders: z.number().int(),
  work_types: Counts,
  breakdowns_flagged: z.number().int(),
  unplanned_rows: z.number().int(),
  planned_flagged_rows: z.number().int(),
  unplanned_h: z.number(),
  flagged_h: z.number(),
  breakdown_cost_idr: z.number().int(),
  incomplete_rows: z.number().int(),
  failure_rows: z.number().int(),
});
export type EquipmentMasterRow = z.infer<typeof EquipmentMasterRow>;

export const FailureFixtures = z.looseObject({
  workbook: z.looseObject({
    rows: z.number().int(),
    work_types: Counts,
    breakdown_flagged: Totals,
    breakdown_kinds: z.looseObject({ unplanned: KindTotals, planned_flagged: KindTotals }),
    incomplete: z.looseObject({ count: z.number().int(), emergency_rows: z.number().int(), by_work_type: Counts }),
  }),
  equipment_master: z.array(EquipmentMasterRow),
  chains: z.looseObject({ links: z.number().int(), by_tag: Counts, window_days: z.number().int() }),
  families: z.looseObject({ list: z.array(z.looseObject({ id: z.string() })), r_by_tag: z.record(z.string(), z.number()), multi_family_wos: z.array(z.string()) }),
  proof_tests: z.looseObject({ total: z.number().int(), by_class: Counts }),
  demo: z.looseObject({ primary_wo: z.string() }),
});
export type FailureFixtures = z.infer<typeof FailureFixtures>;

/** The slice, or null when this runtime has no fixture or the file lacks a key (the surface says so, never a number). */
export function failureFixtures(): FailureFixtures | null {
  if (!fixtures) return null;
  const parsed = FailureFixtures.safeParse(fixtures);
  if (!parsed.success) {
    log.warn({ event: "fixtures.slice_invalid", slice: "failures", issues: parsed.error.issues.length });
    return null;
  }
  return parsed.data;
}

// ---------------------------------------------------------------------------------------------------------------
// Row mappers to the 9.4 shapes (validated on the way out, ARCHITECTURE 1.4)
// ---------------------------------------------------------------------------------------------------------------
type WorkOrderRow = typeof workOrder.$inferSelect;

export function toWorkOrder(r: WorkOrderRow): WorkOrder {
  return WorkOrder.parse({
    wo_number: r.woNumber,
    notification_no: r.notificationNo,
    report_date: r.reportDate,
    start_date: r.startDate,
    completion_date: r.completionDate,
    status: r.status,
    equipment_tag: r.equipmentTag,
    work_type: r.workType,
    discipline: r.discipline,
    priority: r.priority,
    criticality: r.criticality,
    problem_description: r.problemDescription,
    root_cause: r.rootCause,
    corrective_action: r.correctiveAction,
    spare_parts_used: r.sparePartsUsed,
    breakdown: r.breakdown,
    downtime_hours: r.downtimeHours,
    labor_hours: r.laborHours,
    labor_cost_idr: r.laborCostIdr,
    material_cost_idr: r.materialCostIdr,
    total_cost_idr: r.totalCostIdr,
    reported_by_alias: r.reportedByAlias,
    executed_by_alias: r.executedByAlias,
    approved_by_alias: r.approvedByAlias,
    related_interlock: r.relatedInterlock,
    remarks: r.remarks,
    closeout_complete: r.closeoutComplete,
    completeness_flags: r.completenessFlags,
    breakdown_kind: r.breakdownKind,
    notification_lead_hours: r.notificationLeadHours,
  });
}

function toFailureEvent(r: typeof failureEvent.$inferSelect): FailureEvent {
  return FailureEvent.parse({
    wo_number: r.woNumber,
    equipment_tag: r.equipmentTag,
    report_date: r.reportDate,
    downtime_hours: r.downtimeHours,
    maintenance_cost_idr: r.maintenanceCostIdr,
    breakdown_kind: r.breakdownKind,
  });
}

function toFamily(r: typeof failureFamily.$inferSelect): FailureFamily {
  return FailureFamily.parse({ id: r.id, label: r.label, basis: r.basis, review_status: r.reviewStatus, members: r.members });
}

function toLink(r: typeof causalLink.$inferSelect): CausalLink {
  return CausalLink.parse({
    id: r.id,
    from_wo: r.fromWo,
    to_wo: r.toWo,
    equipment_tag: r.equipmentTag,
    mechanism_noun: r.mechanismNoun,
    interval_days: r.intervalDays,
    linking_sentence: r.linkingSentence,
    linking_field: r.linkingField,
    span_id: r.spanId,
  });
}

function toProofTest(r: typeof proofTest.$inferSelect): ProofTest {
  return ProofTest.parse({
    wo_number: r.woNumber,
    equipment_tag: r.equipmentTag,
    seq_id: r.seqId,
    device_tag: r.deviceTag,
    test_class: r.testClass,
    completion_date: r.completionDate,
    result_text: r.resultText,
    as_found: r.asFound,
    as_left: r.asLeft,
  });
}

function toBomMatch(r: typeof bomMatch.$inferSelect): BomMatch {
  return BomMatch.parse({
    wo_number: r.woNumber,
    part_string: r.partString,
    bom_item_id: r.bomItemId,
    alternative_bom_item_id: r.alternativeBomItemId,
    disambiguator_text: r.disambiguatorText,
    status: r.status,
  });
}

function toBomItem(r: typeof bomItem.$inferSelect): BomItem {
  return BomItem.parse({
    id: r.id,
    equipment_tag: r.equipmentTag,
    ga_drawing_doc_no: r.gaDrawingDocNo,
    item_no: r.itemNo,
    description: r.description,
    material: r.material,
    quantity: r.quantity,
    span_id: r.spanId,
  });
}

const zeros = <K extends string>(keys: readonly K[]): Record<K, number> =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;

// numeric and bigint sums come back as text from Postgres; float8 is exact for every figure in the workbook
const sumAsNumber = (col: typeof failureEvent.downtimeHours | typeof failureEvent.maintenanceCostIdr) => sql<number>`coalesce(sum(${col}), 0)::float8`;
const countIf = (cond: SQL) => sql<number>`count(*) filter (where ${cond})::int`;

// ---------------------------------------------------------------------------------------------------------------
// The fleet summary (surface 6, first screen)
// ---------------------------------------------------------------------------------------------------------------
export type KindTotals = { rows: number; hours: number; cost_idr: number };

export type FleetTotals = {
  work_orders: number;
  work_types: Record<WorkType, number>;
  breakdown_flagged: KindTotals;
  unplanned: KindTotals;
  planned_flagged: KindTotals;
  incomplete: { rows: number; emergency_rows: number; by_work_type: Record<WorkType, number> };
  links: number;
  families: number;
  proof_tests: { total: number; by_class: Record<TestClass, number> };
};

export type AssetFailureRow = {
  tag: string;
  name: string;
  service: string;
  criticality_datasheet: string;
  work_orders: number;
  work_types: Record<WorkType, number>;
  breakdowns_flagged: number;
  unplanned_rows: number;
  planned_flagged_rows: number;
  unplanned_h: number;
  flagged_h: number;
  breakdown_cost_idr: number;
  incomplete_rows: number;
  links: number;
  family_members: number;
  proof_tests: number;
};

export type FleetFailureSummary = {
  totals: FleetTotals;
  assets: AssetFailureRow[];
  /** The explicit families (9.4), whole, with the equipment tag of every member for the links. */
  families: FailureFamily[];
  member_tags: Record<string, string>;
};

export async function fleetFailureSummary(): Promise<FleetFailureSummary> {
  const [assets, byType, byTag, events, links, families, tests, incompleteByType] = await Promise.all([
    db.select().from(equipment).orderBy(asc(equipment.tag)),
    db
      .select({ tag: workOrder.equipmentTag, workType: workOrder.workType, n: count() })
      .from(workOrder)
      .groupBy(workOrder.equipmentTag, workOrder.workType),
    db
      .select({
        tag: workOrder.equipmentTag,
        n: count(),
        flagged: countIf(sql`${workOrder.breakdown}`),
        unplanned: countIf(sql`${workOrder.breakdownKind} = 'unplanned'`),
        plannedFlagged: countIf(sql`${workOrder.breakdownKind} = 'planned_flagged'`),
        incomplete: countIf(sql`not ${workOrder.closeoutComplete}`),
        emergencyIncomplete: countIf(sql`not ${workOrder.closeoutComplete} and ${workOrder.priority} = 'Emergency'`),
      })
      .from(workOrder)
      .groupBy(workOrder.equipmentTag),
    db
      .select({
        tag: failureEvent.equipmentTag,
        kind: failureEvent.breakdownKind,
        n: count(),
        hours: sumAsNumber(failureEvent.downtimeHours),
        cost: sumAsNumber(failureEvent.maintenanceCostIdr),
      })
      .from(failureEvent)
      .groupBy(failureEvent.equipmentTag, failureEvent.breakdownKind),
    db.select({ tag: causalLink.equipmentTag, n: count() }).from(causalLink).groupBy(causalLink.equipmentTag),
    db.select().from(failureFamily),
    db.select({ tag: proofTest.equipmentTag, testClass: proofTest.testClass, n: count() }).from(proofTest).groupBy(proofTest.equipmentTag, proofTest.testClass),
    db
      .select({ workType: workOrder.workType, n: count() })
      .from(workOrder)
      .where(eq(workOrder.closeoutComplete, false))
      .groupBy(workOrder.workType),
  ]);

  // Family membership per asset: the members' work orders resolved to their tag (members may span assets).
  const memberWos = [...new Set(families.flatMap((f) => f.members.map((m) => m.wo_number)))];
  const memberTags =
    memberWos.length === 0
      ? []
      : await db.select({ wo: workOrder.woNumber, tag: workOrder.equipmentTag }).from(workOrder).where(inArray(workOrder.woNumber, memberWos));

  const rows: AssetFailureRow[] = assets.map((a) => {
    const t = byTag.find((r) => r.tag === a.tag);
    const kinds = events.filter((e) => e.tag === a.tag);
    const unplannedEvents = kinds.find((e) => e.kind === "unplanned");
    const workTypes = zeros(WORK_TYPES);
    for (const r of byType) if (r.tag === a.tag) workTypes[r.workType] = r.n;
    return {
      tag: a.tag,
      name: a.name,
      service: a.service,
      criticality_datasheet: a.criticalityDatasheet,
      work_orders: t?.n ?? 0,
      work_types: workTypes,
      breakdowns_flagged: t?.flagged ?? 0,
      unplanned_rows: t?.unplanned ?? 0,
      planned_flagged_rows: t?.plannedFlagged ?? 0,
      unplanned_h: Number(unplannedEvents?.hours ?? 0),
      flagged_h: kinds.reduce((s, e) => s + Number(e.hours), 0),
      breakdown_cost_idr: kinds.reduce((s, e) => s + Number(e.cost), 0),
      incomplete_rows: t?.incomplete ?? 0,
      links: links.find((l) => l.tag === a.tag)?.n ?? 0,
      family_members: memberTags.filter((m) => m.tag === a.tag).length,
      proof_tests: tests.filter((p) => p.tag === a.tag).reduce((s, p) => s + p.n, 0),
    };
  });

  const kindTotals = (kind: FailureEvent["breakdown_kind"]): KindTotals => {
    const of = events.filter((e) => e.kind === kind);
    return { rows: of.reduce((s, e) => s + e.n, 0), hours: of.reduce((s, e) => s + Number(e.hours), 0), cost_idr: of.reduce((s, e) => s + Number(e.cost), 0) };
  };
  const unplanned = kindTotals("unplanned");
  const plannedFlagged = kindTotals("planned_flagged");
  const fleetTypes = zeros(WORK_TYPES);
  for (const r of byType) fleetTypes[r.workType] += r.n;
  const incompleteTypes = zeros(WORK_TYPES);
  for (const r of incompleteByType) incompleteTypes[r.workType] = r.n;
  const byClass = zeros(TEST_CLASSES);
  for (const p of tests) byClass[p.testClass] += p.n;

  return {
    totals: {
      work_orders: byTag.reduce((s, r) => s + r.n, 0),
      work_types: fleetTypes,
      breakdown_flagged: {
        rows: unplanned.rows + plannedFlagged.rows,
        hours: unplanned.hours + plannedFlagged.hours,
        cost_idr: unplanned.cost_idr + plannedFlagged.cost_idr,
      },
      unplanned,
      planned_flagged: plannedFlagged,
      incomplete: {
        rows: byTag.reduce((s, r) => s + r.incomplete, 0),
        emergency_rows: byTag.reduce((s, r) => s + r.emergencyIncomplete, 0),
        by_work_type: incompleteTypes,
      },
      links: links.reduce((s, l) => s + l.n, 0),
      families: families.length,
      proof_tests: { total: tests.reduce((s, p) => s + p.n, 0), by_class: byClass },
    },
    assets: rows,
    families: families.map(toFamily),
    member_tags: Object.fromEntries(memberTags.map((r) => [r.wo, r.tag])),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// One asset's failure memory (surface 6, /failures/:tag and GET /api/assets/:tag/failures)
// ---------------------------------------------------------------------------------------------------------------
export type HistoryFilters = { work_type?: WorkType; breakdown?: boolean };

export type ChainPlace = { link_id: string; direction: "from" | "to"; other_wo: string; mechanism_noun: string };

export type QuotingLesson = {
  opl_id: string;
  n: number;
  problem: string;
  cause: string;
  action: string;
  truncated: boolean;
  document_id: string;
};

export type BomMatchDetail = { match: BomMatch; item: BomItem | null; alternative: BomItem | null };

export type HistoryRecord = {
  record: WorkOrder;
  /** Its place in the asset's causal chains (a package artefact); empty when no link names it. */
  chain_places: ChainPlace[];
  /** The explicit family it belongs to, or null (9.4: families are explicit lists). */
  family_id: string | null;
  /** Troubleshooting rows of approved lessons that quote this record, with their ids (AC-FM-06: quoted precedent only). */
  lessons: QuotingLesson[];
  bom_matches: BomMatchDetail[];
  /** Generous-layer coverage of the preferred version: true when no lesson covers it; null when no assessment exists. */
  uncovered: boolean | null;
  /** The CD-4 finding the record's incomplete closeout is open under, for the ClosedoutChip's link; null when none. */
  cd4_finding_id: string | null;
};

export type Precedent = {
  wo_number: string;
  family_id: string;
  precedents: Array<{ wo_number: string; equipment_tag: string | null; recorded_root_cause: string }>;
};

export type AssetFailureMemory = {
  equipment: { tag: string; name: string; service: string; criticality_datasheet: string; area_code: string; area_workbook_name: string };
  fixture: EquipmentMasterRow | null;
  /** The whole (unfiltered) history size, for the filter's count line. */
  history_total: number;
  /** The size of the filtered history, for the count line and the pager. */
  filtered_total: number;
  /** Records of the asset whose closeout is incomplete, over the whole history, for the fixture reconciliation. */
  incomplete_total: number;
  history: HistoryRecord[];
  events: FailureEvent[];
  chains: CausalLink[];
  families: FailureFamily[];
  /** Equipment tag per family member work order, for links across assets. */
  member_tags: Record<string, string>;
  precedent: Precedent[];
  proof_tests: ProofTest[];
  bom_matches: BomMatchDetail[];
  /** The debt cluster of the asset on the preferred version, the target of the request-a-lesson action. */
  cluster_id: string | null;
  /** The corpus version the coverage column was read from; null when no visible version carries an assessment. */
  coverage_version: VersionLabel | null;
};

/**
 * The first of `versionIds` (in preference order: the visitor's own sandbox version, then the active lineage) that
 * carries rows in `table` under `column`, else null. Versioned families (coverage, clusters, the register) are
 * recomputed per version, so one version is read, never a union across versions.
 */
export async function preferredVersion(versionIds: readonly string[], table: PgTable, column: PgColumn<ColumnBaseConfig<"string", "PgText">>): Promise<string | null> {
  if (versionIds.length === 0) return null;
  const rows = await db.select({ id: column, n: count() }).from(table).where(inArray(column, [...versionIds])).groupBy(column);
  const present = new Set(rows.filter((r) => r.n > 0).map((r) => r.id));
  return versionIds.find((v) => present.has(v)) ?? null;
}

/** `visibleVersionIds()` lists the active lineage first and the sandbox's own version last; the own version is preferred. */
export function preferenceOrder(visible: readonly string[], own: string | null): string[] {
  return own !== null && visible.includes(own) ? [own, ...visible.filter((v) => v !== own)] : [...visible];
}

export type VersionLabel = { id: string; label: string; corpus_sha256: string; is_active: boolean };

/**
 * The corpus version a versioned figure was read from, for the badge beside it. Shared by the two surfaces that
 * read one version (the asset's coverage column, the Integrity Register); null when the row is gone.
 */
export async function versionLabel(versionId: string): Promise<VersionLabel | null> {
  const [row] = await db
    .select({ id: corpusVersion.id, label: corpusVersion.label, corpus_sha256: corpusVersion.corpusSha256, is_active: corpusVersion.isActive })
    .from(corpusVersion)
    .where(eq(corpusVersion.id, versionId))
    .limit(1);
  return row ?? null;
}

export async function assetFailureMemory(
  tag: string,
  filters: HistoryFilters,
  versionIds: readonly string[],
  page = 1,
  pageSize = 50,
): Promise<AssetFailureMemory | null> {
  const [eq_] = await db
    .select({
      tag: equipment.tag,
      name: equipment.name,
      service: equipment.service,
      criticalityDatasheet: equipment.criticalityDatasheet,
      areaCode: equipment.areaCode,
      areaWorkbookName: area.workbookName,
    })
    .from(equipment)
    .innerJoin(area, eq(equipment.areaCode, area.code))
    .where(eq(equipment.tag, tag))
    .limit(1);
  if (!eq_) return null;

  const conditions: SQL[] = [eq(workOrder.equipmentTag, tag)];
  if (filters.work_type) conditions.push(eq(workOrder.workType, filters.work_type));
  if (filters.breakdown !== undefined) conditions.push(eq(workOrder.breakdown, filters.breakdown));

  const [[totalRow], [filteredRow], [incompleteRow], woRows, allWos, eventRows, linkRows, familyRows, testRows] = await Promise.all([
    db.select({ n: count() }).from(workOrder).where(eq(workOrder.equipmentTag, tag)),
    db
      .select({ n: count() })
      .from(workOrder)
      .where(and(...conditions)),
    db
      .select({ n: count() })
      .from(workOrder)
      .where(and(eq(workOrder.equipmentTag, tag), eq(workOrder.closeoutComplete, false))),
    db
      .select()
      .from(workOrder)
      .where(and(...conditions))
      .orderBy(desc(workOrder.reportDate), asc(workOrder.woNumber))
      .limit(pageSize)
      .offset((page - 1) * pageSize),
    db.select({ wo: workOrder.woNumber }).from(workOrder).where(eq(workOrder.equipmentTag, tag)),
    db.select().from(failureEvent).where(eq(failureEvent.equipmentTag, tag)).orderBy(desc(failureEvent.reportDate)),
    db.select().from(causalLink).where(eq(causalLink.equipmentTag, tag)).orderBy(asc(causalLink.fromWo), asc(causalLink.toWo), asc(causalLink.id)),
    db.select().from(failureFamily).orderBy(asc(failureFamily.id)),
    db.select().from(proofTest).where(eq(proofTest.equipmentTag, tag)).orderBy(desc(proofTest.completionDate)),
  ]);
  const assetWos = allWos.map((r) => r.wo);
  const woSet = new Set(assetWos);

  // Families with a member on this asset; the members' tags for cross-asset links.
  const families = familyRows.map(toFamily).filter((f) => f.members.some((m) => woSet.has(m.wo_number)));
  const memberWos = [...new Set(families.flatMap((f) => f.members.map((m) => m.wo_number)))];
  const memberTagRows =
    memberWos.length === 0
      ? []
      : await db.select({ wo: workOrder.woNumber, tag: workOrder.equipmentTag }).from(workOrder).where(inArray(workOrder.woNumber, memberWos));
  const memberTags: Record<string, string> = Object.fromEntries(memberTagRows.map((r) => [r.wo, r.tag]));
  const familyOf = new Map<string, string>();
  for (const f of families) for (const m of f.members) familyOf.set(m.wo_number, f.id);

  // Lessons quoting the asset's records, BOM matches, coverage, the cluster and the CD-4 findings, in one round.
  const [versionForCoverage, versionForCluster, versionForRegister] = await Promise.all([
    preferredVersion(versionIds, coverageAssessment, coverageAssessment.corpusVersionId),
    preferredVersion(versionIds, debtCluster, debtCluster.corpusVersionId),
    preferredVersion(versionIds, integrityFinding, integrityFinding.corpusVersionId),
  ]);
  const [quoting, matchRows, coverage, clusters, cd4Rows] = await Promise.all([
    assetWos.length === 0
      ? []
      : db
          .select({
            oplId: troubleshootingRow.oplId,
            n: troubleshootingRow.n,
            problem: troubleshootingRow.problem,
            cause: troubleshootingRow.cause,
            action: troubleshootingRow.action,
            quotedWo: troubleshootingRow.quotedWoNumber,
            truncated: troubleshootingRow.truncated,
            documentId: documentRevision.documentId,
          })
          .from(troubleshootingRow)
          .innerJoin(opl, eq(troubleshootingRow.oplId, opl.oplId))
          .innerJoin(documentRevision, eq(opl.documentRevisionId, documentRevision.id))
          .where(inArray(troubleshootingRow.quotedWoNumber, assetWos))
          .orderBy(asc(troubleshootingRow.oplId), asc(troubleshootingRow.n)),
    assetWos.length === 0 ? [] : db.select().from(bomMatch).where(inArray(bomMatch.woNumber, assetWos)).orderBy(asc(bomMatch.woNumber), asc(bomMatch.partString)),
    assetWos.length === 0 || versionForCoverage === null
      ? []
      : db
          .select({ wo: coverageAssessment.woNumber, covered: coverageAssessment.covered })
          .from(coverageAssessment)
          .where(and(inArray(coverageAssessment.woNumber, assetWos), eq(coverageAssessment.layer, "generous"), eq(coverageAssessment.corpusVersionId, versionForCoverage))),
    versionForCluster === null
      ? []
      : db
          .select({ id: debtCluster.id })
          .from(debtCluster)
          .where(and(eq(debtCluster.equipmentTag, tag), eq(debtCluster.corpusVersionId, versionForCluster)))
          .limit(1),
    // The register's own CD-4 rows for this asset, so an incomplete record's chip lands on its finding, not on the rule.
    versionForRegister === null
      ? []
      : db
          .select({ id: integrityFinding.id, wo: sql<string | null>`${integrityFinding.item} ->> 'wo'` })
          .from(integrityFinding)
          .where(
            and(
              eq(integrityFinding.corpusVersionId, versionForRegister),
              eq(integrityFinding.ruleId, CD4_RULE),
              sql`${integrityFinding.item} ->> 'tag' = ${tag}`,
            ),
          ),
  ]);
  const cd4ByWo = new Map(cd4Rows.flatMap((r) => (r.wo === null ? [] : [[r.wo, r.id] as const])));
  const itemIds = [...new Set(matchRows.flatMap((m) => [m.bomItemId, m.alternativeBomItemId]).filter((id): id is string => id !== null))];
  const itemRows = itemIds.length === 0 ? [] : await db.select().from(bomItem).where(inArray(bomItem.id, itemIds));
  const itemById = new Map(itemRows.map((i) => [i.id, toBomItem(i)] as const));
  const bomMatches: BomMatchDetail[] = matchRows.map((m) => ({
    match: toBomMatch(m),
    item: m.bomItemId === null ? null : (itemById.get(m.bomItemId) ?? null),
    alternative: m.alternativeBomItemId === null ? null : (itemById.get(m.alternativeBomItemId) ?? null),
  }));
  const coveredOf = new Map(coverage.map((c) => [c.wo, c.covered] as const));

  const links = linkRows.map(toLink);
  const history: HistoryRecord[] = woRows.map((r) => {
    const record = toWorkOrder(r);
    const wo = record.wo_number;
    const chainPlaces = links.flatMap<ChainPlace>((l) => {
      if (l.from_wo === wo) return [{ link_id: l.id, direction: "from", other_wo: l.to_wo, mechanism_noun: l.mechanism_noun }];
      if (l.to_wo === wo) return [{ link_id: l.id, direction: "to", other_wo: l.from_wo, mechanism_noun: l.mechanism_noun }];
      return [];
    });
    const covered = coveredOf.get(wo);
    return {
      record,
      chain_places: chainPlaces,
      family_id: familyOf.get(wo) ?? null,
      lessons: quoting
        .filter((q) => q.quotedWo === wo)
        .map((q) => ({ opl_id: q.oplId, n: q.n, problem: q.problem, cause: q.cause, action: q.action, truncated: q.truncated, document_id: q.documentId })),
      bom_matches: bomMatches.filter((b) => b.match.wo_number === wo),
      uncovered: covered === undefined ? null : !covered,
      cd4_finding_id: cd4ByWo.get(wo) ?? null,
    };
  });

  // Precedent: each of the asset's family members read from its own point of view.
  const precedent: Precedent[] = families.flatMap((f) =>
    f.members
      .filter((m) => woSet.has(m.wo_number))
      .map((m) => ({
        wo_number: m.wo_number,
        family_id: f.id,
        precedents: f.members
          .filter((o) => o.wo_number !== m.wo_number)
          .map((o) => ({ wo_number: o.wo_number, equipment_tag: memberTags[o.wo_number] ?? null, recorded_root_cause: o.recorded_root_cause })),
      })),
  );

  const fixture = failureFixtures()?.equipment_master.find((e) => e.tag === tag) ?? null;
  const coverageVersion = versionForCoverage === null ? null : await versionLabel(versionForCoverage);
  return {
    equipment: {
      tag: eq_.tag,
      name: eq_.name,
      service: eq_.service,
      criticality_datasheet: eq_.criticalityDatasheet,
      area_code: eq_.areaCode,
      area_workbook_name: eq_.areaWorkbookName,
    },
    fixture,
    history_total: totalRow?.n ?? 0,
    filtered_total: filteredRow?.n ?? 0,
    incomplete_total: incompleteRow?.n ?? 0,
    history,
    events: eventRows.map(toFailureEvent),
    chains: links,
    families,
    member_tags: memberTags,
    precedent,
    proof_tests: testRows.map(toProofTest),
    bom_matches: bomMatches,
    cluster_id: clusters[0]?.id ?? null,
    coverage_version: coverageVersion,
  };
}
