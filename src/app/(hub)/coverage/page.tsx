// Coverage Console (blueprint 6.2 surface 7; AC-LOOP-02, AC-LOOP-03; register dense-operational, 7.2). The gap
// with its layer, method, threshold and sensitivity band and never a bare percentage; the two layers side by side;
// the three bands with the recount slot a publication animates; the stop-list digest on the panel; the
// per-work-order assessment of the headline population beside the adjudicated reading; the ranked clusters with
// their factor snapshot, the coefficients labelled ASSUMPTION, the incomplete-closeout count beside the score, the
// uncovered work orders with their matched unit and the request-a-lesson action. Every figure is read at request
// time from the coverage_* and debt_cluster rows of the visible corpus version, the work_order rows of the frozen
// population rule and the fixture's coverage_labels (src/db/queries/coverage.ts); nothing here is typed.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { CSSProperties } from "react";
import { can } from "@/auth/matrix";
import { getSandbox } from "@/auth/sandbox";
import { requireSession } from "@/auth/session";
import { BandBars } from "@/components/BandBars";
import { ClusterCard, type UncoveredWorkOrder } from "@/components/ClusterCard";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { GlassPanel } from "@/components/GlassPanel";
import { LayerToggle } from "@/components/LayerToggle";
import { MethodChip } from "@/components/MethodChip";
import { NeumorphicChip } from "@/components/NeumorphicChip";
import { SensitivityStrip } from "@/components/SensitivityStrip";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import type { CoverageSummary, DebtCluster } from "@/contracts/generated/coverage";
import type { Role } from "@/contracts/generated/serving";
import {
  ALL_POPULATION,
  DEBT_LAYER,
  FIELD_LABEL,
  LABELS_STATUS_TEXT,
  NO_UNCOVERED_STATEMENT,
  POPULATION_LABEL,
  hoursText,
  idrText,
  layerPair,
  parseLayer,
  percentOf,
  readAssessmentTable,
  readCoverageConsole,
  reportedAt,
  sensitivityBand,
  type AssessmentRow,
  type CoverageConsole,
  type Layer,
  type LayerReading,
} from "@/db/queries/coverage";
import { REQUEST_LESSON_ACTION } from "@/lib/fixed-strings";
import { log } from "@/lib/log";

export const metadata: Metadata = { title: "Coverage Console" };

// Every figure binds to the visible corpus version at request time (blueprint 10.3); nothing is prerendered.
export const dynamic = "force-dynamic";

const ROUTE = "/coverage";
const DIGEST_PREFIX = 8;
const T = "t";
const RATIO_DIGITS = 4;
// The loop track flips this when POST /api/drafts and /drafts land; until then the request action is disabled and
// carries its explanation (6.3: a designed state, never a dead control).
const DRAFT_ROUTE_LANDED = false;

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

type Props = { searchParams: Promise<{ layer?: string | string[] }> };

// The reading each layer stands for, in words (9.5); the sections list comes from the method row.
function layerReading(layer: Layer, strictSections: readonly string[]): string {
  return layer === "generous"
    ? "matched by no same-asset lesson at all, scored over the whole lesson text"
    : `taught by nothing beyond a copied work-order row, scored over the ${strictSections.join(", ")} fields cut at the watermark`;
}

/** The band a figure is quoted with (6.2 surface 7); the same clause on both layers and on the all-order line. */
function Band({ s }: { s: CoverageSummary }) {
  const band = sensitivityBand(s);
  if (!band) return <>the ladder of this row carries no entry at its own threshold, so no band is stated</>;
  return (
    <>
      sensitivity band <span className="mono">{band.low}</span> to <span className="mono">{band.high}</span> percent over {T} ={" "}
      <span className="mono">{band.from}</span> to <span className="mono">{band.to}</span>
    </>
  );
}

