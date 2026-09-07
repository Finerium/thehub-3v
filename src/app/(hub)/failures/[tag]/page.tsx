// Failure Memory, one asset (blueprint 6.2 surface 6; AC-FM-01 to AC-FM-07; register dense-operational, 7.2). The
// history filterable by work type and breakdown flag, every record carrying its own words, its closeout chip with
// the empty outcome fields and its priority, its place in the asset's causal chains, its family, the lessons that
// quote it and its coverage reading; the chains drawn as hops with the linking sentence verbatim, the field it came
// from, the interval in days and the fixed basis line; the families with explicit membership, basis and review
// status as precedent panels; the proof tests per class; the bill-of-material matches where a record names a part.
// Every figure is read at request time from work_order, failure_event and the package artefacts
// (src/db/queries/failures.ts) and reconciled to the fixture's equipment_master row beside it. Links are carried
// whole from the bundle and are never computed here; nothing on this surface predicts, ranks, assigns or chases.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment, type CSSProperties, type ReactNode } from "react";
import { can } from "@/auth/matrix";
import { getSandbox, visibleVersionIds } from "@/auth/sandbox";
import { requireSession } from "@/auth/session";
import { Chain } from "@/components/ChainHop";
import { ClosedoutChip, emptyFieldsOf } from "@/components/ClosedoutChip";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { PrecedentPanel } from "@/components/FamilyList";
import { FilterBar } from "@/components/FilterBar";
import { GlassPanel } from "@/components/GlassPanel";
import { NeumorphicChip } from "@/components/NeumorphicChip";
import { OperationalContextPanel } from "@/components/OperationalContextPanel";
import { Pagination } from "@/components/Pagination";
import { ProofTestCard, TEST_CLASS_LABEL } from "@/components/ProofTestCard";
import { VersionBadge } from "@/components/VersionBadge";
import type { ProofTest, WorkOrder } from "@/contracts/generated/operations";
import type { Role } from "@/contracts/generated/serving";
import { hoursText, idrText } from "@/db/queries/coverage";
import {
  CD4_RULE,
  TEST_CLASSES,
  WORK_TYPES,
  assetFailureMemory,
  failureFixtures,
  preferenceOrder,
  type AssetFailureMemory,
  type BomMatchDetail,
  type EquipmentMasterRow,
  type HistoryRecord,
  type WorkType,
} from "@/db/queries/failures";
import { operationalContext, type OperationalContext } from "@/db/queries/operational-context";
import { log } from "@/lib/log";

export const metadata: Metadata = { title: "Failure Memory" };

// Every figure binds to the seeded rows at request time (blueprint 10.3); nothing is prerendered.
export const dynamic = "force-dynamic";

const BASE = "/failures";
const PAGE_SIZE = 50;
const DIGEST_PREFIX = 8;
const NOT_RECORDED = "not recorded";
const COST_LABEL = "recorded maintenance cost, labour plus material";
// The record's report_date carries a timestamp; the column prints its date and keeps the whole value in the title.
const DATE_CHARS = 10;
// The workbook writes a lone dash where a record named no spare part; an empty field is not a value.
const EMPTY_FIELD = "-";
// The loop track flips this when POST /api/drafts and /drafts land; until then the request action is disabled and
// carries its explanation (6.3: a designed state, never a dead control).
const DRAFT_ROUTE_LANDED = false;

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;
const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

