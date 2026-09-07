// The operational-context panel of PRD FR-114 (blueprint 6.2 surfaces 5 and 6; AC-CTX-05), in the
// dense-operational register of 7.2 and the Drafting-ink tokens of 7.1. It carries four readings of the plant's
// own records and nothing else: the breakdown split with its recorded downtime and recorded maintenance cost, the
// notification lead time from Report_Date to Start_Date, the protective function the cause-and-effect sheet types
// for the asset, and the demand history, which is stated as not recorded rather than as none and carries the
// demands The Hub infers from the initiator tag the narrative names, each labelled as the inference it is.
//
// Every figure arrives typed from src/db/queries/operational-context.ts and is printed beside the fixture key it
// reconciles to (blueprint 10.5, AC-VIS-04); the fixture value sits in the DOM under `data-fixture-key`, so the
// binding of a displayed number is readable without the page. Nothing here is typed into the component, and an
// absent figure says so rather than printing a zero.
import Link from "next/link";
import type { ReactNode } from "react";
import { hoursText, idrText } from "@/db/queries/coverage";
import { FULL_DAY_HOURS, type InferredDemand, type LeadTime, type OperationalContext } from "@/db/queries/operational-context";
import { CaveatLine } from "./CaveatLine";
import { cx } from "./cx";
import { GlassPanel } from "./GlassPanel";
import { VersionBadge } from "./VersionBadge";
import "./system.css";

const DIGEST_PREFIX = 8;
const NOT_RECORDED = "not recorded";
const NO_RECORD = "no record";

/** The workbook's own spelling of each narrative field, for the line a demand was read from. */
const FIELD_LABEL: Record<InferredDemand["field"], string> = {
  problem_description: "Problem_Description",
  root_cause: "Root_Cause",
  corrective_action: "Corrective_Action",
  remarks: "Remarks",
};

const KIND_LABEL = { unplanned: "unplanned", planned_flagged: "planned, flagged as a breakdown" } as const;
const FULL_DAY_LABEL = `${FULL_DAY_HOURS} h or more`;

const countText = (n: number): string => String(n);
const shareText = (part: number, whole: number): string => (whole === 0 ? NOT_RECORDED : `${((part / whole) * 100).toFixed(1)} percent`);

export type OperationalContextPanelProps = {
  context: OperationalContext;
  /** Builds a work-order href for a demand row; omitted, the ids print without links. */
  hrefFor?: (wo: string) => string;
  className?: string;
};