function Figure({ s, baseline, strictSections }: { s: CoverageSummary; baseline: CoverageSummary | null; strictSections: readonly string[] }) {
  return (
    <div className="min-w-0" data-layer={s.layer}>
      <p className="eyebrow">{s.layer} layer</p>
      <p className="mono mt-1 flex items-baseline gap-2">
        <span className="text-[44px] leading-none font-medium text-ink-900">{s.uncovered_count}</span>
        <span className="text-[15px] text-ink-500">of {s.population_count}</span>
      </p>
      <p className="mt-2 text-[13px] leading-snug text-ink-700">
        <span className="mono text-ink-900">{percentOf(s.uncovered_count, s.population_count)}</span> of the{" "}
        {POPULATION_LABEL.unplanned_failure} at {T} = <span className="mono">{s.threshold}</span>, {s.layer} layer:{" "}
        {layerReading(s.layer, strictSections)}.
      </p>
      <p className="mt-1 text-[12.5px] leading-snug text-ink-500">
        <Band s={s} />.
      </p>
      <dl className="fields mt-3">
        <dt>Uncovered breakdowns</dt>
        <dd className="mono">{s.uncovered_breakdowns}</dd>
        <dt>Recorded downtime</dt>
        <dd className="mono">{hoursText(s.uncovered_downtime_hours)}</dd>
        <dt>Recorded cost</dt>
        <dd className="mono">{idrText(s.uncovered_cost_idr)}</dd>
      </dl>
      {baseline ? (
        <p className="mt-2 text-[12px] text-caveat">
          Baseline before the publication: <span className="mono">{baseline.uncovered_count}</span> of {baseline.population_count}; moved{" "}
          <span className="mono">{baseline.uncovered_count - s.uncovered_count}</span>.
        </p>
      ) : null}
    </div>
  );
}

