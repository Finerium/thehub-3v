"use client";

// Surface 8, the review sheet's live half (blueprint 6.2 surface 8, 6.3, 7.2 tactile-transactional, 9.6, 9.9;
// ARCHITECTURE 8.2, 8.4, 8.6; AC-LOOP-04, AC-LOOP-05, AC-LOOP-08, AC-LOOP-09, AC-LOOP-11, AC-LOOP-14, AC-LOOP-15).
// Everything on this sheet that a decision or the machine lane can change lives here: the six sections of the house
// template with a provenance tag on every element, the slots with their note entry, the redline rounds, the state
// rail and the decision controls.
//
// Four things it does and nothing else:
//   the poll. While the draft is with the machine lane (proposed, drafted, redlined) it asks GET /api/drafts/:id
//   every few seconds, which is also the lease watchdog of ADR-004: that route blocks a draft whose lease has run
//   out before it reads, so a draft stranded by an invocation that died comes back blocked with
//   `deadline_exceeded` and re-proposable rather than spinning forever.
//   the decision. POST /api/drafts/:id/decision with accept, reject, or edit carrying one diff entry per element
//   the Reviewing Supervisor rewrote, each with its reason; the route records the diff on the transition row and
//   the rail renders it.
//   the note. POST /api/sme-notes fills one slot with an engineer's judgement; the slot keeps its literal, the note
//   renders as an attributed block, and the fixed unverified-value line joins it once the lesson is published.
//   the publication. POST /api/drafts/:id/publish is G3's one door and the Manager's alone; its designed refusals
//   (403, 409, 422 with the gate's reason) render as designed states, and its success renders the version the
//   publication created.
//
// Every wording that is fixed comes from src/lib/fixed-strings.ts through the components; every number on the sheet
// is a value of the draft, of a route's own answer or of the evidence. Nothing is typed here.
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { z } from "zod";
import { can } from "@/auth/matrix";
import { cx } from "@/components/cx";
import { DecisionButtons } from "@/components/DecisionButtons";
import { DesignedState } from "@/components/DesignedState";
import { DraftElement } from "@/components/DraftElement";
import { DraftSection } from "@/components/DraftSection";
import { GlassPanel } from "@/components/GlassPanel";
import { NeumorphicChip } from "@/components/NeumorphicChip";
import { RedlineVerdictPanel } from "@/components/RedlineVerdictPanel";
import { SlotField } from "@/components/SlotField";
import { StateRail, stampOf } from "@/components/StateRail";
import { VersionBadge } from "@/components/VersionBadge";
import {
  DraftDocument,
  DraftField,
  DraftTransition,
  RedlineVerdict,
  SmeNote,
  type DraftState,
} from "@/contracts/generated/drafts";
import { CorpusVersion, type Role } from "@/contracts/generated/serving";
import { SECTION_HEADINGS } from "@/loop/template";
import "@/components/drafts.css";

/* The two shapes the routes answer with ------------------------------------------------------------------------ */

const Poll = z.object({
  draft: DraftDocument,
  fields: z.array(DraftField),
  verdicts: z.array(RedlineVerdict),
  transitions: z.array(DraftTransition),
});
type Poll = z.infer<typeof Poll>;

const Published = z.object({
  document_revision_id: z.string(),
  corpus_version: CorpusVersion,
  coverage_recount: z.object({
    uncovered_before: z.number().int(),
    uncovered_after: z.number().int(),
    population_count: z.number().int(),
    recipe_sha256: z.string(),
    stop_list_sha256: z.string(),
  }),
});
type Published = z.infer<typeof Published>;

/** One section 5 row of the draft, as the table stores it (9.5 TroubleshootingRow on a draft). */
export type TroubleshootingRow = {
  n: number;
  problem: string;
  cause: string;
  action: string;
  quotedWoNumber: string | null;
};

export type DraftClientProps = {
  role: Role;
  initial: Poll;
  notes: SmeNote[];
  rows: TroubleshootingRow[];
  /** The document a publication already created for this draft's reserved lesson id, if any. */
  publishedDocumentId: string | null;
};

/* Failures, as the routes report them -------------------------------------------------------------------------- */

type Failure = { status: number; code: string; requestId: string | null; fields: Record<string, unknown> };

