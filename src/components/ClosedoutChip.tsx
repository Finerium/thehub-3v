// Blueprint 6.4 ClosedoutChip: the incomplete-closeout wording (StatusBadge), the empty outcome fields and the
// row's priority, linking to the CD-4 finding in the Integrity Register. A native disclosure so the field list
// never widens a table row until asked.
import Link from "next/link";
import type { WorkOrder } from "@/contracts/generated/operations";
import { cx } from "./cx";
import { StatusBadge } from "./StatusBadge";
import "./system.css";

export type ClosedoutChipProps = {
  woNumber: string;
  /** The outcome fields the record left empty (the false keys of WorkOrder.completeness_flags). */
  emptyFields: string[];
  priority: WorkOrder["priority"];
  /** The CD-4 finding for this record in the register. */
  findingHref: string;
  className?: string;
};

const EMPTY = "empty";
const PRIORITY = "priority";
const FINDING = "CD-4 finding in the Integrity Register";

/** The false keys of a record's completeness flags, in the record's own order. */
export function emptyFieldsOf(flags: WorkOrder["completeness_flags"]): string[] {
  return Object.entries(flags)
    .filter(([, complete]) => !complete)
    .map(([field]) => field);
}

export function ClosedoutChip({ woNumber, emptyFields, priority, findingHref, className }: ClosedoutChipProps) {
  return (
    <details className={cx("disclose", className)} data-component="closeout-chip" data-wo={woNumber}>
      <summary className="chip">
        <StatusBadge kind="incomplete_closeout" />
        <span className="mono text-ink-700">
          {emptyFields.length} {EMPTY}
        </span>
        <span className="text-ink-700">
          {PRIORITY} <b className="font-medium text-ink-900">{priority}</b>
        </span>
      </summary>
      <div className="disclose-body">
        <ul className="closeout-fields">
          {emptyFields.map((f) => (
            <li key={f} className="tag" data-tone="defect">
              {f}
            </li>
          ))}
        </ul>
        <p className="mt-3 mb-0">
          <Link href={findingHref} className="draw">
            {FINDING}
          </Link>
        </p>
      </div>
    </details>
  );
}
