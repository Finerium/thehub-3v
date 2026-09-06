// The seed of an admitted bundle (ARCHITECTURE 2; AC-ING-10, AC-ING-15): one transaction per bundle file family in
// foreign-key order, every row an upsert on its primary key, nothing deleted, then activation of the seeded
// version through src/db/versions.ts (actor "seed", audited as corpus.version_activated) so the previous version
// goes inactive and the lineage rule of ARCHITECTURE 3.4 re-derives document_revision.is_current. The caller
// passes the Bundle that G1 admitted (src/gates/g1.ts); no file is parsed twice and nothing is seeded that G1
// did not verify. After activation the current revisions are compared with the bundle's and any divergence is
// reported, not corrected: the lineage rule is the versions module's contract, not the seed's.
import { count, eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db, withTransaction, type Tx } from "@/db/client";
import {
  area,
  bomItem,
  bomMatch,
  causalLink,
  chunk,
  claim,
  corpusVersion,
  coverageAssessment,
  coverageMethod,
  coverageSummary,
  datasheetParam,
  debtCluster,
  documentEdge,
  documentRevision,
  documentTable,
  equipment,
  failureEvent,
  failureFamily,
  instrumentTag,
  integrityFinding,
  interlock,
  interlockRow,
  opl,
  oplStep,
  pageDerivative,
  pidSidecar,
  proofTest,
  span,
  startPermissive,
  troubleshootingRow,
  workOrder,
} from "@/db/schema";
import { activate } from "@/db/versions";
import type { Bundle } from "@/gates/g1";
import { seedAssets } from "./assets";
import { seedChunks } from "./chunks";
import { seedClaims } from "./claims";
import { seedCoverage } from "./coverage";
import { seedDocuments } from "./documents";
import { seedLessons } from "./lessons";
import { seedOperations } from "./operations";
import { seedPages } from "./pages";
import { seedRegister } from "./register";
import type { FamilyResult } from "./upsert";
import { SEED_ALIAS, SEED_ROUTE, seedVersion, versionRow } from "./version";

export { SEED_ALIAS, SEED_ROUTE, V1_LABEL, versionRow } from "./version";

export type SeedOptions = { log?: (line: string) => void };

export type SeedResult = {
  versionId: string;
  label: string;
  /** rows written per table, in family order */
  written: Record<string, number>;
  families: Array<{ name: string; ms: number }>;
  notes: string[];
  /** document ids whose current revision after activation differs from the bundle's is_current */
  revisionDivergence: string[];
};

// The seeded tables in family order; also the order of the count report.
export const SEEDED_TABLES: ReadonlyArray<readonly [string, PgTable]> = [
  ["corpus_version", corpusVersion],
  ["area", area],
  ["document", documentTable],
  ["document_revision", documentRevision],
  ["span", span],
  ["claim", claim],
  ["document_edge", documentEdge],
  ["chunk", chunk],
  ["page_derivative", pageDerivative],
  ["equipment", equipment],
  ["interlock", interlock],
  ["interlock_row", interlockRow],
  ["start_permissive", startPermissive],
  ["datasheet_param", datasheetParam],
  ["instrument_tag", instrumentTag],
  ["pid_sidecar", pidSidecar],
  ["work_order", workOrder],
  ["failure_event", failureEvent],
  ["failure_family", failureFamily],
  ["causal_link", causalLink],
  ["proof_test", proofTest],
  ["bom_item", bomItem],
  ["bom_match", bomMatch],
  ["opl", opl],
  ["opl_step", oplStep],
  ["troubleshooting_row", troubleshootingRow],
  ["coverage_method", coverageMethod],
  ["coverage_assessment", coverageAssessment],
  ["coverage_summary", coverageSummary],
  ["debt_cluster", debtCluster],
  ["integrity_finding", integrityFinding],
];

export async function seedBundle(bundle: Bundle, options: SeedOptions = {}): Promise<SeedResult> {
  const log = options.log ?? (() => undefined);
  const version = versionRow(bundle);
  const written: Record<string, number> = {};
  const families: SeedResult["families"] = [];
  const notes: string[] = [];

  const family = async (name: string, fn: (tx: Tx) => Promise<FamilyResult>): Promise<void> => {
    const t0 = performance.now();
    const result = await withTransaction(fn);
    const ms = Math.round(performance.now() - t0);
    Object.assign(written, result.rows);
    families.push({ name, ms });
    notes.push(...(result.notes ?? []));
    log(`family ${name}: ${Object.entries(result.rows).map(([t, n]) => `${t} ${n}`).join(", ")} (${ms} ms)`);
    for (const note of result.notes ?? []) log(`note ${note}`);
  };

  await family("version", (tx) => seedVersion(tx, version));
  await family("documents", (tx) => seedDocuments(tx, bundle, version.id));
  await family("claims", (tx) => seedClaims(tx, bundle));
  await family("chunks", (tx) => seedChunks(tx, bundle));
  await family("pages", (tx) => seedPages(tx, bundle));
  await family("assets", (tx) => seedAssets(tx, bundle));
  await family("operations", (tx) => seedOperations(tx, bundle));
  await family("lessons", (tx) => seedLessons(tx, bundle));
  await family("coverage", (tx) => seedCoverage(tx, bundle, version.id));
  await family("register", (tx) => seedRegister(tx, bundle, version.id));

  const t0 = performance.now();
  const activated = await activate(version.id, { alias: SEED_ALIAS, role: "system" }, { route: SEED_ROUTE });
  families.push({ name: "activate", ms: Math.round(performance.now() - t0) });
  log(`activated ${activated.id} (${activated.label}) by ${activated.activated_by_alias ?? SEED_ALIAS}`);
  const versions = await db
    .select({ id: corpusVersion.id, label: corpusVersion.label, isActive: corpusVersion.isActive })
    .from(corpusVersion)
    .orderBy(corpusVersion.createdAt);
  log(`corpus versions: ${versions.map((v) => `${v.id} (${v.label}) ${v.isActive ? "active" : "inactive"}`).join("; ")}`);

  const revisionDivergence = await currentRevisionDivergence(bundle, version.id);
  if (revisionDivergence.length > 0) {
    log(`WARNING ${revisionDivergence.length} documents carry a current revision after activation that differs from the bundle (first: ${revisionDivergence.slice(0, 3).join(", ")})`);
  }
  return { versionId: version.id, label: version.label, written, families, notes, revisionDivergence };
}

// Documents whose current revision in the database differs from the bundle's is_current after activation.
export async function currentRevisionDivergence(bundle: Bundle, versionId: string): Promise<string[]> {
  const rows = await db
    .select({ id: documentRevision.id, documentId: documentRevision.documentId, isCurrent: documentRevision.isCurrent })
    .from(documentRevision)
    .where(eq(documentRevision.corpusVersionId, versionId));
  const inDatabase = new Map(rows.filter((r) => r.isCurrent).map((r) => [r.documentId, r.id] as const));
  return bundle.revisions
    .filter((r) => r.is_current && inDatabase.get(r.document_id) !== r.id)
    .map((r) => r.document_id)
    .sort();
}

/** Row counts of every seeded table, in family order (the `pnpm db:check` style totals). */
export async function seededTableCounts(): Promise<Array<[string, number]>> {
  return Promise.all(
    SEEDED_TABLES.map(async ([name, table]): Promise<[string, number]> => {
      const [row] = await db.select({ n: count() }).from(table);
      return [name, row?.n ?? 0];
    }),
  );
}
