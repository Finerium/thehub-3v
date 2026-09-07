// The draft state machine (blueprint 9.6 transitions, 9.7 audit actions; ARCHITECTURE 3.2 and 8.4; AC-LOOP-08).
// This module is the ONE writer of `draft_document.state`. `transition()` runs inside the caller's transaction: it
// re-reads the row FOR UPDATE, checks the 9.6 pair and the one actor 9.6 names for it, then writes the state, one
// `draft_transition` row and one `audit_log` row, all on the same transaction, so a state without its history or
// its audit event cannot exist. A pair 9.6 does not name, or a legal pair attempted by the wrong actor, throws
// IllegalTransition and writes nothing; an unknown draft is the typed NotFound.
//
// The database holds the same pair table as a CHECK constraint on draft.draft_transition (ARCHITECTURE 3.2), so an
// illegal pair written straight past this module is refused by Postgres as well (AC-LOOP-08's direct-write leg).
// Actor legality is code only: the constraint cannot see who is asking. The Admin appears in no row of the table,
// which is INV-3 as data: no drafting, review or publication right at all.
import { eq } from "drizzle-orm";
import type { DraftState, DraftTransition } from "@/contracts/generated/drafts";
import type { AuditAction } from "@/contracts/generated/serving";
import { withTransaction, type Tx } from "@/db/client";
import { lockDraft } from "@/db/queries/loop";
import { auditLog, draftDocument, draftTransition } from "@/db/schema";
import { NotFound } from "@/lib/errors";
import { log } from "@/lib/log";

export type Actor = { alias: string; role: DraftTransition["actor_role"] };

/** 9.6: the system is the actor of every machine step, spelled as this literal pair on the transition row. */
export const SYSTEM_ACTOR: Actor = { alias: "system", role: "system" };

/** ADR-004: the one reason a lease expiry may carry, and the only way a non-terminal state reaches `blocked`. */
export const DEADLINE_REASON = "deadline_exceeded";

/** 9.6: `published`, `blocked` and `rejected` are terminal; a lease expires only on the rest. */
export const NON_TERMINAL_STATES: readonly DraftState[] = ["proposed", "drafted", "redlined", "in_review", "accepted"];

type Rule = { role: Actor["role"]; action: AuditAction };

// Blueprint 9.6, verbatim: from -> to, the one actor that may do it, and the 9.7 action the pair writes. The audit
// enum closes at six draft actions, so several pairs share one: every redline outcome is `draft.redlined`, a body
// written or rewritten (including the supervisor's in-review edit) is `draft.created`.
const PAIRS: Readonly<Record<string, Rule>> = {
  "proposed>drafted": { role: "system", action: "draft.created" },
  "drafted>redlined": { role: "system", action: "draft.redlined" },
  "redlined>in_review": { role: "system", action: "draft.redlined" },
  "redlined>drafted": { role: "system", action: "draft.created" },
  "redlined>blocked": { role: "system", action: "draft.redlined" },
  "in_review>in_review": { role: "Reviewing Supervisor", action: "draft.created" },
  "in_review>accepted": { role: "Reviewing Supervisor", action: "draft.accepted" },
  "in_review>rejected": { role: "Reviewing Supervisor", action: "draft.rejected" },
  "accepted>published": { role: "Manager", action: "draft.published" },
  "accepted>rejected": { role: "Manager", action: "draft.rejected" },
  "blocked>proposed": { role: "Reviewing Supervisor", action: "draft.reproposed" },
  "rejected>proposed": { role: "Reviewing Supervisor", action: "draft.reproposed" },
};

// The lease escape of ADR-004 first: any non-terminal state to `blocked` with that one reason, by the system alone.
// It takes precedence over the named (redlined, blocked) pair, so a lease expiry is audited as the rejection it is
// rather than as a redline verdict; without the reason, (redlined, blocked) stays the redliner's second block.
function ruleFor(from: DraftState, to: DraftState, reason: string | null): Rule | null {
  if (to === "blocked" && reason === DEADLINE_REASON && NON_TERMINAL_STATES.includes(from)) {
    return { role: "system", action: "draft.rejected" };
  }
  return PAIRS[`${from}>${to}`] ?? null;
}

