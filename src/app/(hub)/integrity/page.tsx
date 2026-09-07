// Integrity Register (blueprint 6.2 surface 9; AC-INT-01, AC-INT-02, AC-INT-04, AC-INT-05; register
// dense-operational, 7.2). The rule ledger with every rule's definition, severity, unit and basis and its live
// count beside the fixture's; the total pinned to fixtures.integrity.total, with a difference rendered as a
// designed defect state and never hidden; the two observation rules CD-15 and CD-16 reported outside that total;
// filters by rule, severity, discipline and lifecycle state; every finding with its evidence link, its two
// lifecycle states, the safety-function mark and the routing recommendation where the register assigns one; the
// CSV export through GET /api/integrity with the fixture header lines. Every figure is read at request time from
// the integrity_finding rows of one corpus version (src/db/queries/integrity.ts); no owner, due date or completion
// metric exists here, and nothing on this surface assigns, chases or aggregates by person (Case 1).
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { getSandbox, visibleVersionIds } from "@/auth/sandbox";
import { requireSession } from "@/auth/session";
import { CitationChip } from "@/components/CitationChip";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { FilterBar } from "@/components/FilterBar";
import { GlassPanel } from "@/components/GlassPanel";
import { Pagination } from "@/components/Pagination";
import { VersionBadge } from "@/components/VersionBadge";
import { preferenceOrder, versionLabel } from "@/db/queries/failures";
import {
  NO_DISCIPLINE,
  OBSERVATION_RULES,
  SEVERITIES,
  STATES,
  filterOptions,
  integrityFixtures,
  listFindings,
  registerTotals,
  registerVersion,
  type FindingFilters,
  type FindingRow,
  type FindingState,
  type RuleTotal,
} from "@/db/queries/integrity";
import { log } from "@/lib/log";

export const metadata: Metadata = { title: "Integrity Register" };

// Every figure binds to the register rows of the visible corpus version at request time (blueprint 10.3).
export const dynamic = "force-dynamic";

const ROUTE = "/integrity";
const API = "/api/integrity";
const PAGE_SIZE = 50;
const DIGEST_PREFIX = 8;
const RULE_PATTERN = /^CD-\d{1,2}$/;
// The corpus writes a lone dash where a title block states no revision or approval line; a dash is not a value.
const UNSTATED = "-";
const NO_ROUTING = "The register assigns no routing recommendation to any finding in this scope.";
const OBSERVATION_STATEMENT = `${OBSERVATION_RULES.join(" and ")} are observations. They are counted separately and reported outside the total.`;

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const SEVERITY_TONE: Record<string, "defect" | "caveat" | "neutral"> = { high: "defect", medium: "caveat", low: "neutral" };

/** The finding's lifecycle: both states are drawn, the one it carries is marked (6.2 surface 9). */
function LifecycleStates({ state }: { state: FindingState }) {
  return (
    <span className="chip" data-state={state} title={`lifecycle: ${STATES.join(" or ")}`}>
      {STATES.map((s) => (
        <span key={s} className={s === state ? "font-medium text-ink-900" : "text-ink-500 line-through"}>
          {s}
        </span>
      ))}
    </span>
  );
}

