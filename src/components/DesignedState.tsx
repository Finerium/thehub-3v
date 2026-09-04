// Blueprint 6.4 DesignedState: the 404, the 429 budget, the 429 rate limit, the 403, the 409, the 422 with its gate
// reason, the hash-mismatch block, the provider-down notice, the deadline-exceeded draft, and every "not yet
// computed" slot; each states what happened, why, and one next step. The code and the reason are content and
// render in mono; the explanation never carries a typed number.
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { cx } from "./cx";

type Props = {
  title: string;
  explanation: string;
  /** The HTTP status or gate code rendered as the display figure ("404", "429", "G3"). */
  code?: string;
  /** A machine-readable reason line (the gate's reason, the limit, the reset moment). */
  reason?: string;
  next?: { href: string; label: string };
  tone?: "neutral" | "caveat" | "defect";
  /** `inline` for a slot inside a surface; the default is a full designed page state. */
  inline?: boolean;
  className?: string;
  children?: ReactNode;
};

const TONE_INK: Record<NonNullable<Props["tone"]>, string> = {
  neutral: "text-ink-500",
  caveat: "text-caveat",
  defect: "text-defect",
};

export function DesignedState({
  title,
  explanation,
  code,
  reason,
  next,
  tone = "neutral",
  inline,
  className,
  children,
}: Props) {
  return (
    <section
      role="status"
      aria-live="polite"
      data-designed-state={code ?? "slot"}
      className={cx("glass", inline ? "p-6" : "mx-auto my-16 max-w-2xl p-10", className)}
    >
      {code ? (
        <p className={cx("mono rise text-[44px] leading-none font-medium", TONE_INK[tone])} style={{ "--i": 0 } as CSSProperties}>
          {code}
        </p>
      ) : null}
      <h2 className={cx("rise", code ? "mt-4 text-[28px]" : "text-[22px]")} style={{ "--i": 1 } as CSSProperties}>
        {title}
      </h2>
      <p className="rise mt-3 max-w-prose text-[14px] text-ink-700" style={{ "--i": 2 } as CSSProperties}>
        {explanation}
      </p>
      {reason ? (
        <p className={cx("mono rise mt-3 text-[12.5px]", TONE_INK[tone])} style={{ "--i": 3 } as CSSProperties}>
          {reason}
        </p>
      ) : null}
      {children}
      {next ? (
        <p className="rise mt-6" style={{ "--i": 4 } as CSSProperties}>
          <Link href={next.href} className="neu">
            {next.label}
            <span aria-hidden className="mono">&rarr;</span>
          </Link>
        </p>
      ) : null}
    </section>
  );
}
