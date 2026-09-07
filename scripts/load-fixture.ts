// The tenfold load fixture of AC-NFR-17 (blueprint 11.9): the criterion asks the fleet table, the Integrity
// Register and the failure history to render "under a fixture of 10x rows", and nothing in this repository built
// one, so no timing reading was ever taken against one. This file builds it: nine more copies of the seeded rows
// those three surfaces list, written into a DISPOSABLE database only.
//
//   pnpm tsx scripts/load-fixture.ts [--copies 9] [--clear] [--counts]
//
// Safety. Every statement below is refused unless the connection string names a disposable host (localhost,
// 127.0.0.1, [::1] or db.localtest.me: the service container of .github/workflows/ci.yml, or the same
// pgvector + local Neon proxy pair started locally). The deployment's database is a Neon host and can never be
// reached from here. Nothing is deleted that this file did not write: every clone carries the marker `~L<k>` in
// its key, a run of characters no corpus id can hold, and `--clear` removes exactly the marked rows.
//
// What is multiplied, and why those tables. Each of the three surfaces reads a different family:
//   - the fleet table (src/db/queries/assets.ts readFleet) renders one row per `equipment` and aggregates
//     `work_order`, `failure_event`, `opl`, `integrity_finding` and `document` by tag;
//   - the Integrity Register (src/db/queries/integrity.ts listFindings) renders `integrity_finding` rows;
//   - the failure history (src/db/queries/failures.ts assetFailureMemory) renders one asset's `work_order` rows
//     and reads `failure_event`, `causal_link`, `failure_family`, `proof_test`, `bom_match` and
//     `coverage_assessment` for that asset.
// So the fixture runs in three passes:
//   A. assets: `equipment` and `interlock` are cloned under a suffixed tag, so the fleet table renders ten times
//      the rows it renders today.
//   B. records: `work_order` and everything keyed by a work order are cloned under a suffixed work-order number
//      and left on the ORIGINAL equipment tag, so every seeded asset's failure history carries ten times its
//      records. Putting the copies on the cloned tags instead would give the fleet ten times its rows and every
//      history one times its own, which is not what the criterion asks of the failure history.
//   C. register: `integrity_finding` is cloned under a suffixed id against the same documents and the same corpus
//      version, so the register lists ten times the findings of one version.
// The corpus itself is never multiplied: `document`, `document_revision`, `span`, `claim` and `chunk` keep their
// seeded rows, because "10x rows" is a claim about the registers these surfaces list, and a tenfold corpus would
// measure a different system than the one the deployment serves.
//
// Deliberately not cloned, and what each costs the reading:
//   - `opl`: `opl.document_revision_id` is UNIQUE, so a copy would need a copy of the revision, which is the
//     corpus. The fleet's lessons-per-asset group-by therefore stays at its seeded size and every cloned asset
//     shows zero lessons; the fleet still reads ten times the equipment rows it renders.
//   - `troubleshooting_row` and `opl_step`: both are keyed on `opl_id`, so they follow `opl`. The failure
//     history's lesson lookup still costs the tenfold `IN` list of the asset's work orders, which is the part of
//     it the row count drives; only the rows it finds stay at their seeded number.
//   - `debt_cluster`: one `LIMIT 1` lookup by tag, whose cost no row count moves.
import path from "node:path";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";

/** The marker every cloned key carries. Corpus ids are drawn from A-Z, 0-9 and `-`, so `~` cannot collide. */
export const MARKER = "~L";

/** Nine copies beside the seeded rows: ten times the rows the three surfaces list. */
export const COPIES = 9;

const LIKE = `%${MARKER}%`;

const DISPOSABLE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "db.localtest.me"]);

/** True when the URL names a database this file may write into: the local docker pair or the CI service container. */
export function disposable(candidate: string | undefined): boolean {
  if (!candidate) return false;
  try {
    return DISPOSABLE_HOSTS.has(new URL(candidate).hostname);
  } catch {
    return false;
  }
}

/** The connection string src/db/client.ts would use, for the guard only; the value is never printed. */
function target(): string | undefined {
  return process.env.DATABASE_URL_APP ?? process.env.DATABASE_URL;
}

function assertDisposable(): void {
  if (!disposable(target())) {
    throw new Error(
      "load-fixture refuses to write: DATABASE_URL_APP or DATABASE_URL must name a disposable database " +
        "(localhost, 127.0.0.1, [::1] or db.localtest.me), which the deployment's database is not",
    );
  }
}

// -----------------------------------------------------------------------------------------------------------------
// The clone. One statement per table per copy: the row is taken to jsonb, the key columns are rewritten, and
// jsonb_populate_record turns it back into a row of the same table, so a column added to the schema is carried
// without editing this file. Every literal below is generated from the constants above; nothing external is
// interpolated.
// -----------------------------------------------------------------------------------------------------------------

/** A column of the clone that differs from the original, as an SQL expression over the alias `t`. `$s` is the suffix. */
type Rewrites = Readonly<Record<string, string>>;

type Family = {
  table: string;
  /** The key column the marker lands in; also the column `--clear` and the "do not clone a clone" guard read. */
  key: string;
  rewrites: Rewrites;
};

/** Pass A, the assets the fleet table renders. */
const ASSETS: readonly Family[] = [
  { table: "equipment", key: "tag", rewrites: { tag: "t.tag || $s" } },
  // seq_id is nullable and unique where not null; `null || $s` stays null, which keeps both properties.
  { table: "interlock", key: "equipment_tag", rewrites: { equipment_tag: "t.equipment_tag || $s", seq_id: "t.seq_id || $s" } },
];

