// Blueprint 6.4 MethodChip: threshold, layer, window multiplier, recipe hash prefix, stop-list hash prefix and the
// extractor string; expands (native details) to the full values and whatever CoverageMethod detail the surface
// passes as children. Props only: every value comes from the caller's coverage_method row or fixtures.json.
import type { ReactNode } from "react";
import { cx } from "./cx";

export type MethodChipProps = {
  threshold: number;
  layer: "generous" | "strict" | "both";
  windowMultiplier: number;
  recipeSha256: string;
  stopListSha256: string;
  extractor: string;
  className?: string;
  children?: ReactNode;
};

const PREFIX = 8;

export function MethodChip({
  threshold,
  layer,
  windowMultiplier,
  recipeSha256,
  stopListSha256,
  extractor,
  className,
  children,
}: MethodChipProps) {
  return (
    <details className={cx("method group inline-block max-w-full", className)}>
      <summary className="chip mono cursor-pointer list-none text-[12px] text-ink-700 [&::-webkit-details-marker]:hidden">
        <span className="text-ink-900">t = {threshold}</span>
        <span aria-hidden>·</span>
        <span>{layer === "both" ? "generous and strict" : layer}</span>
        <span aria-hidden>·</span>
        <span>window {windowMultiplier}n</span>
        <span aria-hidden>·</span>
        <span title={recipeSha256}>recipe {recipeSha256.slice(0, PREFIX)}</span>
        <span aria-hidden>·</span>
        <span title={stopListSha256}>stop-list {stopListSha256.slice(0, PREFIX)}</span>
        <span className="text-accent group-open:hidden">expand</span>
        <span className="hidden text-accent group-open:inline">collapse</span>
      </summary>
      <dl className="fields mt-3 rounded-chip bg-[var(--scrim)] p-4 shadow-[inset_0_0_0_1px_var(--film-edge)]">
        <dt>Threshold</dt>
        <dd className="mono">{threshold}</dd>
        <dt>Layer</dt>
        <dd>{layer === "both" ? "generous and strict, published together" : layer}</dd>
        <dt>Window</dt>
        <dd className="mono">{windowMultiplier} times the field&apos;s content-word count</dd>
        <dt>Recipe</dt>
        <dd className="mono">{recipeSha256}</dd>
        <dt>Stop list</dt>
        <dd className="mono">{stopListSha256}</dd>
        <dt>Extractor</dt>
        <dd className="mono">{extractor}</dd>
      </dl>
      {children ? <div className="mt-3 text-[13px] text-ink-700">{children}</div> : null}
    </details>
  );
}
