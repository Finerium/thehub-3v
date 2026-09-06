// Blueprint 6.4 FilterBar: the register and list filter as a plain GET form (selects and text fields, the current
// values from the URL the surface parsed, hidden fields carried through), so a filter needs no client script and
// the filtered state lives in the address. Apply is the one tactile control; Clear is a link back to the unfiltered
// surface.
import Link from "next/link";
import { cx } from "./cx";
import "./system.css";

export type FilterField =
  | {
      kind: "select";
      name: string;
      label: string;
      value: string;
      options: Array<{ value: string; label: string }>;
      /** The label of the empty option (default "all"). */
      allLabel?: string;
    }
  | { kind: "text"; name: string; label: string; value: string; placeholder?: string };

export type FilterBarProps = {
  fields: FilterField[];
  /** The form's action; omitted, the form submits to the current address. */
  action?: string;
  /** Fields carried through unchanged (the layer, the page size). */
  hidden?: Record<string, string>;
  submitLabel?: string;
  resetHref?: string;
  className?: string;
  "aria-label"?: string;
};

const APPLY = "Apply";
const CLEAR = "Clear";
const ALL = "all";
const FILTERS = "Filters";

export function FilterBar({ fields, action, hidden, submitLabel = APPLY, resetHref, className, "aria-label": ariaLabel = FILTERS }: FilterBarProps) {
  return (
    <form method="get" action={action} className={cx("filterbar", className)} aria-label={ariaLabel} data-component="filter-bar">
      {hidden
        ? Object.entries(hidden).map(([name, value]) => <input key={name} type="hidden" name={name} value={value} />)
        : null}
      {fields.map((f) => (
        <label key={f.name}>
          <span>{f.label}</span>
          {f.kind === "select" ? (
            <select name={f.name} defaultValue={f.value}>
              <option value="">{f.allLabel ?? ALL}</option>
              {f.options.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          ) : (
            <input type="text" name={f.name} defaultValue={f.value} placeholder={f.placeholder} autoComplete="off" />
          )}
        </label>
      ))}
      <span className="filterbar-actions">
        <button type="submit" className="neu" data-size="sm">
          {submitLabel}
        </button>
        {resetHref ? (
          <Link href={resetHref} className="draw text-[12.5px]">
            {CLEAR}
          </Link>
        ) : null}
      </span>
    </form>
  );
}
