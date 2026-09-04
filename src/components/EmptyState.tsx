// Blueprint 6.4 EmptyState: the answer to a filter that matches nothing or a table that has no rows yet. An
// unfilled drawing cell, never a second glass layer and never a placeholder number.
import Link from "next/link";
import { cx } from "./cx";

type Props = {
  title: string;
  explanation?: string;
  action?: { href: string; label: string };
  className?: string;
};

export function EmptyState({ title, explanation, action, className }: Props) {
  return (
    <div role="status" className={cx("empty", className)}>
      <p className="font-medium text-ink-900">{title}</p>
      {explanation ? <p className="mt-1 max-w-prose text-[13px]">{explanation}</p> : null}
      {action ? (
        <p className="mt-3 text-[13px]">
          <Link href={action.href} className="draw">
            {action.label}
          </Link>
        </p>
      ) : null}
    </div>
  );
}
