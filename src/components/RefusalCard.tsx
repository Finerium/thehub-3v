// Blueprint 6.4 RefusalCard: the class, the governing sheet chip with LOGIC No and SIL, the permissive rows, the
// reset note, the route text; the Management of Change text only on the permanent-change class. Typed by Refusal
// (9.8); the rule id and the matched phrase close the card so the refusal is inspectable.
import Link from "next/link";
import type { Refusal } from "@/contracts/generated/evidence_packet";
import { cx } from "./cx";
import { GlassPanel } from "./GlassPanel";
import "./system.css";

export type RefusalCardProps = {
  refusal: Refusal;
  /** The governing sheet in the document viewer, when the surface resolves it. */
  sheetHref?: string;
  className?: string;
};

const TITLE: Record<Refusal["class"], string> = {
  defeat: "Refused: this would defeat a protective function",
  permanent_change: "Refused: this is a permanent change to a protective function",
};
const GOVERNING_SHEET = "Governing sheet";
const LOGIC_NO = "LOGIC No";
const SIL = "SIL";
const SIL_NOT_STATED = "not stated";
const PERMISSIVES = "Permissives that must be TRUE";
const RESET_NOTE = "Reset note";
const ROUTE = "Route";
const MOC = "Management of Change";

export function RefusalCard({ refusal, sheetHref, className }: RefusalCardProps) {
  const fn = refusal.function;
  const sheet = fn ? (
    <>
      <span className="font-medium">{fn.ce_doc_no}</span>
      <span className="text-ink-700">rev {fn.ce_revision}</span>
    </>
  ) : null;
  return (
    <GlassPanel as="article" className={cx("outcome", className)} data-component="refusal-card" data-class={refusal.class} aria-label="Refusal">
        <div className="outcome-head">
          <h3 className="text-defect">{TITLE[refusal.class]}</h3>
          <span className="tag" data-tone="defect">
            {refusal.class}
          </span>
        </div>
        {fn ? (
          <p className="outcome-row text-[13px]">
            <span className="eyebrow">{GOVERNING_SHEET}</span>
            {sheetHref ? (
              <Link href={sheetHref} className="chip mono text-[12px]">
                {sheet}
              </Link>
            ) : (
              <span className="chip mono text-[12px]">{sheet}</span>
            )}
            <span className="tag">
              {LOGIC_NO} {fn.seq_id}
            </span>
            <span className="tag" data-tone={fn.sil === null ? "caveat" : "defect"}>
              {SIL} {fn.sil === null ? SIL_NOT_STATED : fn.sil}
            </span>
          </p>
        ) : null}
        {refusal.permissives.length > 0 ? (
          <div>
            <p className="eyebrow mb-1">{PERMISSIVES}</p>
            <ol className="permissives">
              {refusal.permissives.map((p) => (
                <li key={p.n}>
                  <span className="mono text-ink-500">{p.n}</span>
                  <span className="verbatim">{p.text}</span>
                  {p.signal_tag ? <span className="tag">{p.signal_tag}</span> : <span />}
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        {refusal.reset_note ? (
          <p className="m-0 text-[13.5px]">
            <span className="eyebrow">{RESET_NOTE}</span> <span className="verbatim">{refusal.reset_note}</span>
          </p>
        ) : null}
        <div>
          <p className="eyebrow mb-1">{ROUTE}</p>
          <p className="outcome-route">{refusal.route_text}</p>
        </div>
        {refusal.class === "permanent_change" && refusal.moc_text ? (
          <div>
            <p className="eyebrow mb-1">{MOC}</p>
            <p className="outcome-route">{refusal.moc_text}</p>
          </div>
        ) : null}
        <p className="outcome-foot">
          rule {refusal.rule_id} · matched <span className="verbatim">{refusal.matched_phrase}</span>
        </p>
    </GlassPanel>
  );
}
