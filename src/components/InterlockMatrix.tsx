// Blueprint 6.2 surface 5 and 6.4, AC-CTX-03: one cause-and-effect sheet drawn as the matrix it is. The sheet's
// LOGIC No with the SIL it states as a badge, its start permissives as their AND gate, its typed rows down the
// side, the effect columns across the top with their final elements, the X the sheet marks in each cell, and the
// sheet's own notes with the citation that opens the page they came from.
//
// Two rules this component exists to keep. A sheet that types a control loop states no LOGIC No and no SIL: it
// renders as a control loop, never as a trip with a missing SIL, and its rows carry no voting because voting is a
// SIF architecture that a control, alarm or relief row does not have. And where the Integrity Register raised the
// trip-boilerplate rule against such a sheet, the sheet's own trip wording is shown as that finding, in place,
// beside the note that carries it, rather than only in a register somewhere else.
//
// Everything rendered here is read from the seeded rows the caller passes (src/db/queries/interlock.ts): the marks,
// the setpoints, the vote cells and the notes are the sheet's words, and nothing on this surface is typed, ranked
// or paraphrased.
import Link from "next/link";
import type { Interlock, InterlockRow, StartPermissive } from "@/contracts/generated/asset";
import type { Citation } from "@/contracts/generated/evidence_packet";
import type { Finding } from "@/db/queries/documents-view";
import { CitationChip } from "./CitationChip";
import { cx } from "./cx";
import { PermissiveGate } from "./PermissiveGate";
import "./system.css";

export type InterlockMatrixProps = {
  interlock: Interlock;
  rows: InterlockRow[];
  permissives: StartPermissive[];
  /** What the sheet files its permissives under: its LOGIC No, or the tag on a sheet that states none. */
  permissiveKey: string;
  /** Citations by span id for the rows, the permissives and the notes of this sheet. */
  citations: Record<string, Citation>;
  /** The cause-and-effect document, when the visitor may open it; without it the doc_no prints unlinked. */
  ceDocumentId?: string | null;
  /** The open trip-boilerplate finding the register raised against this sheet (CD-17), where there is one. */
  finding?: Finding | null;
  className?: string;
};

const LOGIC_KIND_LABEL: Record<Interlock["logic_kind"], string> = {
  trip_logic: "trip logic",
  control_loop_only: "control loop only",
};
const ROW_KIND_TONE: Partial<Record<InterlockRow["row_kind"], string>> = { trip: "defect", alarm: "caveat" };

const NO_LOGIC_NO = "no LOGIC No on the sheet";
const NO_SIL = "no SIL stated on the sheet";
const SIL_ON_SHEET = "on the sheet";
const REVISION = "rev";
const PERMISSIVES = "Start permissives";
const PERMISSIVES_BY_TAG = "The sheet states no LOGIC No, so its permissive block is filed under the equipment tag.";
const NO_PERMISSIVE = "The sheet lists no start permissive for this function.";
const ROWS_HEAD = ["Row", "Kind", "Initiator", "Instrument tag", "Setpoint", "Vote cell"] as const;
const SOURCE = "Source";
const NO_RULE_NAME = "rule name not recorded";
const NO_ROWS = "The sheet types no row.";
const ACTUATED = "actuated";
const NOT_ACTUATED = "not actuated";
const NOT_ON_ROW = "column not on this row";
const NOT_VOTED = "not a voted trip row";
const NO_SPAN = "no span resolved";
const NOTES = "Sheet notes";
const BASIS = "Effects basis";
const TRAINING_VALUES = "training values";
const MARK = "X";
const UNMARKED = "·";

/** Blueprint 6.3: the note of a cause-and-effect sheet that declares its setpoints training values. */
const TRAINING_VALUES_NOTE = /training value/i;

/** The sheet's effect columns, in the order its rows print them; every row carries the whole column list (9.3). */
export function effectColumns(rows: readonly InterlockRow[]): Array<{ effect_id: string; final_element: string }> {
  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const effect of row.effects) if (!seen.has(effect.effect_id)) seen.set(effect.effect_id, effect.final_element);
  }
  return [...seen].map(([effect_id, final_element]) => ({ effect_id, final_element }));
}

/**
 * The phrases the register recorded as this sheet's trip boilerplate, from the finding's own item. A note is shown
 * as the finding when it carries one of them; nothing here decides on its own what boilerplate is.
 */
function boilerplatePhrases(finding: Finding | null | undefined): string[] {
  const recorded: unknown = finding?.item?.boilerplate;
  const list: unknown[] = Array.isArray(recorded) ? recorded : [];
  return list.filter((phrase): phrase is string => typeof phrase === "string");
}

function Chip({ citation }: { citation: Citation | undefined }) {
  if (!citation) return <span className="text-[11.5px] text-ink-500">{NO_SPAN}</span>;
  return <CitationChip citation={citation} compact />;
}

