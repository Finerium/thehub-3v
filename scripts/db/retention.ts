// `pnpm db:retention` (D-20, ARCHITECTURE 3.3 and 10, AC-NFR-07): the owner's nightly DELETE over
// DATABASE_URL_UNPOOLED. General audit events older than 30 days go and the two safety actions never (retained for
// the deployment's life, 9.7); rate-limit windows older than one hour and expired sessions go. Prints counts only.
// Refuses to run as the application role, which holds no DELETE on audit_log in any case.
import { neon } from "@neondatabase/serverless";
import { and, lt, notInArray, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/neon-http";
import type { AuditAction } from "../../src/contracts/generated/serving";
import { auditLog, rateLimitCounter, session } from "../../src/db/schema";

const APP_ROLE = "thehub_app";
const AUDIT_RETENTION_DAYS = 30;
const RATE_LIMIT_RETENTION_HOURS = 1;
const SAFETY_ACTIONS: AuditAction[] = ["safety.request_refused", "safety.request_served"];

function ownerUrl(): string {
  const url = process.env.DATABASE_URL_UNPOOLED;
  if (!url) throw new Error("DATABASE_URL_UNPOOLED is not set");
  if (new URL(url).username === APP_ROLE) throw new Error(`refusing to run as ${APP_ROLE}; retention runs as the owner`);
  return url;
}

async function main() {
  const db = drizzle(neon(ownerUrl()));
  const audit = await db
    .delete(auditLog)
    .where(
      and(
        lt(auditLog.serverTs, sql`now() - make_interval(days => ${AUDIT_RETENTION_DAYS})`),
        notInArray(auditLog.action, SAFETY_ACTIONS),
      ),
    );
  const windows = await db
    .delete(rateLimitCounter)
    .where(lt(rateLimitCounter.windowStart, sql`now() - make_interval(hours => ${RATE_LIMIT_RETENTION_HOURS})`));
  const sessions = await db.delete(session).where(lt(session.expiresAt, sql`now()`));
  console.log(
    [
      `audit_log deleted ${audit.rowCount}`,
      `rate_limit_counter deleted ${windows.rowCount}`,
      `session deleted ${sessions.rowCount}`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(`db:retention failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
