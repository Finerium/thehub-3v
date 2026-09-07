// The audit reads behind surface 13 (blueprint 6.2 surface 13, 9.7). One rule decides everything here: the two
// safety events are the only rows whose payload carries a request text as it was typed, and that text is readable by
// Admin alone, deliberately, through the view whose own read is audited. The recent-rows panel must therefore be
// unable to render one even if a row of that action reached it, which is a property of the mapper and not only of
// the query's where clause: this file holds the mapper to it.
//
// Hermetic: `@/db/client` is the fake of tests/helpers, so every read is a queued row set. No text below is corpus
// text; the request text is this file's own sentence.
import { beforeEach, describe, expect, it } from "vitest";
import { queueResult, resetFakeDb } from "../../../tests/helpers/fake-db-client";
import { SAFETY_ACTIONS, auditActionCounts, auditTotals, recentAudit } from "./admin-view";

const REQUEST_TEXT = "Synthetic request text written by this test, never a corpus sentence.";

function auditRow(partial: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "audit-test-1",
    actor_alias: "ENG-TEST",
    actor_role: "Engineer",
    action: "answer.issued",
    entity: "answer_trace",
    entity_id: "trace-test-1",
    trace_id: "trace-test-1",
    route: "/api/ask",
    corpus_version_label: "vX",
    server_ts: "2026-09-07T10:00:00Z",
    payload: {},
    ...partial,
  };
}

const SAFETY_PAYLOAD = {
  request_text: REQUEST_TEXT,
  matched_phrase: "synthetic phrase",
  rule_id: "EX-RULE-DEFEAT",
  class: "defeat_protection",
};

beforeEach(() => {
  resetFakeDb();
});

describe("recentAudit", () => {
  it("renders no safety half on the recent-rows panel, whatever payload a row carries (9.7)", async () => {
    queueResult([
      auditRow({ action: SAFETY_ACTIONS[0], payload: SAFETY_PAYLOAD }),
      auditRow({ action: "draft.published", payload: { draft_id: "dr-1" } }),
    ]);

    const entries = await recentAudit(24);

    expect(entries.every((e) => e.safety === null)).toBe(true);
    expect(JSON.stringify(entries)).not.toContain(REQUEST_TEXT);
    // The row itself is still a row: the panel states what happened, it just states no request text.
    expect(entries[0].event.action).toBe(SAFETY_ACTIONS[0]);
    expect(entries[0].event).not.toHaveProperty("payload");
  });

  it("reads the safety half only under the deliberate safety view, in the spelling of 9.7", async () => {
    queueResult([auditRow({ action: SAFETY_ACTIONS[1], payload: SAFETY_PAYLOAD })]);

    const [entry] = await recentAudit(50, { safety: true });

    expect(entry.safety).toEqual({
      request_text: REQUEST_TEXT,
      matched_phrase: "synthetic phrase",
      rule_id: "EX-RULE-DEFEAT",
      rulepack_class: "defeat_protection",
    });
  });

  it("a safety payload the refusal path did not write in full renders nothing rather than a guess", async () => {
    queueResult([auditRow({ action: SAFETY_ACTIONS[0], payload: { rule_id: "EX-RULE-DEFEAT" } })]);

    const [entry] = await recentAudit(50, { safety: true });

    expect(entry.safety).toBeNull();
  });

  it("an event that is not a safety event carries no safety half inside the safety view either", async () => {
    queueResult([auditRow({ action: "draft.published", payload: SAFETY_PAYLOAD })]);

    const [entry] = await recentAudit(50, { safety: true });

    expect(entry.safety).toBeNull();
  });
});

describe("the log's own totals", () => {
  it("orders the action counts by count, then by action, so the sheet reads the same way twice", async () => {
    queueResult([
      { action: "draft.created", n: 2 },
      { action: "answer.issued", n: 9 },
      { action: "auth.role_violation", n: 2 },
    ]);

    expect(await auditActionCounts()).toEqual([
      { action: "answer.issued", n: 9 },
      { action: "auth.role_violation", n: 2 },
      { action: "draft.created", n: 2 },
    ]);
  });

  it("an empty log is zero and zero, not a crash on the Admin sheet", async () => {
    queueResult([]);
    queueResult([]);

    expect(await auditTotals()).toEqual({ total: 0, safety: 0 });
  });
});
