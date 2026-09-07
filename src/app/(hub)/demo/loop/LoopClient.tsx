"use client";

// Surface 11, the guided loop, the client half (blueprint 6.2 surface 11, 6.3, 7.2; ARCHITECTURE 8.2, 8.4, 8.5,
// 8.6; AC-LOOP-08, AC-LOOP-09, AC-LOOP-11, AC-LOOP-12, AC-LOOP-13, AC-LOOP-15). Six acts on one sheet, each one a
// real call under the 9.9 matrix and each leaving its result on the page, so the walk reads as one story that
// accumulates: the corpus abstains, a lesson is requested, the drafter writes and the redliner rules, a human
// accepts, the Manager publishes through G3, and the same question comes back cited to the lesson that did not
// exist a minute earlier. The publication is the signature moment of 7.2 and is drawn by RecountMoment.
//
//   ask       POST /api/ask                      ask_read       every role
//   request   POST /api/drafts                   create_draft   Reviewing Supervisor
//   draft     GET  /api/drafts/:id (the poll)     view_drafts    the invocation drafts; the poll is the watchdog
//   note      POST /api/sme-notes                 add_sme_note   every role but Admin
//   review    POST /api/drafts/:id/decision       decide         Reviewing Supervisor, from in_review
//   publish   POST /api/drafts/:id/publish        publish        Manager only (INV-3)
//
// D-16: the sandbox is this browser, not this login, so an act the session's role may not take is not hidden and
// not faked: it states the role it needs and offers the switch (a form post that logs out and returns to this
// route with the username prefilled). Nothing is simulated: an act that cannot run (the budget, the role, a
// blocked draft, a gate refusal) renders the designed state of 6.3 that says why, with its next step.
//
// The draft is drawn by the components the Drafts surface owns (StateRail, RedlineVerdictPanel, SlotField), so the
// two surfaces read the same draft the same way. DecisionButtons is not used here: it offers every control the
// matrix allows, and this route is a scripted walk with no tracked-changes editor behind an edit control, which
// would be a dead control (6.3). Each act therefore carries the one button it can service.
import Link from "next/link";
import { REQUEST_LESSON_ACTION } from "@/lib/fixed-strings";
import { useCallback, useEffect, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { z } from "zod";
import { can, canDecide } from "@/auth/matrix";
import { AbstentionCard } from "@/components/AbstentionCard";
import { CaveatLine } from "@/components/CaveatLine";
import { cx } from "@/components/cx";
import { DesignedState } from "@/components/DesignedState";
import { EvidenceList } from "@/components/EvidenceLine";
import { GlassPanel } from "@/components/GlassPanel";
import { NeumorphicChip } from "@/components/NeumorphicChip";
import { PartialAnswerBanner } from "@/components/PartialAnswerBanner";
import { RecountMoment, type RecountSide } from "@/components/RecountMoment";
import { RedlineVerdictPanel } from "@/components/RedlineVerdictPanel";
import { RefusalCard } from "@/components/RefusalCard";
import { SlotField } from "@/components/SlotField";
import { StateRail } from "@/components/StateRail";
import { StatusBadge } from "@/components/StatusBadge";
import { VersionBadge } from "@/components/VersionBadge";
import { CoverageSummary, DebtCluster } from "@/contracts/generated/coverage";
import { DraftDocument, DraftField, DraftTransition, RedlineVerdict, SmeNote } from "@/contracts/generated/drafts";
import type { EvidencePacket } from "@/contracts/generated/evidence_packet";
import { CorpusVersion, type Role } from "@/contracts/generated/serving";
import type { UncoveredRecord } from "@/db/queries/loop-view";
import { AskError, askStream, type AskFailure, type EvidenceLine as EvidenceStage } from "@/lib/ask-stream";

/* Props --------------------------------------------------------------------------------------------------------- */

export type LoopClientProps = {
  session: { alias: string; role: Role };
  /** The reading of the version this browser sees, both layers, as the recount's baseline. */
  before: RecountSide;
  method: { recipe_sha256: string; stop_list_sha256: string };
  versionIsActive: boolean;
  cluster: {
    id: string;
    equipment_tag: string;
    rank: number;
    score: number;
    incomplete_uncovered: number;
    uncovered_wo_numbers: string[];
  };
  /** The record the walk teaches. */
  record: UncoveredRecord;
  /** The cluster's other uncovered records, named so the walk does not look like the whole debt. */
  otherRecords: UncoveredRecord[];
  question: string;
  /** The draft this browser already owns on the cluster, so a reload resumes rather than starting again. */
  draft: DraftDocument | null;
  demoUsernames: Partial<Record<Role, string>>;
  route: string;
};

/* Wordings of this surface (fixed strings of 6.3 come from src/lib/fixed-strings.ts) ----------------------------- */

const TITLE = "The guided loop";
const LEAD =
  "One record that no lesson covers, walked from an abstention to a published lesson and back to the same question. Every act below is a real call under the permission matrix, on this browser's sandbox: the corpus version it creates is never activated, and no other visitor's numbers move. The sandbox belongs to the browser and not to the login, so an act this role may not take offers the switch and the walk stays where it is.";
const SANDBOX_NOTE = "This browser's sandbox";
const TARGET = "The record this walk teaches";
const CLUSTER_LEAD = "Highest-ranked knowledge-debt cluster";
const RANK = "rank";
const SCORE = "score";
const INCOMPLETE = "incomplete closeout among the uncovered";
const ALSO_UNCOVERED = "Also uncovered on this cluster";
const REPORTED = "reported";
const PRIORITY = "priority";
const OPEN_CLUSTER = "Open the cluster";
const OPEN_RECORD = "Open the asset history";

const ACT = "act";
const ROLE_NEEDED = "Role";
/** The status of an act, in the one word the head row carries. */
const STATUS_WORD = { waiting: "waiting", ready: "ready", running: "running", done: "done", blocked: "blocked" } as const;
const ROLE_SYSTEM = "system";
const ROLE_ANY = "any signed-in role";
const SWITCH_TITLE = "This act needs another role";
const SWITCH_BODY = (role: string, mine: string) => `The matrix gives this act to ${role}; this session is signed in as ${mine}.`;
const SWITCH_ACTION = (role: string, username: string) => `Sign out and continue as ${role} (${username})`;
const SWITCH_NO_ACCOUNT = (role: string) =>
  `The matrix gives this act to ${role}, and this deployment carries no demo account for that role, so the walk cannot go further from this browser.`;

const QUESTION_LABEL = "The question";
const ASK_BEFORE_TITLE = "Ask before the lesson exists";
const ASK_BEFORE_BODY =
  "The same rule pack, retrieval and gates every question runs through. No document of this asset teaches this record, so the answer lane has nothing to entail a claim from.";
const ASK_ACTION = "Ask the question";
const ASK_AGAIN_TITLE = "Ask again";
const ASK_AGAIN_BODY =
  "The identical question against the corpus version the publication created. What changed is not the model and not the recipe: it is one more approved document in the retrieved set.";
const ASK_AGAIN_ACTION = "Ask the same question again";
const ASKING = "Resolving scope and retrieving.";
const ASK_EVIDENCE = "Evidence listed. Composing the packet.";
const OUTCOME = "outcome";
const OPEN_TRACE = "Open the trace";
const NO_PACKET = "The stream closed before the packet line, so nothing is shown here.";

const REQUEST_TITLE = REQUEST_LESSON_ACTION;
const REQUEST_BODY =
  "The request names the cluster and nothing else. The route answers immediately with the draft id and drafts inside the same invocation under a lease, so no page waits on a provider call.";
const REQUEST_ACTION = "Request the lesson";
const REQUEST_DONE = "Draft requested";

const DRAFT_TITLE = "The drafter writes, the redliner rules";
const DRAFT_BODY =
  "AG-3 fills the six-section house template with a source tag on every element; the verbatim and numeric checks run before any human sees it; AG-4 redlines the draft question-blind and may block it once. The poll below is also the lease watchdog: a draft whose invocation died is moved to blocked rather than stranded.";
const DRAFT_POLLING = "Polling the draft.";
const DRAFT_STATE = "state";
const DRAFT_LESSON = "reserved lesson id";
const DRAFT_ELEMENTS = "elements";
const DRAFT_SLOTS = "engineer slots";
const DRAFT_REQUESTED_BY = "requested by";
const DRAFT_PENDING = "The redliner has not returned a verdict on this draft yet.";
const DRAFT_HISTORY = "State history";
const DRAFT_OPEN = "Open the draft";
const DRAFT_BLOCKED_TITLE = "The redliner blocked this draft";
const DRAFT_BLOCKED_TEXT =
  "The draft did not pass its second redline round, or its lease ran out before the invocation finished. Nothing was published and nothing was written to the corpus. A blocked draft is re-proposable: a new draft is linked to this one and carries its evidence and its reasons.";
const REPROPOSE_ACTION = "Re-propose the lesson";

const REVIEW_TITLE = "Review and accept";
const REVIEW_BODY =
  "A person reads the draft and decides. The Reviewing Supervisor may accept, edit with reasons, or reject; the Manager may only reject a draft that is already accepted. Every decision writes a transition row and an audit event.";
const REVIEW_ACTION = "Accept the draft";
const REVIEW_DONE = "Accepted";
const SLOT_LEAD =
  "The drafter never writes a slot: it stands as the fixed literal until an engineer records a judgement against it. The note is attributed to a role alias and a date, is not citeable until the lesson is published, and carries the fixed unverified-value line once it is.";
const SLOT_LABEL = "Engineer note";
const SLOT_PLACEHOLDER = "The judgement this slot needs, in the engineer's own words.";
const SLOT_SOURCE_LABEL = "Source reference, optional";
const SLOT_ACTION = "Record the note";
const SLOT_RECORDED = "Note recorded";

const PUBLISH_TITLE = "Publish through G3";
const PUBLISH_BODY =
  "One transaction under an advisory lock: the gate re-reads the draft, refuses anything that is not accepted and any slot without a note, writes the lesson and its spans, creates a child corpus version that is never activated, and recounts coverage under the baseline's own recipe.";
const PUBLISH_ACTION = "Publish the lesson";
const PUBLISH_DONE = "Published";
const PUBLISHED_REVISION = "document revision";
const RECOUNT_BEFORE = "uncovered before";
const RECOUNT_AFTER = "uncovered after";

const WAITING = "Waiting for the act above.";
const RUNNING = "Running.";
const DONE = "Done.";
const RETRY = "Try again";
const OPEN_CONSOLE = "Coverage Console";
const CONSOLE_HREF = "/coverage";
const DRAFTS_HREF = "/drafts";

/* Designed-state wordings for the failures these calls can produce (6.3) ---------------------------------------- */

const BUDGET_TITLE = "Live answering is off for today";
const BUDGET_TEXT =
  "The daily budget of the live role is spent, so no provider call is made. The seeded surfaces and every read-only surface keep working; the walk resumes when the budget resets.";
const RATE_TITLE = "Too many requests from this account";
const RATE_TEXT = "The route refused this call under its per-minute limit. Nothing was written; the walk resumes when the limit resets.";
const FORBIDDEN_TITLE = "This role may not take that act";
const FORBIDDEN_TEXT =
  "The route refused the call under the permission matrix and wrote the role violation to the audit log. Switch to the role the act names and take it again.";
const GATE_TITLE = "G3 refused this publication";
const GATE_TEXT =
  "The gate read the draft again inside its transaction and refused it. Nothing was written: no lesson, no corpus version and no recount.";
const CONFLICT_TITLE = "This draft is already published";
const CONFLICT_TEXT =
  "Another request published this draft first, so this one was refused with a conflict rather than publishing a second time. Exactly one revision and one corpus version exist.";
const HTTP_TITLE = "The route refused this call";
const HTTP_TEXT = "The call came back with a designed refusal rather than a result. Nothing was written by it.";
const NETWORK_TITLE = "The call did not reach the route";
const NETWORK_TEXT = "The browser could not complete the request, so nothing was sent and nothing was written.";
const UNAUTH_TITLE = "This session has expired";
const UNAUTH_TEXT = "The session behind this browser is gone, so the route refused the call. Sign in again and the sandbox resumes where it is.";
const SIGN_IN_AGAIN = "Sign in";

/* Contract-checked bodies of the routes this surface calls (9.9) ------------------------------------------------ */

/** 9.5: the population every headline of the Console and of this walk is taken over. */
const HEADLINE_POPULATION = "unplanned_failure";

// POST /api/drafts answers { draft_id, state }; POST /api/drafts/:id/repropose answers { draft_id } alone (9.9),
// so the state is optional here and the poll is what tells this surface where the new draft stands.
const CreatedBody = z.object({ draft_id: z.string(), state: z.string().optional() }).loose();
const DraftBody = z.object({
  draft: DraftDocument,
  fields: z.array(DraftField),
  verdicts: z.array(RedlineVerdict),
  transitions: z.array(DraftTransition),
});
const PublishBody = z.object({
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
const CoverageBody = z.object({ summaries: z.array(CoverageSummary), clusters: z.array(DebtCluster) }).loose();

type DraftBody = z.infer<typeof DraftBody>;
type PublishBody = z.infer<typeof PublishBody>;

/** A refusal of one of the JSON routes: the status, the code it wrote, and the fields the designed state names. */
type Problem = { status: number; code: string; gate?: string; reason?: string; field_id?: string; request_id: string | null };

const ProblemBody = z.object({ error: z.string(), request_id: z.string().optional(), gate: z.string().optional(), reason: z.string().optional(), field_id: z.string().optional() }).loose();

async function problemOf(response: Response): Promise<Problem> {
  const requestId = response.headers.get("x-request-id");
  const parsed = ProblemBody.safeParse(await response.json().catch(() => null));
  if (!parsed.success) return { status: response.status, code: "unreadable", request_id: requestId };
  return {
    status: response.status,
    code: parsed.data.error,
    gate: parsed.data.gate,
    reason: parsed.data.reason,
    field_id: parsed.data.field_id,
    request_id: parsed.data.request_id ?? requestId,
  };
}

/** One call to a JSON route of this application; a refusal is thrown as a Problem, never rendered as a result. */
async function call<T>(input: string, init: RequestInit, shape: z.ZodType<T>): Promise<T> {
  // egress: none (same-origin routes of this application; the provider is reached only by src/gateway)
  let response: Response;
  try {
    response = await fetch(input, { credentials: "same-origin", ...init });
  } catch {
    throw { status: 0, code: "network", request_id: null } satisfies Problem;
  }
  if (!response.ok) throw await problemOf(response);
  const parsed = shape.safeParse(await response.json().catch(() => null));
  if (!parsed.success) throw { status: response.status, code: "contract", request_id: response.headers.get("x-request-id") } satisfies Problem;
  return parsed.data;
}

function isProblem(value: unknown): value is Problem {
  return typeof value === "object" && value !== null && "status" in value && "code" in value;
}

/* The acts ------------------------------------------------------------------------------------------------------ */

type ActId = "ask_before" | "request" | "draft" | "review" | "publish" | "ask_after";
type ActStatus = "waiting" | "ready" | "running" | "done" | "blocked";

const ACTS: ReadonlyArray<{ id: ActId; name: string; role: string }> = [
  { id: "ask_before", name: "Abstain", role: ROLE_ANY },
  { id: "request", name: "Request", role: "Reviewing Supervisor" },
  { id: "draft", name: "Draft", role: ROLE_SYSTEM },
  { id: "review", name: "Review", role: "Reviewing Supervisor" },
  { id: "publish", name: "Publish", role: "Manager" },
  { id: "ask_after", name: "Ask again", role: ROLE_ANY },
];

/** The states the poll keeps polling through (9.6: the machine is still working on the draft). */
const PENDING_STATES = ["proposed", "drafted", "redlined"];
const POLL_MS = 1500;

/** The roles the 9.9 matrix gives each human act; the walk offers the first that has a demo account. */
function rolesFor(act: ActId): Role[] {
  const roles: Role[] = ["Engineer", "Reviewing Supervisor", "Manager", "Admin"];
  if (act === "request") return roles.filter((r) => can(r, "create_draft"));
  if (act === "review") return roles.filter((r) => canDecide(r, "accept", "in_review"));
  if (act === "publish") return roles.filter((r) => can(r, "publish"));
  return roles.filter((r) => can(r, "ask_read"));
}

function allowed(act: ActId, role: Role): boolean {
  return rolesFor(act).includes(role);
}

/* Small renders ------------------------------------------------------------------------------------------------- */

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;

function utc(iso: string): string {
  return `${iso.slice(0, 16).replace("T", " ")} UTC`;
}

/** The refusal of a JSON route as the designed state of 6.3 it stands for. */
function ProblemState({ problem, onRetry }: { problem: Problem; onRetry?: () => void }) {
  const retry = onRetry ? <p className="mt-4"><NeumorphicChip size="sm" onClick={onRetry}>{RETRY}</NeumorphicChip></p> : null;
  if (problem.status === 401) {
    return <DesignedState inline code="401" title={UNAUTH_TITLE} explanation={UNAUTH_TEXT} next={{ href: "/login", label: SIGN_IN_AGAIN }} />;
  }
  if (problem.status === 403) {
    return <DesignedState inline code="403" tone="defect" title={FORBIDDEN_TITLE} explanation={FORBIDDEN_TEXT} reason={problem.request_id ?? undefined} />;
  }
  if (problem.status === 409) {
    return <DesignedState inline code="409" tone="caveat" title={CONFLICT_TITLE} explanation={CONFLICT_TEXT} reason={problem.code} />;
  }
  if (problem.status === 422) {
    return (
      <DesignedState
        inline
        code={problem.gate ?? "422"}
        tone="defect"
        title={GATE_TITLE}
        explanation={GATE_TEXT}
        reason={[problem.reason, problem.field_id].filter(Boolean).join(" ") || problem.code}
        next={{ href: DRAFTS_HREF, label: DRAFT_OPEN }}
      >
        {retry}
      </DesignedState>
    );
  }
  if (problem.status === 429) {
    return <DesignedState inline code="429" tone="caveat" title={RATE_TITLE} explanation={RATE_TEXT} reason={problem.code}>{retry}</DesignedState>;
  }
  if (problem.status === 0) {
    return <DesignedState inline title={NETWORK_TITLE} explanation={NETWORK_TEXT} tone="defect">{retry}</DesignedState>;
  }
  return (
    <DesignedState inline code={String(problem.status)} tone="defect" title={HTTP_TITLE} explanation={HTTP_TEXT} reason={problem.code}>
      {retry}
    </DesignedState>
  );
}

/** The typed failure of POST /api/ask as its designed state (the same states surface 2 renders). */
function AskFailureState({ failure, onRetry }: { failure: AskFailure; onRetry: () => void }) {
  const retry = <p className="mt-4"><NeumorphicChip size="sm" onClick={onRetry}>{RETRY}</NeumorphicChip></p>;
  if (failure.kind === "budget_exhausted") {
    return (
      <DesignedState inline code="429" tone="caveat" title={BUDGET_TITLE} explanation={BUDGET_TEXT} reason={`${failure.role}, resets ${utc(failure.resets_at)}`}>
        {retry}
      </DesignedState>
    );
  }
  if (failure.kind === "rate_limited") {
    return (
      <DesignedState inline code="429" tone="caveat" title={RATE_TITLE} explanation={RATE_TEXT} reason={`${failure.scope}, limit ${failure.limit}, resets ${utc(failure.resets_at)}`}>
        {retry}
      </DesignedState>
    );
  }
  if (failure.kind === "unauthenticated") {
    return <DesignedState inline code="401" title={UNAUTH_TITLE} explanation={UNAUTH_TEXT} next={{ href: "/login", label: SIGN_IN_AGAIN }} />;
  }
  if (failure.kind === "forbidden") {
    return <DesignedState inline code="403" tone="defect" title={FORBIDDEN_TITLE} explanation={FORBIDDEN_TEXT} reason={failure.request_id ?? undefined} />;
  }
  if (failure.kind === "network" || failure.kind === "aborted") {
    return <DesignedState inline title={NETWORK_TITLE} explanation={NETWORK_TEXT} tone="defect">{retry}</DesignedState>;
  }
  if (failure.kind === "stream") {
    return <DesignedState inline title={HTTP_TITLE} explanation={NO_PACKET} tone="defect" reason={failure.message}>{retry}</DesignedState>;
  }
  if (failure.kind === "hash_mismatch") {
    return <DesignedState inline code="409" tone="defect" title={HTTP_TITLE} explanation={HTTP_TEXT} reason={`hash_mismatch ${failure.opl_id}`} />;
  }
  return <DesignedState inline code={String(failure.status)} tone="defect" title={HTTP_TITLE} explanation={HTTP_TEXT} reason={failure.code}>{retry}</DesignedState>;
}

type AskState = {
  status: "idle" | "running" | "done" | "failed";
  evidence: EvidenceStage | null;
  packet: EvidencePacket | null;
  failure: AskFailure | null;
};

const IDLE_ASK: AskState = { status: "idle", evidence: null, packet: null, failure: null };

/** The packet as the outcome it is: a refusal, an abstention, or the claims with their gaps and caveat. */
function AskOutcome({ state, clusterId, onRetry }: { state: AskState; clusterId: string; onRetry: () => void }) {
  if (state.status === "failed" && state.failure) return <AskFailureState failure={state.failure} onRetry={onRetry} />;
  if (state.status === "running") {
    return (
      <p className="text-[13px] text-ink-500" role="status">
        {state.evidence === null ? ASKING : ASK_EVIDENCE}
      </p>
    );
  }
  const packet = state.packet;
  if (packet === null) return null;
  return (
    <div className="grid gap-4">
      <p className="flex flex-wrap items-center gap-2 text-[12.5px] text-ink-500">
        <span className="tag" data-tone="accent">
          {OUTCOME} {packet.outcome}
        </span>
        <span className="mono">{packet.corpus_version}</span>
        <Link href={`/trace/${packet.trace_id}`} className="draw">
          {OPEN_TRACE}
        </Link>
      </p>
      {packet.refusal ? <RefusalCard refusal={packet.refusal} /> : null}
      {packet.gaps_declared.length > 0 ? <PartialAnswerBanner gaps={packet.gaps_declared} /> : null}
      {packet.claims.length > 0 ? (
        <GlassPanel className="p-5">
          <EvidenceList claims={packet.claims} aria-label="Claims" />
        </GlassPanel>
      ) : null}
      {packet.abstention ? <AbstentionCard abstention={packet.abstention} clusterHref={`${CONSOLE_HREF}/clusters/${clusterId}`} /> : null}
      {packet.caveat ? <CaveatLine kind="as_built" /> : null}
    </div>
  );
}

/** The role switch of D-16: a form post that logs out and returns to this route with the username prefilled. */
function RoleSwitch({ act, role, mine, usernames, route, className }: { act: ActId; role: Role; mine: Role; usernames: Partial<Record<Role, string>>; route: string; className?: string }) {
  const target = rolesFor(act).find((r) => usernames[r] !== undefined);
  const username = target ? usernames[target] : undefined;
  return (
    <div className={cx("empty", className)}>
      <p className="font-medium text-ink-900">{SWITCH_TITLE}</p>
      <p className="mt-1 max-w-prose text-[13px]">{target && username ? SWITCH_BODY(role, mine) : SWITCH_NO_ACCOUNT(role)}</p>
      {target && username ? (
        <form action="/api/auth/logout" method="post" className="mt-3">
          <input type="hidden" name="username" value={username} />
          <input type="hidden" name="next" value={route} />
          <button type="submit" className="neu text-[13px]">
            <span>{SWITCH_ACTION(target, username)}</span>
            <span aria-hidden className="mono">
              &rarr;
            </span>
          </button>
        </form>
      ) : null}
    </div>
  );
}

/** One act: the numbered cell, the role it needs, its status, and whatever it has produced so far. */
function Act({
  n,
  id,
  title,
  body,
  status,
  role,
  children,
}: {
  n: number;
  id: ActId;
  title: string;
  body: string;
  status: ActStatus;
  role: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rise grid grid-cols-[52px_minmax(0,1fr)] gap-x-5" style={stagger(n)} data-act={id} data-status={status} aria-labelledby={`act-${id}`}>
      <div className="flex flex-col items-center">
        <span
          className={cx(
            "mono flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-medium",
            status === "done" ? "bg-[color-mix(in_srgb,var(--state-verified)_14%,transparent)] text-verified" : null,
            status === "blocked" ? "bg-[color-mix(in_srgb,var(--state-defect)_12%,transparent)] text-defect" : null,
            status === "waiting" ? "bg-[color-mix(in_srgb,var(--ink-500)_10%,transparent)] text-ink-500" : null,
            status === "ready" || status === "running" ? "bg-[color-mix(in_srgb,var(--accent)_12%,transparent)] text-accent" : null,
          )}
        >
          {n}
        </span>
        <span aria-hidden className={cx("mt-2 w-px flex-1", n === ACTS.length ? "hidden" : "bg-edge")} />
      </div>
      <div className={cx("min-w-0", n === ACTS.length ? "pb-2" : "pb-10")}>
        <p className="mono flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-edge pb-1.5 text-[11px] text-ink-500">
          <span>
            {ACT} {n} / {ACTS.length}
          </span>
          <span>
            {ROLE_NEEDED}: {role} &middot; {STATUS_WORD[status]}
          </span>
        </p>
        <h2 id={`act-${id}`} className="mt-2 text-[22px]">
          {title}
        </h2>
        <p className="mt-2 max-w-[70ch] text-[13.5px] text-ink-700">{body}</p>
        <div className="mt-4 grid gap-4">{children}</div>
      </div>
    </section>
  );
}

/* The surface --------------------------------------------------------------------------------------------------- */

export function LoopClient(props: LoopClientProps) {
  const { session, before, method, versionIsActive, cluster, record, otherRecords, question, demoUsernames, route } = props;

  const [askBefore, setAskBefore] = useState<AskState>(IDLE_ASK);
  const [askAfter, setAskAfter] = useState<AskState>(IDLE_ASK);
  const [draftId, setDraftId] = useState<string | null>(props.draft?.id ?? null);
  const [draft, setDraft] = useState<DraftBody | null>(null);
  const [notes, setNotes] = useState<Record<string, SmeNote>>({});
  const [published, setPublished] = useState<PublishBody | null>(null);
  const [after, setAfter] = useState<RecountSide | null>(null);
  const [busy, setBusy] = useState<ActId | null>(null);
  const [problem, setProblem] = useState<Partial<Record<ActId, Problem>>>({});
  const polling = useRef(false);

  const fail = useCallback((act: ActId, error: unknown) => {
    setProblem((p) => ({ ...p, [act]: isProblem(error) ? error : { status: 0, code: "network", request_id: null } }));
  }, []);
  const clear = useCallback((act: ActId) => setProblem((p) => ({ ...p, [act]: undefined })), []);

  /* Act 1 and act 6: POST /api/ask, the two-line stream (9.8) ---------------------------------------------------- */

  const ask = useCallback(
    async (set: (updater: (s: AskState) => AskState) => void) => {
      set(() => ({ status: "running", evidence: null, packet: null, failure: null }));
      try {
        await askStream(
          { question },
          {
            onEvidence: (line) => set((s) => ({ ...s, evidence: line })),
            onPacket: (line) => set((s) => ({ ...s, status: "done", packet: line.packet })),
          },
        );
      } catch (error) {
        const failure = error instanceof AskError ? error.failure : ({ kind: "network", message: String(error) } as AskFailure);
        set((s) => ({ ...s, status: "failed", failure }));
      }
    },
    [question],
  );

  /* Act 2: POST /api/drafts ------------------------------------------------------------------------------------- */

  const request = useCallback(async () => {
    setBusy("request");
    clear("request");
    try {
      const created = await call("/api/drafts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ cluster_id: cluster.id }) }, CreatedBody);
      setDraftId(created.draft_id);
    } catch (error) {
      fail("request", error);
    } finally {
      setBusy(null);
    }
  }, [cluster.id, clear, fail]);

  // 9.6, AC-LOOP-14: a blocked or rejected draft re-proposes as a new linked draft; a published one is a 409.
  const repropose = useCallback(async () => {
    if (draftId === null) return;
    setBusy("request");
    clear("draft");
    try {
      const created = await call(`/api/drafts/${encodeURIComponent(draftId)}/repropose`, { method: "POST" }, CreatedBody);
      setDraft(null);
      setNotes({});
      setDraftId(created.draft_id);
    } catch (error) {
      fail("draft", error);
    } finally {
      setBusy(null);
    }
  }, [draftId, clear, fail]);

  /* Act 3: the poll, which is also the lease watchdog (ADR-004) -------------------------------------------------- */

  useEffect(() => {
    if (draftId === null || polling.current) return;
    let live = true;
    let timer = 0;
    polling.current = true;
    const tick = async () => {
      try {
        const body = await call(`/api/drafts/${encodeURIComponent(draftId)}`, { method: "GET" }, DraftBody);
        if (!live) return;
        setDraft(body);
        if (PENDING_STATES.includes(body.draft.state)) timer = window.setTimeout(tick, POLL_MS);
        else polling.current = false;
      } catch (error) {
        if (!live) return;
        polling.current = false;
        fail("draft", error);
      }
    };
    void tick();
    return () => {
      live = false;
      polling.current = false;
      window.clearTimeout(timer);
    };
  }, [draftId, fail]);

  /* Act 4: POST /api/sme-notes and POST /api/drafts/:id/decision ------------------------------------------------- */

  const addNote = useCallback(
    async (event: FormEvent<HTMLFormElement>, fieldId: string) => {
      event.preventDefault();
      if (draftId === null) return;
      const form = new FormData(event.currentTarget);
      const text = String(form.get("text") ?? "").trim();
      const source = String(form.get("source_reference") ?? "").trim();
      if (text.length === 0) return;
      setBusy("review");
      clear("review");
      try {
        const note = await call(
          "/api/sme-notes",
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ draft_id: draftId, field_id: fieldId, text, ...(source.length > 0 ? { source_reference: source } : {}) }),
          },
          SmeNote,
        );
        setNotes((n) => ({ ...n, [fieldId]: note }));
      } catch (error) {
        fail("review", error);
      } finally {
        setBusy(null);
      }
    },
    [draftId, clear, fail],
  );

  const accept = useCallback(async () => {
    if (draftId === null) return;
    setBusy("review");
    clear("review");
    try {
      await call(
        `/api/drafts/${encodeURIComponent(draftId)}/decision`,
        { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision: "accept" }) },
        z.object({ state: z.string() }).loose(),
      );
      const body = await call(`/api/drafts/${encodeURIComponent(draftId)}`, { method: "GET" }, DraftBody);
      setDraft(body);
    } catch (error) {
      fail("review", error);
    } finally {
      setBusy(null);
    }
  }, [draftId, clear, fail]);

  /* Act 5: POST /api/drafts/:id/publish, then the recount read back (8.6, AC-LOOP-12) ---------------------------- */

  const publish = useCallback(async () => {
    if (draftId === null) return;
    setBusy("publish");
    clear("publish");
    try {
      const result = await call(`/api/drafts/${encodeURIComponent(draftId)}/publish`, { method: "POST" }, PublishBody);
      setPublished(result);
      const coverage = await call("/api/coverage", { method: "GET" }, CoverageBody);
      const generous = coverage.summaries.find((s) => s.population === HEADLINE_POPULATION && s.layer === "generous");
      const strict = coverage.summaries.find((s) => s.population === HEADLINE_POPULATION && s.layer === "strict");
      const recounted = coverage.clusters.find((c) => c.equipment_tag === cluster.equipment_tag) ?? null;
      if (generous && strict) {
        setAfter({
          version: { label: result.corpus_version.label, digest_prefix: result.corpus_version.corpus_sha256.slice(0, 8) },
          generous: { layer: "generous", threshold: generous.threshold, uncovered_count: generous.uncovered_count, population_count: generous.population_count, bands: generous.bands },
          strict: { layer: "strict", threshold: strict.threshold, uncovered_count: strict.uncovered_count, population_count: strict.population_count, bands: strict.bands },
          cluster: recounted ? { rank: recounted.rank, score: recounted.score, uncovered_wo_numbers: recounted.uncovered_wo_numbers } : null,
        });
      }
      const body = await call(`/api/drafts/${encodeURIComponent(draftId)}`, { method: "GET" }, DraftBody);
      setDraft(body);
    } catch (error) {
      fail("publish", error);
    } finally {
      setBusy(null);
    }
  }, [draftId, cluster.equipment_tag, clear, fail]);

  /* Derived state ------------------------------------------------------------------------------------------------ */

  const state = draft?.draft.state ?? null;
  const fields = draft?.fields ?? [];
  const slots = fields.filter((f) => f.is_slot);
  const slotsFilled = slots.every((f) => notes[f.id] !== undefined);

  const statusOf = (act: ActId): ActStatus => {
    if (act === "ask_before") return askBefore.status === "done" ? "done" : askBefore.status === "running" ? "running" : "ready";
    if (act === "request") return draftId !== null ? "done" : askBefore.status === "done" ? "ready" : "waiting";
    if (act === "draft") {
      if (state === null) return draftId === null ? "waiting" : "running";
      if (state === "blocked" || state === "rejected") return "blocked";
      return PENDING_STATES.includes(state) ? "running" : "done";
    }
    if (act === "review") {
      if (state === "accepted" || state === "published") return "done";
      if (state === "in_review") return busy === "review" ? "running" : "ready";
      return "waiting";
    }
    if (act === "publish") {
      if (state === "published") return "done";
      if (state === "accepted") return busy === "publish" ? "running" : "ready";
      return "waiting";
    }
    return askAfter.status === "done" ? "done" : askAfter.status === "running" ? "running" : state === "published" ? "ready" : "waiting";
  };

  return (
    <div className="pb-4">
      <header className="grid items-end gap-6 border-b border-edge pb-7 lg:grid-cols-[minmax(0,1fr)_max-content]">
        <div>
          <h1 className="rise text-[42px]" style={stagger(0)}>
            {TITLE}
          </h1>
          <p className="rise mt-3 max-w-[70ch] text-[14.5px] text-ink-700" style={stagger(1)}>
            {LEAD}
          </p>
        </div>
        <div className="rise flex flex-col items-start gap-2 lg:items-end" style={stagger(2)}>
          <VersionBadge label={after?.version.label ?? before.version.label} digestPrefix={after?.version.digest_prefix ?? before.version.digest_prefix} active={after === null && versionIsActive} />
          <p className="text-[12.5px] text-ink-500">{SANDBOX_NOTE}</p>
          <p className="badge" data-tone="accent">
            {session.role}
            <span className="mono font-normal text-ink-700">{session.alias}</span>
          </p>
        </div>
      </header>

      {/* The target: the cluster and the record the walk teaches, in the record's own fields. */}
      <div className="rise mt-7" style={stagger(3)}>
        <GlassPanel className="p-6" aria-labelledby="loop-target">
          <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
            <p className="eyebrow">
              {CLUSTER_LEAD}: <span className="mono text-ink-900">{cluster.id}</span>
            </p>
            <p className="flex flex-wrap items-baseline gap-x-4 text-[12.5px] text-ink-500">
              <span>
                {RANK} <span className="mono text-ink-900">{cluster.rank}</span>
              </span>
              <span>
                {SCORE} <span className="mono text-ink-900">{cluster.score.toFixed(4)}</span>
              </span>
              <span>
                {INCOMPLETE} <span className="mono text-ink-900">{cluster.incomplete_uncovered}</span>
              </span>
            </p>
          </div>

          <h2 id="loop-target" className="mt-4 text-[20px]">
            {TARGET}
          </h2>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
            <span className="mono text-[14px] font-medium text-ink-900">{record.wo_number}</span>
            <span className="mono text-ink-700">{record.equipment_tag}</span>
            <span className="text-ink-500">
              {REPORTED} <span className="mono">{record.report_date.slice(0, 10)}</span>
            </span>
            <span className="text-ink-500">
              {PRIORITY} <span className="mono">{record.priority}</span>
            </span>
            {record.closeout_complete ? null : <StatusBadge kind="incomplete_closeout" />}
          </p>
          <p className="verbatim mt-3 max-w-[80ch] text-[13.5px] text-ink-900">{record.problem_description}</p>
          <p className="verbatim mt-2 max-w-[80ch] text-[13.5px] text-ink-700">{record.corrective_action}</p>

          {otherRecords.length > 0 ? (
            <p className="mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[12.5px] text-ink-500">
              <span className="eyebrow">{ALSO_UNCOVERED}</span>
              {otherRecords.map((r) => (
                <span key={r.wo_number} className="mono text-ink-700">
                  {r.wo_number}
                </span>
              ))}
            </p>
          ) : null}

          <p className="mt-5 flex flex-wrap gap-3">
            <Link href={`${CONSOLE_HREF}/clusters/${cluster.id}`} className="neu text-[13px]">
              <span>{OPEN_CLUSTER}</span>
              <span aria-hidden className="mono">
                &rarr;
              </span>
            </Link>
            <Link href={`/failures/${cluster.equipment_tag}`} className="neu text-[13px]">
              <span>{OPEN_RECORD}</span>
              <span aria-hidden className="mono">
                &rarr;
              </span>
            </Link>
          </p>
        </GlassPanel>
      </div>

      <div className="mt-9 grid">
        {/* Act 1: the abstention. */}
        <Act n={1} id="ask_before" title={ASK_BEFORE_TITLE} body={ASK_BEFORE_BODY} status={statusOf("ask_before")} role={ACTS[0].role}>
          <p className="text-[13px]">
            <span className="eyebrow">{QUESTION_LABEL}</span>
            <span className="mt-1 block max-w-[80ch] text-[13.5px] text-ink-900">{question}</span>
          </p>
          {askBefore.status === "idle" ? (
            <p>
              <NeumorphicChip onClick={() => void ask(setAskBefore)}>{ASK_ACTION}</NeumorphicChip>
            </p>
          ) : null}
          <AskOutcome state={askBefore} clusterId={cluster.id} onRetry={() => void ask(setAskBefore)} />
        </Act>

        {/* Act 2: the request. */}
        <Act n={2} id="request" title={REQUEST_TITLE} body={REQUEST_BODY} status={statusOf("request")} role={ACTS[1].role}>
          {draftId !== null ? (
            <p className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
              <span className="badge" data-tone="verified">
                {REQUEST_DONE}
              </span>
              <span className="mono text-ink-700">{draftId}</span>
            </p>
          ) : !allowed("request", session.role) ? (
            <RoleSwitch act="request" role={ACTS[1].role as Role} mine={session.role} usernames={demoUsernames} route={route} />
          ) : askBefore.status !== "done" ? (
            <p className="text-[13px] text-ink-500">{WAITING}</p>
          ) : (
            <p>
              <NeumorphicChip onClick={() => void request()} disabled={busy === "request"}>
                {busy === "request" ? RUNNING : REQUEST_ACTION}
              </NeumorphicChip>
            </p>
          )}
          {problem.request ? <ProblemState problem={problem.request} onRetry={() => void request()} /> : null}
        </Act>

        {/* Act 3: the drafter and the redliner. */}
        <Act n={3} id="draft" title={DRAFT_TITLE} body={DRAFT_BODY} status={statusOf("draft")} role={ROLE_SYSTEM}>
          {draftId === null ? (
            <p className="text-[13px] text-ink-500">{WAITING}</p>
          ) : draft === null ? (
            <p className="text-[13px] text-ink-500" role="status">
              {DRAFT_POLLING}
            </p>
          ) : (
            <>
              <div className="fields text-[13px]">
                <dt>{DRAFT_STATE}</dt>
                <dd className="mono">{draft.draft.state}</dd>
                <dt>{DRAFT_LESSON}</dt>
                <dd className="mono">{draft.draft.opl_id_reserved}</dd>
                <dt>{DRAFT_ELEMENTS}</dt>
                <dd className="mono">{fields.length}</dd>
                <dt>{DRAFT_SLOTS}</dt>
                <dd className="mono">{slots.length}</dd>
                <dt>{DRAFT_REQUESTED_BY}</dt>
                <dd className="mono">{draft.draft.created_by_alias}</dd>
              </div>
              <p className="flex flex-wrap items-center gap-2 text-[13px]">
                <StatusBadge kind="machine_drafted" />
                <span className="mono text-[12px] text-ink-500">{draft.draft.model_id}</span>
                <span className="mono text-[12px] text-ink-500">{draft.draft.prompt_version}</span>
              </p>
              <RedlineVerdictPanel verdicts={draft.verdicts} pendingText={DRAFT_PENDING} />
              <div>
                <p className="eyebrow mb-2">{DRAFT_HISTORY}</p>
                <StateRail transitions={draft.transitions} current={draft.draft.state} />
              </div>
              <p>
                <Link href={`${DRAFTS_HREF}/${draft.draft.id}`} className="draw text-[13px]">
                  {DRAFT_OPEN}
                </Link>
              </p>
              {state === "blocked" || state === "rejected" ? (
                <DesignedState
                  inline
                  tone="defect"
                  title={DRAFT_BLOCKED_TITLE}
                  explanation={DRAFT_BLOCKED_TEXT}
                  reason={draft.transitions.at(-1)?.reason ?? state}
                  next={{ href: `${DRAFTS_HREF}/${draft.draft.id}`, label: DRAFT_OPEN }}
                >
                  {allowed("request", session.role) ? (
                    <p className="mt-4">
                      <NeumorphicChip onClick={() => void repropose()} disabled={busy === "request"}>
                        {busy === "request" ? RUNNING : REPROPOSE_ACTION}
                      </NeumorphicChip>
                    </p>
                  ) : (
                    <RoleSwitch act="request" role={ACTS[1].role as Role} mine={session.role} usernames={demoUsernames} route={route} className="mt-4" />
                  )}
                </DesignedState>
              ) : null}
            </>
          )}
          {problem.draft ? <ProblemState problem={problem.draft} /> : null}
        </Act>

        {/* Act 4: the human decision, and the engineer note a slot needs first. */}
        <Act n={4} id="review" title={REVIEW_TITLE} body={REVIEW_BODY} status={statusOf("review")} role={ACTS[3].role}>
          {state === "accepted" || state === "published" ? (
            <p>
              <span className="badge" data-tone="verified">
                {REVIEW_DONE}
              </span>
            </p>
          ) : !allowed("review", session.role) ? (
            <RoleSwitch act="review" role={ACTS[3].role as Role} mine={session.role} usernames={demoUsernames} route={route} />
          ) : state === "in_review" ? (
              <>
                {slots.length > 0 ? <p className="max-w-[72ch] text-[13px] text-ink-700">{SLOT_LEAD}</p> : null}
                {slots.map((slot) => {
                  const note = notes[slot.id];
                  return (
                    <SlotField key={slot.id} fieldId={slot.id} notes={note ? [note] : []}>
                      {note ? (
                        <span className="badge" data-tone="verified">
                          {SLOT_RECORDED}
                        </span>
                      ) : (
                        <form className="grid gap-3" onSubmit={(event) => void addNote(event, slot.id)}>
                          <label className="grid gap-1 text-[12.5px] text-ink-500">
                            <span>{SLOT_LABEL}</span>
                            <textarea
                              name="text"
                              rows={3}
                              required
                              maxLength={4000}
                              placeholder={SLOT_PLACEHOLDER}
                              className="w-full max-w-[70ch] rounded-[8px] bg-paper px-3 py-2 text-[13.5px] text-ink-900 shadow-[inset_0_0_0_1px_var(--film-edge)]"
                            />
                          </label>
                          <label className="grid gap-1 text-[12.5px] text-ink-500">
                            <span>{SLOT_SOURCE_LABEL}</span>
                            <input
                              name="source_reference"
                              type="text"
                              maxLength={500}
                              className="mono w-full max-w-[40ch] rounded-[8px] bg-paper px-3 py-2 text-[13px] text-ink-900 shadow-[inset_0_0_0_1px_var(--film-edge)]"
                            />
                          </label>
                          <p>
                            <NeumorphicChip type="submit" size="sm" disabled={busy === "review"}>
                              {SLOT_ACTION}
                            </NeumorphicChip>
                          </p>
                        </form>
                      )}
                    </SlotField>
                  );
                })}
                <p>
                  <NeumorphicChip onClick={() => void accept()} disabled={busy === "review" || !slotsFilled}>
                    {busy === "review" ? RUNNING : REVIEW_ACTION}
                  </NeumorphicChip>
                </p>
              </>
          ) : (
            <p className="text-[13px] text-ink-500">{WAITING}</p>
          )}
          {problem.review ? <ProblemState problem={problem.review} onRetry={() => void accept()} /> : null}
        </Act>

        {/* Act 5: G3, and the signature moment of 7.2. */}
        <Act n={5} id="publish" title={PUBLISH_TITLE} body={PUBLISH_BODY} status={statusOf("publish")} role={ACTS[4].role}>
          {state === "published" ? (
            <p className="flex flex-wrap items-baseline gap-x-3 text-[13px]">
              <span className="badge" data-tone="verified">
                {PUBLISH_DONE}
              </span>
              {published ? (
                <>
                  <span className="text-ink-500">{PUBLISHED_REVISION}</span>
                  <span className="mono text-ink-700">{published.document_revision_id}</span>
                </>
              ) : null}
            </p>
          ) : !allowed("publish", session.role) ? (
            <RoleSwitch act="publish" role={ACTS[4].role as Role} mine={session.role} usernames={demoUsernames} route={route} />
          ) : state === "accepted" ? (
            <p>
              <NeumorphicChip onClick={() => void publish()} disabled={busy === "publish"}>
                {busy === "publish" ? RUNNING : PUBLISH_ACTION}
              </NeumorphicChip>
            </p>
          ) : (
            <p className="text-[13px] text-ink-500">{WAITING}</p>
          )}

          {published ? (
            <p className="flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13px]">
              <span className="text-ink-500">
                {RECOUNT_BEFORE} <span className="mono text-ink-900">{published.coverage_recount.uncovered_before}</span>
              </span>
              <span className="text-ink-500">
                {RECOUNT_AFTER} <span className="mono text-ink-900">{published.coverage_recount.uncovered_after}</span>
              </span>
              <Link href={CONSOLE_HREF} className="draw">
                {OPEN_CONSOLE}
              </Link>
            </p>
          ) : null}

          <GlassPanel className="p-6">
            <RecountMoment before={before} after={after} method={method} record={record.wo_number} />
          </GlassPanel>

          {problem.publish ? <ProblemState problem={problem.publish} onRetry={() => void publish()} /> : null}
        </Act>

        {/* Act 6: the same question, one lesson later. */}
        <Act n={6} id="ask_after" title={ASK_AGAIN_TITLE} body={ASK_AGAIN_BODY} status={statusOf("ask_after")} role={ACTS[5].role}>
          {state !== "published" ? (
            <p className="text-[13px] text-ink-500">{WAITING}</p>
          ) : askAfter.status === "idle" ? (
            <p>
              <NeumorphicChip onClick={() => void ask(setAskAfter)}>{ASK_AGAIN_ACTION}</NeumorphicChip>
            </p>
          ) : null}
          {state === "published" ? <AskOutcome state={askAfter} clusterId={cluster.id} onRetry={() => void ask(setAskAfter)} /> : null}
          {askAfter.status === "done" ? <p className="text-[13px] text-ink-500">{DONE}</p> : null}
        </Act>
      </div>
    </div>
  );
}
