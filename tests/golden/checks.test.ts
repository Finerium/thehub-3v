// One block per check module of blueprint 9.11, over synthetic packets: the form the runner evaluates (pass and
// fail) and the form it does not (unsupported, never a pass). The last block asserts the registry is exhaustive
// over the contract's enum, so a check type added to section 9 cannot slip through as a silent green.
import { describe, expect, it } from "vitest";
import type { GoldenCase } from "@/contracts/generated/golden_case";
import { CHECKS, runCheck } from "../../scripts/golden/checks";
import type { CheckContext } from "../../scripts/golden/checks";
import type { Answer } from "../../scripts/golden/view";
import { answer, citation, packet, trace } from "./packet";

const CHECK_TYPES: GoldenCase["checks"][number]["type"][] = [
  "citation_resolves",
  "numeral_fidelity",
  "string_present",
  "string_absent",
  "rulepack_class",
  "block_order",
  "hash_render",
  "http_status",
  "audit_event",
  "version_increment",
  "trace_replays",
];

function goldenCase(overrides: Partial<GoldenCase> = {}): GoldenCase {
  return {
    id: "GS-TEST",
    category: "Grounded answering",
    hard_gate: false,
    tier: "A",
    input: { question: "a question the report never prints" },
    expected: {
      outcome: "answer",
      must_cite: [],
      must_contain: [],
      must_not_contain: [],
      numerals_allowed: [],
    },
    sources: [],
    checks: [],
    origin: "team",
    ...overrides,
  };
}

function context(overrides: Partial<CheckContext> = {}): CheckContext {
  return {
    goldenCase: goldenCase(),
    answer: answer(),
    status: 200,
    route: "POST /api/ask",
    corpusVersion: "v1",
    audit: [],
    earlier: new Map<string, Answer>(),
    ...overrides,
  };
}

const run = (type: GoldenCase["checks"][number]["type"], args: Record<string, unknown>, ctx: CheckContext) =>
  runCheck({ type, args }, ctx);

describe("citation_resolves", () => {
  it("passes when every must_cite document is among the packet's citations", () => {
    const ctx = context({ goldenCase: goldenCase({ expected: { ...goldenCase().expected, must_cite: ["TEST-DOC-1"] } }) });
    expect(run("citation_resolves", { from: "expected.must_cite" }, ctx).status).toBe("pass");
  });

  it("fails naming the documents that are not cited", () => {
    const ctx = context({ goldenCase: goldenCase({ expected: { ...goldenCase().expected, must_cite: ["TEST-DOC-9"] } }) });
    const verdict = run("citation_resolves", { from: "expected.must_cite" }, ctx);
    expect(verdict).toMatchObject({ status: "fail" });
    expect(verdict.status === "fail" && verdict.detail).toContain("TEST-DOC-9");
  });

  it("honours min_count", () => {
    const ctx = context();
    expect(run("citation_resolves", { from: "expected.must_cite", min_count: 4 }, ctx).status).toBe("fail");
  });

  it("reports the targeted corpus forms unsupported", () => {
    const verdict = run("citation_resolves", { doc: "TEST-IL-1", row: "T3", row_kind: "trip" }, context());
    expect(verdict).toMatchObject({ status: "unsupported" });
    expect(verdict.status === "unsupported" && verdict.detail).toContain("row_kind");
  });
});

describe("numeral_fidelity", () => {
  const allowed = [{ value: "7.4", unit: "units", source_ref: "TEST-DOC-1 row 1" }];

  it("passes when every rendered numeral is in the closed set", () => {
    const ctx = context({ goldenCase: goldenCase({ expected: { ...goldenCase().expected, numerals_allowed: allowed } }) });
    expect(run("numeral_fidelity", { from: "expected.numerals_allowed" }, ctx).status).toBe("pass");
  });

  it("fails on a numeral the set does not carry", () => {
    const ctx = context({
      goldenCase: goldenCase({ expected: { ...goldenCase().expected, numerals_allowed: allowed } }),
      answer: answer(packet({ claims: [{ id: "c1", text: "The test claim states 9.9 units.", citations: [citation()], entailment: "entailed" }] })),
    });
    const verdict = run("numeral_fidelity", { from: "expected.numerals_allowed" }, ctx);
    expect(verdict).toMatchObject({ status: "fail" });
    expect(verdict.status === "fail" && verdict.detail).toContain("9.9");
  });

  it("accounts for a numeral that lives inside an allowed unit", () => {
    const ctx = context({
      goldenCase: goldenCase({ expected: { ...goldenCase().expected, numerals_allowed: [{ value: "0.12", unit: "mm/100mm", source_ref: "TEST-DOC-1" }] } }),
      answer: answer(packet({ claims: [{ id: "c1", text: "Misalignment 0.12 mm/100mm.", citations: [citation()], entailment: "entailed" }] })),
    });
    expect(run("numeral_fidelity", { from: "expected.numerals_allowed" }, ctx).status).toBe("pass");
  });
});

