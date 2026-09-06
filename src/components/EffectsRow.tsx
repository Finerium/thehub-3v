// Blueprint 6.4 EffectsRow: the effects of one cause-and-effect row, the marked ones with their final element
// rimmed in the defect token, the unmarked ones stated as not actuated, and the sheet's own effects basis under
// them. Typed by InterlockRow.effects and InterlockRow.effects_basis (9.3).
import type { InterlockRow } from "@/contracts/generated/asset";
import { cx } from "./cx";
import "./system.css";

export type EffectsRowProps = {
  rowId: InterlockRow["row_id"];
  effects: InterlockRow["effects"];
  basis: InterlockRow["effects_basis"];
  className?: string;
};

const ACTUATES = "actuates";
const NOT_ACTUATED = "not actuated";
const MARKED = "marked";
const OF = "of";
const BASIS = "basis";

export function EffectsRow({ rowId, effects, basis, className }: EffectsRowProps) {
  const marked = effects.filter((e) => e.marked).length;
  return (
    <div className={cx("effects-row", className)} data-component="effects-row" data-row={rowId}>
      <p className="eyebrow mb-2">
        {rowId} · <span className="mono">{marked}</span> {OF} <span className="mono">{effects.length}</span> {MARKED}
      </p>
      <ul className="effects" aria-label={`Effects of row ${rowId}`}>
        {effects.map((e) => (
          <li key={e.effect_id} className="effect" data-marked={e.marked ? "true" : "false"}>
            <span className="id">{e.effect_id}</span>
            <span>{e.final_element}</span>
            <span className="state">{e.marked ? ACTUATES : NOT_ACTUATED}</span>
          </li>
        ))}
      </ul>
      <p className="effects-basis">
        {BASIS} {basis}
      </p>
    </div>
  );
}
