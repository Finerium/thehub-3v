// Blueprint 6.4 ChainHop: from and to work orders, the mechanism noun, the interval in days, the linking sentence
// verbatim with the field it came from, and the basis line (a shared degradation noun inside the window, never a
// claim of cause). The accent rail draws in along the chain on first render (transform only, staggered by --i).
// Typed by CausalLink (9.4); Chain is the ordered list.
import Link from "next/link";
import type { CSSProperties } from "react";
import type { CausalLink } from "@/contracts/generated/operations";
import { CHAIN_BASIS_LINE } from "@/lib/fixed-strings";
import { cx } from "./cx";
import "./system.css";

export type ChainHopProps = {
  link: CausalLink;
  /** The chain rule's window, in days, when the surface names it. */
  windowDays?: number;
  fromHref?: string;
  toHref?: string;
  /** Position in the chain, for the reveal stagger. */
  index?: number;
  className?: string;
};

const DAYS = "days";
const FROM = "from";
const WINDOW = "window";
const FIELD_LABEL: Record<CausalLink["linking_field"], string> = {
  root_cause: "root cause",
  problem_description: "problem description",
};

function Wo({ wo, href }: { wo: string; href?: string }) {
  return href ? (
    <Link href={href} className="wo draw">
      {wo}
    </Link>
  ) : (
    <span className="wo">{wo}</span>
  );
}

export function ChainHop({ link, windowDays, fromHref, toHref, index = 0, className }: ChainHopProps) {
  return (
    <li className={cx("hop", className)} data-component="chain-hop" data-link={link.id} style={{ "--i": index } as CSSProperties}>
      <div className="hop-rail">
        <Wo wo={link.from_wo} href={fromHref} />
        <span className="days">
          {link.interval_days} {DAYS}
          {windowDays !== undefined ? ` · ${WINDOW} ${windowDays}` : null}
        </span>
        <Wo wo={link.to_wo} href={toHref} />
      </div>
      <div className="hop-body">
        <p>
          <span className="tag" data-tone="accent">
            {link.mechanism_noun}
          </span>
        </p>
        <p>
          <span className="verbatim">{link.linking_sentence}</span>{" "}
          <span className="text-ink-500 text-[12px]">
            {FROM} {FIELD_LABEL[link.linking_field]}
          </span>
        </p>
        <p className="hop-basis">{CHAIN_BASIS_LINE}</p>
      </div>
    </li>
  );
}

export type ChainProps = {
  links: CausalLink[];
  windowDays?: number;
  /** Builds a work-order href; omitted, the ids print without links. */
  hrefFor?: (wo: string) => string;
  className?: string;
  "aria-label"?: string;
};

export function Chain({ links, windowDays, hrefFor, className, ...aria }: ChainProps) {
  return (
    <ol className={cx("chain", className)} data-component="chain" {...aria}>
      {links.map((link, i) => (
        <ChainHop key={link.id} link={link} index={i} windowDays={windowDays} fromHref={hrefFor?.(link.from_wo)} toHref={hrefFor?.(link.to_wo)} />
      ))}
    </ol>
  );
}
