// AC-NFR-07 (blueprint 9.7, ARCHITECTURE 3.3, D-20): connected as the application role thehub_app, an INSERT into
// audit_log succeeds while an UPDATE and a DELETE on that row are refused by the database itself (insufficient
// privilege, the grants of scripts/db/app-role.ts), never by application code. Runs only when TEST_DATABASE_URL
// names a database: the URL of thehub_app on a migrated, seeded database, set on purpose for this lane and never in
// the unit lane; skipped otherwise. The inserted row is labelled as this test's, binds to the active corpus version
// and is a general event, so the nightly retention removes it after 30 days; nothing here deletes anything.
import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { eq, sql } from "drizzle-orm";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import { beforeAll, describe, expect, it } from "vitest";
import { auditLog, corpusVersion } from "../../src/db/schema";

const APP_ROLE = "thehub_app";
const INSUFFICIENT_PRIVILEGE = "42501"; // the Postgres SQLSTATE the grant level answers with
const TIMEOUT_MS = 30_000; // a Neon wake after an idle gap is about one second; the default 5 s is too tight

const url = process.env.TEST_DATABASE_URL;

// Drizzle wraps a failed query with the driver's error as `cause`; the SQLSTATE lives on the driver's error.
function sqlStateOf(error: unknown): string | undefined {
  const cause = (error as { cause?: unknown } | undefined)?.cause ?? error;
  return (cause as { code?: unknown } | undefined)?.code as string | undefined;
}

describe.skipIf(!url)("audit_log is append-only for thehub_app (AC-NFR-07)", () => {
  // Connected in beforeAll: the describe body runs at collection even when skipped, and neon() checks its URL eagerly.
  let db: NeonHttpDatabase;
  const id = `ac-nfr-07-${randomUUID()}`;
  const row = () => db.select().from(auditLog).where(eq(auditLog.id, id));

  beforeAll(async () => {
    expect(new URL(url!).username, "TEST_DATABASE_URL must be the application role's URL").toBe(APP_ROLE);
    db = drizzle(neon(url!));
    const who = await db.execute(sql`select current_user as role`);
    expect(who.rows[0]?.role, "the connection must run as the application role").toBe(APP_ROLE);
  }, TIMEOUT_MS);

  it(
    "INSERT succeeds: one general event labelled as this test's, bound to the active version",
    async () => {
      const [active] = await db.select({ id: corpusVersion.id }).from(corpusVersion).where(eq(corpusVersion.isActive, true)).limit(1);
      expect(active, "a seeded database has exactly one active corpus version").toBeDefined();

      await db.insert(auditLog).values({
        id,
        actorAlias: "ci:ac-nfr-07",
        actorRole: "ci",
        action: "evaluation.run_ingested",
        entity: "test",
        entityId: "AC-NFR-07",
        payload: { criterion: "AC-NFR-07", purpose: "append-only proof" },
        traceId: null,
        route: "tests/db/audit-append-only.test.ts",
        corpusVersionId: active!.id,
      });

      const [inserted] = await row();
      expect(inserted).toMatchObject({ id, entityId: "AC-NFR-07", corpusVersionId: active!.id });
    },
    TIMEOUT_MS,
  );

  it(
    "UPDATE is refused by the database and the row is unchanged",
    async () => {
      let failure: unknown;
      await db
        .update(auditLog)
        .set({ entityId: "tampered" })
        .where(eq(auditLog.id, id))
        .catch((error: unknown) => (failure = error));
      expect(sqlStateOf(failure), "UPDATE on audit_log must fail with insufficient_privilege").toBe(INSUFFICIENT_PRIVILEGE);

      const [after] = await row();
      expect(after?.entityId).toBe("AC-NFR-07");
    },
    TIMEOUT_MS,
  );

  it(
    "DELETE is refused by the database and the row is still there",
    async () => {
      let failure: unknown;
      await db
        .delete(auditLog)
        .where(eq(auditLog.id, id))
        .catch((error: unknown) => (failure = error));
      expect(sqlStateOf(failure), "DELETE on audit_log must fail with insufficient_privilege").toBe(INSUFFICIENT_PRIVILEGE);

      const [after] = await row();
      expect(after?.id).toBe(id);
    },
    TIMEOUT_MS,
  );
});
