// Blueprint 6.4 GlassPanel: the frosted-film container over paper with the hairline rim; `scrim` when it sits over
// a P&ID underlay; the reduced-transparency fallback and the two-layer blur cap live in globals.css (.glass).
import type { ReactNode } from "react";
import { cx } from "./cx";

type Props = {
  as?: "section" | "article" | "aside" | "div";
  scrim?: boolean;
  interactive?: boolean;
  className?: string;
  id?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  /** Marker attributes for the export script and the verifier (`data-component`, `data-tone`, ...). */
  [dataAttribute: `data-${string}`]: string | undefined;
  children: ReactNode;
};

export function GlassPanel({ as: Tag = "section", scrim, interactive, className, children, ...rest }: Props) {
  return (
    <Tag
      className={cx("glass", className)}
      data-scrim={scrim ? "" : undefined}
      data-interactive={interactive ? "" : undefined}
      {...rest}
    >
      {children}
    </Tag>
  );
}
