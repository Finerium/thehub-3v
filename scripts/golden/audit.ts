// The audit rows a case's checks read (9.7, 9.11 audit_event). The application writes them; the runner reads them
// back over the same database, by trace id, through the one client of src/db/client.ts.
//
// The database is optional. A Tier B run against the production URL has no connection string in reach, and the
// runner must not fail a case for that: `auditReader` returns null, every audit_event reports unsupported, and the
// report says how many checks that cost. The import is dynamic so a run without a database never builds a client.
import type { AuditRow } from "./checks/types";

export type AuditReader = (traceId: string) => Promise<AuditRow[]>;

export async function auditReader(): Promise<AuditReader | null> {
  if (!process.env.DATABASE_URL_APP && !process.env.DATABASE_URL) return null;
  try {
    const [{ db }, { auditLog }, { eq }] = await Promise.all([
      import("../../src/db/client"),
      import("../../src/db/schema"),
      import("drizzle-orm"),
    ]);
    return async (traceId: string): Promise<AuditRow[]> => {
      // A transient database error belongs to this one read, not to the run: the case that asked reports its
      // audit_event check as not evaluated and the loop goes on. A run of 102 cases must not die on one connection.
      let rows: Array<{ action: string; traceId: string | null; payload: unknown }>;
      try {
        rows = await db
          .select({ action: auditLog.action, traceId: auditLog.traceId, payload: auditLog.payload })
          .from(auditLog)
          .where(eq(auditLog.traceId, traceId));
      } catch {
        return [];
      }
      return rows.map((row) => ({
        action: row.action,
        trace_id: row.traceId,
        payload: (row.payload ?? {}) as Record<string, unknown>,
      }));
    };
  } catch {
    return null;
  }
}