type Props = {
  params: Promise<{ tag: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const BREAKDOWN_OPTIONS = [
  { value: "true", label: "flagged as a breakdown" },
  { value: "false", label: "not flagged" },
];

const KIND_LABEL: Record<WorkOrder["breakdown_kind"], string> = {
  unplanned: "unplanned",
  planned_flagged: "planned, flagged",
  none: "not flagged",
};

/** A recorded figure the workbook may have left empty; an empty cell says so rather than printing a zero. */
function Figure({ value, format }: { value: number | null; format: (n: number) => string }) {
  return value === null ? <span className="text-[12px] text-ink-500">{NOT_RECORDED}</span> : <span className="mono">{format(value)}</span>;
}

/** One reconciled figure of the asset's fixture row: the recorded value, the harness key beside it. */
function Recon({ live, fixture, fixtureKey, format }: { live: number; fixture: number | null; fixtureKey: string; format?: (n: number) => string }) {
  const fmt = format ?? ((n: number) => String(n));
  const differs = fixture !== null && fixture !== live;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5">
      <span className={differs ? "mono font-medium text-defect" : "mono font-medium text-ink-900"}>{fmt(live)}</span>
      {fixture === null ? (
        <span className="text-[11.5px] text-ink-500">no key</span>
      ) : (
        <span className="mono text-[11.5px] text-ink-500" title={fixtureKey}>
          {fmt(fixture)}
        </span>
      )}
      {differs ? (
        <span className="badge" data-tone="defect">
          differs
        </span>
      ) : null}
    </span>
  );
}

function Section({ id, title, right, children, index }: { id: string; title: string; right?: ReactNode; children: ReactNode; index: number }) {
  return (
    <section id={id} className="rise" style={stagger(index)} aria-labelledby={`${id}-heading`}>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id={`${id}-heading`} className="text-[20px]">
          {title}
        </h2>
        {right}
      </div>
      {children}
    </section>
  );
}

/** The record's own words, each under the workbook field it is quoted from; an empty field says it is empty. */
function Narrative({ label, text }: { label: string; text: string }) {
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[12.5px] leading-snug">
      <span className="eyebrow shrink-0">{label}</span>
      {text.trim().length > 0 ? <span className="verbatim text-ink-700">{text}</span> : <span className="text-ink-500">{NOT_RECORDED}</span>}
    </p>
  );
}

function CoverageCell({ h }: { h: HistoryRecord }) {
  if (h.uncovered === null) return <span className="text-[12px] text-ink-500">no assessment</span>;
  if (!h.uncovered)
    return (
      <span className="badge" data-tone="verified">
        taught
      </span>
    );
  return (
    <Link href="#uncovered" className="badge" data-tone="defect">
      no lesson
    </Link>
  );
}

