// Blueprint 6.4 AuditRow: actor alias, action, entity, corpus version, server timestamp; never a question text
// outside the Admin safety view. One line of the append-only log of 9.7, drawn as a log entry rather than a table
// row so it stands alone in the gallery and stacks in a list on the Admin sheet.
//
// The payload rules of 9.7 are enforced here, not trusted to the caller: the `safety` half is rendered only when
// the action is one of the two safety events, so a request text can never reach the DOM under any other action.
// Every other action's payload stays where it was written and is not rendered at all: an answer event's trace id
// travels as `trace_id`, and a draft event's states stay in the log.
import Link from "next/link";
import type { ReactNode } from "react";
import type { AuditAction, AuditEvent } from "@/contracts/generated/serving";
import { cx } from "./cx";

/** The 9.7 columns this row draws, with the corpus version resolved to its label. */
export type AuditRowEvent = Pick<
  AuditEvent,
  "id" | "actor_alias" | "actor_role" | "action" | "entity" | "entity_id" | "trace_id" | "route" | "server_ts"
> & { corpus_version_label: string };

/**
 * The safety half, read from the payload of `safety.request_refused` or `safety.request_served` only (9.7: the
 * request text as typed, pseudonymised, with the matched rule and phrase, readable by Admin alone). A caller that
 * passes this for any other action gets nothing: the guard below drops it.
 */
export type AuditRowSafety = {
  request_text: string;
  matched_phrase: string | null;
  rule_id: string | null;
  rulepack_class: string | null;
};

const SAFETY_ACTIONS = ["safety.request_refused", "safety.request_served"] as const;

type Tone = "neutral" | "accent" | "caveat" | "defect" | "verified";

// The state colours are reserved for state (7.1): a refusal, a violation and a blocked render carry the defect
// token; a publication, an activation and an ingested run carry the verified token; an abstention and the two
// safety reads carry the caveat token; everything else is neutral ink.
const TONE: Partial<Record<AuditAction, Tone>> = {
  "safety.request_refused": "defect",
  "safety.request_served": "caveat",
  "auth.role_violation": "defect",
  "auth.reviewer_link_rejected": "defect",
  "render.integrity_blocked": "defect",
  "publication.rejected": "defect",
  "draft.rejected": "defect",
  "answer.abstained": "caveat",
  "audit.safety_events_read": "caveat",
  "draft.published": "verified",
  "corpus.version_activated": "verified",
  "evaluation.run_ingested": "verified",
};

/** The server timestamp as the log holds it: the UTC instant, seconds, never a relative phrase. */
export function auditStamp(iso: string): string {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : `${at.toISOString().slice(0, 19).replace("T", " ")}Z`;
}

export type AuditRowProps = {
  event: AuditRowEvent;
  /** Rendered only under the two safety actions, and only where the reader is Admin (9.7). */
  safety?: AuditRowSafety | null;
  className?: string;
};

export function AuditRow({ event, safety, className }: AuditRowProps) {
  const tone = TONE[event.action] ?? "neutral";
  const isSafety = (SAFETY_ACTIONS as readonly string[]).includes(event.action);
  const shown = isSafety ? (safety ?? null) : null;

  return (
    <li
      className={cx(
        "grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-4 gap-y-1.5 border-b border-edge/70 py-2.5 last:border-b-0",
        className,
      )}
      data-component="audit-row"
      data-action={event.action}
      data-tone={tone}
    >
      <time className="mono text-[11.5px] whitespace-nowrap text-ink-500" dateTime={event.server_ts}>
        {auditStamp(event.server_ts)}
      </time>

      <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-1.5">
        <span className="badge" data-tone={tone}>
          <span className="mono">{event.action}</span>
        </span>

        <span className="text-[12.5px] whitespace-nowrap text-ink-700">
          {event.actor_alias === "system" || event.actor_alias.startsWith("job:") ? null : (
            <span className="mono font-medium text-ink-900">{event.actor_alias}</span>
          )}{" "}
          <span className="text-ink-500">{event.actor_role}</span>
        </span>

        <span className="min-w-0 text-[12.5px] text-ink-700">
          <span className="text-ink-500">{event.entity}</span>{" "}
          <span className="mono break-all text-ink-900">{event.entity_id}</span>
        </span>

        <span className="mono text-[11.5px] whitespace-nowrap text-ink-500">{event.route}</span>

        {event.trace_id ? (
          <Link href={`/trace/${encodeURIComponent(event.trace_id)}`} className="mono draw text-[11.5px]">
            trace
          </Link>
        ) : null}

        <span className="mono ml-auto text-[11.5px] whitespace-nowrap text-ink-500">
          corpus {event.corpus_version_label}
        </span>
      </div>

      {shown ? (
        <div className="col-start-2 flex flex-col gap-1.5 rounded-[8px] bg-paper-deep/60 px-3 py-2.5 shadow-[inset_0_0_0_1px_var(--film-edge)]">
          <p className="eyebrow">request as typed, pseudonymised</p>
          <p className="verbatim text-[13px] leading-snug">{shown.request_text}</p>
          <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[11.5px] text-ink-500">
            {shown.rule_id ? (
              <span>
                rule <span className="mono text-ink-900">{shown.rule_id}</span>
              </span>
            ) : null}
            {shown.rulepack_class ? (
              <span>
                class <span className="mono text-ink-900">{shown.rulepack_class}</span>
              </span>
            ) : null}
            {shown.matched_phrase ? (
              <span className="min-w-0">
                matched phrase <span className="verbatim text-ink-900">{shown.matched_phrase}</span>
              </span>
            ) : null}
          </p>
        </div>
      ) : null}
    </li>
  );
}

export function AuditList({
  children,
  className,
  ...aria
}: {
  children: ReactNode;
  className?: string;
  "aria-label"?: string;
  "aria-labelledby"?: string;
}) {
  return (
    <ol className={cx("m-0 list-none p-0", className)} data-component="audit-list" {...aria}>
      {children}
    </ol>
  );
}
