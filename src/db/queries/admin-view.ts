// The reads behind the Admin sheet (blueprint 6.2 surface 13) and the Evaluation sheet (surface 10). Nothing here
// writes; the one write either surface can start is the activation, which goes through POST /api/admin/corpus/activate
// and its own transaction in src/db/versions.ts.
//
// Bindings (10.3): corpus versions, accounts, audit rows and evaluation runs are database rows; the golden set's
// category counts are the bundle's fixture slice; the provider pins, the rate limits and the budgets are read from
// configuration by the page itself (src/gateway/config.ts, src/lib/ratelimit.ts), never from a provider call. The
// ingested runs themselves belong to src/db/queries/evaluation.ts and are not re-read here.
//
// Two payload rules of 9.7 are enforced here rather than left to a caller. The account read selects no credential
// column, so no password hash ever leaves the database towards a render. And an audit payload is read only for the
// two safety events and only when the caller asks for them as Admin; every other row travels with its 9.7 columns
// and no payload at all, so a question text cannot reach a surface outside the safety view.
import { count, desc, eq, inArray, isNotNull, notInArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { Role } from "@/contracts/generated/serving";
import { Root as FixtureRoot } from "@/contracts/generated/fixtures";
import { db } from "@/db/client";
import { appUser, auditLog, corpusVersion } from "@/db/schema";
import { fixtures } from "@/lib/fixtures";

// ---------------------------------------------------------------------------------------------------------------
// Accounts (9.7 AppUser): alias and role, the two columns the surface states. `username` is the login identifier
// and `password_hash` the credential; neither is selected, so neither can be rendered.
// ---------------------------------------------------------------------------------------------------------------

export type AccountRow = { id: string; alias: string; role: Role; is_demo: boolean };

/** The role order of the 9.9 matrix, so the table reads down the matrix rather than by insertion. */
export const ROLE_ORDER: readonly Role[] = ["Engineer", "Reviewing Supervisor", "Manager", "Admin"];

export async function listAccounts(): Promise<AccountRow[]> {
  const rows = await db
    .select({ id: appUser.id, alias: appUser.alias, role: appUser.role, is_demo: appUser.isDemo })
    .from(appUser);
  return rows.sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role) || a.alias.localeCompare(b.alias));
}

// ---------------------------------------------------------------------------------------------------------------
// The audit log (9.7 AuditEvent)
// ---------------------------------------------------------------------------------------------------------------

/** The two events whose payload carries the request text, readable by Admin alone (9.7). */
export const SAFETY_ACTIONS = ["safety.request_refused", "safety.request_served"] as const;
export type SafetyAction = (typeof SAFETY_ACTIONS)[number];

/** The action written when the safety events are read (9.7). */
export const SAFETY_READ_ACTION = "audit.safety_events_read" as const;

/** The 9.7 columns a row is rendered from, with the corpus version resolved to its label. */
export type AuditView = {
  id: string;
  actor_alias: string;
  actor_role: (typeof auditLog.$inferSelect)["actorRole"];
  action: (typeof auditLog.$inferSelect)["action"];
  entity: string;
  entity_id: string;
  trace_id: string | null;
  route: string;
  corpus_version_label: string;
  server_ts: string;
};

/** The safety half of a safety event, read from its payload (9.7: request text, matched rule and phrase). */
export type SafetyView = {
  request_text: string;
  matched_phrase: string | null;
  rule_id: string | null;
  rulepack_class: string | null;
};

export type AuditEntry = { event: AuditView; safety: SafetyView | null };

// The payload as the refusal path writes it; a field the writer did not set is rendered as absent, never guessed.
const SafetyPayload = z.object({
  request_text: z.string(),
  matched_phrase: z.string().nullish(),
  rule_id: z.string().nullish(),
  class: z.string().nullish(),
});

type AuditSelect = AuditView & { payload: Record<string, unknown> };

const AUDIT_COLUMNS = {
  id: auditLog.id,
  actor_alias: auditLog.actorAlias,
  actor_role: auditLog.actorRole,
  action: auditLog.action,
  entity: auditLog.entity,
  entity_id: auditLog.entityId,
  trace_id: auditLog.traceId,
  route: auditLog.route,
  corpus_version_label: corpusVersion.label,
  server_ts: sql<string>`to_char(${auditLog.serverTs} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')`,
} as const;