const SECTIONS = [1, 2, 3, 4, 5, 6] as const;
const MACHINE_STATES: readonly DraftState[] = ["proposed", "drafted", "redlined"];
const POLL_MS = 4000;
const DEADLINE_REASON = "deadline_exceeded";
const DIGEST_PREFIX = 8;

/** The elements the Reviewing Supervisor rewrote, read from the diffs the decision route recorded (id before ": "). */
function editedFields(transitions: readonly DraftTransition[]): Map<string, string> {
  const edited = new Map<string, string>();
  for (const t of transitions) {
    if (t.edit_diff === null) continue;
    for (const line of t.edit_diff.split("\n")) {
      const at = line.indexOf(": ");
      if (at <= 0) continue;
      const reason = /\(([^)]*)\)\s*$/.exec(line);
      edited.set(line.slice(0, at), reason?.[1] ?? "rewritten in review");
    }
  }
  return edited;
}

async function failureOf(response: Response): Promise<Failure> {
  const requestId = response.headers.get("x-request-id");
  const body: unknown = await response.json().catch(() => null);
  const record = body !== null && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = typeof record.error === "string" ? record.error : "unexpected";
  const fields: Record<string, unknown> = { ...record };
  delete fields.error;
  delete fields.request_id;
  return { status: response.status, code, requestId, fields };
}

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);

function FailureState({ failure }: { failure: Failure }) {
  const gate = text(failure.fields.gate);
  const reason = text(failure.fields.reason);
  const scope = text(failure.fields.scope);
  const resets = text(failure.fields.resets_at);
  const fieldId = text(failure.fields.field_id);
  const state = text(failure.fields.state);
  const limit = typeof failure.fields.limit === "number" ? failure.fields.limit : null;

  const title =
    failure.status === 403
      ? "This role may not take that decision"
      : failure.status === 409
        ? "The draft moved before this request landed"
        : failure.status === 422
          ? "The gate refused the publication"
          : failure.status === 429
            ? "The limit for this account is spent"
            : "The route did not accept the request";

  const explanation =
    failure.status === 403
      ? "The permission matrix of 9.9 was asked again by the route and refused this role for this action. The refusal is recorded as an auth.role_violation event, and a publication attempt also records publication.rejected."
      : failure.status === 409
        ? failure.code === "already_published"
          ? "This draft is already published. G3 publishes once: every later request reads the published state under the same advisory lock and is refused, which is what keeps one publication from becoming two."
          : `A draft is re-proposed only from blocked or rejected (9.6)${state === null ? "" : `; this one is ${state}`}. Nothing was created.`
        : failure.status === 422
          ? reason === "outstanding_slot"
            ? "A slot on this draft carries no SME note. G3 refuses to publish a lesson with an unfilled slot: the literal would reach the corpus as a value."
            : "The draft is not in the accepted state, and G3 publishes an accepted draft alone."
          : failure.status === 429
            ? "The route limits how often an account may create drafts, and this account has spent its allowance for the window."
            : "The route answered with an error code rather than the state it was asked for. Nothing on this draft was changed.";

  const parts = [
    gate === null ? null : `gate ${gate}`,
    reason === null ? failure.code : `reason ${reason}`,
    fieldId === null ? null : `field ${fieldId}`,
    scope === null || limit === null ? null : `${limit} ${scope} per minute`,
    resets === null ? null : `resets ${stampOf(resets)}`,
    failure.requestId === null ? null : `request ${failure.requestId}`,
  ].filter((p): p is string => p !== null);

  return (
    <DesignedState
      inline
      code={String(failure.status)}
      tone={failure.status === 429 ? "caveat" : "defect"}
      title={title}
      explanation={explanation}
      reason={parts.join(" · ")}
      next={{ href: "/drafts", label: "Back to the queue" }}
    />
  );
}

/* The sheet ---------------------------------------------------------------------------------------------------- */

