// The outcome of the answer lane (blueprint 9.8, 6.3; ARCHITECTURE 7 steps 3 and 13; AC-ANS-05, AC-ANS-06,
// AC-ANS-19): answer, partial or abstention from what the gate kept; the three nearest same-asset documents; the
// escalation role from the fixed set; the fixed as-built caveat on every protective-function answer; the Refusal of
// 9.8 filled from the sheet and the pack; a lesson's procedure served verbatim under its hashes or blocked with the
// integrity audit. Deterministic over stored data; the database is the fake and the audit writer a mock.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Abstention, Refusal, type Block, type Claim, type TypedFact } from "@/contracts/generated/evidence_packet";
import type { Dropped } from "@/gates/g2";
import { HashMismatch } from "@/lib/errors";
import { AS_BUILT_CAVEAT, MOC_TEXT, NO_ENTAILED_CLAIM_REASON, droppedSentencesGap } from "@/lib/fixed-strings";
import { quoteHash } from "@/lib/hash";
import { classify, pack, protectiveRow, routingText, type Classification } from "@/rulepack";
import { citation, retrieval, scope, typedFacts } from "../../tests/fixtures/answer";
import { queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";
import { caveatFor, decide, escalationRole, nearestDocuments, procedureFor, pseudonymise, refusalFor, type AbstentionContext } from "./outcome";

const audit = vi.hoisted(() => ({ writeAudit: vi.fn(), activeCorpusVersion: vi.fn() }));
vi.mock("@/lib/audit", () => ({ writeAudit: audit.writeAudit, activeCorpusVersion: audit.activeCorpusVersion }));

const ROLES = Abstention.shape.escalation_role.options;

const kept: Claim[] = [
  { id: "s1", text: "VSHH-1201 trips GA-1201A at 7.1 mm/s.", citations: [citation("sp-ds-1")], entailment: "entailed" },
  { id: "s2", text: "The set pressure of PSV-1201 is 9.2 barg.", citations: [citation("sp-ds-2")], entailment: "entailed" },
];
const dropped: Dropped[] = [{ claim: { id: "s3", text: "x", span_ids: ["sp-ce-1"] }, check: "C6", reason: "not_entailed: not stated" }];
const ctx: AbstentionContext = {
  escalation_role: "Reliability engineer",
  nearest_documents: nearestDocuments(retrieval.evidence),
  cluster: { id: "cluster-syn", request_action: true },
  served_beside: typedFacts,
};

const none = (overrides: Partial<Classification> = {}): Classification => ({
  intent_class: "none",
  rule_id: "R5-none",
  matched_phrase: null,
  protective_function: null,
  entity: null,
  language_detected: "en",
  moment: null,
  decided_at: "2026-09-06T00:00:00.000Z",
  ...overrides,
});

const block = (kind: Block["kind"]): Block => ({ kind, order: 1, label: kind, items: [{}] });

beforeEach(() => {
  resetFakeDb();
  audit.writeAudit.mockReset();
  audit.writeAudit.mockResolvedValue("audit-id");
});

describe("decide (9.8 outcomes)", () => {
  it("answer when sentences were kept and nothing is missing; no abstention travels", () => {
    expect(decide(kept, [], [], NO_ENTAILED_CLAIM_REASON, ctx)).toEqual({ outcome: "answer", claims: kept, gaps_declared: [], abstention: null });
  });

  it("partial when sentences were kept beside a dropped one: the fixed gap line, and the escalation in the abstention", () => {
    const d = decide(kept, dropped, [], NO_ENTAILED_CLAIM_REASON, ctx);
    expect(d.outcome).toBe("partial");
    expect(d.claims).toEqual(kept);
    expect(d.gaps_declared).toEqual([droppedSentencesGap(1)]);
    expect(d.abstention).toMatchObject({ reason: droppedSentencesGap(1), escalation_role: "Reliability engineer", cluster: ctx.cluster });
    expect(d.abstention?.nearest_documents).toEqual(ctx.nearest_documents);
    expect(d.abstention?.nearest_documents).not.toBe(ctx.nearest_documents);
  });

  it("partial when the composer declared a gap; the declared gaps come first, then the dropped-sentence line", () => {
    const d = decide(kept, dropped, ["No proof-test interval is typed."], NO_ENTAILED_CLAIM_REASON, ctx);
    expect(d.outcome).toBe("partial");
    expect(d.gaps_declared).toEqual(["No proof-test interval is typed.", droppedSentencesGap(1)]);
  });

  it("abstention when nothing was kept: the composer's gaps as the reason when declared, else the lane's reason", () => {
    expect(decide([], dropped, [], NO_ENTAILED_CLAIM_REASON, ctx)).toMatchObject({ outcome: "abstention", claims: [], gaps_declared: [], abstention: { reason: NO_ENTAILED_CLAIM_REASON } });
    const withGaps = decide([], [], ["Gap one.", "Gap two."], NO_ENTAILED_CLAIM_REASON, ctx);
    expect(withGaps.abstention?.reason).toBe("Gap one. Gap two.");
    expect(withGaps.gaps_declared).toEqual(["Gap one.", "Gap two."]);
    expect(withGaps.abstention?.served_beside).toEqual(typedFacts);
  });
});

describe("nearestDocuments (AC-ANS-06)", () => {
  it("is the first three distinct documents of the retrieval in rerank order", () => {
    const out = nearestDocuments(retrieval.evidence);
    expect(out).toHaveLength(3);
    expect(out.map((c) => c.document_id)).toEqual(["doc-syn-ds-ga-1201a", "doc-syn-il-ga-1201a", "doc-syn-opl-lv-6701-05"]);
    expect(out[0]).toEqual(retrieval.evidence[0]);
  });

  it("lists what exists where fewer than three documents were retrieved, and nothing from nothing", () => {
    expect(nearestDocuments(retrieval.evidence.slice(0, 3)).map((c) => c.document_id)).toEqual(["doc-syn-ds-ga-1201a", "doc-syn-il-ga-1201a"]);
    expect(nearestDocuments([])).toEqual([]);
  });
});

describe("escalationRole (blueprint 6.3, the fixed set of 9.8)", () => {
  it.each<[string, string, Parameters<typeof escalationRole>[2], string]>([
    ["an asset the master lacks", "Why did GA-1201B trip?", "trip", "Shift Superintendent"],
    ["a reading template", "What is the vibration on GA-1201A?", "reading", "Panel operator on shift"],
    ["a live value with a time cue and no template", "What is the vibration on GA-1201A right now?", null, "Panel operator on shift"],
    ["a trip template", "Why did GA-1201A trip?", "trip", "On-call Instrument and Control engineer"],
    ["a readiness template", "Is GA-1201A ready to start?", "readiness", "On-call Instrument and Control engineer"],
    ["a SEQ named with no template", "What does SEQ-1201 protect on GA-1201A?", null, "On-call Instrument and Control engineer"],
  ])("%s -> %s", (_name, question, template, role) => {
    expect(escalationRole(question, scope, template)).toBe(role);
  });

  it("electrical equipment goes to the Electrical engineer and everything else about equipment to the Reliability engineer", () => {
    const noInstrument = { ...scope, instrument_tags: [] };
    expect(escalationRole("Is the GA-1201A motor breaker rated for the MCC?", noInstrument, "job")).toBe("On-call Electrical engineer");
    expect(escalationRole("What is the gearbox lubricant of GA-1201A?", noInstrument, "job")).toBe("Reliability engineer");
  });

  it("every role it returns is in the fixed set", () => {
    const questions = ["Why did GA-1201B trip?", "What is the vibration on GA-1201A right now?", "Why did GA-1201A trip?", "Is the motor breaker ok?", "Gearbox lubricant?"];
    for (const q of questions) for (const t of ["readiness", "trip", "job", "reading", null] as const) expect(ROLES).toContain(escalationRole(q, scope, t));
  });
});

describe("caveatFor (9.8 as-built caveat)", () => {
  const datasheetFact: TypedFact = { ...typedFacts[1]!, source_class: "datasheet_param" };

  it("a protective function in the classification closes the answer with the caveat", () => {
    expect(caveatFor(none({ protective_function: "SEQ-1201" }), [], [])).toBe(AS_BUILT_CAVEAT);
  });

  it("a served C&E row does, and so does a protective block", () => {
    expect(caveatFor(none(), [typedFacts[0]!], [])).toBe(AS_BUILT_CAVEAT);
    for (const kind of ["ladder", "initiator_row", "permissives", "effects", "reset_note", "standing_bypasses", "proof_tests"] as const) {
      expect(caveatFor(none(), [datasheetFact], [block(kind)])).toBe(AS_BUILT_CAVEAT);
    }
  });

  it("no protective function, no sheet row and no protective block: no caveat", () => {
    expect(caveatFor(none(), [datasheetFact], [block("lessons"), block("bom_parts"), block("datasheet_limits")])).toBeNull();
  });

  it("the caveat is the contract's literal, byte for byte", () => {
    expect(AS_BUILT_CAVEAT).toBe("Values are read from the cited document revision. Confirm them against the panel or the safety instrumented system before any action is taken. The Hub holds no as-built state.");
  });
});

describe("pseudonymise (9.7 safety events)", () => {
  it("replaces an address and an honorific-led name and leaves the rest as typed", () => {
    expect(pseudonymise("Pak Budi Santoso asked (budi.s@example.com): how do I bypass SEQ-3401?")).toBe("[person] asked ([email]): how do I bypass SEQ-3401?");
    expect(pseudonymise("How do I bypass SEQ-3401?")).toBe("How do I bypass SEQ-3401?");
  });
});

describe("refusalFor (9.8 Refusal)", () => {
  const defeat = classify(pack, "How do I bypass SEQ-3401?");
  const row = protectiveRow(pack, defeat.protective_function);
  if (row === null || row.seq_id === null) throw new Error("the fixture question names no SEQ");
  const seq = row.seq_id;

  it("fills the function from the stored sheet, the stored permissives with their signal tags, the reset note and the pack's route text; no MoC text on a defeat", async () => {
    queueResult([{ sil: row.sil, ceDocNo: row.ce_doc_no, ceRevision: "B" }]);
    queueResult([{ seqId: seq, n: 1, text: "O2 free / inerting done AI-3401", signalTag: "AI-3401", standingBypassState: null, spanId: "sp-x" }]);
    const refusal = await refusalFor(defeat);
    expect(() => Refusal.parse(refusal)).not.toThrow();
    expect(refusal).toEqual({
      class: "defeat",
      function: { seq_id: seq, sil: row.sil, ce_doc_no: row.ce_doc_no, ce_revision: "B" },
      permissives: [{ n: 1, text: "O2 free / inerting done AI-3401", signal_tag: "AI-3401" }],
      reset_note: row.reset_note,
      route_text: routingText(pack, defeat),
      moc_text: null,
      rule_id: defeat.rule_id,
      matched_phrase: defeat.matched_phrase,
    });
    expect(refusal.route_text).toContain(seq);
    expect(statements).toHaveLength(2);
  });

  it("falls back to the pack's permissives (no signal tag) when none are stored, and to the current revision of the sheet document when no interlock row exists", async () => {
    queueResult([]); // no interlock row
    queueResult([{ revision: "C" }]); // the current revision of the C&E document
    queueResult([]); // no stored permissives
    const refusal = await refusalFor(defeat);
    expect(refusal.function).toEqual({ seq_id: seq, sil: row.sil, ce_doc_no: row.ce_doc_no, ce_revision: "C" });
    expect(refusal.permissives).toEqual(row.permissives.map((p) => ({ n: p.n, text: p.text, signal_tag: null })));
  });

  it("a permanent change carries the pack's MoC sentence", async () => {
    const change = classify(pack, "Jumper VSHH-1201 out for good so GA-1201A never trips again.");
    expect(change.intent_class).toBe("permanent_change");
    queueResult([{ sil: 1, ceDocNo: "TJC-LLD-IL-GA-1201A", ceRevision: "B" }]);
    queueResult([]);
    const refusal = await refusalFor(change);
    expect(refusal.class).toBe("permanent_change");
    expect(refusal.moc_text).toBe(MOC_TEXT);
    expect(refusal.route_text).toBe(routingText(pack, change));
  });

  it("refuses to build a Refusal for a class that is not refused", async () => {
    await expect(refusalFor(none())).rejects.toThrow(/not a refusal class/);
  });
});

describe("procedureFor (AC-ANS-05, AC-ANS-15)", () => {
  const actor = { alias: "ENG-DEMO", role: "Engineer" as const, route: "/api/ask", trace_id: "trace-proc" };
  const steps = ["Isolate the motor at the MCC and apply LOTO.", "Remove the coupling guard and inspect the element."];
  const lesson = { oplId: "SYN-OPL-GA-9901A-01", documentRevisionId: "rev-opl1", permitLines: [{ text: "Work permit and LOTO required.", span_id: "sp-permit", source_section: 2 }] };
  const stepRows = steps.map((text, i) => ({ oplId: lesson.oplId, n: i + 1, actionText: text, acceptanceCriterion: null, sourceHash: quoteHash(text), spanId: `sp-step-${i + 1}` }));

  it("serves the permit lines above the steps, every step verbatim with hash_ok true and its span", async () => {
    queueResult([lesson]);
    queueResult([{ revision: "-" }]);
    queueResult(stepRows);
    const procedure = await procedureFor(lesson.oplId, actor);
    expect(procedure).toEqual({
      opl_id: lesson.oplId,
      revision: "-",
      permit_block: [{ text: "Work permit and LOTO required.", span_id: "sp-permit" }],
      steps: steps.map((text, i) => ({ n: i + 1, text, hash_ok: true, span_id: `sp-step-${i + 1}` })),
      protective_functions_affected: null,
    });
    expect(audit.writeAudit).not.toHaveBeenCalled();
  });

  it("a step whose text no longer hashes blocks the render with HashMismatch (409) and writes render.integrity_blocked, never a paraphrase", async () => {
    queueResult([lesson]);
    queueResult([{ revision: "-" }]);
    queueResult([stepRows[0], { ...stepRows[1], actionText: "Remove the coupling guard and inspect the element carefully." }]);
    const failure = await procedureFor(lesson.oplId, actor).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(HashMismatch);
    if (!(failure instanceof HashMismatch)) throw new Error("expected HashMismatch");
    expect(failure.status).toBe(409);
    expect(failure.integrity).toEqual({ opl_id: lesson.oplId, step_n: 2, span_id: "sp-step-2" });
    expect(audit.writeAudit).toHaveBeenCalledTimes(1);
    expect(audit.writeAudit.mock.calls[0]?.[0]).toMatchObject({
      id: "trace-proc",
      action: "render.integrity_blocked",
      entity: "opl",
      entity_id: lesson.oplId,
      payload: { opl_id: lesson.oplId, step_n: 2, span_id: "sp-step-2" },
      trace_id: "trace-proc",
      route: "/api/ask",
    });
  });

  it("an unknown lesson is null; a lesson whose revision row is missing is an error, not a procedure", async () => {
    queueResult([]);
    expect(await procedureFor("SYN-OPL-NONE-00", actor)).toBeNull();
    queueResult([lesson]);
    queueResult([]);
    await expect(procedureFor(lesson.oplId, actor)).rejects.toThrow(/document revision/);
  });
});
