// The permission matrix of blueprint 9.9, every role against every column, plus the per-role restriction inside the
// `decide` column (the Manager rejects from accepted only).
import { describe, expect, it } from "vitest";
import { DraftState } from "@/contracts/generated/drafts";
import { Role } from "@/contracts/generated/serving";
import { MATRIX, PERMISSIONS, can, canDecide, type Decision, type Permission } from "./matrix";

// 9.9 verbatim, columns in the blueprint's order: ask_read, view_drafts, create_draft, decide, publish,
// activate_version, add_sme_note. "reject-from-accepted only" holds the column (canDecide narrows it).
const BLUEPRINT_9_9: Record<Role, [boolean, boolean, boolean, boolean, boolean, boolean, boolean]> = {
  Engineer: [true, true, false, false, false, false, true],
  "Reviewing Supervisor": [true, true, true, true, false, false, true],
  Manager: [true, true, false, true, true, false, true],
  Admin: [true, false, false, false, false, true, false],
};

describe("9.9 matrix", () => {
  it("names exactly the seven columns in the blueprint's order", () => {
    expect(PERMISSIONS).toEqual([
      "ask_read",
      "view_drafts",
      "create_draft",
      "decide",
      "publish",
      "activate_version",
      "add_sme_note",
    ]);
  });

  it("covers exactly the four roles of 9.7", () => {
    expect(Object.keys(MATRIX).sort()).toEqual([...Role.options].sort());
  });

  for (const role of Role.options) {
    for (const [i, permission] of PERMISSIONS.entries()) {
      const expected = BLUEPRINT_9_9[role][i];
      it(`${role} ${expected ? "holds" : "lacks"} ${permission}`, () => {
        expect(can(role, permission)).toBe(expected);
        expect(MATRIX[role][permission]).toBe(expected);
      });
    }
  }

  it("Admin reads and activates versions but never sees a draft or notes one", () => {
    const admin = PERMISSIONS.filter((p: Permission) => can("Admin", p));
    expect(admin).toEqual(["ask_read", "activate_version"]);
  });

  it("only the Manager publishes and only the Reviewing Supervisor creates a draft", () => {
    expect(Role.options.filter((r) => can(r, "publish"))).toEqual(["Manager"]);
    expect(Role.options.filter((r) => can(r, "create_draft"))).toEqual(["Reviewing Supervisor"]);
  });
});

describe("decide restriction (9.9, 9.6)", () => {
  const decisions: Decision[] = ["accept", "edit", "reject"];

  it("the Reviewing Supervisor decides on a draft in review, with any decision, and nowhere else", () => {
    for (const decision of decisions) {
      expect(canDecide("Reviewing Supervisor", decision, "in_review")).toBe(true);
      for (const state of DraftState.options.filter((s) => s !== "in_review")) {
        expect(canDecide("Reviewing Supervisor", decision, state)).toBe(false);
      }
    }
  });

  it("the Manager may only reject a draft that is already accepted", () => {
    expect(canDecide("Manager", "reject", "accepted")).toBe(true);
    expect(canDecide("Manager", "accept", "accepted")).toBe(false);
    expect(canDecide("Manager", "edit", "accepted")).toBe(false);
    for (const state of DraftState.options.filter((s) => s !== "accepted")) {
      expect(canDecide("Manager", "reject", state)).toBe(false);
    }
  });

  it("the Engineer and the Admin never decide", () => {
    for (const role of ["Engineer", "Admin"] as const) {
      for (const decision of decisions) {
        for (const state of DraftState.options) expect(canDecide(role, decision, state)).toBe(false);
      }
    }
  });
});
