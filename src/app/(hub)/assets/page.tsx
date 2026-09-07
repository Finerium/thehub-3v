// Assets, the fleet register (blueprint 6.2 surface 5, first screen; AC-CTX-01; register dense-operational, 7.2).
// Eight rows joined on the tag: the criticality the datasheet states with the workbook's own value beside it, the
// interlock_ref verbatim, and the unplanned and breakdown-flagged hours of the failure_event rows reconciled
// against the workbook slice of fixtures.json. Every figure is read at request time from equipment, area,
// interlock, work_order, failure_event, opl and integrity_finding rows (src/db/queries/assets.ts); nothing here is
// typed, ranked or predicted, and no line aggregates by person (Case 1).
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";
import { requireSession } from "@/auth/session";
import { CaveatLine } from "@/components/CaveatLine";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { GlassPanel } from "@/components/GlassPanel";
import { VersionBadge } from "@/components/VersionBadge";
import { readFleet, reconciled, type Fleet, type FleetRow } from "@/db/queries/assets";
import { hoursText } from "@/db/queries/coverage";
import { activeVersion } from "@/db/versions";
import { log } from "@/lib/log";

export const metadata: Metadata = { title: "Assets" };

// Every figure binds to the seeded database at request time (blueprint 10.3); nothing is prerendered.
export const dynamic = "force-dynamic";

const DIGEST_PREFIX = 8;

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

const LOGIC_KIND_LABEL = { trip_logic: "trip logic", control_loop_only: "control loop only" } as const;

function Criticality({ row }: { row: FleetRow }) {
  const { criticality_datasheet: sheet, criticality_workbook: book } = row.equipment;
  const agree = sheet === book;
  return (
    <span className="flex flex-col gap-1">
      <span className="font-medium whitespace-nowrap text-ink-900">{sheet}</span>
      <span className="text-[11.5px] text-ink-500">
        workbook <span className={agree ? "whitespace-nowrap text-ink-700" : "whitespace-nowrap text-defect"}>{book}</span>
        {agree ? null : " differs"}
      </span>
    </span>
  );
}

// The workbook column: the two recorded hours against the fixture's own counts for the same asset. A difference is
// stated with both figures, never smoothed over; without a fixture the column says the file is not readable here.
function Reconciliation({ row }: { row: FleetRow }) {
  const verdict = reconciled(row);
  if (verdict === null) return <span className="text-[11.5px] text-ink-500">no fixture here</span>;
  if (verdict) {
    return (
      <span className="badge" data-tone="verified" title={`workbook: ${hoursText(row.workbook?.unplanned_h ?? 0)} unplanned, ${hoursText(row.workbook?.flagged_h ?? 0)} flagged, ${row.workbook?.work_orders ?? 0} records`}>
        reconciled
      </span>
    );
  }
  return (
    <span className="flex flex-col gap-1">
      <span className="badge" data-tone="defect">
        differs
      </span>
      <span className="mono text-[11px] text-defect">
        workbook {hoursText(row.workbook?.unplanned_h ?? 0)} / {hoursText(row.workbook?.flagged_h ?? 0)} / {row.workbook?.work_orders ?? 0}
      </span>
    </span>
  );
}

