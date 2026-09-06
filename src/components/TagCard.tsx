// Blueprint 6.4 TagCard: the instrument tag's role, its typed cause-and-effect rows (setpoint and vote cell
// verbatim, the marked final elements), its related work orders with their chain place, and the datasheet limits of
// its equipment. Typed by InstrumentTag, InterlockRow and DatasheetParam (9.3); the chain place is the sentence
// the surface states from its chain data, never derived here.
import Link from "next/link";
import type { ReactNode } from "react";
import type { DatasheetParam, InstrumentTag, InterlockRow } from "@/contracts/generated/asset";
import type { Citation } from "@/contracts/generated/evidence_packet";
import { CitationChip } from "./CitationChip";
import { cx } from "./cx";
import { GlassPanel } from "./GlassPanel";
import "./system.css";

export type TagWorkOrder = {
  wo_number: string;
  /** Its place in a causal chain as the surface states it, or null when the record is in no chain. */
  chain_place: string | null;
  href?: string;
};

export type TagCardProps = {
  tag: InstrumentTag;
  rows: InterlockRow[];
  workOrders: TagWorkOrder[];
  limits: DatasheetParam[];
  equipmentHref?: string;
  /** The citation of a row on its sheet, when the surface resolves it; otherwise the page prints alone. */
  citationFor?: (row: InterlockRow) => Citation | undefined;
  drawerFor?: (citation: Citation) => ReactNode;
  className?: string;
};

export const ROLE_LABEL: Record<InstrumentTag["role"], string> = {
  initiator: "initiator",
  final_element: "final element",
  permissive: "permissive",
  control: "control",
  alarm: "alarm",
  relief: "relief",
  monitor: "monitor",
  unknown: "role not stated",
};
const ROWS = "Typed rows";
const NO_ROWS = "No cause-and-effect row names this tag.";
const WORK_ORDERS = "Related work orders";
const NO_WORK_ORDERS = "No work order names this tag.";
const LIMITS = "Datasheet limits";
const NO_LIMITS = "No datasheet limit is recorded for the equipment.";
const SOURCES = "sources";
const PAGE = "p.";

export function TagCard({ tag, rows, workOrders, limits, equipmentHref, citationFor, drawerFor, className }: TagCardProps) {
  return (
    <GlassPanel as="article" className={cx("tagcard", className)} data-component="tag-card" data-tag={tag.tag} aria-label={`Tag ${tag.tag}`}>
      <div className="tagcard-head">
        <span className="tagcard-tag">{tag.tag}</span>
        <span className="tag" data-tone="accent">
          {ROLE_LABEL[tag.role]}
        </span>
        {equipmentHref ? (
          <Link href={equipmentHref} className="mono draw text-[13px]">
            {tag.equipment_tag}
          </Link>
        ) : (
          <span className="mono text-[13px]">{tag.equipment_tag}</span>
        )}
        <span className="mono text-[12px] text-ink-500">
          {tag.sources.length} {SOURCES}
        </span>
      </div>

      <div>
        <p className="eyebrow mb-1">{ROWS}</p>
        {rows.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="reg">
              <thead>
                <tr>
                  <th scope="col">Row</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Initiator</th>
                  <th scope="col">Setpoint</th>
                  <th scope="col">Vote</th>
                  <th scope="col">Final elements</th>
                  <th scope="col">Source</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const citation = citationFor?.(row);
                  const marked = row.effects.filter((e) => e.marked);
                  return (
                    <tr key={row.id} data-row={row.row_id}>
                      <td className="mono font-medium text-ink-900">{row.row_id}</td>
                      <td>
                        <span className="tag" data-tone={row.row_kind === "trip" ? "defect" : row.row_kind === "alarm" ? "caveat" : undefined}>
                          {row.row_kind}
                        </span>
                      </td>
                      <td>{row.initiator}</td>
                      <td className="mono">
                        <span className="verbatim">{row.setpoint_text}</span>
                      </td>
                      <td className="mono">{row.vote_cell_text ? <span className="verbatim">{row.vote_cell_text}</span> : null}</td>
                      <td>
                        {marked.length > 0 ? (
                          <span className="flex flex-wrap gap-1">
                            {marked.map((e) => (
                              <span key={e.effect_id} className="tag">
                                {e.effect_id} {e.final_element}
                              </span>
                            ))}
                          </span>
                        ) : (
                          <span className="text-ink-500">none marked</span>
                        )}
                      </td>
                      <td>
                        {citation ? (
                          <CitationChip citation={citation} compact>
                            {drawerFor?.(citation)}
                          </CitationChip>
                        ) : (
                          <span className="mono">
                            {PAGE} {row.source_page}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="m-0 text-[12.5px] text-ink-700">{NO_ROWS}</p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <p className="eyebrow mb-1">{WORK_ORDERS}</p>
          {workOrders.length > 0 ? (
            <ul className="wolist">
              {workOrders.map((wo) => (
                <li key={wo.wo_number}>
                  {wo.href ? (
                    <Link href={wo.href} className="mono draw">
                      {wo.wo_number}
                    </Link>
                  ) : (
                    <span className="mono">{wo.wo_number}</span>
                  )}
                  {wo.chain_place ? (
                    <span className="tag" data-tone="accent">
                      {wo.chain_place}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="m-0 text-[12.5px] text-ink-700">{NO_WORK_ORDERS}</p>
          )}
        </div>
        <div>
          <p className="eyebrow mb-1">{LIMITS}</p>
          {limits.length > 0 ? (
            <dl className="fields">
              {limits.map((l) => (
                <div key={l.id} className="contents">
                  <dt>
                    {l.group} · {l.field}
                  </dt>
                  <dd className="mono" data-span={l.span_id}>
                    {l.value_text}
                    {l.unit ? <span className="text-ink-500"> {l.unit}</span> : null}
                  </dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="m-0 text-[12.5px] text-ink-700">{NO_LIMITS}</p>
          )}
        </div>
      </div>
    </GlassPanel>
  );
}