export function InterlockMatrix({
  interlock,
  rows,
  permissives,
  permissiveKey,
  citations,
  ceDocumentId,
  finding,
  className,
}: InterlockMatrixProps) {
  const columns = effectColumns(rows);
  const phrases = boilerplatePhrases(finding);
  const bases = [...new Set(rows.map((r) => r.effects_basis))];

  return (
    <div
      className={cx("flex flex-col gap-5", className)}
      data-component="interlock-matrix"
      data-tag={interlock.equipment_tag}
      data-kind={interlock.logic_kind}
      data-sil={interlock.sil_sheet === null ? "none" : String(interlock.sil_sheet)}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {interlock.seq_id ? (
          <span className="mono text-[17px] font-medium text-ink-900">{interlock.seq_id}</span>
        ) : (
          <span className="text-[13px] text-ink-500">{NO_LOGIC_NO}</span>
        )}
        <span className="tag" data-tone="accent">
          {LOGIC_KIND_LABEL[interlock.logic_kind]}
        </span>
        {interlock.sil_sheet === null ? (
          <span className="tag">{NO_SIL}</span>
        ) : (
          <span className="badge" data-tone="accent">
            SIL {interlock.sil_sheet} {SIL_ON_SHEET}
          </span>
        )}
        {ceDocumentId ? (
          <Link href={`/documents/${encodeURIComponent(ceDocumentId)}`} className="mono draw text-[13px]">
            {interlock.ce_doc_no} {REVISION} {interlock.ce_revision}
          </Link>
        ) : (
          <span className="mono text-[13px]">
            {interlock.ce_doc_no} {REVISION} {interlock.ce_revision}
          </span>
        )}
      </div>

      {finding ? (
        <p className="m-0 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[12.5px] text-ink-700">
          <span className="badge" data-tone="defect">
            {finding.rule_id}
          </span>
          <span>{finding.rule ?? NO_RULE_NAME}</span>
          <span className="text-ink-500">
            {finding.severity}
            {finding.unit ? ` · ${finding.unit}` : ""}
          </span>
          <Link href={`/integrity?rule=${encodeURIComponent(finding.rule_id)}`} className="draw">
            {finding.id}
          </Link>
        </p>
      ) : null}

      <div>
        <p className="eyebrow mb-2">{PERMISSIVES}</p>
        {permissives.length > 0 ? (
          <>
            <div className="max-w-[860px]">
              <PermissiveGate seqId={permissiveKey} gate={interlock.permissive_gate} permissives={permissives} />
            </div>
            {interlock.seq_id === null ? <p className="mt-2 text-[12px] text-ink-500">{PERMISSIVES_BY_TAG}</p> : null}
          </>
        ) : (
          <p className="m-0 text-[12.5px] text-ink-700">{NO_PERMISSIVE}</p>
        )}
      </div>

      <div className="overflow-x-auto">
        {rows.length > 0 ? (
          <table className="reg">
            <caption className="sr-only">
              The rows of {interlock.ce_doc_no} down the side and its effect columns across the top, with the mark the
              sheet prints in each cell.
            </caption>
            <thead>
              <tr>
                {ROWS_HEAD.map((head) => (
                  <th key={head} scope="col">
                    {head}
                  </th>
                ))}
                {/* The effect columns: the sheet's own EFF id over the final element it actuates, wrapped inside the
                    cell because a final element is a sentence, not a label. */}
                {columns.map((column) => (
                  <th key={column.effect_id} scope="col">
                    <span className="mx-auto block max-w-[15ch] text-center whitespace-normal">
                      <span className="mono block text-ink-900">{column.effect_id}</span>
                      <span className="mt-0.5 block text-[11px] leading-tight font-normal text-ink-700">{column.final_element}</span>
                    </span>
                  </th>
                ))}
                <th scope="col">{SOURCE}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-row-kind={row.row_kind}>
                  <th scope="row" className="mono align-top">
                    {row.row_id}
                  </th>
                  <td>
                    <span className="tag" data-tone={ROW_KIND_TONE[row.row_kind]}>
                      {row.row_kind}
                    </span>
                  </td>
                  <td>
                    <span className="verbatim">{row.initiator}</span>
                  </td>
                  <td className="mono whitespace-nowrap">{row.instrument_tag}</td>
                  <td className="mono">
                    <span className="verbatim">{row.setpoint_text}</span>
                  </td>
                  <td className="mono">
                    <span className="verbatim">{row.vote_cell_text}</span>
                    {row.voting === null ? <span className="mt-0.5 block text-[11px] text-ink-500">{NOT_VOTED}</span> : null}
                  </td>
                  {columns.map((column) => {
                    const cell = row.effects.find((effect) => effect.effect_id === column.effect_id);
                    const state = cell === undefined ? NOT_ON_ROW : cell.marked ? ACTUATED : NOT_ACTUATED;
                    return (
                      <td key={column.effect_id} className="text-center" data-marked={cell?.marked ? "true" : "false"}>
                        <span aria-hidden className={cell?.marked ? "mono font-medium text-defect" : "mono text-ink-500"}>
                          {cell?.marked ? MARK : UNMARKED}
                        </span>
                        <span className="sr-only">{state}</span>
                      </td>
                    );
                  })}
                  <td>
                    <Chip citation={citations[row.span_id]} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="m-0 text-[12.5px] text-ink-700">{NO_ROWS}</p>
        )}
      </div>

      {bases.length > 0 ? (
        <p className="m-0 text-[12px] text-ink-500">
          {BASIS} {bases.join(" · ")}
        </p>
      ) : null}

      {interlock.notes.length > 0 ? (
        <div>
          <p className="eyebrow mb-2">{NOTES}</p>
          <ul className="idlist">
            {interlock.notes.map((note) => {
              const training = TRAINING_VALUES_NOTE.test(note.text);
              const boilerplate = phrases.some((phrase) => note.text.includes(phrase));
              return (
                <li key={note.n} className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className={cx("verbatim", training || boilerplate ? "text-caveat" : undefined)}>{note.text}</span>
                  {training ? (
                    <span className="badge" data-tone="caveat">
                      {TRAINING_VALUES}
                    </span>
                  ) : null}
                  {boilerplate && finding ? (
                    <span className="badge" data-tone="defect">
                      {finding.rule_id}
                    </span>
                  ) : null}
                  <Chip citation={citations[note.span_id]} />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
