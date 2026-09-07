// The card one hotspot of a P&ID opens (blueprint 6.2 surface 4 and 6.4 TagCard; AC-CTX-02). It states what the
// sheet draws, in the sidecar's own words, and then only what a typed row of the seeded corpus already carries
// under that tag: the cause-and-effect row on the instrument tag with its effects, the datasheet cell whose value
// is the tag, and the work orders of the sheet's own asset whose narrative names it. A hotspot the sidecar bound to
// nothing says so and carries the reason it recorded.
//
// Nothing here is a citation of the drawing: the sheet is an image, `pdftotext -raw` extracts nothing from it, and
// the transcription is an agent's under review_status pending (D-12, ADR-007). Every typed row keeps the citation
// of the document it was read from, which is the cause-and-effect sheet or the datasheet, never the P&ID.
import Link from "next/link";
import type { Citation } from "@/contracts/generated/evidence_packet";
import { RELATED_WORK_ORDER_BASIS } from "@/db/queries/assets";
import type { PidSelection } from "@/db/queries/pid";
import type { PidSidecar } from "@/contracts/generated/asset";
import { CitationChip } from "./CitationChip";
import { cx } from "./cx";
import { EffectsRow } from "./EffectsRow";
import { EmptyState } from "./EmptyState";
import "./system.css";

export type PidHotspotPanelProps = {
  selection: PidSelection;
  provenance: PidSidecar["provenance"];
  /** Every span the typed rows cite, resolved to its 9.8 Citation; a row without one prints the span id. */
  citations: Record<string, Citation>;
  className?: string;
};

const AS_DRAWN = "As drawn on the sheet";
const UNBOUND_TITLE = "This hotspot binds to nothing";
const UNBOUND_NO_REASON = "The sidecar recorded no reason for the absent binding.";
const NOTHING_TYPED_TITLE = "No typed row of the seeded corpus carries this tag";
const NOTHING_TYPED_LINE =
  "The sheet draws the tag and the sidecar bound it, and no cause-and-effect row, datasheet cell or work order of the seeded corpus names it.";
const BASIS_PREFIX = "Transcription basis:";
const BASIS_LINE =
  "the sheet is a supplied image and carries no extractable text, so this reading comes from the sidecar and not from a span of the drawing.";
const INTERLOCK_ROWS = "Cause-and-effect rows";
const DATASHEET_PARAMS = "Datasheet parameters";
const WORK_ORDERS = "Work orders naming this tag";
const NO_SPAN = "no citation resolved";
const DRAWN_SETPOINT = "Drawn setpoint";
const NO_CHAIN = "in no chain of the frozen rule";

function Chip({ spanId, citations }: { spanId: string; citations: Record<string, Citation> }) {
  const citation = citations[spanId];
  return citation ? (
    <CitationChip citation={citation} compact />
  ) : (
    <span className="mono text-[11.5px] text-ink-500">
      {NO_SPAN} <span className="text-ink-700">{spanId}</span>
    </span>
  );
}

export function PidHotspotPanel({ selection, provenance, citations, className }: PidHotspotPanelProps) {
  const { hotspot: h, typed } = selection;
  return (
    <article className={cx("tagcard", className)} data-component="pid-hotspot-panel" data-hotspot={h.id} data-bound={h.bound_tag === null ? "false" : "true"}>
      <header className="tagcard-head">
        <span className="tagcard-tag">{h.bound_tag ?? h.as_drawn_text}</span>
        <span className="tag">{h.role}</span>
        {h.foreign ? (
          <span className="badge" data-tone="caveat">
            foreign tag
          </span>
        ) : null}
        <span className="mono text-[11.5px] text-ink-500">{h.id}</span>
      </header>

      <div>
        <p className="eyebrow mb-1">{AS_DRAWN}</p>
        <p className="m-0 text-[13.5px]">
          <span className="verbatim">{h.as_drawn_text}</span>
        </p>
        {h.drawn_setpoint === null ? null : (
          <p className="m-0 mt-1 text-[12.5px] text-ink-700">
            {DRAWN_SETPOINT} <span className="mono">{h.drawn_setpoint}</span>
          </p>
        )}
        <p className="m-0 mt-2 text-[12px] leading-snug text-caveat">
          {BASIS_PREFIX} {provenance.basis === "agent_transcription" ? "agent transcription" : "manual transcription"} by{" "}
          <span className="mono">{provenance.alias}</span> on <span className="mono">{provenance.date}</span>,{" "}
          {provenance.review_status === "pending" ? "review pending" : "reviewed"}; {BASIS_LINE}
        </p>
      </div>

      {typed === null ? (
        <EmptyState title={UNBOUND_TITLE} explanation={h.unbound_reason ?? UNBOUND_NO_REASON} />
      ) : typed.interlock_rows.length === 0 && typed.datasheet_params.length === 0 && typed.work_orders.length === 0 ? (
        <EmptyState title={NOTHING_TYPED_TITLE} explanation={NOTHING_TYPED_LINE} />
      ) : (
        <>
          {typed.instrument === null ? null : (
            <p className="m-0 text-[12.5px] text-ink-700">
              Typed as <span className="tag">{typed.instrument.role}</span> on{" "}
              <Link href={`/assets/${encodeURIComponent(typed.instrument.equipment_tag)}`} className="mono draw">
                {typed.instrument.equipment_tag}
              </Link>
            </p>
          )}

          {typed.interlock_rows.length > 0 ? (
            <div>
              <p className="eyebrow mb-2">{INTERLOCK_ROWS}</p>
              <ul className="idlist">
                {typed.interlock_rows.map((r) => (
                  <li key={r.id} className="grid gap-2">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="mono font-medium text-ink-900">{r.row_id}</span>
                      <span className="tag" data-tone={r.row_kind === "trip" ? "defect" : undefined}>
                        {r.row_kind}
                      </span>
                      <span className="text-[12.5px]">{r.initiator}</span>
                      <span className="mono text-[12.5px] text-ink-900">{r.setpoint_text}</span>
                      <span className="tag">
                        vote <span className="mono">{r.vote_cell_text}</span>
                      </span>
                      <Chip spanId={r.span_id} citations={citations} />
                    </span>
                    <EffectsRow rowId={r.row_id} effects={r.effects} basis={r.effects_basis} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {typed.datasheet_params.length > 0 ? (
            <div>
              <p className="eyebrow mb-2">{DATASHEET_PARAMS}</p>
              <ul className="idlist">
                {typed.datasheet_params.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="text-[12.5px] text-ink-700">{p.group}</span>
                    <span className="text-[12.5px] text-ink-900">{p.field}</span>
                    <span className="mono text-ink-900">
                      {p.value_text}
                      {p.unit === null ? null : <span className="text-ink-700"> {p.unit}</span>}
                    </span>
                    <Chip spanId={p.span_id} citations={citations} />
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {typed.work_orders.length > 0 ? (
            <div>
              <p className="eyebrow mb-2">{WORK_ORDERS}</p>
              <ul className="idlist">
                {typed.work_orders.map((w) => (
                  <li key={w.wo_number} className="grid gap-1">
                    <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="mono font-medium text-ink-900">{w.wo_number}</span>
                      <span className="text-[11.5px] text-ink-500">{w.chain_place ?? NO_CHAIN}</span>
                    </span>
                    <span className="max-w-[70ch] text-[12.5px] leading-snug text-ink-700">
                      <span className="verbatim">{w.root_cause}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <p className="m-0 mt-2 text-[11.5px] text-ink-500">{RELATED_WORK_ORDER_BASIS}</p>
            </div>
          ) : null}
        </>
      )}
    </article>
  );
}
