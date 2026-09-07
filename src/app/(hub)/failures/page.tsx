// Failure Memory, the fleet summary (blueprint 6.2 surface 6, first screen; AC-FM-01, AC-FM-03, AC-FM-04,
// AC-FM-05; register dense-operational, 7.2). Work orders by asset and by work type, the breakdown flag split into
// its two recorded kinds, recorded downtime and recorded maintenance cost, the incomplete-closeout count with its
// Emergency rows, the package artefacts (chain links, explicit families, proof tests) counted beside them. Every
// figure is read at request time from work_order and failure_event and from the causal_link, failure_family and
// proof_test rows (src/db/queries/failures.ts); the fixture's workbook and equipment_master keys are read beside
// them, never in their place, and a difference is printed rather than hidden. Nothing here ranks an asset,
// predicts a failure or aggregates by person (Case 1).
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { FamilyList } from "@/components/FamilyList";
import { GlassPanel } from "@/components/GlassPanel";
import { TEST_CLASS_LABEL } from "@/components/ProofTestCard";
import { hoursText, idrText } from "@/db/queries/coverage";
import {
  TEST_CLASSES,
  WORK_TYPES,
  failureFixtures,
  fleetFailureSummary,
  type AssetFailureRow,
  type FailureFixtures,
  type FleetFailureSummary,
} from "@/db/queries/failures";
import { log } from "@/lib/log";

export const metadata: Metadata = { title: "Failure Memory" };

// Every figure binds to the seeded rows at request time (blueprint 10.3); nothing is prerendered.
export const dynamic = "force-dynamic";

const ROUTE = "/failures";
const NO_FIXTURE = "fixtures.json is not readable on this deployment, so no key is shown beside the live figure.";
const COST_FIELD = "recorded maintenance cost, labour plus material (work_order.total_cost_idr, failure_event.maintenance_cost_idr)";

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;
const count = (n: number) => String(n);
/** The same digit grouping as idrText, without repeating the currency beside a figure that already carries it. */
const idrPlain = (n: number) => idrText(n).replace("IDR ", "");
/** The same one decimal as hoursText, without repeating the unit beside a figure that already carries it. */
const hoursPlain = (h: number) => hoursText(h).replace(" h", "");
const plural = (n: number, noun: string) => (n === 1 ? noun : `${noun}s`);

/**
 * One reconciled figure: the live count in ink, the fixture's own key beside it in grey, and the word "differs"
 * when they part. A missing key says so; a figure is never printed twice as if it agreed.
 */
