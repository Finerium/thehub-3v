// The request-a-lesson action of 6.2 surfaces 2 and 7, shared by AbstentionCard and ClusterCard: a neumorphic link
// carrying the fixed action wording. A surface that needs a POST wraps its own form around NeumorphicChip with the
// same wording instead.
import Link from "next/link";
import { REQUEST_LESSON_ACTION } from "@/lib/fixed-strings";
import { cx } from "./cx";
import "./system.css";

export type RequestLessonActionProps = { href: string; className?: string };

export function RequestLessonAction({ href, className }: RequestLessonActionProps) {
  return (
    <Link href={href} className={cx("neu", className)} data-size="sm" data-component="request-lesson-action">
      {REQUEST_LESSON_ACTION}
      <span aria-hidden className="mono">
        &rarr;
      </span>
    </Link>
  );
}