function Record({ h, tag, memberTags, colSpan }: { h: HistoryRecord; tag: string; memberTags: Record<string, string>; colSpan: number }) {
  const r = h.record;
  const empty = emptyFieldsOf(r.completeness_flags);
  const woHref = (wo: string) => {
    const other = memberTags[wo];
    return other && other !== tag ? `${BASE}/${encodeURIComponent(other)}#${wo}` : `#${wo}`;
  };
  return (
    <tbody id={r.wo_number} data-wo={r.wo_number} data-breakdown={r.breakdown ? "" : undefined}>
      <tr>
        <th scope="row" className="whitespace-nowrap align-top">
          <span className="mono font-medium text-ink-900">{r.wo_number}</span>
          <span className="mono block text-[11px] font-normal text-ink-500">{r.notification_no}</span>
        </th>
        <td className="mono whitespace-nowrap align-top" title={`reported ${r.report_date}`}>
          {r.report_date.slice(0, DATE_CHARS)}
          <span className="block text-[11px] text-ink-500">{r.status}</span>
        </td>
        <td className="whitespace-nowrap align-top">{r.work_type}</td>
        <td className="whitespace-nowrap align-top">{r.discipline}</td>
        <td className="whitespace-nowrap align-top">
          <span className="tag" data-tone={r.priority === "Emergency" ? "caveat" : undefined}>
            {r.priority}
          </span>
        </td>
        <td className="whitespace-nowrap align-top">
          <span className="tag" data-tone={r.breakdown_kind === "unplanned" ? "defect" : r.breakdown_kind === "planned_flagged" ? "caveat" : undefined}>
            {KIND_LABEL[r.breakdown_kind]}
          </span>
        </td>
        <td className="whitespace-nowrap align-top">
          <Figure value={r.downtime_hours} format={hoursText} />
        </td>
        <td className="whitespace-nowrap align-top">
          <Figure value={r.total_cost_idr} format={idrText} />
        </td>
        <td className="whitespace-nowrap align-top">
          <CoverageCell h={h} />
        </td>
        <td className="align-top">
          {r.closeout_complete ? (
            <span className="badge" data-tone="verified">
              closeout complete
            </span>
          ) : (
            <ClosedoutChip
              woNumber={r.wo_number}
              emptyFields={empty}
              priority={r.priority}
              findingHref={h.cd4_finding_id === null ? `/integrity?rule=${CD4_RULE}` : `/integrity?rule=${CD4_RULE}#${h.cd4_finding_id}`}
            />
          )}
        </td>
      </tr>
      <tr>
        <td colSpan={colSpan} className="pt-0">
          <div className="flex flex-col gap-1 border-l-2 border-edge pl-3">
            <Narrative label="Problem_Description" text={r.problem_description} />
            <Narrative label="Root_Cause" text={r.root_cause} />
            <Narrative label="Corrective_Action" text={r.corrective_action} />
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px]">
              {h.chain_places.map((p) => (
                <Link key={p.link_id} href={woHref(p.other_wo)} className="chip" title={`causal link ${p.link_id}`}>
                  <span className="text-ink-700">{p.direction === "from" ? "leads to" : "follows"}</span>
                  <span className="mono text-ink-900">{p.other_wo}</span>
                  <span className="tag" data-tone="accent">
                    {p.mechanism_noun}
                  </span>
                </Link>
              ))}
              {h.family_id ? (
                <Link href={`#family-${h.family_id}`} className="chip">
                  <span className="text-ink-700">family</span>
                  <span className="mono text-ink-900">{h.family_id}</span>
                </Link>
              ) : null}
              {h.lessons.map((l) => (
                <Link key={`${l.opl_id}:${l.n}`} href={`/documents/${encodeURIComponent(l.document_id)}`} className="chip" title="approved lesson quoting this record">
                  <span className="text-ink-700">quoted by</span>
                  <span className="mono text-ink-900">
                    {l.opl_id} row {l.n}
                  </span>
                  {l.truncated ? (
                    <span className="badge" data-tone="caveat">
                      truncated cell
                    </span>
                  ) : null}
                </Link>
              ))}
              {h.bom_matches.length > 0 ? (
                <Link href="#bom" className="chip">
                  <span className="text-ink-700">bill of material</span>
                  <span className="mono text-ink-900">{h.bom_matches.length}</span>
                </Link>
              ) : null}
              <span className="chip">
                <span className="text-ink-700">labour</span>
                <span className="mono text-ink-900">{r.labor_hours === null ? NOT_RECORDED : hoursText(r.labor_hours)}</span>
              </span>
              {r.spare_parts_used.trim().length > 0 && r.spare_parts_used.trim() !== EMPTY_FIELD ? (
                <span className="chip">
                  <span className="text-ink-700">spare parts</span>
                  <span className="verbatim text-ink-900">{r.spare_parts_used}</span>
                </span>
              ) : null}
            </div>
          </div>
        </td>
      </tr>
    </tbody>
  );
}