function Recon({
  live,
  fixture,
  fixtureKey,
  format = count,
  fixtureFormat,
}: {
  live: number;
  fixture: number | null;
  fixtureKey: string;
  format?: (n: number) => string;
  /** A narrower rendering of the key beside a wide figure; the default repeats the live format. */
  fixtureFormat?: (n: number) => string;
}) {
  const differs = fixture !== null && fixture !== live;
  const fmt = fixtureFormat ?? format;
  return (
    <span className="inline-flex items-baseline gap-x-1.5 whitespace-nowrap" data-differs={differs ? "" : undefined}>
      <span className={differs ? "mono font-medium text-defect" : "mono font-medium text-ink-900"}>{format(live)}</span>
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

type LedgerLine = {
  label: string;
  live: number;
  fixture: number | null;
  key: string;
  format?: (n: number) => string;
  fixtureFormat?: (n: number) => string;
  note?: string;
};

function Ledger({ lines }: { lines: LedgerLine[] }) {
  return (
    <table className="reg">
      <thead>
        <tr>
          <th scope="col">Figure</th>
          <th scope="col">Recorded</th>
          <th scope="col">Field it is read from</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.label}>
            <th scope="row" className="font-normal text-ink-900">
              {l.label}
            </th>
            <td>
              <Recon live={l.live} fixture={l.fixture} fixtureKey={l.key} format={l.format} fixtureFormat={l.fixtureFormat} />
            </td>
            <td className="text-[12px] text-ink-500">{l.note ?? l.key}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CountRow({ entries }: { entries: Array<{ label: string; live: number; fixture: number | null; key: string }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-2">
      {entries.map((e) => (
        <li key={e.label} className="chip">
          <span className="text-ink-700">{e.label}</span>
          <Recon live={e.live} fixture={e.fixture} fixtureKey={e.key} />
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, right, children, index }: { title: string; right?: ReactNode; children: ReactNode; index: number }) {
  const id = `${title.toLowerCase().replace(/[^a-z]+/g, "-")}-heading`;
  return (
    <GlassPanel className="rise p-6" aria-labelledby={id}>
      <div style={stagger(index)}>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id={id} className="text-[20px]">
            {title}
          </h2>
          {right}
        </div>
        {children}
      </div>
    </GlassPanel>
  );
}

/** The asset row's fixture twin, or null when the fixture is absent or names no such tag. */
function fixtureFor(fx: FailureFixtures | null, tag: string) {
  return fx?.equipment_master.find((e) => e.tag === tag) ?? null;
}

function AssetRow({ a, fx }: { a: AssetFailureRow; fx: FailureFixtures | null }) {
  const f = fixtureFor(fx, a.tag);
  return (
    <tr>
      <th scope="row" className="whitespace-nowrap">
        <Link href={`${ROUTE}/${encodeURIComponent(a.tag)}`} className="mono draw font-medium text-ink-900">
          {a.tag}
        </Link>
        <span className="block text-[11.5px] font-normal text-ink-500">{a.name}</span>
      </th>
      <td className="whitespace-nowrap">
        <Recon live={a.work_orders} fixture={f?.work_orders ?? null} fixtureKey={`equipment_master.${a.tag}.work_orders`} />
      </td>
      <td className="whitespace-nowrap">
        <Recon live={a.breakdowns_flagged} fixture={f?.breakdowns_flagged ?? null} fixtureKey={`equipment_master.${a.tag}.breakdowns_flagged`} />
      </td>
      <td className="whitespace-nowrap text-[11.5px] text-ink-700">
        <span className="block">
          unplanned <Recon live={a.unplanned_rows} fixture={f?.unplanned_rows ?? null} fixtureKey={`equipment_master.${a.tag}.unplanned_rows`} />
        </span>
        <span className="block">
          planned <Recon live={a.planned_flagged_rows} fixture={f?.planned_flagged_rows ?? null} fixtureKey={`equipment_master.${a.tag}.planned_flagged_rows`} />
        </span>
      </td>
      <td className="whitespace-nowrap">
        <Recon
          live={a.unplanned_h}
          fixture={f?.unplanned_h ?? null}
          fixtureKey={`equipment_master.${a.tag}.unplanned_h`}
          format={hoursText}
          fixtureFormat={hoursPlain}
        />
      </td>
      <td className="whitespace-nowrap">
        <Recon
          live={a.flagged_h}
          fixture={f?.flagged_h ?? null}
          fixtureKey={`equipment_master.${a.tag}.flagged_h`}
          format={hoursText}
          fixtureFormat={hoursPlain}
        />
      </td>
      <td className="whitespace-nowrap">
        <Recon
          live={a.breakdown_cost_idr}
          fixture={f?.breakdown_cost_idr ?? null}
          fixtureKey={`equipment_master.${a.tag}.breakdown_cost_idr`}
          format={idrText}
          fixtureFormat={idrPlain}
        />
      </td>
      <td className="whitespace-nowrap">
        <Recon live={a.incomplete_rows} fixture={f?.incomplete_rows ?? null} fixtureKey={`equipment_master.${a.tag}.incomplete_rows`} />
      </td>
      <td className="whitespace-nowrap text-[11.5px] text-ink-700">
        <span className="block">
          <span className="mono text-ink-900">{a.links}</span> {plural(a.links, "link")}
        </span>
        <span className="block">
          <span className="mono text-ink-900">{a.family_members}</span> family {plural(a.family_members, "member")}
        </span>
        <span className="block">
          <span className="mono text-ink-900">{a.proof_tests}</span> proof {plural(a.proof_tests, "test")}
        </span>
      </td>
    </tr>
  );
}

export default async function FailuresPage() {
  let summary: FleetFailureSummary;
  try {
    summary = await fleetFailureSummary();
  } catch (error) {
    log.error({ event: "failures.read_failed", route: ROUTE, message: error instanceof Error ? error.message : String(error) });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="The fleet summary reads the work-order and failure-event rows at request time. The read failed, so no figure is shown in their place."
        next={{ href: ROUTE, label: "Try again" }}
      />
    );
  }

  const fx = failureFixtures();
  const { totals, assets, families, member_tags } = summary;
  const wb = fx?.workbook ?? null;

  const ledger: LedgerLine[] = [
    { label: "Work orders", live: totals.work_orders, fixture: wb?.rows ?? null, key: "workbook.rows", note: "work_order rows" },
    {
      label: "Flagged as a breakdown",
      live: totals.breakdown_flagged.rows,
      fixture: wb?.breakdown_flagged.rows ?? null,
      key: "workbook.breakdown_flagged.rows",
      note: "failure_event rows (work_order.breakdown true)",
    },
    {
      label: "Recorded downtime of those rows",
      live: totals.breakdown_flagged.hours,
      fixture: wb?.breakdown_flagged.hours ?? null,
      key: "workbook.breakdown_flagged.hours",
      format: hoursText,
      fixtureFormat: hoursPlain,
      note: "failure_event.downtime_hours",
    },
    {
      label: "Recorded maintenance cost of those rows",
      live: totals.breakdown_flagged.cost_idr,
      fixture: wb?.breakdown_flagged.cost_idr ?? null,
      key: "workbook.breakdown_flagged.cost_idr",
      format: idrText,
      fixtureFormat: idrPlain,
      note: COST_FIELD,
    },
    {
      label: "Unplanned kind",
      live: totals.unplanned.rows,
      fixture: wb?.breakdown_kinds.unplanned.count ?? null,
      key: "workbook.breakdown_kinds.unplanned.count",
      note: "failure_event.breakdown_kind unplanned",
    },
    {
      label: "Planned work carrying the flag",
      live: totals.planned_flagged.rows,
      fixture: wb?.breakdown_kinds.planned_flagged.count ?? null,
      key: "workbook.breakdown_kinds.planned_flagged.count",
      note: "failure_event.breakdown_kind planned_flagged, the CD-6 rule",
    },
    {
      label: "Incomplete closeout",
      live: totals.incomplete.rows,
      fixture: wb?.incomplete.count ?? null,
      key: "workbook.incomplete.count",
      note: "work_order.closeout_complete false, the CD-4 rule",
    },
    {
      label: "Incomplete and Emergency priority",
      live: totals.incomplete.emergency_rows,
      fixture: wb?.incomplete.emergency_rows ?? null,
      key: "workbook.incomplete.emergency_rows",
      note: "work_order.priority Emergency; these rows record no downtime and no cost",
    },
  ];

  const mismatches = ledger.filter((l) => l.fixture !== null && l.fixture !== l.live).map((l) => l.label);
  const assetMismatch = assets.some((a) => {
    const f = fixtureFor(fx, a.tag);
    return f !== null && (f.work_orders !== a.work_orders || f.breakdowns_flagged !== a.breakdowns_flagged || f.incomplete_rows !== a.incomplete_rows);
  });

  return (
    <div className="flex flex-col gap-8">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <h1 className="text-[34px]">Failure Memory</h1>
          <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">
            What the fleet already recorded: every work order by asset and by work type, the breakdown flag split into the two kinds the workbook
            records, and the package artefacts that read the same rows. No figure is computed here that the workbook does not already state.
          </p>
        </div>
        {fx === null ? (
          <span className="badge" data-tone="caveat">
            fixture not readable
          </span>
        ) : mismatches.length > 0 || assetMismatch ? (
          <span className="badge" data-tone="defect">
            reconciliation differs
          </span>
        ) : (
          <span className="badge" data-tone="verified">
            reconciles to fixtures.json
          </span>
        )}
      </header>

      {fx === null ? (
        <DesignedState
          inline
          tone="caveat"
          title="No fixture key beside the live figures"
          explanation={`${NO_FIXTURE} The recorded figures below are read from the seeded rows and stand alone; nothing is filled in for the missing key.`}
          next={{ href: ROUTE, label: "Reload" }}
        />
      ) : null}

      {mismatches.length > 0 ? (
        <DesignedState
          inline
          code="reconciliation"
          tone="defect"
          title="A fleet figure does not equal its fixture key"
          explanation="The seeded rows and the harness fixture disagree. The recorded figure is shown in the defect token beside the key it should equal; neither is quietly preferred."
          reason={mismatches.join("; ")}
          next={{ href: "/coverage", label: "Coverage Console" }}
        />
      ) : null}

      {/* The fleet ledger: every headline figure with the fixture key it reconciles to and the field it is read from. */}
      <Panel
        index={1}
        title="Fleet totals"
        right={<span className="text-[12px] text-ink-500">recorded figures, not a saving and not a forecast</span>}
      >
        <p className="mt-1 max-w-prose text-[12.5px] text-ink-700">
          Every figure below is the recorded one, with the <span className="mono">fixtures.json</span> key it reconciles to beside it in grey; hover a
          grey figure for the key name. A difference is printed in the defect token, never smoothed away.
        </p>
        <div className="mt-4 grid gap-8 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="overflow-x-auto">
              <Ledger lines={ledger} />
            </div>
          </div>
          <div className="lg:col-span-4 flex flex-col gap-5">
            <div>
              <p className="eyebrow mb-2">Work orders by work type</p>
              <CountRow
                entries={WORK_TYPES.map((t) => ({
                  label: t,
                  live: totals.work_types[t],
                  fixture: wb?.work_types[t] ?? null,
                  key: `workbook.work_types.${t}`,
                }))}
              />
            </div>
            <div>
              <p className="eyebrow mb-2">Incomplete closeout by work type</p>
              <CountRow
                entries={WORK_TYPES.filter((t) => totals.incomplete.by_work_type[t] > 0 || (wb?.incomplete.by_work_type[t] ?? 0) > 0).map((t) => ({
                  label: t,
                  live: totals.incomplete.by_work_type[t],
                  fixture: wb?.incomplete.by_work_type[t] ?? null,
                  key: `workbook.incomplete.by_work_type.${t}`,
                }))}
              />
            </div>
            <div>
              <p className="eyebrow mb-2">Package artefacts over the same rows</p>
              <CountRow
                entries={[
                  { label: "causal links", live: totals.links, fixture: fx?.chains.links ?? null, key: "chains.links" },
                  { label: "explicit families", live: totals.families, fixture: fx?.families.list.length ?? null, key: "families.list" },
                  { label: "proof tests", live: totals.proof_tests.total, fixture: fx?.proof_tests.total ?? null, key: "proof_tests.total" },
                ]}
              />
              <p className="mt-2 text-[12px] text-ink-500">
                Links and families are package artefacts carried whole from the bundle. They are never computed on this surface, and a link states a
                shared degradation noun inside the window, never a cause.
              </p>
            </div>
            <div>
              <p className="eyebrow mb-2">Proof tests by class</p>
              <CountRow
                entries={TEST_CLASSES.map((c) => ({
                  label: TEST_CLASS_LABEL[c],
                  live: totals.proof_tests.by_class[c],
                  fixture: fx?.proof_tests.by_class[c] ?? null,
                  key: `proof_tests.by_class.${c}`,
                }))}
              />
            </div>
          </div>
        </div>
      </Panel>

      {/* Work orders by asset: the workbook key beside every recorded figure, one row per equipment tag. */}
      <Panel
        index={2}
        title="By asset"
        right={<span className="text-[12px] text-ink-500">tag order; nothing here ranks an asset</span>}
      >
        {assets.length > 0 ? (
          <>
            <div className="mt-4 overflow-x-auto">
              <table className="reg" data-component="fleet-failure-table">
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    <th scope="col">Work orders</th>
                    <th scope="col">Flagged</th>
                    <th scope="col">Breakdown kind</th>
                    <th scope="col">Unplanned h</th>
                    <th scope="col">Flagged h</th>
                    <th scope="col">Recorded cost</th>
                    <th scope="col">Incomplete</th>
                    <th scope="col">Package artefacts</th>
                  </tr>
                </thead>
                <tbody>
                  {assets.map((a) => (
                    <AssetRow key={a.tag} a={a} fx={fx} />
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[12px] text-ink-500">
              The grey figure in each cell is the harness key the recorded figure reconciles to; hover it for the key name. Flagged is the sum of the
              two breakdown kinds beside it. Recorded cost is the {COST_FIELD}. Links, family members and proof tests are counted from the package
              artefacts and carry no fixture key per asset.
            </p>
          </>
        ) : (
          <EmptyState
            className="mt-4"
            title="No equipment rows"
            explanation="The seed writes the eight assets of the corpus; none is present on this database, so no row is drawn."
          />
        )}
      </Panel>

      {/* Explicit families, fleet-wide: membership spans assets, so the list lives beside the fleet table. */}
      <section className="rise" style={stagger(3)} aria-labelledby="families-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="families-heading" className="text-[20px]">
            Explicit families
          </h2>
          <span className="text-[12px] text-ink-500">membership is a list, not a model output</span>
        </div>
        {families.length > 0 ? (
          <>
            <div className="mt-4">
              <FamilyList
                families={families}
                hrefFor={(wo) => {
                  const tag = member_tags[wo];
                  return tag ? `${ROUTE}/${encodeURIComponent(tag)}#${wo}` : `${ROUTE}#${wo}`;
                }}
              />
            </div>
            <p className="mt-3 text-[12px] text-ink-500">
              Each family carries the recorded root cause of every member and the basis it was drawn on, with its review status. A record outside a
              family stays outside it; nothing is inferred into membership on this surface.
            </p>
          </>
        ) : (
          <EmptyState
            className="mt-4"
            title="No family rows"
            explanation="Families are package artefacts written by the bundle at ingestion; this database carries none, so no membership is drawn."
          />
        )}
      </section>
    </div>
  );
}