describe("string_present", () => {
  it("reads the case's must_contain list", () => {
    const ctx = context({ goldenCase: goldenCase({ expected: { ...goldenCase().expected, must_contain: ["7.4 units"] } }) });
    expect(run("string_present", { from: "expected.must_contain" }, ctx).status).toBe("pass");
  });

  it("checks one string in one field", () => {
    expect(run("string_present", { in: "claims", text: "test claim" }, context()).status).toBe("pass");
    expect(run("string_present", { in: "claims", text: "absent" }, context()).status).toBe("fail");
  });

  it("checks an ordered list and rejects the wrong order", () => {
    const ctx = context({ answer: answer(packet({ blocks: [{ kind: "ladder", order: 1, label: "Ladder", items: ["alarm", "trip", "relief"] }] })) });
    expect(run("string_present", { in: "blocks.ladder", ordered: ["alarm", "trip", "relief"] }, ctx).status).toBe("pass");
    expect(run("string_present", { in: "blocks.ladder", ordered: ["relief", "alarm"] }, ctx).status).toBe("fail");
  });

  it("checks a named field for a value and for emptiness", () => {
    const ctx = context({ answer: answer(packet({ gaps_declared: ["a declared gap"] })) });
    expect(run("string_present", { field: "gaps_declared", in: "packet", nonempty: true }, ctx).status).toBe("pass");
    expect(run("string_present", { field: "gaps_declared", in: "packet" }, context()).status).toBe("fail");
  });

  it("reports a field path outside the vocabulary unsupported", () => {
    expect(run("string_present", { in: "draft.sections", text: "x" }, context()).status).toBe("unsupported");
    expect(run("string_present", { in: "export TheHub_prototype.html", text: "x" }, context()).status).toBe("unsupported");
  });

  it("never prints the expected string in a failure", () => {
    const verdict = run("string_present", { in: "claims", text: "a secret corpus sentence" }, context());
    expect(verdict.status === "fail" && verdict.detail).not.toContain("a secret corpus sentence");
  });
});

describe("string_absent", () => {
  it("checks a string, a pattern and a Python inline flag", () => {
    expect(run("string_absent", { in: "claims", text: "absent" }, context()).status).toBe("pass");
    expect(run("string_absent", { in: "claims", text: "test claim" }, context()).status).toBe("fail");
    expect(run("string_absent", { in: "claims", pattern: "(?i)\\bTEST CLAIM\\b" }, context()).status).toBe("fail");
    expect(run("string_absent", { in: "claims", pattern: "\\bnever\\b" }, context()).status).toBe("pass");
  });

  it("checks emptiness of a field the packet omits", () => {
    expect(run("string_absent", { empty: true, in: "blocks.effects" }, context()).status).toBe("pass");
    expect(run("string_absent", { empty: true, in: "claims" }, context()).status).toBe("fail");
  });

  it("reads the case's must_not_contain list", () => {
    const ctx = context({ goldenCase: goldenCase({ expected: { ...goldenCase().expected, must_not_contain: ["never written"] } }) });
    expect(run("string_absent", { from: "expected.must_not_contain" }, ctx).status).toBe("pass");
  });

  it("reports an unknown field path unsupported rather than empty", () => {
    expect(run("string_absent", { empty: true, in: "review_queue" }, context()).status).toBe("unsupported");
  });
});

