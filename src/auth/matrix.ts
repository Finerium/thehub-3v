// The permission matrix of blueprint 9.9 as data. Every route handler and every server component asks this table
// through authorize(); the proxy is never the authority (ARCHITECTURE section 5).
import type { DraftState } from "@/contracts/generated/drafts";
import type { Role } from "@/contracts/generated/serving";

export const PERMISSIONS = [
  "ask_read",
  "view_drafts",
  "create_draft",
  "decide",
  "publish",
  "activate_version",
  "add_sme_note",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

// 9.9, verbatim. The Manager's `decide` column reads "reject-from-accepted only": the column is held, and the
// restriction is expressed by canDecide(), which the decision route calls after authorize("decide").
export const MATRIX: Readonly<Record<Role, Readonly<Record<Permission, boolean>>>> = {
  Engineer: {
    ask_read: true,
    view_drafts: true,
    create_draft: false,
    decide: false,
    publish: false,
    activate_version: false,
    add_sme_note: true,
  },
  "Reviewing Supervisor": {
    ask_read: true,
    view_drafts: true,
    create_draft: true,
    decide: true,
    publish: false,
    activate_version: false,
    add_sme_note: true,
  },
  Manager: {
    ask_read: true,
    view_drafts: true,
    create_draft: false,
    decide: true,
    publish: true,
    activate_version: false,
    add_sme_note: true,
  },
  Admin: {
    ask_read: true,
    view_drafts: false,
    create_draft: false,
    decide: false,
    publish: false,
    activate_version: true,
    add_sme_note: false,
  },
};

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[role][permission];
}

// The decision body of POST /api/drafts/:id/decision (9.9)
export type Decision = "accept" | "edit" | "reject";

// The per-role restriction inside the `decide` column (9.9, 9.6): the Reviewing Supervisor decides on a draft in
// review (accept, edit, reject); the Manager may only reject a draft that is already accepted. Actor legality of
// the transition itself is enforced again by src/loop/state.ts.
export function canDecide(role: Role, decision: Decision, fromState: DraftState): boolean {
  if (role === "Reviewing Supervisor") return fromState === "in_review";
  if (role === "Manager") return decision === "reject" && fromState === "accepted";
  return false;
}