function BomTable({ matches }: { matches: BomMatchDetail[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th scope="col">Work order</th>
          <th scope="col">Part named on the record</th>
          <th scope="col">Status</th>
          <th scope="col">Bill-of-material item</th>
          <th scope="col">Alternative</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((b) => (
          <tr key={`${b.match.wo_number}:${b.match.part_string}`}>
            <th scope="row" className="whitespace-nowrap">
              <Link href={`#${b.match.wo_number}`} className="mono draw">
                {b.match.wo_number}
              </Link>
            </th>
            <td>
              <span className="verbatim">{b.match.part_string}</span>
            </td>
            <td className="whitespace-nowrap">
              <span className="badge" data-tone={b.match.status === "matched" ? "verified" : "caveat"}>
                {b.match.status}
              </span>
            </td>
            <td>
              {b.item ? (
                <>
                  <span className="mono text-ink-900">item {b.item.item_no}</span>{" "}
                  <span className="verbatim">{b.item.description}</span>
                  <span className="mono block text-[11.5px] text-ink-500">
                    {b.item.ga_drawing_doc_no}
                    {b.item.material ? ` · ${b.item.material}` : ""}
                    {b.item.quantity ? ` · qty ${b.item.quantity}` : ""}
                  </span>
                </>
              ) : (
                <span className="text-[12px] text-ink-500">no item on the drawing carries this part string</span>
              )}
            </td>
            <td>
              {b.alternative ? (
                <>
                  <span className="mono text-ink-900">item {b.alternative.item_no}</span> <span className="verbatim">{b.alternative.description}</span>
                  {b.match.disambiguator_text ? (
                    <span className="block text-[11.5px] text-ink-500">
                      separated by <span className="verbatim">{b.match.disambiguator_text}</span>
                    </span>
                  ) : null}
                </>
              ) : (
                <span className="text-[12px] text-ink-500">none</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function UncoveredPanel({ memory, role }: { memory: AssetFailureMemory; role: Role }) {
  const uncovered = memory.history.filter((h) => h.uncovered === true);
  const allowed = can(role, "create_draft");
  const explanation = !allowed
    ? `The ${role} role holds no create_draft permission (9.9); the Reviewing Supervisor requests the lesson.`
    : memory.cluster_id === null
      ? "No debt cluster exists for this asset on the version this session sees, so no drafting target is addressed."
      : DRAFT_ROUTE_LANDED
        ? `Opens the drafting queue for ${memory.equipment.tag}.`
        : `Drafting has not landed on this deployment; when it does, this chip opens /drafts?cluster=${memory.cluster_id}.`;
  return (
    <GlassPanel id="uncovered" className="rise p-6" aria-labelledby="uncovered-heading" data-component="uncovered-records">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="uncovered-heading" className="text-[20px]">
          Records no lesson teaches
        </h2>
        {memory.coverage_version ? (
          <VersionBadge
            label={memory.coverage_version.label}
            digestPrefix={memory.coverage_version.corpus_sha256.slice(0, DIGEST_PREFIX)}
            active={memory.coverage_version.is_active}
          />
        ) : null}
      </div>
      <p className="mt-2 max-w-prose text-[13px] text-ink-700">
        The generous layer of the frozen coverage recipe read over this page of the history: a record is uncovered when no same-asset lesson reaches
        the threshold even over its whole text. The reading belongs to the Coverage Console; it is shown here so a record carries it.
      </p>
      {memory.coverage_version === null ? (
        <p className="mt-3 text-[13px] text-ink-500">
          No corpus version visible to this session carries a coverage assessment, so no record on this page is marked either way.
        </p>
      ) : uncovered.length > 0 ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {uncovered.map((h) => (
            <li key={h.record.wo_number}>
              <Link href={`#${h.record.wo_number}`} className="chip">
                <span className="mono text-ink-900">{h.record.wo_number}</span>
                <span className="text-ink-700">{h.record.report_date}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : memory.history.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-700">
          No record is on this page of the history, so no coverage reading is shown. Clear the filter below to read the whole history.
        </p>
      ) : (
        <p className="mt-3 text-[13px] text-ink-700">Every record on this page of the history is matched by a same-asset lesson under the generous layer.</p>
      )}
      <form action="/drafts" method="get" className="mt-4 flex flex-wrap items-center gap-3" data-component="request-lesson-form" data-cluster={memory.cluster_id ?? undefined}>
        {memory.cluster_id ? <input type="hidden" name="cluster" value={memory.cluster_id} /> : null}
        <NeumorphicChip
          type="submit"
          size="sm"
          disabled={!allowed || memory.cluster_id === null || !DRAFT_ROUTE_LANDED}
          icon={<span>&rarr;</span>}
          aria-label={`Request a lesson for ${memory.equipment.tag}`}
        >
          Request a lesson
        </NeumorphicChip>
        <span className="max-w-[52ch] text-[12px] leading-snug text-ink-500">{explanation}</span>
        <Link href="/coverage" className="draw text-[12.5px]">
          Coverage Console
        </Link>
      </form>
    </GlassPanel>
  );
}

export default async function AssetFailuresPage({ params, searchParams }: Props) {
  const [{ role }, { tag }, query, jar] = await Promise.all([requireSession(), params, searchParams, cookies()]);

  const workTypeParam = first(query.work_type);
  const workType = (WORK_TYPES as readonly string[]).includes(workTypeParam ?? "") ? (workTypeParam as WorkType) : undefined;
  const breakdownParam = first(query.breakdown);
  const breakdown = breakdownParam === "true" ? true : breakdownParam === "false" ? false : undefined;
  const pageParam = Number(first(query.page) ?? "1");
  const page = Number.isFinite(pageParam) && pageParam >= 1 ? Math.floor(pageParam) : 1;

  const box = await getSandbox(jar);
  const versions = preferenceOrder(await visibleVersionIds(box), box?.corpusVersionId ?? null);

  let memory: AssetFailureMemory | null;
  let context: OperationalContext | null;
  try {
    [memory, context] = await Promise.all([assetFailureMemory(tag, { work_type: workType, breakdown }, versions, page, PAGE_SIZE), operationalContext(tag, versions)]);
  } catch (error) {
    log.error({ event: "failures.asset_read_failed", route: `${BASE}/${tag}`, message: error instanceof Error ? error.message : String(error) });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="This asset's failure memory reads its work-order, failure-event and package-artefact rows at request time. The read failed, so no figure is shown in their place."
        next={{ href: BASE, label: "Failure Memory" }}
      />
    );
  }
  if (!memory) notFound();

  const fx = failureFixtures();
  const eq = memory.equipment;
  const fixture: EquipmentMasterRow | null = memory.fixture;
  const filtered = workType !== undefined || breakdown !== undefined;
  const pageCount = Math.max(1, Math.ceil(memory.filtered_total / PAGE_SIZE));
  const historyHref = (p: number) => {
    const q = new URLSearchParams();
    if (workType) q.set("work_type", workType);
    if (breakdown !== undefined) q.set("breakdown", String(breakdown));
    if (p > 1) q.set("page", String(p));
    const s = q.toString();
    return `${BASE}/${encodeURIComponent(tag)}${s ? `?${s}` : ""}#history`;
  };

  const byClass = new Map<ProofTest["test_class"], ProofTest[]>();
  for (const t of memory.proof_tests) byClass.set(t.test_class, [...(byClass.get(t.test_class) ?? []), t]);
  const absentClasses = TEST_CLASSES.filter((c) => !byClass.has(c));

  const memberHref = (wo: string) => {
    const other = memory.member_tags[wo];
    return other && other !== tag ? `${BASE}/${encodeURIComponent(other)}#${wo}` : `#${wo}`;
  };
  const soleMemberOf = (familyId: string): string | undefined => {
    const onAsset = memory.precedent.filter((p) => p.family_id === familyId);
    return onAsset.length === 1 ? onAsset[0]?.wo_number : undefined;
  };

  const chainFixture = fx?.chains.by_tag[tag] ?? null;
  const columns = 10;

  return (
    <div className="flex flex-col gap-8">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <p className="eyebrow">Failure Memory</p>
          <h1 className="mono mt-1 text-[34px]">{eq.tag}</h1>
          <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">
            {eq.name}. {eq.service}. Area <span className="mono">{eq.area_code}</span>, called{" "}
            <span className="verbatim">{eq.area_workbook_name}</span> in the workbook. Criticality on the datasheet{" "}
            <span className="mono">{eq.criticality_datasheet}</span>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Link href={`/assets/${encodeURIComponent(eq.tag)}`} className="draw text-[13px]">
            Asset page
          </Link>
          <Link href={BASE} className="draw text-[13px]">
            Fleet summary
          </Link>
        </div>
      </header>

      {/* The asset's recorded totals with the harness key each one reconciles to. */}
      <GlassPanel className="rise p-6" aria-labelledby="recon-heading" data-component="asset-reconciliation">
        <div style={stagger(1)}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 id="recon-heading" className="text-[20px]">
              Recorded totals
            </h2>
            <span className="text-[12px] text-ink-500">
              {fixture === null ? "no equipment_master key for this tag on this deployment" : `reconciled to equipment_master.${tag}`}
            </span>
          </div>
          <dl className="fields mt-4">
            <dt>Work orders</dt>
            <dd>
              <Recon live={memory.history_total} fixture={fixture?.work_orders ?? null} fixtureKey={`equipment_master.${tag}.work_orders`} />
            </dd>
            <dt>Flagged as a breakdown</dt>
            <dd>
              <Recon live={memory.events.length} fixture={fixture?.breakdowns_flagged ?? null} fixtureKey={`equipment_master.${tag}.breakdowns_flagged`} />
            </dd>
            <dt>Recorded downtime of the flagged rows</dt>
            <dd>
              <Recon
                live={memory.events.reduce((s, e) => s + (e.downtime_hours ?? 0), 0)}
                fixture={fixture?.flagged_h ?? null}
                fixtureKey={`equipment_master.${tag}.flagged_h`}
                format={hoursText}
              />
            </dd>
            <dt>Recorded maintenance cost, labour plus material</dt>
            <dd>
              <Recon
                live={memory.events.reduce((s, e) => s + (e.maintenance_cost_idr ?? 0), 0)}
                fixture={fixture?.breakdown_cost_idr ?? null}
                fixtureKey={`equipment_master.${tag}.breakdown_cost_idr`}
                format={idrText}
              />
            </dd>
            <dt>Incomplete closeout</dt>
            <dd>
              <Recon live={memory.incomplete_total} fixture={fixture?.incomplete_rows ?? null} fixtureKey={`equipment_master.${tag}.incomplete_rows`} />
              <span className="ml-2 text-[11.5px] text-ink-500">the {CD4_RULE} rule, over the whole history</span>
            </dd>
            <dt>Causal links</dt>
            <dd>
              <Recon live={memory.chains.length} fixture={chainFixture} fixtureKey={`chains.by_tag.${tag}`} />
            </dd>
            <dt>Proof tests</dt>
            <dd className="mono">{memory.proof_tests.length}</dd>
          </dl>
        </div>
      </GlassPanel>

      {context ? <OperationalContextPanel className="rise" context={context} hrefFor={(wo) => `#${wo}`} /> : null}

      <UncoveredPanel memory={memory} role={role} />

      {/* The history: one work order per record block, its own words under the workbook field they are quoted from. */}
      <Section
        id="history"
        index={2}
        title="History"
        right={
          <span className="text-[12px] text-ink-500">
            <span className="mono text-ink-900">{memory.filtered_total}</span> of {memory.history_total} records
            {filtered ? ", filtered" : ""}
          </span>
        }
      >
        <div className="mt-3">
          <FilterBar
            action={`${BASE}/${encodeURIComponent(tag)}#history`}
            aria-label="Filter the history by work type and breakdown flag"
            resetHref={`${BASE}/${encodeURIComponent(tag)}#history`}
            fields={[
              {
                kind: "select",
                name: "work_type",
                label: "Work type",
                value: workType ?? "",
                options: WORK_TYPES.map((t) => ({ value: t, label: t })),
                allLabel: "every work type",
              },
              {
                kind: "select",
                name: "breakdown",
                label: "Breakdown flag",
                value: breakdown === undefined ? "" : String(breakdown),
                options: BREAKDOWN_OPTIONS,
                allLabel: "flagged and not",
              },
            ]}
          />
        </div>
        {memory.history.length > 0 ? (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="reg" data-component="failure-history">
                <thead>
                  <tr>
                    <th scope="col">Work order</th>
                    <th scope="col">Reported</th>
                    <th scope="col">Type</th>
                    <th scope="col">Discipline</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Breakdown</th>
                    <th scope="col">Downtime</th>
                    <th scope="col">Recorded cost</th>
                    <th scope="col">Coverage</th>
                    <th scope="col">Closeout</th>
                  </tr>
                </thead>
                {memory.history.map((h) => (
                  <Record key={h.record.wo_number} h={h} tag={tag} memberTags={memory.member_tags} colSpan={columns} />
                ))}
              </table>
            </div>
            <p className="mt-3 text-[12px] text-ink-500">
              Recorded cost is the {COST_LABEL} of the record (total_cost_idr); an empty outcome field reads {NOT_RECORDED} and is listed by the
              closeout chip, which links to the record&apos;s own {CD4_RULE} finding.
            </p>
            {pageCount > 1 ? <Pagination className="mt-3" page={page} pageCount={pageCount} total={memory.filtered_total} unit="records" hrefFor={historyHref} /> : null}
          </>
        ) : (
          <EmptyState
            className="mt-4"
            title="No record matches this filter"
            explanation={`The asset carries ${memory.history_total} records; none of them is of the work type and breakdown flag selected above.`}
            action={{ href: `${BASE}/${encodeURIComponent(tag)}#history`, label: "Clear the filter" }}
          />
        )}
      </Section>

      {/* Causal chains: hops with the linking sentence verbatim, its field, the interval and the fixed basis line. */}
      <Section
        id="chains"
        index={3}
        title="Causal chains"
        right={
          <span className="text-[12px] text-ink-500">
            <span className="mono text-ink-900">{memory.chains.length}</span> links
            {chainFixture === null ? null : (
              <>
                , fixture <span className="mono">{chainFixture}</span>
              </>
            )}
            {fx ? (
              <>
                , inside a <span className="mono">{fx.chains.window_days}</span> day window
              </>
            ) : null}
          </span>
        }
      >
        {memory.chains.length > 0 ? (
          <>
            <div className="mt-4">
              <Chain links={memory.chains} windowDays={fx?.chains.window_days} hrefFor={memberHref} aria-label={`Causal chains of ${tag}`} />
            </div>
            <p className="mt-3 max-w-prose text-[12px] text-ink-500">
              A link is a package artefact: two records of the same asset whose recorded text shares a degradation noun inside the window. It is
              carried whole from the bundle, never computed on this surface, and it is not a claim of cause.
            </p>
          </>
        ) : (
          <EmptyState
            className="mt-4"
            title="No causal link on this asset"
            explanation="No two records of this asset share a degradation noun inside the window the package used, so no hop is drawn."
          />
        )}
      </Section>

      {/* Families: explicit membership with the recorded root cause per member, the basis and its review status. */}
      <Section
        id="families"
        index={4}
        title="Families and precedent"
        right={<span className="text-[12px] text-ink-500">membership is a list, not a model output</span>}
      >
        {memory.families.length > 0 ? (
          <>
            <div className={memory.families.length > 1 ? "mt-4 grid gap-5 xl:grid-cols-2" : "mt-4 grid gap-5"}>
              {memory.families.map((f) => (
                <div key={f.id} id={`family-${f.id}`}>
                  <PrecedentPanel family={f} currentWo={soleMemberOf(f.id)} hrefFor={memberHref} />
                </div>
              ))}
            </div>
            <p className="mt-3 max-w-prose text-[12px] text-ink-500">
              Every member carries the root cause its own record records. A member on another asset links to that asset&apos;s history. A record this
              family leaves out stays out of it.
            </p>
          </>
        ) : (
          <EmptyState
            className="mt-4"
            title="No family names a record of this asset"
            explanation="Families are explicit lists written by the package; none of them lists a work order of this asset."
          />
        )}
      </Section>

      {/* Proof tests per class, with the fixed statement that no supplied document types an interval. */}
      <Section
        id="proof-tests"
        index={5}
        title="Proof tests"
        right={
          <span className="text-[12px] text-ink-500">
            <span className="mono text-ink-900">{memory.proof_tests.length}</span> records over {byClass.size} of {TEST_CLASSES.length} classes
          </span>
        }
      >
        {byClass.size > 0 ? (
          <>
            <div className="mt-4 grid gap-5 xl:grid-cols-2">
              {TEST_CLASSES.filter((c) => byClass.has(c)).map((c) => (
                <ProofTestCard key={c} testClass={c} records={byClass.get(c) ?? []} hrefFor={(wo) => `#${wo}`} />
              ))}
            </div>
            {absentClasses.length > 0 ? (
              <p className="mt-3 text-[12px] text-ink-500">
                No record of this asset belongs to {absentClasses.map((c) => TEST_CLASS_LABEL[c]).join(", ")}.
              </p>
            ) : null}
          </>
        ) : (
          <EmptyState
            className="mt-4"
            title="No proof-test record on this asset"
            explanation="No work order of this asset was classified into one of the four test classes, so no card is drawn and no interval is implied."
          />
        )}
      </Section>

      {/* Bill-of-material matches: the part string the record names, resolved against the GA drawing's items. */}
      <Section
        id="bom"
        index={6}
        title="Bill-of-material matches"
        right={
          <span className="text-[12px] text-ink-500">
            <span className="mono text-ink-900">{memory.bom_matches.length}</span> part strings named by a record
          </span>
        }
      >
        {memory.bom_matches.length > 0 ? (
          <>
            <div className="mt-4 overflow-x-auto">
              <BomTable matches={memory.bom_matches} />
            </div>
            <p className="mt-3 max-w-prose text-[12px] text-ink-500">
              A match is the part string the work order recorded read against the items of the asset&apos;s general-arrangement drawing. Where two
              items carry the same description the alternative is listed beside the match with the text that separates them.
            </p>
          </>
        ) : (
          <EmptyState
            className="mt-4"
            title="No record of this asset names a part"
            explanation="Matching runs only where a work order names a spare part; none of this asset's records does."
          />
        )}
      </Section>
    </div>
  );
}
