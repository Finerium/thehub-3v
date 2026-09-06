// Blueprint 6.4 HotspotLayer: the P&ID underlay (an <img> whose src the surface passes, width-limited, with its
// provenance in the DOM as data attributes per 7.4) with the sidecar's fractional hotspot rectangles over it, each
// a link or a button named by its as-drawn text and its binding; the neumorphic handle carries the as-drawn text
// (7.1: hotspot handles are tactile accents); an unbound hotspot is dashed in the caveat token, a foreign one in
// the mid ink. Under the image: the provenance line stating the transcription basis and the review status (D-12,
// pending in the caveat token), and the sidecar's defect list. Typed by PidSidecar (9.3).
import Link from "next/link";
import type { CSSProperties } from "react";
import type { PidSidecar } from "@/contracts/generated/asset";
import { cx } from "./cx";
import "./system.css";

export type Hotspot = PidSidecar["hotspots"][number];

export type HotspotLayerProps = {
  /** The underlay derivative the surface serves under the role check. */
  src: string;
  alt: string;
  sidecar: Pick<PidSidecar, "set" | "document_id" | "hotspots" | "defects" | "provenance">;
  /** SHA-256 of the source file, carried on the image as data-sha256 (7.4). */
  sourceSha256?: string;
  /** The hotspot the surface is on (aria-current). */
  currentId?: string | null;
  /** A link per hotspot (the tag card); without one the hotspot is a button reporting onSelect. */
  hrefFor?: (hotspot: Hotspot) => string | undefined;
  onSelect?: (hotspot: Hotspot) => void;
  /** Handles beside every rectangle (default on); off, the as-drawn text stays in the accessible name. */
  handles?: boolean;
  className?: string;
};

const BASIS_LABEL: Record<PidSidecar["provenance"]["basis"], string> = {
  manual: "manual transcription",
  agent_transcription: "agent transcription",
};
const REVIEW_LABEL: Record<PidSidecar["provenance"]["review_status"], string> = {
  reviewed: "reviewed",
  pending: "review pending",
};
const BY = "by";
const ON = "on";
const BOUND = "bound to";
const UNBOUND = "unbound";
const FOREIGN = "foreign tag";
const DRAWN_SETPOINT = "drawn setpoint";
const DEFECTS = "Sidecar defects";
const NO_DEFECT = "No defect recorded in the sidecar.";
const HOTSPOTS = "hotspots";

function hotspotName(h: Hotspot): string {
  const parts = [h.as_drawn_text, h.role];
  parts.push(h.bound_tag ? `${BOUND} ${h.bound_tag}` : `${UNBOUND}${h.unbound_reason ? `: ${h.unbound_reason}` : ""}`);
  if (h.foreign) parts.push(FOREIGN);
  if (h.drawn_setpoint) parts.push(`${DRAWN_SETPOINT} ${h.drawn_setpoint}`);
  return parts.join(", ");
}

function box(h: Hotspot): CSSProperties {
  return { left: `${h.x_frac * 100}%`, top: `${h.y_frac * 100}%`, width: `${h.w_frac * 100}%`, height: `${h.h_frac * 100}%` };
}

export function HotspotLayer({ src, alt, sidecar, sourceSha256, currentId, hrefFor, onSelect, handles = true, className }: HotspotLayerProps) {
  const { provenance: p } = sidecar;
  return (
    <figure className={cx("hotspots", className)} data-component="hotspot-layer" data-document={sidecar.document_id} data-set={sidecar.set}>
      <div className="hotspots-stage">
        {/* eslint-disable-next-line @next/next/no-img-element -- a private derivative served one page at a time under the role check, never through a shared optimizer cache (INV-7) */}
        <img src={src} alt={alt} data-document={sidecar.document_id} data-set={sidecar.set} data-sha256={sourceSha256} />
        {sidecar.hotspots.map((h) => {
          const name = hotspotName(h);
          const href = hrefFor?.(h);
          const shared = {
            className: "hotspot",
            style: box(h),
            title: name,
            "aria-label": name,
            "aria-current": h.id === currentId ? ("true" as const) : undefined,
            "data-hotspot": h.id,
            "data-bound": h.bound_tag ? "true" : "false",
            "data-foreign": h.foreign ? "true" : "false",
            "data-role": h.role,
          };
          const handle = handles ? (
            <span className="hotspot-handle" aria-hidden>
              {h.as_drawn_text}
            </span>
          ) : null;
          return href ? (
            <Link key={h.id} href={href} {...shared}>
              {handle}
            </Link>
          ) : (
            <button key={h.id} type="button" onClick={onSelect ? () => onSelect(h) : undefined} {...shared}>
              {handle}
            </button>
          );
        })}
      </div>
      <figcaption className="hotspots-provenance" data-pending={p.review_status === "pending" ? "" : undefined}>
        {BASIS_LABEL[p.basis]} {BY} <span className="mono">{p.alias}</span> {ON} <span className="mono">{p.date}</span> · {REVIEW_LABEL[p.review_status]}
        {p.reviewed_by ? (
          <>
            {" "}
            {BY} <span className="mono">{p.reviewed_by}</span>
          </>
        ) : null}
        {" · "}
        <span className="mono">{sidecar.hotspots.length}</span> {HOTSPOTS}
      </figcaption>
      <div>
        <p className="eyebrow mb-1">{DEFECTS}</p>
        {sidecar.defects.length > 0 ? (
          <ul className="hotspots-defects">
            {sidecar.defects.map((d, i) => (
              <li key={`${d.rule}:${i}`}>
                <span className="tag" data-tone="defect">
                  {d.rule}
                </span>
                <span>{d.detail}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[12.5px] text-ink-700">{NO_DEFECT}</p>
        )}
      </div>
    </figure>
  );
}