describe("rulepack_class", () => {
  const refused = () =>
    answer(
      packet({
        outcome: "refusal",
        rulepack: { version: "1", class: "defeat" },
        claims: [],
        refusal: {
          class: "defeat",
          function: { seq_id: "SEQ-1", sil: 1, ce_doc_no: "TEST-IL-1", ce_revision: "0" },
          permissives: [],
          reset_note: null,
          route_text: "the fixed route text",
          moc_text: null,
          rule_id: "R2-defeat",
          matched_phrase: "a phrase",
        },
      }),
      trace({ outcome: "refusal", rulepack: { version: "1", class: "defeat", rule_id: "R2-defeat", matched_phrase: "a phrase", decided_at: "2026-09-07T00:00:00.000Z" } }),
    );

  it("passes on the class, the rule, the phrase, the function and the language", () => {
    const ctx = context({ answer: refused() });
    expect(run("rulepack_class", { class: "defeat", rule_id: "R2-defeat", matched_phrase: "a phrase", function: "SEQ-1", language: "en", decided_before_model_call: true }, ctx).status).toBe("pass");
  });

  it("fails on the wrong class and on the wrong rule", () => {
    const ctx = context({ answer: refused() });
    expect(run("rulepack_class", { class: "none" }, ctx).status).toBe("fail");
    expect(run("rulepack_class", { class: "defeat", rule_id: "R1-permanent-change" }, ctx).status).toBe("fail");
  });

  it("fails when a refused request recorded a prompt", () => {
    const withPrompt = refused();
    const ctx = context({ answer: { ...withPrompt, trace: trace({ outcome: "refusal", prompts: [{ role: "AG-2", version: "v2", sha256: "0".repeat(64) }] }) } });
    expect(run("rulepack_class", { class: "defeat", decided_before_model_call: true }, ctx).status).toBe("fail");
  });

  it("reports the rule-pack port forms unsupported", () => {
    expect(run("rulepack_class", { class: "defeat", rule_id: "R2-defeat", text: "a sentence to classify" }, context({ answer: refused() })).status).toBe("unsupported");
    expect(run("rulepack_class", { artefact: "a draft", blocked: true, class: "defeat" }, context({ answer: refused() })).status).toBe("unsupported");
  });
});

describe("block_order", () => {
  const withBlocks = (kinds: string[]) =>
    answer(packet({ template: "readiness", blocks: kinds.map((kind, i) => ({ kind, order: i + 1, label: kind, items: ["one"] })) as never }));

  it("passes on the pinned order and notes a block beyond it", () => {
    const gc = goldenCase({ expected: { ...goldenCase().expected, block_order: ["permissives", "proof_tests"] } });
    const ctx = context({ goldenCase: gc, answer: withBlocks(["permissives", "proof_tests", "lessons"]) });
    const verdict = run("block_order", { template: "readiness", inferred_by: "rulepack.moment_keywords", from: "expected.block_order" }, ctx);
    expect(verdict).toMatchObject({ status: "pass" });
    expect(verdict.status === "pass" && verdict.note).toContain("lessons");
  });

  it("fails on a missing block and on the wrong order", () => {
    const gc = goldenCase({ expected: { ...goldenCase().expected, block_order: ["permissives", "proof_tests"] } });
    expect(run("block_order", { from: "expected.block_order" }, context({ goldenCase: gc, answer: withBlocks(["permissives"]) })).status).toBe("fail");
    expect(run("block_order", { from: "expected.block_order" }, context({ goldenCase: gc, answer: withBlocks(["proof_tests", "permissives"]) })).status).toBe("fail");
  });

  it("fails on the wrong template", () => {
    const gc = goldenCase({ expected: { ...goldenCase().expected, block_order: ["permissives"] } });
    expect(run("block_order", { template: "trip", from: "expected.block_order" }, context({ goldenCase: gc, answer: withBlocks(["permissives"]) })).status).toBe("fail");
  });
});

describe("hash_render", () => {
  const served = (steps: { n: number; hash_ok: true }[]) =>
    answer(
      packet({
        procedure: {
          opl_id: "OPL-TEST-01",
          revision: "0",
          permit_block: [],
          steps: steps.map((s) => ({ n: s.n, text: `step ${s.n}`, hash_ok: s.hash_ok, span_id: `span-${s.n}` })),
          protective_functions_affected: null,
        },
      }),
    );

  it("passes when the named steps render under their hashes", () => {
    const ctx = context({ answer: served([{ n: 1, hash_ok: true }, { n: 2, hash_ok: true }]) });
    expect(run("hash_render", { opl_id: "OPL-TEST-01", steps: [1, 2], count: 2 }, ctx).status).toBe("pass");
  });

  it("fails on a missing step, the wrong lesson and the wrong count", () => {
    const ctx = context({ answer: served([{ n: 1, hash_ok: true }]) });
    expect(run("hash_render", { opl_id: "OPL-TEST-01", steps: [1, 2] }, ctx).status).toBe("fail");
    expect(run("hash_render", { opl_id: "OPL-OTHER-02", steps: [1] }, ctx).status).toBe("fail");
    expect(run("hash_render", { opl_id: "OPL-TEST-01", steps: [1], count: 5 }, ctx).status).toBe("fail");
    expect(run("hash_render", { opl_id: "OPL-TEST-01", steps: [1] }, context()).status).toBe("fail");
  });

  it("reports the draft-comparison and block forms unsupported", () => {
    expect(run("hash_render", { artefact: "a draft", compare: ["before", "after"], equal: true }, context()).status).toBe("unsupported");
    expect(run("hash_render", { opl_id: "OPL-TEST-01", steps: [1], block: "return_to_service" }, context()).status).toBe("unsupported");
  });
});

