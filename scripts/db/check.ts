// `pnpm db:check`: row counts of the M0 seed tables, nothing else (no values, no secrets).
import { count } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "../../src/db/client";
import { appUser, corpusVersion, documentTable, equipment } from "../../src/db/schema";

async function rows(table: PgTable): Promise<number> {
  const [row] = await db.select({ n: count() }).from(table);
  return row?.n ?? 0;
}

async function main() {
  const tables = [
    ["corpus_version", corpusVersion],
    ["equipment", equipment],
    ["app_user", appUser],
    ["document", documentTable],
  ] as const;
  for (const [name, table] of tables) console.log(`${name} ${await rows(table)}`);
}

main().catch((error: unknown) => {
  console.error(`db:check failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