function Register({ fleet }: { fleet: Fleet }) {
  return (
    <div className="overflow-x-auto">
      <table className="reg">
        <colgroup>
          <col style={{ width: "22%" }} />
          <col style={{ width: "16%" }} />
          <col style={{ width: "12%" }} />
          <col style={{ width: "14%" }} />
          <col span={4} style={{ width: "6%" }} />
          <col style={{ width: "10%" }} />
          <col span={2} style={{ width: "5%" }} />
        </colgroup>
        <caption className="sr-only">
          The eight assets of the corpus with the criticality of the datasheet and of the workbook, the LOGIC No the
          cause-and-effect sheet states, the recorded work orders and downtime, and the workbook reconciliation.
        </caption>
        <thead>
          <tr>
            <th scope="col">Tag and equipment</th>
            <th scope="col">Area</th>
            <th scope="col">Criticality</th>
            <th scope="col">LOGIC No</th>
            <th scope="col" className="num">
              Records
            </th>
            <th scope="col" className="num">
              Unplanned
              <br />
              rows
            </th>
            <th scope="col" className="num">
              Unplanned
              <br />
              hours
            </th>
            <th scope="col" className="num">
              Flagged
              <br />
              hours
            </th>
            <th scope="col">Workbook</th>
            <th scope="col" className="num">
              Lessons
            </th>
            <th scope="col" className="num">
              Findings
            </th>
          </tr>
        </thead>
        <tbody>
          {fleet.rows.map((row) => {
            const e = row.equipment;
            return (
              <tr key={e.tag} id={e.tag}>
                <td>
                  <Link href={`/assets/${encodeURIComponent(e.tag)}`} className="mono draw text-[14px] font-medium text-ink-900">
                    {e.tag}
                  </Link>
                  <span className="mt-0.5 block text-[12px] text-ink-700">{e.name}</span>
                  <span className="mt-0.5 block max-w-[36ch] text-[11.5px] leading-snug text-ink-500">{e.service}</span>
                </td>
                <td>
                  <span className="mono text-ink-900">{e.area_code}</span>
                  <span className="mt-0.5 block max-w-[22ch] text-[11.5px] leading-snug text-ink-500">{row.area_workbook_name}</span>
                </td>
                <td>
                  <Criticality row={row} />
                </td>
                <td>
                  <span className="mono verbatim text-ink-900">{e.interlock_ref}</span>
                  {row.interlock ? (
                    <span className="mt-1 block text-[11.5px] text-ink-500">
                      {LOGIC_KIND_LABEL[row.interlock.logic_kind]}
                      {row.interlock.sil_sheet === null ? ", no SIL on the sheet" : `, SIL ${row.interlock.sil_sheet}`}
                    </span>
                  ) : (
                    <span className="mt-1 block text-[11.5px] text-ink-500">no cause-and-effect sheet bound</span>
                  )}
                </td>
                <td className="num">{row.work_orders}</td>
                <td className="num">{row.unplanned_rows}</td>
                <td className="num">{row.unplanned_hours.toFixed(1)}</td>
                <td className="num">{row.flagged_hours.toFixed(1)}</td>
                <td>
                  <Reconciliation row={row} />
                </td>
                <td className="num">
                  <Link href={`/assets/${encodeURIComponent(e.tag)}#lessons`} className="draw">
                    {row.lessons}
                  </Link>
                </td>
                <td className="num">
                  {row.open_findings > 0 ? (
                    <Link href={`/integrity?asset=${encodeURIComponent(e.tag)}`} className="draw text-defect">
                      {row.open_findings}
                    </Link>
                  ) : (
                    <span className="text-ink-500">0</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={4}>
              {fleet.totals.assets} assets in {fleet.totals.areas} areas
            </td>
            <td className="num">{fleet.totals.work_orders}</td>
            <td className="num">{fleet.rows.reduce((s, r) => s + r.unplanned_rows, 0)}</td>
            <td className="num">{fleet.totals.unplanned_hours.toFixed(1)}</td>
            <td className="num">{fleet.totals.flagged_hours.toFixed(1)}</td>
            <td colSpan={3} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export default async function AssetsPage() {
  await requireSession();

  let fleet: Fleet;
  let version: Awaited<ReturnType<typeof activeVersion>>;
  try {
    [fleet, version] = await Promise.all([readFleet(), activeVersion()]);
  } catch (error) {
    log.error({ event: "assets.fleet_read_failed", route: "/assets", message: error instanceof Error ? error.message : String(error) });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="The fleet register joins the equipment, area, interlock, work-order and failure-event rows at request time. The read failed, so no line is shown in their place."
        next={{ href: "/", label: "Back to Home" }}
      />
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <p className="eyebrow">Surface 05 · Assets</p>
          <h1 className="mt-1 text-[34px]">Fleet register</h1>
          <p className="mt-2 max-w-[70ch] text-[13.5px] leading-snug text-ink-700">
            One line per asset of the corpus, joined on the tag. Criticality is the value the datasheet carries with
            the maintenance workbook&apos;s own value beside it; the LOGIC No is the cause-and-effect sheet&apos;s line
            verbatim; the hours are recorded downtime of the failure records, reconciled against the workbook.
          </p>
        </div>
        {version ? <VersionBadge label={version.label} digestPrefix={version.corpus_sha256.slice(0, DIGEST_PREFIX)} active={version.is_active} /> : null}
      </header>

      <GlassPanel className="rise p-6" aria-labelledby="register-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2" style={stagger(1)}>
          <h2 id="register-heading" className="text-[20px]">
            The eight assets
          </h2>
          <p className="text-[12px] text-ink-500">
            <span className="mono">{fleet.totals.documents}</span> documents carry one of these tags as their subject,{" "}
            <span className="mono">{fleet.rows.reduce((s, r) => s + r.lessons, 0)}</span> of them lessons.
          </p>
        </div>
        {fleet.rows.length > 0 ? (
          <div className="mt-4">
            <Register fleet={fleet} />
          </div>
        ) : (
          <EmptyState
            className="mt-4"
            title="No equipment row is seeded"
            explanation="The register reads the equipment table of the active corpus version. This deployment carries no row, so no asset line can be drawn."
            action={{ href: "/admin", label: "Corpus versions" }}
          />
        )}
      </GlassPanel>

      <GlassPanel className="rise p-6" aria-labelledby="binding-heading">
        <h2 id="binding-heading" className="text-[20px]" style={stagger(2)}>
          What each column is read from
        </h2>
        <dl className="fields mt-3 max-w-[92ch]">
          <dt>Criticality</dt>
          <dd>
            <span className="mono">equipment.criticality_datasheet</span> from the datasheet header, with{" "}
            <span className="mono">criticality_workbook</span> from the maintenance workbook beside it. The two are
            shown separately because a difference is a finding, not a value to choose between.
          </dd>
          <dt>LOGIC No</dt>
          <dd>
            <span className="mono">equipment.interlock_ref</span> verbatim, with the kind and the SIL the
            cause-and-effect sheet itself states. An asset whose sheet is a control loop carries no SIL.
          </dd>
          <dt>Records and hours</dt>
          <dd>
            Work orders counted from <span className="mono">work_order</span>; the hours are recorded downtime summed
            over the <span className="mono">failure_event</span> rows, unplanned alone and every breakdown-flagged row.
            No hour is estimated and none is attributed to a person.
          </dd>
          <dt>Workbook</dt>
          <dd>
            {fleet.fixture_available ? (
              <>
                The <span className="mono">equipment_master</span> row of{" "}
                <span className="mono">fixtures.json</span>, recomputed by the harness from the same workbook.
                &quot;reconciled&quot; means the unplanned hours, the flagged hours, the record count and the
                workbook criticality all match this line. The LOGIC No is printed verbatim beside them and is not
                part of the claim: the workbook records none for an asset whose sheet is a control loop.
              </>
            ) : (
              "The fixture is not readable on this runtime, so no reconciliation is claimed for any line."
            )}
          </dd>
          <dt>Lessons and findings</dt>
          <dd>
            One Point Lessons bound to the asset, and the integrity findings open against the asset&apos;s own
            documents. Findings link into the register filtered by the asset; neither number is a score.
          </dd>
        </dl>
        {fleet.fixture_available ? null : (
          <DesignedState
            inline
            className="mt-4"
            tone="caveat"
            title="No workbook fixture on this runtime"
            explanation="The register prints the figures it read from the database and claims no reconciliation, rather than showing a number the fixture did not supply."
            reason="fixtures.json: equipment_master not readable"
          />
        )}
        <CaveatLine kind="as_built" className="mt-4" />
      </GlassPanel>
    </div>
  );
}