/** Pass B, the records one asset's failure history renders, kept on the seeded equipment tags. */
const RECORDS: readonly Family[] = [
  { table: "work_order", key: "wo_number", rewrites: { wo_number: "t.wo_number || $s" } },
  { table: "failure_event", key: "wo_number", rewrites: { wo_number: "t.wo_number || $s" } },
  { table: "proof_test", key: "wo_number", rewrites: { wo_number: "t.wo_number || $s" } },
  { table: "bom_match", key: "wo_number", rewrites: { wo_number: "t.wo_number || $s" } },
  { table: "coverage_assessment", key: "wo_number", rewrites: { wo_number: "t.wo_number || $s" } },
  { table: "causal_link", key: "id", rewrites: { id: "t.id || $s", from_wo: "t.from_wo || $s", to_wo: "t.to_wo || $s" } },
  {
    // The family read is unfiltered and the members are matched in memory against the asset's work orders, so the
    // members of a cloned family must name the cloned work orders or the copy would answer for the seeded ones.
    table: "failure_family",
    key: "id",
    rewrites: {
      id: "t.id || $s",
      members:
        "(select jsonb_agg(jsonb_set(m, '{wo_number}', to_jsonb((m ->> 'wo_number') || $s))) from jsonb_array_elements(t.members) m)",
    },
  },
];

/** Pass C, the findings the register lists, against the same documents and the same corpus version. */
const REGISTER: readonly Family[] = [{ table: "integrity_finding", key: "id", rewrites: { id: "t.id || $s" } }];

const FAMILIES: readonly Family[] = [...ASSETS, ...RECORDS, ...REGISTER];

/** Reverse dependency order: a clone is removed before the clone it points at. */
const CLEAR_ORDER: readonly Family[] = [
  ...RECORDS.filter((f) => f.table !== "work_order"),
  ...REGISTER,
  ...RECORDS.filter((f) => f.table === "work_order"),
  ...[...ASSETS].reverse(),
];

function cloneStatement(family: Family, copy: number): string {
  const suffix = `'${MARKER}${copy}'`;
  const pairs = Object.entries(family.rewrites)
    .map(([column, expression]) => `'${column}', ${expression.replaceAll("$s", suffix)}`)
    .join(", ");
  return (
    `insert into "${family.table}" ` +
    `select (jsonb_populate_record(null::"${family.table}", to_jsonb(t) || jsonb_build_object(${pairs}))).* ` +
    `from "${family.table}" t where t."${family.key}" not like '${LIKE}'`
  );
}

async function countOf(family: Family, cloned: boolean): Promise<number> {
  const rows = await db.execute<{ n: number }>(
    sql.raw(
      `select count(*)::int as n from "${family.table}" where "${family.key}" ${cloned ? "" : "not "}like '${LIKE}'`,
    ),
  );
  return rows.rows[0]?.n ?? 0;
}

export type TableCount = { table: string; seeded: number; cloned: number; total: number };

/** The seeded and cloned row count of every table this fixture multiplies. */
export async function counts(): Promise<TableCount[]> {
  const out: TableCount[] = [];
  for (const family of FAMILIES) {
    const seeded = await countOf(family, false);
    const cloned = await countOf(family, true);
    out.push({ table: family.table, seeded, cloned, total: seeded + cloned });
  }
  return out;
}

/** Removes every row this file wrote, and nothing else. Safe to call when none exist. */
export async function clear(): Promise<TableCount[]> {
  assertDisposable();
  for (const family of CLEAR_ORDER) {
    await db.execute(sql.raw(`delete from "${family.table}" where "${family.key}" like '${LIKE}'`));
  }
  return counts();
}

/**
 * Builds the fixture: `copies` clones beside the seeded rows, so each of the three surfaces reads
 * `copies + 1` times the rows it reads today. Idempotent, because it clears its own marked rows first and never
 * clones a row that already carries the marker.
 */
export async function multiply(copies: number = COPIES): Promise<TableCount[]> {
  assertDisposable();
  if (!Number.isInteger(copies) || copies < 0) throw new Error(`--copies must be a non-negative integer, received ${copies}`);
  await clear();
  for (let copy = 1; copy <= copies; copy += 1) {
    for (const family of FAMILIES) await db.execute(sql.raw(cloneStatement(family, copy)));
  }
  return counts();
}

// -----------------------------------------------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------------------------------------------

function option(name: string): string | undefined {
  const at = process.argv.indexOf(name);
  return at >= 0 ? process.argv[at + 1] : undefined;
}

function report(rows: readonly TableCount[]): void {
  for (const row of rows) console.log(`  ${row.table} ${row.total} (seeded ${row.seeded}, cloned ${row.cloned})`);
}

async function main(): Promise<void> {
  if (process.argv.includes("--counts")) {
    console.log("row counts");
    report(await counts());
    return;
  }
  if (process.argv.includes("--clear")) {
    console.log("cleared; row counts");
    report(await clear());
    return;
  }
  const copies = Number(option("--copies") ?? COPIES);
  const started = performance.now();
  const rows = await multiply(copies);
  console.log(`${copies} copies beside the seeded rows (${copies + 1}x) in ${Math.round(performance.now() - started)} ms`);
  report(rows);
}

// Run only when this file is the entry point, so the test that imports `multiply` starts no CLI run.
const entry = process.argv[1];
if (entry !== undefined && path.resolve(entry) === path.resolve(import.meta.filename)) {
  void main().catch((error: unknown) => {
    console.error(`load-fixture failed: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  });
}
