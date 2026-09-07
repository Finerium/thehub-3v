// DecisionButtons (blueprint 6.4, 9.6, 9.9; INV-3): the one component where the permission matrix becomes something
// a person can press, so it is the one component whose logic is worth checking without a browser. The controls it
// draws are asked of the same two functions every route handler asks, which means a wrong answer here is a control
// offered for an act the route would refuse, or a control withheld from a role that holds it.
//
// The component is props-only and server-renderable, so it is rendered to static markup in the node lane: no DOM, no
// test renderer and no new dependency. `createElement` rather than JSX keeps the file a `.test.ts`, which is what
// the unit project includes.
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { DraftState } from "@/contracts/generated/drafts";
import type { Role } from "@/contracts/generated/serving";
import { DecisionButtons } from "./DecisionButtons";

const CONTROLS = ["Accept", "Publish", "Edit with reasons", "Reject", "Re-propose"] as const;

function render(role: Role, state: DraftState): string {
  return renderToStaticMarkup(createElement(DecisionButtons, { role, state }));
}

/** The controls the panel actually drew, in the order of the row. */
function controlsIn(html: string): string[] {
  return CONTROLS.filter((label) => html.includes(`>${label}</`));
}

describe("the decide column of 9.9", () => {
  it("gives the Reviewing Supervisor accept, edit and reject on a draft in review, and no publication", () => {
    expect(controlsIn(render("Reviewing Supervisor", "in_review"))).toEqual(["Accept", "Edit with reasons", "Reject"]);
  });

  it("gives the Manager publish and reject on an accepted draft, and no accept and no edit (INV-3)", () => {
    expect(controlsIn(render("Manager", "accepted"))).toEqual(["Publish", "Reject"]);
  });

  it("gives the Manager nothing on a draft in review, and says the restriction rather than hiding it", () => {
    const html = render("Manager", "in_review");

    expect(controlsIn(html)).toEqual([]);
    expect(html).toContain("reject-from-accepted only");
  });

  it("gives the Reviewing Supervisor nothing on an accepted draft: publication is the Manager's", () => {
    const html = render("Reviewing Supervisor", "accepted");

    expect(controlsIn(html)).toEqual([]);
    expect(html).toContain("INV-3");
  });
});

describe("the roles that hold no column at all", () => {
  it("the Engineer gets no decision and no publication on any state, with the reason named", () => {
    for (const state of ["in_review", "accepted", "blocked", "rejected"] as const) {
      const html = render("Engineer", state);
      expect(controlsIn(html), `Engineer on ${state}`).toEqual([]);
      expect(html).toContain("holds no decide and no publish column");
    }
  });

  it("the Admin gets nothing anywhere: no drafting, no review, no publication (INV-3)", () => {
    for (const state of ["in_review", "accepted", "blocked", "published"] as const) {
      const html = render("Admin", state);
      expect(controlsIn(html), `Admin on ${state}`).toEqual([]);
      expect(html).toContain("no drafting, review or publication right");
    }
  });
});

describe("the transition table of 9.6", () => {
  it("published is terminal: no role is offered a control on it", () => {
    for (const role of ["Engineer", "Reviewing Supervisor", "Manager", "Admin"] as const) {
      expect(controlsIn(render(role, "published")), `${role} on published`).toEqual([]);
    }
    expect(render("Manager", "published")).toContain("Published is terminal");
  });

  it("a blocked or rejected draft is re-proposable by the role that holds create_draft, and by no other", () => {
    for (const state of ["blocked", "rejected"] as const) {
      expect(controlsIn(render("Reviewing Supervisor", state)), `Supervisor on ${state}`).toEqual(["Re-propose"]);
      expect(controlsIn(render("Manager", state)), `Manager on ${state}`).toEqual([]);
    }
  });

  it("a draft the machine lane still holds offers no decision, and says the review controls come with the redline", () => {
    for (const state of ["proposed", "drafted", "redlined"] as const) {
      const html = render("Reviewing Supervisor", state);
      expect(controlsIn(html), `Supervisor on ${state}`).toEqual([]);
      expect(html).toContain("still with the machine lane");
    }
  });
});

describe("the panel itself", () => {
  it("names the role and the state it drew for, and states that every decision is checked again", () => {
    const html = render("Reviewing Supervisor", "in_review");

    expect(html).toContain('data-component="decision-buttons"');
    expect(html).toContain('data-role="Reviewing Supervisor"');
    expect(html).toContain('data-state="in_review"');
    expect(html).toContain("checked again by the route, the state machine");
  });
});
