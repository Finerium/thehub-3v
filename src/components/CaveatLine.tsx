// Blueprint 6.4 CaveatLine: the fixed as-built caveat and the fixed unverified-value line, in the caveat token,
// led by a revision triangle. The wording is the constant of src/lib/fixed-strings.ts, never retyped.
import { AS_BUILT_CAVEAT, UNVERIFIED_VALUE_LINE } from "@/lib/fixed-strings";
import { cx } from "./cx";
import "./system.css";

export type CaveatKind = "as_built" | "unverified_value";

const TEXT: Record<CaveatKind, string> = {
  as_built: AS_BUILT_CAVEAT,
  unverified_value: UNVERIFIED_VALUE_LINE,
};

export type CaveatLineProps = { kind: CaveatKind; className?: string };

export function CaveatLine({ kind, className }: CaveatLineProps) {
  return (
    <p className={cx("caveat", className)} data-component="caveat-line" data-kind={kind}>
      <svg viewBox="0 0 14 14" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
        <path d="M7 1.8 12.8 12.2H1.2Z" />
      </svg>
      <span>{TEXT[kind]}</span>
    </p>
  );
}
