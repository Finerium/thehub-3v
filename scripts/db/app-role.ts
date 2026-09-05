// `pnpm db:app-role` (D-20, ARCHITECTURE 3.3 and 10, AC-NFR-07): as the owner over DATABASE_URL_UNPOOLED, create
// the application role thehub_app (LOGIN) with the password from APP_ROLE_PASSWORD, or rotate the password when the
// role exists; grant USAGE on the schemas public and draft, SELECT, INSERT, UPDATE, DELETE on every table of both,
// USAGE on every sequence, and the same table privileges on future tables of both schemas; then revoke UPDATE and
// DELETE on public.audit_log. Idempotent: re-run after any migration that adds a table, or to rotate the password.
// Postgres quotes the password itself (format('%L')); the literal never leaves this process and no statement is
// logged. Prints the role name, created or rotated, and grant counts only.
import { neon } from "@neondatabase/serverless";
import { z } from "zod";

const ROLE = "thehub_app";
const SCHEMAS = ["public", "draft"] as const;
const AUDIT_TABLE = "public.audit_log";

const Literal = z.tuple([z.object({ lit: z.string().min(2) })]);
const Exists = z.tuple([z.object({ exists: z.boolean() })]);
const Count = z.tuple([z.object({ n: z.number().int() })]);
const Privileges = z.array(z.object({ privilege_type: z.string() }));

function env(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

async function main() {
  const sql = neon(env("DATABASE_URL_UNPOOLED"));
  const [{ lit }] = Literal.parse(await sql.query("select format('%L', $1::text) as lit", [env("APP_ROLE_PASSWORD")]));
  const [{ exists }] = Exists.parse(await sql.query("select exists(select 1 from pg_roles where rolname = $1) as exists", [ROLE]));
  await sql.query(`${exists ? "alter" : "create"} role ${ROLE} with login password ${lit}`);

  const schemas = SCHEMAS.join(", ");
  const grants = [
    `grant usage on schema ${schemas} to ${ROLE}`,
    `grant select, insert, update, delete on all tables in schema ${schemas} to ${ROLE}`,
    `grant usage on all sequences in schema ${schemas} to ${ROLE}`,
    ...SCHEMAS.map((s) => `alter default privileges in schema ${s} grant select, insert, update, delete on tables to ${ROLE}`),
  ];
  for (const statement of grants) await sql.query(statement);
  await sql.query(`revoke update, delete on ${AUDIT_TABLE} from ${ROLE}`);

  const [{ n }] = Count.parse(
    await sql.query("select count(*)::int as n from information_schema.role_table_grants where grantee = $1", [ROLE]),
  );
  const audit = Privileges.parse(
    await sql.query(
      "select privilege_type from information_schema.role_table_grants where grantee = $1 and table_schema = 'public' and table_name = 'audit_log' order by privilege_type",
      [ROLE],
    ),
  );
  console.log(
    [
      `role ${ROLE} ${exists ? "password rotated" : "created"}`,
      `schema usage grants ${SCHEMAS.length}`,
      `table privilege grants ${n}`,
      `audit_log privileges ${audit.map((p) => p.privilege_type.toLowerCase()).join(", ") || "none"}`,
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  console.error(`db:app-role failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
