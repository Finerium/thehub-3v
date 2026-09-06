// Blueprint 6.3 and 6.4: the integrity note on a citation chip or a document. A static defect-red dot (never
// glowing, never pulsing) whose accessible name lists the open rule ids; a link into the Integrity Register when
// the surface passes one. Renders nothing when no finding is open.
import Link from "next/link";
import { cx } from "./cx";
import "./system.css";

export type IntegrityDotProps = {
  /** Rule ids open against the document (Citation.integrity_findings). */
  findings: readonly string[];
  href?: string;
  className?: string;
};

export function integrityLabel(findings: readonly string[]): string {
  const n = findings.length;
  return `${n} open integrity ${n === 1 ? "finding" : "findings"}: ${findings.join(", ")}`;
}

export function IntegrityDot({ findings, href, className }: IntegrityDotProps) {
  if (findings.length === 0) return null;
  const label = integrityLabel(findings);
  if (href) {
    return <Link href={href} className={cx("idot", className)} aria-label={label} title={label} data-component="integrity-dot" />;
  }
  return <span role="img" className={cx("idot", className)} aria-label={label} title={label} data-component="integrity-dot" />;
}
