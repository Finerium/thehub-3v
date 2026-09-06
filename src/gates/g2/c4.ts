// C4, the approval filter (blueprint 8.4 "approved current revisions only", 9.2 DocumentRevision, 9.8 Citation;
// AC-ANS-02, AC-ANS-14): every cited span comes from a revision whose approval status is in the served set and that
// is not superseded. The labelled history toggle (include_superseded, traced) is the one way a superseded or
// unserved revision passes; its citation keeps superseded true so the chip can label it.
import { SERVED_APPROVAL_STATUSES, type EvidenceSpan } from "./index";

export function c4(spans: readonly EvidenceSpan[], includeSuperseded: boolean): string | null {
  if (includeSuperseded) return null;
  const unserved = spans.find((s) => s.superseded || !SERVED_APPROVAL_STATUSES.includes(s.approval_status));
  if (unserved === undefined) return null;
  const status = `${unserved.approval_status} (${unserved.approval_status_text})`;
  return `unserved citation ${unserved.span_id}: revision ${unserved.revision} of ${unserved.doc_no} is ${status}${unserved.superseded ? ", superseded" : ""}`;
}