export class IllegalTransition extends Error {
  constructor(
    readonly from: DraftState,
    readonly to: DraftState,
    readonly violation: "pair" | "actor",
    readonly actorRole: Actor["role"],
  ) {
    super(
      violation === "pair"
        ? `draft transition ${from} -> ${to} is not one 9.6 names`
        : `draft transition ${from} -> ${to} is not open to ${actorRole}`,
    );
    this.name = "IllegalTransition";
  }
}

/**
 * The audit row a transition writes cannot be derived inside the transaction, so the caller names its context:
 * `route` is the 9.9 route pattern (never the concrete pathname), `auditId` is the request id so `x-request-id`
 * equals the audit event id (9.9), and `corpusVersionId` overrides the draft's own version, which is how the
 * published event binds to the child version G3 creates rather than to the active one (AC-LOOP-12).
 */
export type TransitionOptions = { route: string; auditId?: string; corpusVersionId?: string };

export type Moved = { from: DraftState; to: DraftState };

/** Called with an open transaction: the caller's own transaction carries the state, the row and the audit event. */
type InTransaction = [
  tx: Tx,
  draftId: string,
  to: DraftState,
  actor: Actor,
  reason: string | null,
  editDiff: string | null,
  options: TransitionOptions,
];

/** Called without one: the drafting lane's system steps stand alone, so this module opens the transaction itself. */
type OnItsOwn = [
  draftId: string,
  to: DraftState,
  actor: Actor,
  reason?: string | null,
  editDiff?: string | null,
  options?: TransitionOptions,
];

/** Where a system transition happens when the caller names no route: the drafting lane of ARCHITECTURE 8.2. */
const DRAFTING_LANE: TransitionOptions = { route: "/api/drafts" };

// The two declared forms, the transaction-first one last so `Parameters<typeof transition>` names it.
export function transition(
  draftId: string,
  to: DraftState,
  actor: Actor,
  reason?: string | null,
  editDiff?: string | null,
  options?: TransitionOptions,
): Promise<Moved>;
export function transition(
  tx: Tx,
  draftId: string,
  to: DraftState,
  actor: Actor,
  reason: string | null,
  editDiff: string | null,
  options: TransitionOptions,
): Promise<Moved>;
export function transition(...args: InTransaction | OnItsOwn): Promise<Moved> {
  const own = typeof args[0] === "string";
  const [draftId, to, actor, reason = null, editDiff = null, options = DRAFTING_LANE] = (
    own ? args : args.slice(1)
  ) as OnItsOwn;
  const write = (tx: Tx): Promise<Moved> => transitionIn(tx, draftId, to, actor, reason, editDiff, options);
  return own ? withTransaction(write) : write(args[0] as Tx);
}

async function transitionIn(
  tx: Tx,
  draftId: string,
  to: DraftState,
  actor: Actor,
  reason: string | null,
  editDiff: string | null,
  options: TransitionOptions,
): Promise<Moved> {
  const draft = await lockDraft(tx, draftId);
  if (!draft) throw new NotFound("draft", draftId);

  const from = draft.state;
  const rule = ruleFor(from, to, reason);
  if (!rule) throw new IllegalTransition(from, to, "pair", actor.role);
  if (rule.role !== actor.role) throw new IllegalTransition(from, to, "actor", actor.role);

  await tx.update(draftDocument).set({ state: to }).where(eq(draftDocument.id, draftId));
  await tx.insert(draftTransition).values({
    id: crypto.randomUUID(),
    draftId,
    fromState: from,
    toState: to,
    actorAlias: actor.alias,
    actorRole: actor.role,
    reason,
    editDiff,
    serverTs: new Date(),
  });

  // 9.7 payload rules: a draft event carries the draft id, the two states and the reason, never a body or a note.
  const auditId = options.auditId ?? crypto.randomUUID();
  const corpusVersionId = options.corpusVersionId ?? draft.corpusVersionId;
  await tx.insert(auditLog).values({
    id: auditId,
    actorAlias: actor.alias,
    actorRole: actor.role,
    action: rule.action,
    entity: "draft",
    entityId: draftId,
    payload: { draft_id: draftId, from_state: from, to_state: to, reason },
    traceId: null,
    route: options.route,
    corpusVersionId,
  });
  log.info({
    event: "audit",
    audit_id: auditId,
    action: rule.action,
    entity: "draft",
    entity_id: draftId,
    actor_alias: actor.alias,
    actor_role: actor.role,
    route: options.route,
    trace_id: null,
    corpus_version_id: corpusVersionId,
  });

  return { from, to };
}