function toEntry(row: AuditSelect, withSafety: boolean): AuditEntry {
  const { payload, ...event } = row;
  if (!withSafety || !(SAFETY_ACTIONS as readonly string[]).includes(event.action)) return { event, safety: null };
  const parsed = SafetyPayload.safeParse(payload);
  if (!parsed.success) return { event, safety: null };
  return {
    event,
    safety: {
      request_text: parsed.data.request_text,
      matched_phrase: parsed.data.matched_phrase ?? null,
      rule_id: parsed.data.rule_id ?? null,
      rulepack_class: parsed.data.class ?? null,
    },
  };
}

/**
 * The most recent rows, newest first. `safety` decides two things at once: which actions are in scope and whether a
 * payload is read at all. Without it the two safety events are excluded from the query, so the recent-rows panel
 * cannot show one even by accident; with it the query returns those two actions alone, with their payload, which is
 * the Admin safety view whose read the caller audits.
 */
export async function recentAudit(limit: number, options: { safety?: boolean } = {}): Promise<AuditEntry[]> {
  const withSafety = options.safety === true;
  const rows = await db
    .select({ ...AUDIT_COLUMNS, payload: auditLog.payload })
    .from(auditLog)
    .innerJoin(corpusVersion, eq(auditLog.corpusVersionId, corpusVersion.id))
    .where(withSafety ? inArray(auditLog.action, [...SAFETY_ACTIONS]) : notInArray(auditLog.action, [...SAFETY_ACTIONS]))
    .orderBy(desc(auditLog.serverTs), desc(auditLog.id))
    .limit(limit);
  return rows.map((row) => toEntry(row as AuditSelect, withSafety));
}

/** One count per action over the whole log, so the sheet states what the log holds without listing it. */
export async function auditActionCounts(): Promise<Array<{ action: AuditView["action"]; n: number }>> {
  const rows = await db.select({ action: auditLog.action, n: count() }).from(auditLog).groupBy(auditLog.action);
  return rows.sort((a, b) => b.n - a.n || a.action.localeCompare(b.action));
}

/** How many rows the log holds in total, and how many of them are the two safety events. */
export async function auditTotals(): Promise<{ total: number; safety: number }> {
  const [all] = await db.select({ n: count() }).from(auditLog);
  const [safety] = await db
    .select({ n: count() })
    .from(auditLog)
    .where(inArray(auditLog.action, [...SAFETY_ACTIONS]));
  return { total: all?.n ?? 0, safety: safety?.n ?? 0 };
}

// ---------------------------------------------------------------------------------------------------------------
// The golden set the Evaluation sheet names when no run has been ingested (10.5 `golden`). The runs themselves are
// read by src/db/queries/evaluation.ts, which owns the per-category rates and the failure list.
// ---------------------------------------------------------------------------------------------------------------

/** The golden set as the fixture states it: the case counts a run is measured against. */
export const GoldenFixture = FixtureRoot.shape.golden;
export type GoldenFixture = z.infer<typeof GoldenFixture>;

export function goldenFixture(): GoldenFixture | null {
  const parsed = GoldenFixture.safeParse(fixtures?.golden);
  return parsed.success ? parsed.data : null;
}

// ---------------------------------------------------------------------------------------------------------------
// Corpus versions: the list, and the lineage depth each row sits at (9.7 parent_version_id)
// ---------------------------------------------------------------------------------------------------------------

/** True when the version has at least one child, so the ledger can draw the lineage rail without a second query. */
export async function versionChildCounts(): Promise<Map<string, number>> {
  const rows = await db
    .select({ parent: corpusVersion.parentVersionId, n: count() })
    .from(corpusVersion)
    .where(isNotNull(corpusVersion.parentVersionId))
    .groupBy(corpusVersion.parentVersionId);
  return new Map(rows.filter((r): r is { parent: string; n: number } => r.parent !== null).map((r) => [r.parent, r.n]));
}
