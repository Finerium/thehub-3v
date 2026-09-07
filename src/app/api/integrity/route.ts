// GET /api/integrity?rule=&severity=&discipline=&state=&document=&observations=&page=&page_size= (blueprint 9.9,
// 6.2 surface 9; AC-INT-01, AC-INT-02, AC-INT-04): under the ask_read column through withRoute. JSON carries the
// findings of one page (default 50, maximum 200) with the totals pinned to the fixture; with `Accept: text/csv`
// (or ?format=csv, so a plain link can ask for it) the whole filtered register leaves as CSV whose header comment
// lines carry the corpus version, the rule ids in scope and the fixture totals. The observation rules CD-15 and
// CD-16 enter a listing only when the rule filter names one or observations=true, so an unfiltered export totals
// the fixture. No bulk document content travels here: a finding carries ids, its own item fields and a document
// reference, never a span text.
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withRoute } from "@/auth/authorize";
import { getSandbox, visibleVersionIds } from "@/auth/sandbox";
import { cookies } from "next/headers";
import { preferenceOrder, versionLabel } from "@/db/queries/failures";
import { SEVERITIES, STATES, allFindings, listFindings, registerTotals, registerVersion, type FindingRow, type RegisterTotals } from "@/db/queries/integrity";
import { HttpError } from "@/lib/errors";

export const dynamic = "force-dynamic";

const ROUTE = "/api/integrity";

const Query = z.object({
  rule: z.string().regex(/^CD-\d{1,2}$/).optional(),
  severity: z.enum(SEVERITIES).optional(),
  discipline: z.string().min(1).max(64).optional(),
  state: z.enum(STATES).optional(),
  document: z.string().min(1).max(200).optional(),
  observations: z.enum(["true", "false", "1", "0"]).optional(),
  format: z.enum(["json", "csv"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
});

/** The CSV columns, one per finding field; `item` travels as its JSON so a filtered export reimports losslessly. */
const CSV_COLUMNS = [
  "id",
  "rule_id",
  "rule",
  "severity",
  "discipline",
  "unit",
  "basis",
  "document_id",
  "span_id",
  "state",
  "safety_function",
  "routing_recommendation",
  "observation_only",
  "item",
  "corpus_version_id",
] as const satisfies ReadonlyArray<keyof FindingRow>;

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const text = typeof value === "string" ? value : typeof value === "object" ? JSON.stringify(value) : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The fixture header lines (AC-INT-04), the column line, then one line per finding. */
function csvOf(rows: readonly FindingRow[], corpusVersionLabel: string, totals: RegisterTotals): string {
  const rulesInScope = [...new Set(rows.map((r) => r.rule_id))];
  const fixtureRules = totals.rules.filter((r) => r.fixture !== null).map((r) => `${r.rule_id}=${r.fixture}`);
  const fixtureObservations = totals.observations.filter((r) => r.fixture !== null).map((r) => `${r.rule_id}=${r.fixture}`);
  const header = [
    `# corpus_version: ${corpusVersionLabel}`,
    `# corpus_version_id: ${totals.version_id}`,
    `# rules_in_scope: ${rulesInScope.join(",")}`,
    `# fixture_total: ${totals.fixture_total ?? ""}`,
    `# fixture_rules: ${fixtureRules.join(",")}`,
    `# fixture_observations: ${fixtureObservations.join(",")}`,
    `# rows: ${rows.length}`,
    CSV_COLUMNS.join(","),
  ];
  const lines = rows.map((r) => CSV_COLUMNS.map((c) => csvCell(r[c])).join(","));
  return `${[...header, ...lines].join("\r\n")}\r\n`;
}

export const GET = withRoute(ROUTE, "ask_read", async (request: NextRequest) => {
  const query = Query.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!query.success) throw new HttpError(400, "invalid_query");
  const { rule, severity, discipline, state, document, observations, format, page, page_size } = query.data;
  const filters = { rule, severity, discipline, state, document, observations: observations === "true" || observations === "1" };
  const wantsCsv = format === "csv" || (format === undefined && (request.headers.get("accept") ?? "").includes("text/csv"));

  const box = await getSandbox(await cookies());
  const versionId = await registerVersion(preferenceOrder(await visibleVersionIds(box), box?.corpusVersionId ?? null));
  if (versionId === null) throw new HttpError(503, "no_register_version");
  const label = (await versionLabel(versionId))?.label ?? versionId;
  const totals = await registerTotals(versionId);

  if (wantsCsv) {
    const rows = await allFindings(filters, versionId);
    return new NextResponse(csvOf(rows, label, totals), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="integrity-register-${label}.csv"`,
        "cache-control": "private, no-store",
      },
    });
  }

  const found = await listFindings(filters, versionId, page, page_size);
  return NextResponse.json(
    { corpus_version: label, version_id: versionId, totals, findings: found.rows, page, page_size, total: found.total },
    { headers: { "cache-control": "private, no-store" } },
  );
});