function RequestAction({ cluster, role }: { cluster: DebtCluster; role: Role }) {
  const allowed = can(role, "create_draft");
  const explanation = !allowed
    ? `The ${role} role holds no create_draft permission (9.9); the Reviewing Supervisor requests the lesson.`
    : DRAFT_ROUTE_LANDED
      ? `Opens the drafting queue for ${cluster.equipment_tag}.`
      : `Drafting has not landed on this deployment; when it does, this chip opens /drafts?cluster=${cluster.id}.`;
  return (
    <div className="flex flex-col gap-3">
      {cluster.uncovered_wo_numbers.length === 0 ? <p className="m-0 text-[12.5px] text-ink-500">{NO_UNCOVERED_STATEMENT}</p> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <Link href={`/coverage/clusters/${encodeURIComponent(cluster.id)}`} className="draw text-[13px]">
        Cluster page
      </Link>
      <form action="/drafts" method="get" className="flex flex-wrap items-center gap-3" data-component="request-lesson-form" data-cluster={cluster.id}>
        <input type="hidden" name="cluster" value={cluster.id} />
        <NeumorphicChip type="submit" size="sm" disabled={!allowed || !DRAFT_ROUTE_LANDED} icon={<span>&rarr;</span>} aria-label={`${REQUEST_LESSON_ACTION} for ${cluster.equipment_tag}`}>
          {REQUEST_LESSON_ACTION}
        </NeumorphicChip>
        <span className="max-w-[46ch] text-[12px] leading-snug text-ink-500">{explanation}</span>
      </form>
      </div>
    </div>
  );
}

function Reading({ r }: { r: LayerReading | null }) {
  if (!r) return <span className="text-ink-500">no assessment on this version</span>;
  return (
    <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <span className="mono text-ink-900">{r.best_ratio.toFixed(RATIO_DIGITS)}</span>
      <span className="badge" data-tone={r.covered ? "verified" : "defect"}>
        {r.covered ? "covered" : "uncovered"}
      </span>
      {r.matched_field && r.matched_lesson ? (
        <>
          <span className="tag">{FIELD_LABEL[r.matched_field]}</span>
          <span className="mono">{r.matched_lesson}</span>
        </>
      ) : (
        <span className="text-ink-500">no scoreable field</span>
      )}
    </span>
  );
}

function Adjudicated({ row }: { row: AssessmentRow }) {
  if (row.adjudicated === null) return <span className="text-ink-500">not available</span>;
  return (
    <span className="badge" data-tone={row.adjudicated === "uncovered" ? "defect" : "verified"}>
      {row.adjudicated}
    </span>
  );
}

function Header({ version }: { version: CoverageConsole["version"] | null }) {
  return (
    <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
      <div>
        <h1 className="text-[34px]">Coverage Console</h1>
        <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">
          What the lessons never taught, under one frozen recipe, in two layers, on the population of unplanned failures.
        </p>
      </div>
      {version ? <VersionBadge label={version.label} digestPrefix={version.corpus_sha256.slice(0, DIGEST_PREFIX)} active={version.is_active} /> : null}
    </header>
  );
}

export default async function CoveragePage({ searchParams }: Props) {
  const [{ role }, params, jar] = await Promise.all([requireSession(), searchParams, cookies()]);
  const layer = parseLayer(params.layer);
  const box = await getSandbox(jar);

  let data: CoverageConsole | null;
  let rows: AssessmentRow[];
  try {
    data = await readCoverageConsole(box);
    rows = data ? await readAssessmentTable(data.version.id, data.labels) : [];
  } catch (error) {
    log.error({ event: "coverage.read_failed", route: ROUTE, message: error instanceof Error ? error.message : String(error) });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="The Console reads the coverage rows of the visible corpus version at request time. The read failed, so no figure is shown in their place."
        next={{ href: ROUTE, label: "Try again" }}
      />
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col gap-8">
        <Header version={null} />
        <DesignedState
          inline
          title="Not yet computed on this version"
          explanation="No corpus version visible to this session carries coverage rows. The seed writes both layers of corpus version v1 under the frozen recipe; the Console renders the moment they exist."
          next={{ href: "/", label: "Home" }}
        />
      </div>
    );
  }

  const { version, method, unplanned, clusters, baseline, labels } = data;
  const selected = unplanned[layer];
  const bands = unplanned.generous.bands ?? unplanned.strict.bands;
  const all = layerPair(data.summaries, ALL_POPULATION);
  const strictSections = method.strict_sections;

  // Uncovered under the selected layer first, then work-order order; the summary row stays the authority for the count.
  const uncoveredUnder = (r: AssessmentRow) => (r[layer] !== null && !r[layer].covered ? 1 : 0);
  const ordered = [...rows].sort((a, b) => uncoveredUnder(b) - uncoveredUnder(a) || a.wo_number.localeCompare(b.wo_number));
  const uncoveredRows = rows.reduce((n, r) => n + uncoveredUnder(r), 0);
  const tableAgrees = rows.length === selected.population_count && uncoveredRows === selected.uncovered_count;

  const byWo = new Map(rows.map((r) => [r.wo_number, r]));
  const cardWorkOrders = (c: DebtCluster): UncoveredWorkOrder[] =>
    c.uncovered_wo_numbers.map((wo) => {
      const reading = byWo.get(wo)?.[layer] ?? null;
      return { wo_number: wo, matched_field: reading?.matched_field ? FIELD_LABEL[reading.matched_field] : null, matched_lesson: reading?.matched_lesson ?? null, href: `/failures/${c.equipment_tag}#${wo}` };
    });
  const coefficients = clusters[0]?.coefficients ?? null;

  return (
    <div className="flex flex-col gap-8">
      <Header version={version} />

      {/* The gap: the two layers side by side, the method chip with the stop-list digest, the three bands and the recount slot. */}
      <GlassPanel className="rise p-6" aria-labelledby="gap-heading" data-component="coverage-gap">
        <div style={stagger(1)} className="grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <h2 id="gap-heading" className="text-[20px]">
              The gap
            </h2>
            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              <Figure s={unplanned.generous} baseline={baseline?.unplanned.generous ?? null} strictSections={strictSections} />
              <Figure s={unplanned.strict} baseline={baseline?.unplanned.strict ?? null} strictSections={strictSections} />
            </div>
            <p className="mt-4 text-[12.5px] text-ink-700">
              Downtime and cost are the recorded figures of the uncovered breakdowns: an exposure, not a saving. A band runs from the lowest
              threshold the harness scored to the last one that leaves the count unchanged; above it the figure enters another regime.
            </p>
            <div className="mt-4">
              <MethodChip
                className="[&>summary]:flex-wrap [&>summary]:gap-y-1"
                threshold={method.threshold}
                layer="both"
                windowMultiplier={method.window_multiplier}
                recipeSha256={method.recipe_sha256}
                stopListSha256={method.stop_list_sha256}
                extractor={method.extractor}
              >
                <dl className="fields">
                  <dt>Comparison</dt>
                  <dd className="mono">{method.comparison}</dd>
                  <dt>Minimum content words</dt>
                  <dd className="mono">{method.min_content_words}</dd>
                  <dt>Strict layer fields</dt>
                  <dd className="mono">{strictSections.join(", ")}</dd>
                  <dt>Strict cut marker</dt>
                  <dd>{method.strict_cut_marker}</dd>
                  <dt>Unscoreable records</dt>
                  <dd className="mono">{method.unscoreable_ids.length}</dd>
                  <dt>Labels</dt>
                  <dd className="flex flex-wrap items-center gap-2">
                    <StatusBadge kind="machine_drafted" />
                    <span>{LABELS_STATUS_TEXT[method.labels_status]}</span>
                  </dd>
                </dl>
              </MethodChip>
            </div>
          </div>

          <div className="lg:col-span-5" data-slot="recount" data-version={version.id}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[15px]">Three bands</h3>
              <span className="text-[12px] text-ink-500">
                {POPULATION_LABEL.unplanned_failure}, {T} = <span className="mono">{selected.threshold}</span>
              </span>
            </div>
            {bands ? (
              <BandBars className="mt-3" bands={bands} populationCount={unplanned.generous.population_count} recountKey={version.id} />
            ) : (
              <EmptyState className="mt-3" title="No bands on this version" explanation="The summary row of the headline population carries no bands object, so no bars are drawn." />
            )}
            <dl className="fields mt-4 text-[12px]">
              <dt>no lesson</dt>
              <dd>uncovered under the generous layer: no same-asset lesson reaches the threshold even over its whole text</dd>
              <dt>copied row only</dt>
              <dd>covered under the generous layer, uncovered under the strict: the match lives in a pasted work-order row</dd>
              <dt>taught</dt>
              <dd>covered under both layers</dd>
            </dl>
            <p className="mt-4 text-[12px] text-ink-500">
              {baseline ? (
                <>
                  Recount on <span className="mono">{version.label}</span> after a publication in this browser&apos;s sandbox; the baseline is{" "}
                  <span className="mono">{baseline.version.label}</span>, the active version.
                </>
              ) : (
                <>A publication increments the corpus version and recounts both layers here; the bars move only then.</>
              )}
            </p>
          </div>
        </div>

        {/* The adjudicated reading beside the machine reading, labelled with its status. */}
        <div style={stagger(2)} className="mt-6 border-t border-edge pt-4" data-component="coverage-labels">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[15px]">Adjudicated reading</h3>
            <StatusBadge kind="machine_drafted" />
            <span className="text-[12px] text-ink-500">{labels ? LABELS_STATUS_TEXT[labels.status] : LABELS_STATUS_TEXT[method.labels_status]}</span>
          </div>
          {labels ? (
            <>
              <p className="mt-2 text-[13px] text-ink-700">
                Two labellers read the same {unplanned.generous.population_count} records: <span className="mono text-ink-900">{labels.uncovered_count}</span> of{" "}
                {unplanned.generous.population_count} ({percentOf(labels.uncovered_count, unplanned.generous.population_count)}) uncovered, with{" "}
                <span className="mono">{labels.breakdowns}</span> breakdowns, <span className="mono">{hoursText(labels.downtime_h)}</span> and{" "}
                <span className="mono">{idrText(labels.cost_idr)}</span>; Cohen&apos;s kappa <span className="mono">{labels.kappa_covered}</span> on covered and{" "}
                <span className="mono">{labels.kappa_taught}</span> on taught. Against them the proxy scores precision <span className="mono">{labels.proxy_agreement.generous.precision}</span> and recall{" "}
                <span className="mono">{labels.proxy_agreement.generous.recall}</span> in the generous layer, <span className="mono">{labels.proxy_agreement.strict.precision}</span> and{" "}
                <span className="mono">{labels.proxy_agreement.strict.recall}</span> in the strict.
              </p>
              <p className="mt-1 text-[12px] text-ink-500">The adjudicated reading bounds the gap from below; the headline stays the proxy until the human adjudication closes.</p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-ink-500">Not available on this deployment: the runtime cannot read the fixture that carries the labels, so no adjudicated figure is shown.</p>
          )}
        </div>
      </GlassPanel>

      {/* Sensitivity: the ladder of thresholds per layer with the current threshold marked; the all-order ladder beneath. */}
      <GlassPanel className="rise p-6" aria-labelledby="sens-heading">
        <div style={stagger(3)}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="sens-heading" className="text-[20px]">
              Sensitivity
            </h2>
            <span className="text-[12px] text-ink-500">uncovered count at each threshold the harness wrote, {POPULATION_LABEL.unplanned_failure}</span>
          </div>
          <SensitivityStrip className="mt-4" layers={[unplanned.generous, unplanned.strict]} />
          {all ? (
            <details className="disclose mt-5">
              <summary>
                {POPULATION_LABEL.all}: <span className="mono">{all.generous.uncovered_count}</span> of {all.generous.population_count} uncovered at {T} ={" "}
                <span className="mono">{all.generous.threshold}</span>, generous layer ({percentOf(all.generous.uncovered_count, all.generous.population_count)}, <Band s={all.generous} />);{" "}
                <span className="mono">{all.strict.uncovered_count}</span> of {all.strict.population_count} strict ({percentOf(all.strict.uncovered_count, all.strict.population_count)},{" "}
                <Band s={all.strict} />)
              </summary>
              <div className="disclose-body">
                <SensitivityStrip layers={[all.generous, all.strict]} />
              </div>
            </details>
          ) : null}
        </div>
      </GlassPanel>

      {/* The per-work-order assessment of the headline population, both layers, beside the adjudicated reading. */}
      <GlassPanel className="rise p-6" aria-labelledby="table-heading" id="assessment">
        <div style={stagger(4)}>
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 id="table-heading" className="text-[20px]">
                Per-work-order assessment
              </h2>
              <p className="mt-1 max-w-prose text-[13px] text-ink-700">
                Every record of the population with both layers&apos; best window. The toggle orders one layer&apos;s uncovered records first and selects the matched unit the cluster cards show.
              </p>
            </div>
            <form method="get" action={`${ROUTE}#assessment`} aria-label="Layer for the table and the cluster cards">
              <LayerToggle value={layer} />
            </form>
          </div>
          <p className="mt-3 text-[13px] text-ink-700">
            <span className="mono text-ink-900">{selected.uncovered_count}</span> of {selected.population_count} uncovered at {T} = <span className="mono">{selected.threshold}</span>,{" "}
            {layer} layer.
            {tableAgrees ? null : (
              <span className="text-caveat">
                {" "}
                The population rule selects {rows.length} rows with {uncoveredRows} uncovered on this version; the summary row is the authority.
              </span>
            )}
          </p>
          {rows.length > 0 ? (
            <div className="mt-3 overflow-x-auto">
              <table className="reg" data-layer={layer}>
                <thead>
                  <tr>
                    <th scope="col">Work order</th>
                    <th scope="col">Asset</th>
                    <th scope="col">Reported</th>
                    <th scope="col">Kind</th>
                    <th scope="col">Generous</th>
                    <th scope="col">Strict</th>
                    <th scope="col">
                      <span className="flex flex-wrap items-center gap-2">
                        Adjudicated <StatusBadge kind="machine_drafted" />
                      </span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ordered.map((r) => (
                    <tr key={r.wo_number} data-uncovered={uncoveredUnder(r) ? "" : undefined}>
                      <td className="mono whitespace-nowrap text-ink-900">{r.wo_number}</td>
                      <td className="mono whitespace-nowrap">
                        <Link href={`/assets/${r.equipment_tag}`} className="draw">
                          {r.equipment_tag}
                        </Link>
                      </td>
                      <td className="mono whitespace-nowrap">
                        {reportedAt(r.report_date).date} <span className="text-ink-500">{reportedAt(r.report_date).time}</span>
                      </td>
                      <td className="whitespace-nowrap">
                        {r.work_type}
                        {r.breakdown_kind === "unplanned" ? <span className="tag ml-2">breakdown</span> : null}
                      </td>
                      <td>
                        <Reading r={r.generous} />
                      </td>
                      <td>
                        <Reading r={r.strict} />
                      </td>
                      <td>
                        <Adjudicated row={r} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState className="mt-3" title="No work orders in the population on this version" explanation="The frozen population rule selected no row; the summary row above still carries the version's counts." />
          )}
        </div>
      </GlassPanel>

      {/* Ranked clusters: the factor snapshot, the coefficients labelled ASSUMPTION, the closeout count beside the score, the request action. */}
      <section className="rise" style={stagger(5)} aria-labelledby="clusters-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="clusters-heading" className="text-[20px]">
            Ranked clusters
          </h2>
          {coefficients ? (
            <span className="text-[12px] text-ink-700">
              score = <span className="mono">{coefficients.a}</span> D/D<sub>max</sub> + <span className="mono">{coefficients.b}</span> C/C<sub>max</sub> +{" "}
              <span className="mono">{coefficients.c}</span> k + <span className="mono">{coefficients.d}</span> r over the {DEBT_LAYER}-uncovered records; coefficients{" "}
              <span className="tag" data-tone="caveat">
                {coefficients.basis}
              </span>
            </span>
          ) : null}
        </div>
        {clusters.length > 0 ? (
          <div className="mt-4 grid gap-5 xl:grid-cols-2">
            {clusters.map((c) => (
              <ClusterCard key={c.id} cluster={c} workOrders={cardWorkOrders(c)} assetHref={`/assets/${c.equipment_tag}`} requestAction={<RequestAction cluster={c} role={role} />} />
            ))}
          </div>
        ) : (
          <EmptyState className="mt-4" title="No clusters on this version" explanation="The debt ranking is written per corpus version; none exists for the version this session sees." />
        )}
        <p className="mt-3 text-[12px] text-ink-500">Matched units on the cards follow the {layer} layer selected above; the score itself is always computed over the {DEBT_LAYER} layer.</p>
      </section>
    </div>
  );
}