/** A live figure with the fixture value it reconciles to; the two are compared as they print, never as floats. */
function Reconciled({ live, fixture, fixtureKey, format }: { live: number; fixture: number | null; fixtureKey: string; format?: (n: number) => string }) {
  const fmt = format ?? countText;
  const shown = fmt(live);
  const expected = fixture === null ? null : fmt(fixture);
  const differs = expected !== null && expected !== shown;
  return (
    <span className="inline-flex flex-wrap items-baseline gap-x-1.5" data-fixture-key={fixtureKey} data-fixture-value={expected ?? undefined}>
      <span className={differs ? "mono font-medium text-defect" : "mono font-medium text-ink-900"}>{shown}</span>
      {expected === null ? (
        <span className="text-[11.5px] text-ink-500">no key</span>
      ) : (
        <span className="mono text-[11.5px] text-ink-500" title={fixtureKey}>
          {expected}
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

function Block({ id, title, note, children }: { id: string; title: string; note?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-t border-edge pt-4" data-block={id} aria-labelledby={`opctx-${id}`}>
      <div className="blockhead">
        <h3 id={`opctx-${id}`}>{title}</h3>
        {note ? <span className="text-[12px] text-ink-500">{note}</span> : null}
      </div>
      {children}
    </section>
  );
}

/** The lead-time reading of one record set: the median, the full-day bucket and the range the records hold. */
function LeadTimeLine({ lead, fixture }: { lead: LeadTime; fixture: { median_h: number; at_least_24h: number; records: number } | null }) {
  if (lead.records === 0) return <span className="text-[12.5px] text-ink-500">{NOT_RECORDED}</span>;
  return (
    <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[12.5px]">
      <span className="inline-flex items-baseline gap-x-1.5">
        <span className="text-ink-500">median</span>
        {lead.median_h === null ? (
          <span className="text-ink-500">{NOT_RECORDED}</span>
        ) : (
          <Reconciled live={lead.median_h} fixture={fixture?.median_h ?? null} fixtureKey="workbook.lead_time.median_h" format={hoursText} />
        )}
      </span>
      <span className="inline-flex items-baseline gap-x-1.5">
        <Reconciled live={lead.at_least_24h} fixture={fixture?.at_least_24h ?? null} fixtureKey="workbook.lead_time.at_least_24h" />
        <span className="inline-flex flex-wrap items-baseline gap-x-1.5 text-ink-500">
          of{" "}
          {fixture === null ? (
            <span className="mono text-ink-700">{lead.records}</span>
          ) : (
            <Reconciled live={lead.records} fixture={fixture.records} fixtureKey="workbook.rows" />
          )}
          <span>
            at {FULL_DAY_LABEL}, {shareText(lead.at_least_24h, lead.records)}
          </span>
        </span>
      </span>
      {lead.min_h !== null && lead.max_h !== null ? (
        <span className="text-ink-500">
          range <span className="mono text-ink-700">{hoursText(lead.min_h)}</span> to <span className="mono text-ink-700">{hoursText(lead.max_h)}</span>
        </span>
      ) : null}
    </span>
  );
}

function Demand({ demand, seqId, ceDocNo, hrefFor }: { demand: InferredDemand; seqId: string; ceDocNo: string; hrefFor?: (wo: string) => string }) {
  const href = hrefFor?.(demand.wo_number);
  return (
    <li className="flex flex-col gap-1.5 border-l-2 border-edge pl-3" data-demand={demand.wo_number}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px]">
        {href ? (
          <Link href={href} className="mono draw font-medium text-ink-900">
            {demand.wo_number}
          </Link>
        ) : (
          <span className="mono font-medium text-ink-900">{demand.wo_number}</span>
        )}
        <span className="mono text-ink-500">{demand.report_date.slice(0, 10)}</span>
        <span className="tag" data-tone="caveat">
          inference
        </span>
        <span className="text-ink-700">
          resolved by <span className="mono text-ink-900">{demand.initiator_tag}</span>, row <span className="mono text-ink-900">{demand.row_id}</span>
        </span>
      </div>
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[12.5px] leading-snug">
        <span className="eyebrow shrink-0">{FIELD_LABEL[demand.field]}</span>
        <span className="verbatim text-ink-700">{demand.field_text}</span>
      </p>
      <p className="m-0 max-w-prose text-[11.5px] leading-snug text-ink-500">
        Basis: this record leaves Related_Interlock empty, the field above names {demand.initiator_tag}, which row {demand.row_id} of {ceDocNo} types as a
        trip initiator of {seqId}, and the same field states a trip. The link is The Hub&apos;s inference, not the plant&apos;s record.
      </p>
    </li>
  );
}

export function OperationalContextPanel({ context, hrefFor, className }: OperationalContextPanelProps) {
  const { asset, fleet, demands, findings, fixture, protective_function: pf } = context;
  const fleetFixture = fixture
    ? { median_h: fixture.workbook.lead_time.median_h, at_least_24h: fixture.workbook.lead_time.at_least_24h, records: fixture.workbook.rows }
    : null;
  const kinds = [
    {
      kind: "unplanned" as const,
      onAsset: asset.unplanned,
      onFleet: fleet.unplanned,
      fixtureRows: fixture?.populations.unplanned_breakdowns ?? null,
      rowsKey: "populations.unplanned_breakdowns",
      hoursKey: "workbook.breakdown_kinds.unplanned.hours",
      costKey: "workbook.breakdown_kinds.unplanned.cost_idr",
      fixtureHours: fixture?.workbook.breakdown_kinds.unplanned.hours ?? null,
      fixtureCost: fixture?.workbook.breakdown_kinds.unplanned.cost_idr ?? null,
    },
    {
      kind: "planned_flagged" as const,
      onAsset: asset.planned_flagged,
      onFleet: fleet.planned_flagged,
      fixtureRows: fixture?.populations.planned_flagged ?? null,
      rowsKey: "populations.planned_flagged",
      hoursKey: "workbook.breakdown_kinds.planned_flagged.hours",
      costKey: "workbook.breakdown_kinds.planned_flagged.cost_idr",
      fixtureHours: fixture?.workbook.breakdown_kinds.planned_flagged.hours ?? null,
      fixtureCost: fixture?.workbook.breakdown_kinds.planned_flagged.cost_idr ?? null,
    },
  ];

  return (
    <GlassPanel
      id="operational-context"
      className={cx("p-6", className)}
      aria-labelledby="operational-context-heading"
      data-component="operational-context"
      data-tag={context.tag}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="operational-context-heading" className="text-[20px]">
          Operational context
        </h2>
        <span className="text-[12px] text-ink-500">built from the records the plant already writes</span>
      </div>
      <p className="mt-2 max-w-prose text-[13px] text-ink-700">
        The breakdown split, the notification lead time, the protective function and the demand history of{" "}
        <span className="mono text-ink-900">{context.tag}</span>, each read from the seeded rows at request time and printed beside the harness key it
        reconciles to. No reading here is a prediction and none of them is a rate.
      </p>

      <div className="mt-5 grid gap-6 xl:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Block id="breakdown-split" title="Breakdown split" note="failure_event rows by their recorded flag">
            <div className="overflow-x-auto">
              <table className="reg" data-component="breakdown-split">
                <thead>
                  <tr>
                    <th scope="col">Kind</th>
                    <th scope="col">Records on this asset</th>
                    <th scope="col">Recorded downtime</th>
                    <th scope="col">Recorded cost</th>
                    <th scope="col">Across the fleet</th>
                  </tr>
                </thead>
                <tbody>
                  {kinds.map((k) => (
                    <tr key={k.kind}>
                      <th scope="row" className="whitespace-nowrap">
                        <span className="tag" data-tone={k.kind === "unplanned" ? "defect" : "caveat"}>
                          {KIND_LABEL[k.kind]}
                        </span>
                      </th>
                      <td className="mono whitespace-nowrap text-ink-900">{k.onAsset.rows}</td>
                      <td className="mono whitespace-nowrap">{k.onAsset.rows === 0 ? <span className="text-ink-500">{NO_RECORD}</span> : hoursText(k.onAsset.hours)}</td>
                      <td className="mono whitespace-nowrap">{k.onAsset.rows === 0 ? <span className="text-ink-500">{NO_RECORD}</span> : idrText(k.onAsset.cost_idr)}</td>
                      <td className="whitespace-nowrap">
                        <Reconciled live={k.onFleet.rows} fixture={k.fixtureRows} fixtureKey={k.rowsKey} />
                        <span className="mt-0.5 block text-[11.5px] text-ink-500">
                          <Reconciled live={k.onFleet.hours} fixture={k.fixtureHours} fixtureKey={k.hoursKey} format={hoursText} />{" "}
                          <Reconciled live={k.onFleet.cost_idr} fixture={k.fixtureCost} fixtureKey={k.costKey} format={idrText} />
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="max-w-prose text-[12px] text-ink-500">
              Recorded cost is the workbook&apos;s own labour plus material on the flagged records; a record that left the field empty contributes
              nothing to it and is listed by its closeout chip instead.
            </p>
          </Block>

          <Block id="lead-time" title="Notification lead time" note="Report_Date to Start_Date, as the workbook records it">
            <dl className="fields">
              <dt>This asset</dt>
              <dd>
                <LeadTimeLine lead={asset.lead_time} fixture={null} />
              </dd>
              <dt>Across the fleet</dt>
              <dd>
                <LeadTimeLine lead={fleet.lead_time} fixture={fleetFixture} />
              </dd>
            </dl>
            <p className="max-w-prose text-[12px] text-ink-500">
              The median is the records&apos; own middle value, not a mean, and the bucket counts the records reported a full day or more before work
              started. A long lead is not a failure and a short one is not a fault: the figure is the plant&apos;s notification habit, shown so a
              reader can see it.
            </p>
          </Block>
        </div>

        <div className="flex flex-col gap-6">
          <Block id="protective-function" title="Protective function" note="read from the cause-and-effect sheet, never from the tag number">
            {pf === null ? (
              <>
                <p className="m-0 max-w-prose text-[13px] text-ink-900" data-state="no-protective-function">
                  No protective function is recorded for this asset.
                </p>
                <p className="m-0 max-w-prose text-[12.5px] text-ink-700">
                  Its cause-and-effect sheet <span className="mono">{context.ce_doc_no}</span> types a control loop and no LOGIC No, and the equipment
                  record reads <span className="verbatim">{context.interlock_ref}</span>. The relation is read from the sheet itself; no sequence id is
                  derived from an equipment tag anywhere in this product.
                </p>
              </>
            ) : (
              <>
                <dl className="fields">
                  <dt>LOGIC No</dt>
                  <dd className="mono">{pf.seq_id}</dd>
                  <dt>SIL on the sheet</dt>
                  <dd>{pf.sil_sheet === null ? <span className="text-ink-500">{NOT_RECORDED}</span> : <span className="mono">SIL {pf.sil_sheet}</span>}</dd>
                  <dt>Cause-and-effect sheet</dt>
                  <dd>
                    <span className="mono">{pf.ce_doc_no}</span> <span className="text-ink-500">revision</span> <span className="mono">{pf.ce_revision}</span>
                  </dd>
                  <dt>Equipment record</dt>
                  <dd>
                    <span className="verbatim">{context.interlock_ref}</span>
                  </dd>
                </dl>
                {pf.initiators.length > 0 ? (
                  <ul className="m-0 flex list-none flex-col gap-1.5 p-0">
                    {pf.initiators.map((i) => (
                      <li key={i.row_id} className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 text-[12.5px]">
                        <span className="tag" data-tone="accent">
                          {i.row_id}
                        </span>
                        <span className="mono text-ink-900">{i.instrument_tag}</span>
                        <span className="verbatim text-ink-700">{i.initiator}</span>
                        <span className="mono text-ink-900">{i.setpoint_text}</span>
                        {i.voting === null ? null : <span className="tag">{i.voting}</span>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="m-0 text-[12.5px] text-ink-500">The sheet types no trip row for this function.</p>
                )}
                <CaveatLine kind="as_built" />
              </>
            )}
          </Block>

          <Block id="demand-history" title="Demand history" note="stated as not recorded, never as none">
            <p className="m-0 max-w-prose text-[13px] text-ink-900" data-state="demand-history-not-recorded">
              Demand history is {NOT_RECORDED}.
            </p>
            <p className="m-0 max-w-prose text-[12.5px] text-ink-700">
              Related_Interlock is one of the eleven outcome fields the CD-4 rule finds empty:{" "}
              <span className="mono text-ink-900">{demands.empty_related_interlock}</span> of this asset&apos;s{" "}
              <span className="mono text-ink-900">{demands.records}</span> records leave it blank, so no record types the function it demanded. The
              absence is stated as an absence; it is not read as a function that was never demanded.
            </p>
            {pf === null ? (
              <p className="m-0 max-w-prose text-[12.5px] text-ink-500">
                No protective function is recorded for this asset, so no demand is inferred against one either.
              </p>
            ) : demands.inferred.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-3 p-0" data-component="inferred-demands">
                {demands.inferred.map((d) => (
                  <Demand key={d.wo_number} demand={d} seqId={pf.seq_id} ceDocNo={pf.ce_doc_no} hrefFor={hrefFor} />
                ))}
              </ul>
            ) : (
              <p className="m-0 max-w-prose text-[12.5px] text-ink-500">
                No record of this asset states a trip beside a trip initiator of {pf.seq_id}, so no demand is inferred for it.
              </p>
            )}
          </Block>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-edge pt-4" data-block="open-findings">
        <span className="eyebrow">Integrity findings open against this asset</span>
        <span className="mono text-[13px] font-medium text-ink-900">{findings.total}</span>
        {findings.by_rule.map((r) => (
          <Link key={r.rule_id} href={`/integrity?rule=${encodeURIComponent(r.rule_id)}`} className="chip text-[12px]">
            <span className="mono text-ink-900">{r.rule_id}</span>
            {r.rule ? <span className="text-ink-700">{r.rule}</span> : null}
            <span className="mono text-ink-500">{r.n}</span>
          </Link>
        ))}
        {findings.version === null ? (
          <span className="text-[12px] text-ink-500">No corpus version visible to this session carries the register, so no finding is counted.</span>
        ) : (
          <VersionBadge
            label={findings.version.label}
            digestPrefix={findings.version.corpus_sha256.slice(0, DIGEST_PREFIX)}
            active={findings.version.is_active}
          />
        )}
      </div>
    </GlassPanel>
  );
}
