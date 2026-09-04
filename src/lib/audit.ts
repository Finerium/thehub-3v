// The audit writer (blueprint 9.7 AuditEvent, AC-NFR-11): one insert into audit_log, the active corpus version
// resolved when the caller does not name one. The payload rules of 9.7 bind the caller: answer events carry ids,
// route, alias, version, class, gate outcome and band, never the question text or a span; draft events carry
// draft id, states and reason, never a body; only the two safety events carry request text. The log line written
// here never includes the payload, so those rules hold for the logs too.
import { eq } from "drizzle-orm";
import type { AuditEvent } from "@/contracts/generated/serving";
import { db } from "@/db/client";
import { auditLog, corpusVersion } from "@/db/schema";
import { log } from "./log";

export type AuditInput = Omit<AuditEvent, "id" | "server_ts" | "corpus_version_id" | "trace_id" | "payload"> & {
  // defaults to a fresh UUID; a route passes its request id so x-request-id equals the audit event id (9.9)
  id?: string;
  corpus_version_id?: string;
  trace_id?: string | null;
  payload?: Record<string, unknown>;
};

export async function activeCorpusVersion(): Promise<{ id: string; label: string } | null> {
  const [row] = await db
    .select({ id: corpusVersion.id, label: corpusVersion.label })
    .from(corpusVersion)
    .where(eq(corpusVersion.isActive, true))
    .limit(1);
  return row ?? null;
}

// Returns the audit event id.
export async function writeAudit(input: AuditInput): Promise<string> {
  const corpusVersionId = input.corpus_version_id ?? (await activeCorpusVersion())?.id;
  if (!corpusVersionId) throw new Error("audit: no active corpus version to bind the event to");
  const id = input.id ?? crypto.randomUUID();
  await db.insert(auditLog).values({
    id,
    actorAlias: input.actor_alias,
    actorRole: input.actor_role,
    action: input.action,
    entity: input.entity,
    entityId: input.entity_id,
    payload: input.payload ?? {},
    traceId: input.trace_id ?? null,
    route: input.route,
    corpusVersionId,
  });
  log.info({
    event: "audit",
    audit_id: id,
    action: input.action,
    entity: input.entity,
    entity_id: input.entity_id,
    actor_alias: input.actor_alias,
    actor_role: input.actor_role,
    route: input.route,
    trace_id: input.trace_id ?? null,
    corpus_version_id: corpusVersionId,
  });
  return id;
}
