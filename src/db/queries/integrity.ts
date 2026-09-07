// Integrity Register reads (blueprint 6.2 surface 9, 9.9 GET /api/integrity, 10.3; AC-INT-01, 02, 04, 05). Every
// finding is an integrity_finding row of one corpus version (the register is recomputed at ingestion, so one
// version is read, never a union); the totals are pinned to fixtures.integrity and a difference is reported as a
// defect, never hidden. The two observation rules CD-15 and CD-16 sit outside the total and enter a listing only
// when asked for by rule or by the observations switch. No owner, due date or completion metric exists here
// (Case 1, AC-INT-02): a finding carries its severity, discipline, evidence link, two states, the safety_function
// mark and the routing recommendation where the register assigns one.
import { and, asc, count, eq, isNull, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { citationOf } from "@/answer/retrieve";
import type { Citation } from "@/contracts/generated/evidence_packet";
import type { DocumentClass } from "@/contracts/generated/document";
import { db } from "@/db/client";
import { openFindingRuleIds, spansByIds } from "@/db/queries/retrieval";
import { documentRevision, documentTable, integrityFinding } from "@/db/schema";
import { fixtures } from "@/lib/fixtures";
import { log } from "@/lib/log";
import { preferredVersion } from "./failures";

export const OBSERVATION_RULES = ["CD-15", "CD-16"] as const;
export const SEVERITIES = ["high", "medium", "low"] as const;
export const STATES = ["open", "resolved"] as const;
export type FindingState = (typeof STATES)[number];

/** The filter value that selects findings the register assigns no discipline to. */
export const NO_DISCIPLINE = "none";

// ---------------------------------------------------------------------------------------------------------------
// The fixture slice (10.5 integrity { total, rules, observations }; each rule's own meta block beside them)
// ---------------------------------------------------------------------------------------------------------------
const RuleMeta = z.looseObject({
  rule: z.string(),
  definition: z.string(),
  severity: z.string(),
  unit: z.string(),
  basis: z.string(),
  observation_only: z.boolean(),
  count: z.number().int(),
});
export type RuleMeta = z.infer<typeof RuleMeta>;

const IntegrityFixtures = z.looseObject({
  integrity: z.looseObject({
    total: z.number().int(),
    rules: z.record(z.string(), z.number().int()),
    observations: z.record(z.string(), z.number().int()),
  }),
});
export type IntegrityFixtures = z.infer<typeof IntegrityFixtures>;

export function integrityFixtures(): IntegrityFixtures | null {
  if (!fixtures) return null;
  const parsed = IntegrityFixtures.safeParse(fixtures);
  if (!parsed.success) {
    log.warn({ event: "fixtures.slice_invalid", slice: "integrity", issues: parsed.error.issues.length });
    return null;
  }
  return parsed.data;
}

/** The harness's own block for one rule (name, definition, severity, unit, basis), or null when the fixture lacks it. */
export function ruleMeta(fx: IntegrityFixtures | null, ruleId: string): RuleMeta | null {
  const block = fx?.integrity[ruleId];
  const parsed = RuleMeta.safeParse(block);
  return parsed.success ? parsed.data : null;
}

/** Rule ids ordered by their number (CD-1, CD-2, ..., CD-18), the register's own order. */
export function byRuleNumber(a: string, b: string): number {
  return Number(a.slice(3)) - Number(b.slice(3)) || a.localeCompare(b);
}

// ---------------------------------------------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------------------------------------------
export type FindingFilters = {
  rule?: string;
  severity?: string;
  /** A discipline name, or NO_DISCIPLINE for findings the register assigns none to. */
  discipline?: string;
  state?: FindingState;
  /** The document a citation chip's integrity dot links from (`/integrity?document=`). */
  document?: string;
  /** Lists the observation rules beside the counted ones; a `rule` naming one selects it regardless. */
  observations?: boolean;
};

export type FilterOptions = {
  rules: Array<{ rule_id: string; rule: string | null; observation_only: boolean }>;
  severities: string[];
  disciplines: string[];
};

function whereOf(filters: FindingFilters, versionId: string): SQL {
  const conditions: SQL[] = [eq(integrityFinding.corpusVersionId, versionId)];
  if (filters.rule) conditions.push(eq(integrityFinding.ruleId, filters.rule));
  else if (!filters.observations) conditions.push(eq(integrityFinding.observationOnly, false));
  if (filters.severity) conditions.push(eq(integrityFinding.severity, filters.severity));
  if (filters.discipline === NO_DISCIPLINE) conditions.push(isNull(integrityFinding.discipline));
  else if (filters.discipline) conditions.push(eq(integrityFinding.discipline, filters.discipline));
  if (filters.state) conditions.push(eq(integrityFinding.state, filters.state));
  if (filters.document) conditions.push(eq(integrityFinding.documentId, filters.document));
  return and(...conditions) as SQL;
}

const severityRank = sql<number>`case ${integrityFinding.severity} when 'high' then 0 when 'medium' then 1 else 2 end`;
const ruleNumber = sql<number>`substring(${integrityFinding.ruleId} from 4)::int`;

/** The version the register is read from: the visitor's own sandbox version when it carries findings, else the active lineage. */
export function registerVersion(versionIds: readonly string[]): Promise<string | null> {
  return preferredVersion(versionIds, integrityFinding, integrityFinding.corpusVersionId);
}

export async function filterOptions(versionId: string): Promise<FilterOptions> {
  const [rules, severities, disciplines] = await Promise.all([
    db
      .selectDistinct({ rule_id: integrityFinding.ruleId, rule: integrityFinding.rule, observation_only: integrityFinding.observationOnly })
      .from(integrityFinding)
      .where(eq(integrityFinding.corpusVersionId, versionId)),
    db.selectDistinct({ severity: integrityFinding.severity }).from(integrityFinding).where(eq(integrityFinding.corpusVersionId, versionId)),
    db.selectDistinct({ discipline: integrityFinding.discipline }).from(integrityFinding).where(eq(integrityFinding.corpusVersionId, versionId)),
  ]);
  const order = new Map<string, number>(SEVERITIES.map((s, i) => [s, i]));
  return {
    rules: rules.sort((a, b) => byRuleNumber(a.rule_id, b.rule_id)),
    severities: severities.map((s) => s.severity).sort((a, b) => (order.get(a) ?? 9) - (order.get(b) ?? 9) || a.localeCompare(b)),
    disciplines: disciplines.map((d) => d.discipline).filter((d): d is string => d !== null).sort((a, b) => a.localeCompare(b)),
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Totals pinned to the fixture (AC-INT-01, AC-INT-03)
// ---------------------------------------------------------------------------------------------------------------
export type RuleTotal = {
  rule_id: string;
  rule: string | null;
  severity: string | null;
  unit: string | null;
  basis: string | null;
  definition: string | null;
  observation_only: boolean;
  /** Live rows of the register version, both states. */
  count: number;
  open: number;
  /** The fixture's count for the rule, or null when the fixture does not name it. */
  fixture: number | null;
};

export type RegisterTotals = {
  version_id: string;
  total: number;
  open: number;
  fixture_total: number | null;
  rules: RuleTotal[];
  observations: RuleTotal[];
  /** Rule ids (and "total") whose live count differs from the fixture; empty when the register reconciles. */
  mismatches: string[];
};

export async function registerTotals(versionId: string): Promise<RegisterTotals> {
  const fx = integrityFixtures();
  const rows = await db
    .select({
      rule_id: integrityFinding.ruleId,
      rule: sql<string | null>`max(${integrityFinding.rule})`,
      severity: sql<string | null>`max(${integrityFinding.severity})`,
      unit: sql<string | null>`max(${integrityFinding.unit})`,
      basis: sql<string | null>`max(${integrityFinding.basis})`,
      observation_only: integrityFinding.observationOnly,
      count: count(),
      open: sql<number>`count(*) filter (where ${integrityFinding.state} = 'open')::int`,
    })
    .from(integrityFinding)
    .where(eq(integrityFinding.corpusVersionId, versionId))
    .groupBy(integrityFinding.ruleId, integrityFinding.observationOnly);

  const fixtureCounts = new Map<string, number>([
    ...Object.entries(fx?.integrity.rules ?? {}),
    ...Object.entries(fx?.integrity.observations ?? {}),
  ]);
  const ids = [...new Set([...rows.map((r) => r.rule_id), ...fixtureCounts.keys()])].sort(byRuleNumber);
  const totals: RuleTotal[] = ids.map((rule_id) => {
    const live = rows.find((r) => r.rule_id === rule_id);
    const meta = ruleMeta(fx, rule_id);
    const observation = live?.observation_only ?? meta?.observation_only ?? (OBSERVATION_RULES as readonly string[]).includes(rule_id);
    return {
      rule_id,
      rule: live?.rule ?? meta?.rule ?? null,
      severity: live?.severity ?? meta?.severity ?? null,
      unit: live?.unit ?? meta?.unit ?? null,
      basis: live?.basis ?? meta?.basis ?? null,
      definition: meta?.definition ?? null,
      observation_only: observation,
      count: live?.count ?? 0,
      open: live?.open ?? 0,
      fixture: fixtureCounts.get(rule_id) ?? null,
    };
  });
  const rules = totals.filter((t) => !t.observation_only);
  const observations = totals.filter((t) => t.observation_only);
  const total = rules.reduce((s, r) => s + r.count, 0);
  const fixtureTotal = fx?.integrity.total ?? null;
  const mismatches = totals.filter((t) => t.fixture !== null && t.fixture !== t.count).map((t) => t.rule_id);
  if (fixtureTotal !== null && fixtureTotal !== total) mismatches.push("total");
  return {
    version_id: versionId,
    total,
    open: rules.reduce((s, r) => s + r.open, 0),
    fixture_total: fixtureTotal,
    rules,
    observations,
    mismatches,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------------------------------------------
export type FindingRow = {
  id: string;
  rule_id: string;
  rule: string | null;
  severity: string;
  discipline: string | null;
  unit: string | null;
  basis: string | null;
  document_id: string | null;
  span_id: string | null;
  state: FindingState;
  safety_function: boolean;
  routing_recommendation: string | null;
  observation_only: boolean;
  /** The register item's own fields as the harness emitted them (the defect location in words). */
  item: Record<string, unknown> | null;
  corpus_version_id: string;
  /** The document the finding is open against, with its current revision, for the evidence link. */
  document: { doc_no: string | null; class: DocumentClass; revision: string | null; approval_status_text: string | null } | null;
  /** The 9.8 Citation when the finding names a span (the chip lands on it); null when it names a document only. */
  citation: Citation | null;
};

export type FindingPage = { rows: FindingRow[]; total: number };

async function findingRows(where: SQL, page: number | null, pageSize: number): Promise<FindingRow[]> {
  const base = db
    .select({
      finding: integrityFinding,
      doc_no: documentTable.docNo,
      class: documentTable.class,
      revision: documentRevision.revision,
      approval_status_text: documentRevision.approvalStatusText,
    })
    .from(integrityFinding)
    .leftJoin(documentTable, eq(integrityFinding.documentId, documentTable.id))
    .leftJoin(documentRevision, and(eq(documentRevision.documentId, integrityFinding.documentId), eq(documentRevision.isCurrent, true)))
    .where(where)
    .orderBy(severityRank, ruleNumber, asc(integrityFinding.id));
  const rows = page === null ? await base : await base.limit(pageSize).offset((page - 1) * pageSize);

  // Citations for the findings that name a span (none in bundle 1.0.1: the harness polish list adds them).
  const spanIds = rows.map((r) => r.finding.spanId).filter((s): s is string => s !== null);
  const spans = spanIds.length === 0 ? new Map() : await spansByIds(db, spanIds);
  const openRules = spans.size === 0 ? new Map<string, string[]>() : await openFindingRuleIds(db, [...new Set([...spans.values()].map((s) => s.documentId))]);

  return rows.map((r) => {
    const f = r.finding;
    const span = f.spanId === null ? undefined : spans.get(f.spanId);
    return {
      id: f.id,
      rule_id: f.ruleId,
      rule: f.rule,
      severity: f.severity,
      discipline: f.discipline,
      unit: f.unit,
      basis: f.basis,
      document_id: f.documentId,
      span_id: f.spanId,
      state: f.state,
      safety_function: f.safetyFunction,
      routing_recommendation: f.routingRecommendation,
      observation_only: f.observationOnly,
      item: f.item,
      corpus_version_id: f.corpusVersionId,
      document: r.class === null ? null : { doc_no: r.doc_no, class: r.class, revision: r.revision, approval_status_text: r.approval_status_text },
      citation: span ? citationOf(span, openRules.get(span.documentId) ?? []) : null,
    };
  });
}

/** One page of the filtered register (9.9: default 50, maximum 200, enforced by the caller). */
export async function listFindings(filters: FindingFilters, versionId: string, page: number, pageSize: number): Promise<FindingPage> {
  const where = whereOf(filters, versionId);
  const [rows, [totalRow]] = await Promise.all([findingRows(where, page, pageSize), db.select({ n: count() }).from(integrityFinding).where(where)]);
  return { rows, total: totalRow?.n ?? 0 };
}

/** The whole filtered register, for the CSV export (AC-INT-04: an unfiltered export totals the fixture). */
export function allFindings(filters: FindingFilters, versionId: string): Promise<FindingRow[]> {
  return findingRows(whereOf(filters, versionId), null, 0);
}