/** The item's own fields, as the harness emitted them: the defect location in words, never a re-description. */
function ItemFields({ item }: { item: Record<string, unknown> }) {
  const entries = Object.entries(item);
  if (entries.length === 0) return <span className="text-[12px] text-ink-500">the rule recorded no item field</span>;
  return (
    <details className="disclose">
      <summary>
        <span className="text-[12px] text-ink-700">
          {entries.length} recorded {entries.length === 1 ? "field" : "fields"}
        </span>
      </summary>
      <div className="disclose-body">
        <dl className="fields">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt>{key}</dt>
              <dd>
                {typeof value === "string" ? (
                  <span className="verbatim">{value}</span>
                ) : (
                  <span className="mono">{Array.isArray(value) ? value.map((v) => String(v)).join(", ") : JSON.stringify(value)}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </details>
  );
}

/**
 * The evidence link: the citation chip when the finding names a span, the document it is open against otherwise.
 * A document with no drawing number on its title block is named by its class, with its id beneath it; a revision or
 * an approval line the document does not carry is left out rather than printed as a dash.
 */
function Evidence({ f }: { f: FindingRow }) {
  if (f.citation) return <CitationChip citation={f.citation} compact />;
  if (f.document && f.document_id) {
    const revision = f.document.revision === null || f.document.revision.trim() === UNSTATED ? null : f.document.revision;
    const status = f.document.approval_status_text === null || f.document.approval_status_text.trim() === UNSTATED ? null : f.document.approval_status_text;
    return (
      <Link
        href={`/documents/${encodeURIComponent(f.document_id)}`}
        className="chip whitespace-nowrap"
        title={`${f.document.class} ${f.document_id}${revision ? `, revision ${revision}` : ", no revision on its title block"}`}
      >
        {f.document.doc_no ? (
          <span className="mono font-medium text-ink-900">{f.document.doc_no}</span>
        ) : (
          <span className="font-medium text-ink-900">{f.document.class}</span>
        )}
        {revision ? <span className="mono text-ink-500">rev {revision}</span> : null}
        {status ? <span className="text-ink-700">{status}</span> : null}
      </Link>
    );
  }
  return <span className="text-[12px] text-ink-500">the item spans several documents; the recorded fields carry the location</span>;
}

function RuleTable({ rules, caption }: { rules: RuleTotal[]; caption: string }) {
  return (
    <table className="reg" data-component="rule-ledger">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Rule</th>
          <th scope="col">What it reads</th>
          <th scope="col">Severity</th>
          <th scope="col">Unit</th>
          <th scope="col">Basis</th>
          <th scope="col">Findings</th>
        </tr>
      </thead>
      <tbody>
        {rules.map((r) => {
          const differs = r.fixture !== null && r.fixture !== r.count;
          return (
            <tr key={r.rule_id}>
              <th scope="row" className="whitespace-nowrap">
                <Link href={`${ROUTE}?rule=${r.rule_id}`} className="mono draw font-medium text-ink-900">
                  {r.rule_id}
                </Link>
                <span className="block text-[11.5px] font-normal text-ink-700">{r.rule ?? "name not recorded"}</span>
              </th>
              <td className="max-w-[52ch] text-[12px] leading-snug text-ink-700">{r.definition ?? "no definition in the fixture for this rule"}</td>
              <td className="whitespace-nowrap">
                {r.severity ? (
                  <span className="badge" data-tone={SEVERITY_TONE[r.severity] ?? "neutral"}>
                    {r.severity}
                  </span>
                ) : (
                  <span className="text-[12px] text-ink-500">not recorded</span>
                )}
              </td>
              <td className="whitespace-nowrap text-[12.5px]">{r.unit ?? "not recorded"}</td>
              <td className="mono whitespace-nowrap text-[12px]">{r.basis ?? "not recorded"}</td>
              <td className="whitespace-nowrap">
                <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
                  <span className={differs ? "mono font-medium text-defect" : "mono font-medium text-ink-900"}>{r.count}</span>
                  {r.fixture === null ? (
                    <span className="text-[11.5px] text-ink-500">no key</span>
                  ) : (
                    <span className="mono text-[11.5px] text-ink-500" title={`fixtures.integrity.${r.observation_only ? "observations" : "rules"}.${r.rule_id}`}>
                      {r.fixture}
                    </span>
                  )}
                  {differs ? (
                    <span className="badge" data-tone="defect">
                      differs
                    </span>
                  ) : null}
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function Total({ label, live, fixture, note }: { label: string; live: number; fixture: number | null; note: ReactNode }) {
  const differs = fixture !== null && fixture !== live;
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="mono mt-1 flex items-baseline gap-2">
        <span className={differs ? "text-[44px] leading-none font-medium text-defect" : "text-[44px] leading-none font-medium text-ink-900"}>{live}</span>
        {fixture === null ? <span className="text-[13px] text-ink-500">no fixture key</span> : <span className="text-[15px] text-ink-500">fixture {fixture}</span>}
      </p>
      <p className="mt-2 max-w-[46ch] text-[12.5px] leading-snug text-ink-700">{note}</p>
    </div>
  );
}

export default async function IntegrityPage({ searchParams }: Props) {
  const [, query, jar] = await Promise.all([requireSession(), searchParams, cookies()]);

  const ruleParam = first(query.rule);
  const rule = ruleParam && RULE_PATTERN.test(ruleParam) ? ruleParam : undefined;
  const severityParam = first(query.severity);
  const severity = (SEVERITIES as readonly string[]).includes(severityParam ?? "") ? severityParam : undefined;
  const disciplineParam = first(query.discipline);
  const discipline = disciplineParam && disciplineParam.length <= 64 ? disciplineParam : undefined;
  const stateParam = first(query.state);
  const state = (STATES as readonly string[]).includes(stateParam ?? "") ? (stateParam as FindingState) : undefined;
  const documentParam = first(query.document);
  const document = documentParam && documentParam.length <= 200 ? documentParam : undefined;
  const observationsParam = first(query.observations);
  const observations = observationsParam === "true";
  const pageParam = Number(first(query.page) ?? "1");
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

  const box = await getSandbox(jar);
  const versions = preferenceOrder(await visibleVersionIds(box), box?.corpusVersionId ?? null);

  let versionId: string | null;
  let data: Awaited<ReturnType<typeof registerTotals>> | null = null;
  let options: Awaited<ReturnType<typeof filterOptions>> | null = null;
  let found: Awaited<ReturnType<typeof listFindings>> | null = null;
  let version: Awaited<ReturnType<typeof versionLabel>> = null;
  const filters: FindingFilters = { rule, severity, discipline, state, document, observations };
  try {
    versionId = await registerVersion(versions);
    if (versionId !== null) {
      [data, options, found, version] = await Promise.all([
        registerTotals(versionId),
        filterOptions(versionId),
        listFindings(filters, versionId, page, PAGE_SIZE),
        versionLabel(versionId),
      ]);
    }
  } catch (error) {
    log.error({ event: "integrity.read_failed", route: ROUTE, message: error instanceof Error ? error.message : String(error) });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="The register reads the integrity findings of the visible corpus version at request time. The read failed, so no count is shown in their place."
        next={{ href: ROUTE, label: "Try again" }}
      />
    );
  }

  if (versionId === null || data === null || options === null || found === null) {
    return (
      <div className="flex flex-col gap-8">
        <header className="rise" style={stagger(0)}>
          <h1 className="text-[34px]">Integrity Register</h1>
        </header>
        <DesignedState
          inline
          title="Not yet computed on this version"
          explanation="No corpus version visible to this session carries integrity findings. Ingestion writes the register per corpus version; the surface renders the moment the rows exist."
          next={{ href: "/", label: "Home" }}
        />
      </div>
    );
  }

  const fx = integrityFixtures();
  const filtered = rule !== undefined || severity !== undefined || discipline !== undefined || state !== undefined || document !== undefined;
  const observationTotal = data.observations.reduce((s, r) => s + r.count, 0);
  const observationFixture = fx === null ? null : Object.values(fx.integrity.observations).reduce((s, n) => s + n, 0);

  const params = (extra: Record<string, string | undefined> = {}) => {
    const q = new URLSearchParams();
    const all: Record<string, string | undefined> = {
      rule,
      severity,
      discipline,
      state,
      document,
      observations: observations ? "true" : undefined,
      ...extra,
    };
    for (const [k, v] of Object.entries(all)) if (v !== undefined && v !== "") q.set(k, v);
    return q.toString();
  };
  const findingsHref = (p: number) => {
    const s = params(p > 1 ? { page: String(p) } : {});
    return `${ROUTE}${s ? `?${s}` : ""}#findings`;
  };
  const csvHref = `${API}?${params({ format: "csv" })}`;
  const pageCount = Math.max(1, Math.ceil(found.total / PAGE_SIZE));

  return (
    <div className="flex flex-col gap-8">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <h1 className="text-[34px]">Integrity Register</h1>
          <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">
            What the supplied documents and the workbook contradict, leave empty or state twice. Eighteen deterministic rules read at ingestion, each
            with the unit it counts and the basis it was read on. Every finding names its own location; none names a person, an owner or a date it is
            due.
          </p>
        </div>
        {version ? <VersionBadge label={version.label} digestPrefix={version.corpus_sha256.slice(0, DIGEST_PREFIX)} active={version.is_active} /> : null}
      </header>

      {data.mismatches.length > 0 ? (
        <DesignedState
          inline
          code="reconciliation"
          tone="defect"
          title="A register count does not equal its fixture key"
          explanation="The findings written on this corpus version and the harness fixture disagree. The live count is shown in the defect token beside the key it should equal; neither is quietly preferred, and no figure is adjusted to make them agree."
          reason={data.mismatches.join(", ")}
          next={{ href: csvHref, label: "Export the register as CSV" }}
        />
      ) : null}

      {/* The two totals: the counted rules, and the observation rules that sit outside them. */}
      <GlassPanel className="rise p-6" aria-labelledby="totals-heading" data-component="register-totals">
        <div style={stagger(1)}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="totals-heading" className="text-[20px]">
              The register
            </h2>
            <span className="text-[12px] text-ink-500">
              counts read from the integrity_finding rows of <span className="mono">{version?.label ?? versionId}</span>
            </span>
          </div>
          <div className="mt-4 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <Total
              label="Findings in the total"
              live={data.total}
              fixture={data.fixture_total}
              note={
                <>
                  Every rule but the two observations, with both lifecycle states counted;{" "}
                  {data.open === data.total ? "every one of them is open" : <>{data.open} of them are open</>}.
                </>
              }
            />
            <Total
              label="Observations, outside the total"
              live={observationTotal}
              fixture={observationFixture}
              note={OBSERVATION_STATEMENT}
            />
            <div className="min-w-0">
              <p className="eyebrow">Export</p>
              <p className="mt-2 text-[12.5px] leading-snug text-ink-700">
                The whole filtered register leaves as CSV whose header lines carry the corpus version, the rule ids in scope and the fixture totals, so
                an export can be reconciled without this page.
              </p>
              <p className="mt-3">
                <a href={csvHref} className="neu" data-size="sm" download>
                  Export CSV
                  <span aria-hidden className="mono">
                    &rarr;
                  </span>
                </a>
              </p>
            </div>
          </div>
        </div>
      </GlassPanel>

      {/* The rule ledger: one line per rule with its definition, severity, unit, basis and reconciled count. */}
      <section className="rise" style={stagger(2)} aria-labelledby="rules-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="rules-heading" className="text-[20px]">
            Rules
          </h2>
          <span className="text-[12px] text-ink-500">
            <span className="mono text-ink-900">{data.rules.length}</span> counted rules and{" "}
            <span className="mono text-ink-900">{data.observations.length}</span> observations; the grey figure is the fixture key
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <RuleTable rules={data.rules} caption="Counted rules with their definition, severity, unit, basis and reconciled count" />
        </div>
        {data.observations.length > 0 ? (
          <div className="mt-6">
            <p className="eyebrow mb-2">Observation rules, reported outside the total</p>
            <div className="overflow-x-auto">
              <RuleTable rules={data.observations} caption="Observation rules, counted separately from the total" />
            </div>
            <p className="mt-2 max-w-prose text-[12px] text-ink-500">
              {OBSERVATION_STATEMENT} They enter the list below only when the rule filter names one or the observations filter asks for them, so an
              unfiltered export totals the counted rules alone.
            </p>
          </div>
        ) : null}
      </section>

      {/* Findings: filters, then one row per finding with its evidence, states, safety mark and routing line. */}
      <section id="findings" className="rise" style={stagger(3)} aria-labelledby="findings-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="findings-heading" className="text-[20px]">
            Findings
          </h2>
          <span className="text-[12px] text-ink-500">
            <span className="mono text-ink-900">{found.total}</span> in scope{filtered ? ", filtered" : ""}
            {observations ? ", observations included" : ""}
          </span>
        </div>

        <div className="mt-3">
          <FilterBar
            action={`${ROUTE}#findings`}
            aria-label="Filter the register by rule, severity, discipline and lifecycle state"
            resetHref={`${ROUTE}#findings`}
            hidden={document ? { document } : undefined}
            fields={[
              {
                kind: "select",
                name: "rule",
                label: "Rule",
                value: rule ?? "",
                allLabel: "every rule",
                options: options.rules.map((r) => ({ value: r.rule_id, label: `${r.rule_id} ${r.rule ?? ""}`.trim() })),
              },
              {
                kind: "select",
                name: "severity",
                label: "Severity",
                value: severity ?? "",
                allLabel: "every severity",
                options: options.severities.map((s) => ({ value: s, label: s })),
              },
              {
                kind: "select",
                name: "discipline",
                label: "Discipline",
                value: discipline ?? "",
                allLabel: "every discipline",
                options: [
                  ...options.disciplines.map((d) => ({ value: d, label: d })),
                  { value: NO_DISCIPLINE, label: "no discipline assigned" },
                ],
              },
              {
                kind: "select",
                name: "state",
                label: "State",
                value: state ?? "",
                allLabel: "both states",
                options: STATES.map((s) => ({ value: s, label: s })),
              },
              {
                kind: "select",
                name: "observations",
                label: "Observations",
                value: observations ? "true" : "",
                allLabel: "counted rules only",
                options: [{ value: "true", label: `include ${OBSERVATION_RULES.join(" and ")}` }],
              },
            ]}
          />
        </div>

        {document ? (
          <p className="mt-3 flex flex-wrap items-center gap-3 text-[12.5px]">
            <span className="chip">
              <span className="text-ink-700">open against document</span>
              <span className="mono text-ink-900">{document}</span>
            </span>
            <Link href={`${ROUTE}#findings`} className="draw">
              Clear the document filter
            </Link>
          </p>
        ) : null}

        {found.rows.length > 0 ? (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="reg" data-component="findings-table">
                <thead>
                  <tr>
                    <th scope="col">Finding</th>
                    <th scope="col">Rule</th>
                    <th scope="col">Severity</th>
                    <th scope="col">Discipline</th>
                    <th scope="col">Lifecycle</th>
                    <th scope="col">Safety function</th>
                    <th scope="col">Evidence</th>
                    <th scope="col">Recorded fields</th>
                  </tr>
                </thead>
                <tbody>
                  {found.rows.map((f) => (
                    <tr key={f.id} id={f.id} data-rule={f.rule_id} data-safety={f.safety_function ? "" : undefined}>
                      <th scope="row" className="mono whitespace-nowrap font-medium text-ink-900">
                        {f.id}
                        {f.observation_only ? (
                          <span className="badge ml-2" data-tone="neutral">
                            observation
                          </span>
                        ) : null}
                      </th>
                      <td className="whitespace-nowrap">
                        <Link href={`${ROUTE}?rule=${f.rule_id}`} className="mono draw">
                          {f.rule_id}
                        </Link>
                        <span className="block text-[11.5px] text-ink-700">{f.rule ?? "name not recorded"}</span>
                      </td>
                      <td className="whitespace-nowrap">
                        <span className="badge" data-tone={SEVERITY_TONE[f.severity] ?? "neutral"}>
                          {f.severity}
                        </span>
                      </td>
                      <td className="whitespace-nowrap text-[12.5px]">{f.discipline ?? <span className="text-ink-500">none assigned</span>}</td>
                      <td className="whitespace-nowrap">
                        <LifecycleStates state={f.state} />
                      </td>
                      <td className="whitespace-nowrap">
                        {f.safety_function ? (
                          <span className="badge" data-tone="defect">
                            safety function
                          </span>
                        ) : (
                          <span className="text-[12px] text-ink-500">not marked</span>
                        )}
                        {f.routing_recommendation ? (
                          <span className="block max-w-[34ch] text-[11.5px] leading-snug whitespace-normal text-ink-700">{f.routing_recommendation}</span>
                        ) : null}
                      </td>
                      <td>
                        <Evidence f={f} />
                      </td>
                      <td className="min-w-[16ch]">{f.item === null ? <span className="text-[12px] text-ink-500">none recorded</span> : <ItemFields item={f.item} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 max-w-prose text-[12px] text-ink-500">
              A finding carries the rule that read it, where it was read and what it read. It carries no owner, no due date and no completion metric:
              the register states the defect, and the routing recommendation is the only action it ever names.
              {found.rows.every((r) => r.routing_recommendation === null) ? ` ${NO_ROUTING}` : null}
            </p>
            {pageCount > 1 ? <Pagination className="mt-3" page={page} pageCount={pageCount} total={found.total} unit="findings" hrefFor={findingsHref} /> : null}
          </>
        ) : (
          <EmptyState
            className="mt-4"
            title="No finding matches this filter"
            explanation={`The register carries ${data.total} findings in the total and ${observationTotal} observations on this corpus version; none of them matches the rule, severity, discipline and state selected above.`}
            action={{ href: `${ROUTE}#findings`, label: "Clear the filter" }}
          />
        )}
      </section>
    </div>
  );
}
