// Blueprint 6.4 HotspotLayer on the drawing page of the document viewer (6.2 surface 4; AC-CTX-02). Every hotspot
// the sidecar transcribed is placed on the sheet at its own fractional coordinate, as a pin when the sidecar drew a
// point and as a rectangle when it drew a box, and every pin is a link that selects it. Under the sheet: the
// provenance line stating the transcription basis and the review status (D-12), the reading order of the whole set
// with each hotspot's as-drawn text verbatim and what it binds to, and the sidecar's own defect list.
//
// The underlay is the width-limited derivative the surface serves under the role check, with its provenance in the
// DOM as data attributes (7.4). A deployment that holds no render of the sheet says so and still places every
// hotspot: the coordinates are the sidecar's, not the raster's, so the placement is true either way.
import Link from "next/link";
import type { CSSProperties } from "react";
import type { PidSidecar } from "@/contracts/generated/asset";
import { cx } from "./cx";
import "./system.css";

export type Hotspot = PidSidecar["hotspots"][number];

export type PidSheetProps = {
  sidecar: Pick<PidSidecar, "set" | "document_id" | "hotspots" | "defects" | "provenance">;
  /** The page derivative to draw under the hotspots, or null when this deployment holds no render of the sheet. */
  underlay: { src: string; alt: string; sourceSha256: string } | null;
  /** The bound tags a typed row of the seeded corpus carries; a pin on one of them opens that row. */
  typedTags: readonly string[];
  selectedId: string | null;
  /** The address of one hotspot; the surface owns the query string it selects with. */
  hrefFor: (hotspot: Hotspot) => string;
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
const BOUND = "bound to";
const UNBOUND = "unbound";
const FOREIGN = "foreign tag";
const DRAWN_SETPOINT = "drawn setpoint";
const OPENS_A_ROW = "opens a typed row";
const OPENS_NOTHING = "no typed row of the seeded corpus carries this tag";
const NO_REASON = "the sidecar recorded no reason for the absent binding";
const NO_UNDERLAY_TITLE = "No render of this sheet on this deployment";
const NO_UNDERLAY_LINE =
  "The sheet is a supplied image and this deployment holds no width-limited derivative of it, so the field below carries the hotspots at the fractional coordinates the sidecar recorded and no drawing under them.";
const READING_ORDER = "Every hotspot of this set, in the order the sidecar recorded them";
const DEFECTS = "Sidecar defects";
const NO_DEFECT = "No defect recorded in the sidecar.";

// Layout only: a point hotspot has no width in the sidecar, so the pin is drawn at a fixed size centred on the
// coordinate, and an underlay-less field takes the ISO 216 landscape proportion of a drawing sheet. Neither is a
// measurement of the corpus and neither is ever displayed as a figure.
const PIN_PX = 22;
const SHEET_RATIO = "1.4142 / 1";

/** The accessible name of a hotspot: what the sheet draws, what it binds to and why, in the sidecar's own words. */
export function hotspotName(h: Hotspot): string {
  const parts = [h.as_drawn_text, h.role];
  parts.push(h.bound_tag === null ? `${UNBOUND}${h.unbound_reason === null ? "" : `: ${h.unbound_reason}`}` : `${BOUND} ${h.bound_tag}`);
  if (h.foreign) parts.push(FOREIGN);
  if (h.drawn_setpoint !== null) parts.push(`${DRAWN_SETPOINT} ${h.drawn_setpoint}`);
  return parts.join(", ");
}

/** Where the hotspot sits: the sidecar's rectangle where it drew one, the pin centred on the point where it did not. */
function place(h: Hotspot): CSSProperties {
  const left = `${h.x_frac * 100}%`;
  const top = `${h.y_frac * 100}%`;
  if (h.w_frac === 0 && h.h_frac === 0) {
    return { left, top, width: PIN_PX, height: PIN_PX, marginLeft: -PIN_PX / 2, marginTop: -PIN_PX / 2 };
  }
  return { left, top, width: `${h.w_frac * 100}%`, height: `${h.h_frac * 100}%` };
}

export function PidSheet({ sidecar, underlay, typedTags, selectedId, hrefFor, className }: PidSheetProps) {
  const p = sidecar.provenance;
  const opens = new Set(typedTags);
  const bound = sidecar.hotspots.filter((h) => h.bound_tag !== null);
  const foreign = sidecar.hotspots.filter((h) => h.foreign);
  const distinctBound = new Set(bound.flatMap((h) => (h.bound_tag === null ? [] : [h.bound_tag])));

  return (
    <figure
      className={cx("hotspots", className)}
      data-component="pid-sheet"
      data-document={sidecar.document_id}
      data-set={sidecar.set}
    >
      {underlay === null ? (
        <p className="text-[12.5px] text-ink-700">
          <span className="badge" data-tone="caveat">
            {NO_UNDERLAY_TITLE}
          </span>{" "}
          {NO_UNDERLAY_LINE}
        </p>
      ) : null}

      <div className="hotspots-stage" style={underlay === null ? { aspectRatio: SHEET_RATIO } : undefined}>
        {underlay === null ? null : (
          // eslint-disable-next-line @next/next/no-img-element -- a private derivative served one page at a time under the role check, never through a shared optimizer cache (INV-7)
          <img
            src={underlay.src}
            alt={underlay.alt}
            data-document={sidecar.document_id}
            data-page="1"
            data-set={sidecar.set}
            data-sha256={underlay.sourceSha256}
          />
        )}
        {sidecar.hotspots.map((h) => (
          <Link
            key={h.id}
            href={hrefFor(h)}
            className="hotspot"
            style={place(h)}
            title={hotspotName(h)}
            aria-label={hotspotName(h)}
            aria-current={h.id === selectedId ? "true" : undefined}
            data-hotspot={h.id}
            data-bound={h.bound_tag === null ? "false" : "true"}
            data-foreign={h.foreign ? "true" : "false"}
            data-role={h.role}
          >
            {h.id === selectedId ? (
              <span className="hotspot-handle" aria-hidden>
                {h.as_drawn_text}
              </span>
            ) : null}
          </Link>
        ))}
      </div>

      <figcaption className="hotspots-provenance" data-pending={p.review_status === "pending" ? "" : undefined}>
        {BASIS_LABEL[p.basis]} by <span className="mono">{p.alias}</span> on <span className="mono">{p.date}</span> ·{" "}
        {REVIEW_LABEL[p.review_status]}
        {p.reviewed_by === null ? null : (
          <>
            {" "}
            by <span className="mono">{p.reviewed_by}</span>
          </>
        )}
      </figcaption>

      <p className="text-[12.5px] text-ink-700">
        <span className="mono">{sidecar.hotspots.length}</span> hotspots on this sheet:{" "}
        <span className="mono">{bound.length}</span> bound to a tag, <span className="mono">{sidecar.hotspots.length - bound.length}</span>{" "}
        stating why they bind to nothing, <span className="mono">{foreign.length}</span> drawn from another unit.{" "}
        <span className="mono">{typedTags.length}</span> of the <span className="mono">{distinctBound.size}</span> bound{" "}
        {distinctBound.size === 1 ? "tag" : "tags"} {typedTags.length === 1 ? "opens" : "open"} a typed row of the seeded corpus.
      </p>

      <div className="overflow-x-auto">
        <table className="reg">
          <caption className="sr-only">{READING_ORDER}</caption>
          <thead>
            <tr>
              <th scope="col">As drawn</th>
              <th scope="col">Role</th>
              <th scope="col">Binding</th>
            </tr>
          </thead>
          <tbody>
            {sidecar.hotspots.map((h) => (
              <tr key={h.id} aria-current={h.id === selectedId ? "true" : undefined}>
                <td>
                  <Link href={hrefFor(h)} className="draw" data-hotspot-row={h.id}>
                    <span className="verbatim">{h.as_drawn_text}</span>
                  </Link>
                  {h.drawn_setpoint === null ? null : (
                    <span className="mt-0.5 block text-[11.5px] text-ink-500">
                      {DRAWN_SETPOINT} <span className="mono">{h.drawn_setpoint}</span>
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap">
                  <span className="tag">{h.role}</span>
                  {h.foreign ? (
                    <span className="badge ml-1" data-tone="caveat">
                      {FOREIGN}
                    </span>
                  ) : null}
                </td>
                <td>
                  {h.bound_tag === null ? (
                    <>
                      <span className="badge" data-tone="caveat">
                        {UNBOUND}
                      </span>
                      <span className="mt-0.5 block max-w-[54ch] text-[11.5px] leading-snug text-ink-700">
                        {h.unbound_reason === null ? NO_REASON : h.unbound_reason}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="mono text-ink-900">{h.bound_tag}</span>
                      <span className="mt-0.5 block text-[11.5px] text-ink-500">
                        {opens.has(h.bound_tag) ? OPENS_A_ROW : OPENS_NOTHING}
                      </span>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