export function DraftClient({ role, initial, notes: initialNotes, rows, publishedDocumentId }: DraftClientProps) {
  const router = useRouter();
  const [data, setData] = useState<Poll>(initial);
  const [notes, setNotes] = useState<SmeNote[]>(initialNotes);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [published, setPublished] = useState<Published | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, { text: string; reason: string }>>({});
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const alive = useRef(true);
  const rejectId = useId();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const read = useCallback(async (): Promise<void> => {
    // egress: none (same-origin routes of this application; the provider is reached only by src/gateway)
    const response = await fetch(`/api/drafts/${encodeURIComponent(initial.draft.id)}`, {
      credentials: "same-origin",
      cache: "no-store",
    });
    if (!response.ok) {
      if (alive.current) setFailure(await failureOf(response));
      return;
    }
    const body = Poll.safeParse(await response.json());
    if (body.success && alive.current) setData(body.data);
  }, [initial.draft.id]);

  // The poll is the lease watchdog's trigger (ADR-004): while the machine lane holds the draft, GET /api/drafts/:id
  // is what moves an expired draft to blocked. It stops the moment the draft reaches a state a person owns.
  useEffect(() => {
    if (!MACHINE_STATES.includes(data.draft.state)) return;
    const timer = setInterval(() => {
      void read();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [data.draft.state, read]);

  const post = useCallback(
    async (path: string, body?: unknown): Promise<Response | null> => {
      setBusy(true);
      setFailure(null);
      try {
        const response = await fetch(path, {
          method: "POST",
          credentials: "same-origin",
          headers: body === undefined ? {} : { "content-type": "application/json" },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!response.ok) {
          setFailure(await failureOf(response));
          return null;
        }
        return response;
      } catch (error) {
        setFailure({
          status: 0,
          code: error instanceof Error ? error.message : "no answer",
          requestId: null,
          fields: {},
        });
        return null;
      } finally {
        if (alive.current) setBusy(false);
      }
    },
    [],
  );

  const id = data.draft.id;
  const decide = useCallback(
    async (body: Record<string, unknown>): Promise<void> => {
      const response = await post(`/api/drafts/${encodeURIComponent(id)}/decision`, body);
      if (!response) return;
      setEditing(false);
      setDrafts({});
      setRejecting(false);
      setRejectReason("");
      await read();
      router.refresh();
    },
    [id, post, read, router],
  );

  const publish = useCallback(async (): Promise<void> => {
    const response = await post(`/api/drafts/${encodeURIComponent(id)}/publish`);
    if (!response) return;
    const body = Published.safeParse(await response.json());
    if (body.success) setPublished(body.data);
    // G3 step 5 flips every note of the published lesson to citeable inside the same transaction; the poll route
    // does not carry notes, so the sheet mirrors that one flip rather than showing a stale "not citeable" line.
    setNotes((current) => current.map((note) => ({ ...note, citeable: true })));
    await read();
    router.refresh();
  }, [id, post, read, router]);

  const repropose = useCallback(async (): Promise<void> => {
    const response = await post(`/api/drafts/${encodeURIComponent(id)}/repropose`);
    if (!response) return;
    const body = z.object({ draft_id: z.string() }).safeParse(await response.json());
    if (body.success) router.push(`/drafts/${encodeURIComponent(body.data.draft_id)}`);
  }, [id, post, router]);

  const addNote = useCallback(
    async (fieldId: string, noteText: string, sourceReference: string): Promise<boolean> => {
      const response = await post("/api/sme-notes", {
        draft_id: id,
        field_id: fieldId,
        text: noteText,
        ...(sourceReference.trim() === "" ? {} : { source_reference: sourceReference.trim() }),
      });
      if (!response) return false;
      const body = SmeNote.safeParse(await response.json());
      if (body.success) setNotes((current) => [...current, body.data]);
      router.refresh();
      return true;
    },
    [id, post, router],
  );

  const submitEdits = useCallback(async (): Promise<void> => {
    const edits = data.fields
      .filter((f) => !f.is_slot)
      .map((f) => ({ field: f, draft: drafts[f.id] }))
      .filter((e): e is { field: DraftField; draft: { text: string; reason: string } } => e.draft !== undefined)
      .filter((e) => e.draft.text.trim() !== "" && e.draft.text !== e.field.text)
      .map((e) => ({ field_id: e.field.id, text: e.draft.text, reason: e.draft.reason.trim() }));
    if (edits.length === 0) {
      setEditError("No element was rewritten. Change the text of an element before submitting.");
      return;
    }
    const missing = edits.find((e) => e.reason === "");
    if (missing) {
      setEditError(`Every rewritten element needs a reason; ${missing.field_id} has none.`);
      return;
    }
    setEditError(null);
    await decide({ decision: "edit", edits });
  }, [data.fields, drafts, decide]);

  const edited = editedFields(data.transitions);
  const notesFor = (fieldId: string): SmeNote[] => notes.filter((n) => n.field_id === fieldId);
  const mayNote = can(role, "add_sme_note") && data.draft.state !== "published";
  const blockedByDeadline =
    data.draft.state === "blocked" && data.transitions.some((t) => t.to_state === "blocked" && t.reason === DEADLINE_REASON);
  const working = MACHINE_STATES.includes(data.draft.state);
  const slots = data.fields.filter((f) => f.is_slot);
  const openSlots = slots.filter((f) => notesFor(f.id).length === 0).length;

  return (
    <div className="review" data-component="draft-review" data-state={data.draft.state}>
      {/* The draft itself ------------------------------------------------------------------------------------- */}
      <GlassPanel className="p-6" aria-labelledby="body-heading">
        <div className="blockhead">
          <h2 id="body-heading" className="text-[20px]">
            The draft
          </h2>
          <span className="text-[12px] text-ink-500">
            {data.fields.length} {data.fields.length === 1 ? "element" : "elements"}, {slots.length}{" "}
            {slots.length === 1 ? "slot" : "slots"}
            {slots.length === 0 ? "" : `, ${openSlots} unfilled`}, {rows.length} troubleshooting{" "}
            {rows.length === 1 ? "row" : "rows"}
          </span>
        </div>
        <p className="mt-1 max-w-prose text-[12.5px] text-ink-500">
          Six sections in the order of the plant&apos;s One Point Lesson form. Every element carries the evidence item
          that states it, and every numeral carries the item that types it; an element with neither is a slot.
        </p>

        {editing ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <NeumorphicChip size="sm" disabled={busy} onClick={() => void submitEdits()} className="decision-primary">
              Submit edits
            </NeumorphicChip>
            <NeumorphicChip
              size="sm"
              disabled={busy}
              onClick={() => {
                setEditing(false);
                setDrafts({});
                setEditError(null);
              }}
            >
              Cancel
            </NeumorphicChip>
            <span className="max-w-[52ch] text-[12px] text-ink-500">
              Rewrite an element and give the reason; the draft stays in review and the diff is recorded on the
              transition. A slot is never editable: only an SME note fills one.
            </span>
          </div>
        ) : null}
        {editError ? (
          <p className="mono mt-3 text-[12px] text-defect" role="alert">
            {editError}
          </p>
        ) : null}

        <div className="mt-5">
          {SECTIONS.map((n) => {
            const fields = data.fields.filter((f) => f.section === n);
            const isFive = n === 5;
            return (
              <DraftSection
                key={n}
                n={n}
                heading={SECTION_HEADINGS[n]}
                count={isFive ? rows.length : fields.length}
                emptyText={
                  working
                    ? "The drafter has not written this section yet."
                    : isFive
                      ? "The drafter quoted no record in the troubleshooting table."
                      : undefined
                }
              >
                {isFive ? (
                  rows.length === 0 ? null : (
                    <div className="overflow-x-auto">
                      <table className="reg">
                        <thead>
                          <tr>
                            <th scope="col">n</th>
                            <th scope="col">Problem</th>
                            <th scope="col">Cause</th>
                            <th scope="col">Action</th>
                            <th scope="col">Work order quoted</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((row) => (
                            <tr key={row.n}>
                              <td className="mono">{row.n}</td>
                              <td>{row.problem}</td>
                              <td>{row.cause}</td>
                              <td>{row.action}</td>
                              <td className="mono whitespace-nowrap">
                                {row.quotedWoNumber === null ? (
                                  <span className="text-ink-500">none named</span>
                                ) : (
                                  <Link href={`/failures/${encodeURIComponent(data.draft.equipment_tag)}`} className="draw">
                                    {row.quotedWoNumber}
                                  </Link>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : fields.length === 0 ? null : (
                  fields.map((field) => (
                    <DraftElement
                      key={field.id}
                      id={field.id}
                      ordinal={field.ordinal}
                      text={field.is_slot ? undefined : field.text}
                      provenance={field.provenance}
                      numericProvenance={field.numeric_provenance}
                      quarantined={field.quarantined}
                      edited={edited.has(field.id) ? { reason: edited.get(field.id) ?? "" } : null}
                      slot={
                        field.is_slot ? (
                          <SlotField fieldId={field.id} notes={notesFor(field.id)}>
                            {mayNote ? (
                              <NoteEntry fieldId={field.id} busy={busy} onSubmit={addNote} />
                            ) : (
                              <p className="m-0 text-[12px] text-ink-500">
                                {can(role, "add_sme_note")
                                  ? "The lesson is published; its notes are closed."
                                  : `The ${role} role holds no add_sme_note column (9.9), so this slot cannot be filled from this account.`}
                              </p>
                            )}
                          </SlotField>
                        ) : undefined
                      }
                    >
                      {field.is_slot ? null : editing ? (
                        <ElementEditor
                          field={field}
                          value={drafts[field.id] ?? { text: field.text, reason: "" }}
                          onChange={(next) => setDrafts((current) => ({ ...current, [field.id]: next }))}
                        />
                      ) : null}
                    </DraftElement>
                  ))
                )}
              </DraftSection>
            );
          })}
        </div>
      </GlassPanel>

      {/* The review rail -------------------------------------------------------------------------------------- */}
      <div className="review-rail">
        <GlassPanel className="p-5" aria-labelledby="decide-heading">
          <div className="blockhead">
            <h2 id="decide-heading" className="text-[17px]">
              Decision
            </h2>
            <span className="badge" data-tone={data.draft.state === "published" ? "verified" : "neutral"}>
              {data.draft.state}
            </span>
          </div>
          <DecisionButtons
            className="mt-4"
            role={role}
            state={data.draft.state}
            busy={busy}
            editing={editing}
            onAccept={() => void decide({ decision: "accept" })}
            onEdit={() => {
              setEditing((open) => !open);
              setEditError(null);
            }}
            onReject={() => setRejecting((open) => !open)}
            onPublish={() => void publish()}
            onRepropose={() => void repropose()}
          />
          {rejecting ? (
            <div className="del-edit mt-3">
              <label htmlFor={rejectId}>Reason for the rejection, recorded on the transition</label>
              <input
                id={rejectId}
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                placeholder="what the draft would need to be accepted"
              />
              <div className="flex flex-wrap gap-2">
                <NeumorphicChip
                  size="sm"
                  disabled={busy || rejectReason.trim() === ""}
                  onClick={() => void decide({ decision: "reject", reason: rejectReason.trim() })}
                  className="decision-reject"
                >
                  Confirm the rejection
                </NeumorphicChip>
                <NeumorphicChip size="sm" disabled={busy} onClick={() => setRejecting(false)}>
                  Cancel
                </NeumorphicChip>
              </div>
            </div>
          ) : null}
          {working ? (
            <p className="mono mt-3 text-[12px] text-ink-500" role="status" aria-live="polite">
              the machine lane holds this draft; polling every {POLL_MS / 1000} s
            </p>
          ) : null}
        </GlassPanel>

        {failure ? <FailureState failure={failure} /> : null}

        {blockedByDeadline ? (
          <DesignedState
            inline
            code="blocked"
            tone="caveat"
            title="The drafting lease ran out"
            explanation="The invocation that was drafting this lesson did not finish inside its lease, so the poll moved the draft to blocked rather than leaving it stranded. Nothing of the draft is lost: a re-proposal creates a new linked draft with the same evidence and the reasons this one carries."
            reason={DEADLINE_REASON}
            next={{ href: "/drafts", label: "Back to the queue" }}
          />
        ) : null}

        {published ? (
          <GlassPanel className="p-5" aria-labelledby="published-heading">
            <div className="blockhead">
              <h2 id="published-heading" className="text-[17px]">
                Published
              </h2>
              <VersionBadge
                label={published.corpus_version.label}
                digestPrefix={published.corpus_version.corpus_sha256.slice(0, DIGEST_PREFIX)}
                active={published.corpus_version.is_active}
              />
            </div>
            <p className="mt-3 text-[13px] text-ink-700">
              G3 wrote the lesson, its steps and its spans, created the child corpus version and recounted coverage in
              one transaction. The version is not activated: it is visible to this browser alone.
            </p>
            <dl className="fields mt-3">
              <dt>Revision</dt>
              <dd className="mono">{published.document_revision_id}</dd>
              <dt>Uncovered before</dt>
              <dd className="mono">{published.coverage_recount.uncovered_before}</dd>
              <dt>Uncovered after</dt>
              <dd className="mono">{published.coverage_recount.uncovered_after}</dd>
              <dt>Population</dt>
              <dd className="mono">{published.coverage_recount.population_count}</dd>
              <dt>Recipe</dt>
              <dd className="mono">{published.coverage_recount.recipe_sha256.slice(0, DIGEST_PREFIX)}</dd>
              <dt>Stop list</dt>
              <dd className="mono">{published.coverage_recount.stop_list_sha256.slice(0, DIGEST_PREFIX)}</dd>
            </dl>
            <p className="mt-3 text-[13px]">
              <Link href="/coverage" className="draw">
                The recount on the Coverage Console
              </Link>
            </p>
          </GlassPanel>
        ) : publishedDocumentId ? (
          <GlassPanel className="p-5">
            <p className="m-0 text-[13px] text-ink-700">
              This draft&apos;s lesson is in the corpus.{" "}
              <Link href={`/documents/${encodeURIComponent(publishedDocumentId)}`} className="draw">
                Read {data.draft.opl_id_reserved}
              </Link>
            </p>
          </GlassPanel>
        ) : null}

        <GlassPanel className="p-5" aria-labelledby="redline-heading">
          <div className="blockhead">
            <h2 id="redline-heading" className="text-[17px]">
              Redline
            </h2>
            <span className="text-[12px] text-ink-500">question-blind, no edit path</span>
          </div>
          <p className="mt-1 text-[12px] text-ink-500">
            The adversarial pass reads the draft, the evidence identifiers and the template rules. It returns a
            verdict and reasons and never rewrites a word of the draft.
          </p>
          <RedlineVerdictPanel
            className="mt-4"
            verdicts={data.verdicts}
            pendingText={
              working
                ? "The redliner has not returned a verdict on this round yet."
                : "No redline round was recorded for this draft."
            }
          />
        </GlassPanel>

        <GlassPanel className="p-5" aria-labelledby="rail-heading">
          <div className="blockhead">
            <h2 id="rail-heading" className="text-[17px]">
              State history
            </h2>
            <span className="text-[12px] text-ink-500">
              {data.transitions.length} {data.transitions.length === 1 ? "transition" : "transitions"}
            </span>
          </div>
          <StateRail className="mt-4" transitions={data.transitions} current={data.draft.state} />
        </GlassPanel>
      </div>
    </div>
  );
}

/* The two small forms ------------------------------------------------------------------------------------------ */

function ElementEditor({
  field,
  value,
  onChange,
}: {
  field: DraftField;
  value: { text: string; reason: string };
  onChange: (next: { text: string; reason: string }) => void;
}) {
  const changed = value.text !== field.text;
  return (
    <div className={cx("del-edit")}>
      {changed ? <p className="del-was">{field.text}</p> : null}
      <label htmlFor={`edit-${field.id}`}>New text</label>
      <textarea
        id={`edit-${field.id}`}
        rows={3}
        value={value.text}
        onChange={(event) => onChange({ ...value, text: event.target.value })}
      />
      <label htmlFor={`reason-${field.id}`}>Reason, recorded on the transition</label>
      <input
        id={`reason-${field.id}`}
        value={value.reason}
        onChange={(event) => onChange({ ...value, reason: event.target.value })}
        placeholder="why this element was rewritten"
      />
    </div>
  );
}

function NoteEntry({
  fieldId,
  busy,
  onSubmit,
}: {
  fieldId: string;
  busy: boolean;
  onSubmit: (fieldId: string, text: string, sourceReference: string) => Promise<boolean>;
}) {
  const [value, setValue] = useState("");
  const [reference, setReference] = useState("");
  const textId = `note-${fieldId}`;
  const refId = `note-ref-${fieldId}`;
  return (
    <form
      className="del-edit"
      style={{ marginTop: 0 } as CSSProperties}
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit(fieldId, value.trim(), reference).then((ok) => {
          if (ok) {
            setValue("");
            setReference("");
          }
        });
      }}
    >
      <label htmlFor={textId}>SME note: the engineer&apos;s judgement that fills this slot</label>
      <textarea id={textId} rows={3} value={value} onChange={(event) => setValue(event.target.value)} required />
      <label htmlFor={refId}>Source reference, optional</label>
      <input id={refId} value={reference} onChange={(event) => setReference(event.target.value)} autoComplete="off" />
      <div>
        <NeumorphicChip type="submit" size="sm" disabled={busy || value.trim() === ""}>
          Record the note
        </NeumorphicChip>
      </div>
      <p className="m-0 text-[11.5px] text-ink-500">
        The note is stored with your role alias, the server date and the fixed provenance of 9.6. It is not citeable
        until a Manager publishes the lesson, and the slot keeps its literal either way.
      </p>
    </form>
  );
}