describe("http_status", () => {
  it("compares the status of the route the runner drives", () => {
    expect(run("http_status", { route: "POST /api/ask", status: 200 }, context()).status).toBe("pass");
    expect(run("http_status", { route: "POST /api/ask", status: 429 }, context()).status).toBe("fail");
  });

  it("reports another route unsupported", () => {
    const verdict = run("http_status", { route: "POST /api/drafts", role: "Reviewing Supervisor", status: 202 }, context());
    expect(verdict).toMatchObject({ status: "unsupported" });
    expect(verdict.status === "unsupported" && verdict.detail).toContain("/api/drafts");
  });
});

describe("audit_event", () => {
  const rows = [{ action: "safety.request_refused", trace_id: "trace-1", payload: { rule_id: "R2-defeat", matched_phrase: "a phrase", request_text: "pseudonymised" } }];

  it("asserts an action was written and carries its fields", () => {
    const ctx = context({ audit: rows });
    expect(run("audit_event", { action: "safety.request_refused", present: true }, ctx).status).toBe("pass");
    expect(run("audit_event", { action: "safety.request_refused", present: true, carries: ["rule_id", "matched_phrase"] }, ctx).status).toBe("pass");
    expect(run("audit_event", { action: "safety.request_refused", present: true, carries: ["question"] }, ctx).status).toBe("pass");
    expect(run("audit_event", { action: "answer.issued", present: false }, ctx).status).toBe("pass");
  });

  it("fails on a missing action and on a payload field the row does not carry", () => {
    const ctx = context({ audit: rows });
    expect(run("audit_event", { action: "answer.issued", present: true }, ctx).status).toBe("fail");
    expect(run("audit_event", { action: "safety.request_refused", present: false }, ctx).status).toBe("fail");
    expect(run("audit_event", { action: "safety.request_refused", present: true, carries: ["draft_id"] }, ctx).status).toBe("fail");
  });

  it("reports unsupported with no database in reach", () => {
    expect(run("audit_event", { action: "safety.request_refused", present: true }, context({ audit: null })).status).toBe("unsupported");
  });
});

describe("version_increment", () => {
  it("passes on delta 0 when the packet answered on the run's version", () => {
    expect(run("version_increment", { delta: 0, after: "an Engineer publish attempt" }, context()).status).toBe("pass");
  });

  it("fails on delta 0 when the version moved", () => {
    const ctx = context({ answer: answer(packet({ corpus_version: "v2" })) });
    expect(run("version_increment", { delta: 0, after: "an attempt" }, ctx).status).toBe("fail");
  });

  it("reports a publication delta unsupported", () => {
    expect(run("version_increment", { delta: 1, after: "GS-16 Manager publish", previous_readable: true }, context()).status).toBe("unsupported");
  });
});

describe("trace_replays", () => {
  it("compares the deterministic parts of an earlier case in the same run", () => {
    const earlier = new Map<string, Answer>([["GS-01", answer()]]);
    expect(run("trace_replays", { of: "GS-01", equal: ["evidence_ids", "corpus_version"] }, context({ earlier })).status).toBe("pass");
  });

  it("fails when a part differs", () => {
    const earlier = new Map<string, Answer>([["GS-01", answer(packet({ corpus_version: "v2" }))]]);
    const verdict = run("trace_replays", { of: "GS-01", equal: ["corpus_version"] }, context({ earlier }));
    expect(verdict).toMatchObject({ status: "fail" });
    expect(verdict.status === "fail" && verdict.detail).toContain("corpus_version");
  });

  it("reports unsupported when the other case did not run, and for the prose forms", () => {
    expect(run("trace_replays", { of: "GS-01", equal: ["claims"] }, context()).status).toBe("unsupported");
    expect(run("trace_replays", { against: "the same question without the persona sentence", equal: ["claims"] }, context()).status).toBe("unsupported");
  });
});

describe("the registry", () => {
  it("holds one module per check type of the contract", () => {
    expect(Object.keys(CHECKS).sort()).toEqual([...CHECK_TYPES].sort());
  });

  it("turns a module that throws into a failure, never a pass", () => {
    const broken = { ...context(), answer: null as unknown as CheckContext["answer"] };
    expect(runCheck({ type: "numeral_fidelity", args: { from: "expected.numerals_allowed" } }, broken).status).toBe("fail");
  });
});
