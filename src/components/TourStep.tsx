// Blueprint 6.4 TourStep: one of the six tour steps with its target (6.2 surface 12). A step is an editorial cell
// on the drafting sheet: the Expected Solution code and the position in the margin, the rail drawn between the
// steps, what the step shows, the facts it stands on read from the corpus by the surface, and the one link to the
// surface it names. The last step carries no rail below it, which is how the walk ends on the loop route.
//
// Props-only and server-renderable: every fact is passed in already read from the database or the fixture, so this
// component types no figure of its own. Register: expressive (7.2), which here is the staggered load reveal of
// `.rise` rather than scroll choreography; a scroll-driven reveal is the polish this cell can take later without
// a shape change.
import Link from "next/link";
import type { CSSProperties } from "react";
import { cx } from "./cx";

export type TourFact = { label: string; value: string };

export type TourStepProps = {
  /** The Expected Solution component this step walks ("ES1" to "ES6"). */
  code: string;
  /** Position in the walk, 1-based, and its length; the rail closes after the last step. */
  n: number;
  of: number;
  title: string;
  /** What this step shows, in one or two sentences. */
  body: string;
  /** What to look at once the surface opens. */
  look?: string;
  /** The surface this step names. */
  target: { href: string; label: string };
  /** Figures this step stands on, each already read from the corpus by the surface that renders the step. */
  facts?: readonly TourFact[];
  className?: string;
};

const STEP = "step";
const OPEN = "Open";

export function TourStep({ code, n, of, title, body, look, target, facts, className }: TourStepProps) {
  const last = n === of;
  return (
    <li
      className={cx("rise grid grid-cols-[64px_minmax(0,1fr)] gap-x-6 gap-y-4 lg:grid-cols-[64px_minmax(0,60ch)_minmax(0,1fr)]", className)}
      style={{ "--i": n } as CSSProperties}
      data-component="tour-step"
      data-step={code}
    >
      {/* The margin: the code, the position and the rail that joins this step to the next. */}
      <div className="row-span-2 flex flex-col items-center lg:row-span-1">
        <span className="mono w-full rounded-[4px] bg-[color-mix(in_srgb,var(--accent)_9%,transparent)] py-1 text-center text-[12px] font-medium text-accent">
          {code}
        </span>
        <span aria-hidden className={cx("mt-2 w-px flex-1 bg-edge", last && "hidden")} />
      </div>

      <div className={cx("min-w-0", last ? "pb-0" : "pb-10")}>
        <p className="mono text-[11px] text-ink-500">
          {STEP} {n} / {of}
        </p>
        <h3 className="mt-1 text-[24px]">{title}</h3>
        <p className="mt-2 text-[14px] text-ink-700">{body}</p>
        {look ? <p className="mt-2 text-[13px] text-ink-500">{look}</p> : null}
      </div>

      {/* The right margin: what the step stands on, and the door it opens. */}
      <div className={cx("min-w-0 border-edge lg:border-l lg:pl-6", last ? "pb-0" : "pb-10")}>
        {facts && facts.length > 0 ? (
          <dl className="grid gap-1.5 text-[12.5px]">
            {facts.map((fact) => (
              <div key={fact.label} className="flex items-baseline justify-between gap-3 border-b border-edge pb-1.5 last:border-b-0">
                <dt className="text-ink-500">{fact.label}</dt>
                <dd className="mono m-0 text-right text-ink-900">{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
        <p className={cx(facts && facts.length > 0 ? "mt-4" : null)}>
          <Link href={target.href} className="neu text-[13.5px]">
            <span>
              {OPEN} {target.label}
            </span>
            <span aria-hidden className="mono">
              &rarr;
            </span>
          </Link>
        </p>
      </div>
    </li>
  );
}
