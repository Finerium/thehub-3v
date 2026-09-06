// The one write primitive of the seed (ARCHITECTURE 2: deterministic, idempotent, never a delete): a batched
// INSERT ... ON CONFLICT (<key>) DO UPDATE SET <every other column> = excluded.<column>. Generated columns
// (chunk.text_tsv) and the caller's insert-only columns stay out of the update, so a re-run rewrites every
// bundle-owned value and touches nothing the database or a later actor owns. A table whose columns are all key
// columns (document_edge) gets DO NOTHING: the row exists or is inserted. Nothing here deletes.
import { getTableColumns, sql, type SQL } from "drizzle-orm";
import type { PgColumn, PgInsertValue, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { Tx } from "@/db/client";

// Rows per statement: the wire protocol caps a statement at 65535 parameters and the widest table (work_order) has
// 32 columns, so 500 rows stay well inside it; wide rows (vectors, page bytes) pass a smaller batch.
export const DEFAULT_BATCH = 500;

export type UpsertOptions = {
  batch?: number;
  /** property names written on insert and never updated on conflict */
  insertOnly?: ReadonlyArray<string>;
};

export async function upsert<T extends PgTable>(
  tx: Tx,
  table: T,
  rows: ReadonlyArray<T["$inferInsert"]>,
  keys: ReadonlyArray<PgColumn>,
  options: UpsertOptions = {},
): Promise<number> {
  if (rows.length === 0) return 0;
  const keyNames = new Set(keys.map((k) => k.name));
  const insertOnly = new Set(options.insertOnly ?? []);
  const columns: Record<string, PgColumn> = getTableColumns(table);
  const set: Record<string, SQL> = {};
  for (const [property, column] of Object.entries(columns)) {
    if (keyNames.has(column.name) || column.generated !== undefined || insertOnly.has(property)) continue;
    set[property] = sql`excluded.${sql.identifier(column.name)}`;
  }
  const target = [...keys];
  const batch = options.batch ?? DEFAULT_BATCH;
  for (let i = 0; i < rows.length; i += batch) {
    const slice = rows.slice(i, i + batch) as PgInsertValue<T>[];
    const insert = tx.insert(table).values(slice);
    if (Object.keys(set).length === 0) await insert.onConflictDoNothing({ target });
    else await insert.onConflictDoUpdate({ target, set: set as PgUpdateSetSource<T> });
  }
  return rows.length;
}

/** What one family reports: rows written per table, plus notes for anything the schema could not carry. */
export type FamilyResult = { rows: Record<string, number>; notes?: string[] };
