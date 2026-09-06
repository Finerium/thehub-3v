// The seeded path (blueprint 9.17, 9.8; ARCHITECTURE 7 step 2; AC-UI-05, AC-NFR-15): a question whose canonical
// form equals a seeded chip's question is answered from the chip's stored trace; the match ignores whitespace runs
// and Unicode form and nothing else; the evidence line of a stored packet lists its distinct citations in packet
// order; the new trace row keeps the stored decisions under the asking user's alias. The database is the fake.
import { beforeEach, describe, expect, it } from "vitest";
import { EvidencePacket } from "@/contracts/generated/evidence_packet";
import { citation, seeded, seededPacket, seededTraceStored, SEEDED_QUESTION, typedFacts } from "../../tests/fixtures/answer";
import { queueResult, resetFakeDb, statements } from "../../tests/helpers/fake-db-client";
import { evidenceOf, findSeeded, seededTrace } from "./seeded";

const chipRow = { id: seeded.chip.id, equipmentTag: seeded.chip.equipment_tag, question: seeded.chip.question, goldenCaseId: seeded.chip.golden_case_id, traceId: seeded.chip.trace_id };

const traceRow = {
  id: seededTraceStored.id,
  question: seededTraceStored.question,
  languageDetected: seededTraceStored.language_detected,
  template: seededTraceStored.template,
  scope: seededTraceStored.scope,
  rulepack: seededTraceStored.rulepack,
  retrievedChunkIds: seededTraceStored.retrieved_chunk_ids,
  prompts: seededTraceStored.prompts,
  verifierVerdicts: seededTraceStored.verifier_verdicts,
  gateResults: seededTraceStored.gate_results,
  repairRounds: seededTraceStored.repair_rounds,
  confidence: seededTraceStored.confidence,
  outcome: seededTraceStored.outcome,
  packet: seededTraceStored.packet,
  modelIds: seededTraceStored.model_ids,
  corpusVersionId: seededTraceStored.corpus_version_id,
  userAlias: seededTraceStored.user_alias,
  serverTs: new Date(seededTraceStored.server_ts),
};

beforeEach(() => {
  resetFakeDb();
});

describe("findSeeded", () => {
  it("matches on the canonical form: a whitespace run and a soft hyphen in the typed question still hit the chip", async () => {
    queueResult([chipRow, { ...chipRow, id: "chip-other", question: "Another chip question about YD-2301", traceId: "trace-other" }]);
    queueResult([traceRow]);
    const typed = `  Why did  GA-1201A trip­ in February 2025\tand what is the setpoint? `;
    const found = await findSeeded(typed);
    expect(found).not.toBeNull();
    expect(found?.chip).toEqual(seeded.chip);
    expect(found?.trace).toEqual(seededTraceStored);
    expect(statements).toHaveLength(2);
  });

  it("a question that matches no chip is null after the one chip select, with no trace lookup", async () => {
    queueResult([chipRow]);
    expect(await findSeeded("Why did GA-1201A trip in March 2025?")).toBeNull();
    expect(statements).toHaveLength(1);
  });

  it("a chip whose stored trace is missing is null, never a partial seeded answer", async () => {
    queueResult([chipRow]);
    queueResult([]);
    expect(await findSeeded(SEEDED_QUESTION)).toBeNull();
  });
});

describe("evidenceOf", () => {
  it("lists the distinct citations of a stored packet in packet order: claims, typed facts, abstention, contradictions", () => {
    const packet = EvidencePacket.parse({
      ...seededPacket,
      outcome: "partial",
      claims: [
        { id: "s1", text: "A.", citations: [citation("sp-ds-1"), citation("sp-ds-2")], entailment: "entailed" },
        { id: "s2", text: "B.", citations: [citation("sp-ds-2")], entailment: "entailed" },
      ],
      typed_facts: [typedFacts[0], typedFacts[1]],
      abstention: {
        reason: "gap",
        escalation_role: "Reliability engineer",
        nearest_documents: [citation("sp-ce-1"), citation("sp-ds-1")],
        cluster: null,
        served_beside: [typedFacts[2] ?? typedFacts[0]],
      },
      contradictions: [{ subject: "x", readings: [{ text: "45", citation: citation("sp-ct-0") }], governing_document: citation("sp-ct-0") }],
      gaps_declared: ["gap"],
    });
    const ids = evidenceOf(packet).map((c) => c.span_id);
    expect(new Set(ids).size).toBe(ids.length);
    // The two typed facts cite sp-ds-1 and sp-ds-2, already listed from the claims, so the abstention's sp-ce-1 is third.
    expect(typedFacts.slice(0, 2).map((f) => f.source.span_id)).toEqual(["sp-ds-1", "sp-ds-2"]);
    expect(ids.slice(0, 3)).toEqual(["sp-ds-1", "sp-ds-2", "sp-ce-1"]);
    expect(ids.at(-1)).toBe("sp-ct-0");
  });

  it("the fixture's stored packet yields its claim citation once", () => {
    expect(evidenceOf(seededPacket).map((c) => c.span_id)).toEqual(["sp-ds-1"]);
  });
});

describe("seededTrace", () => {
  it("is the stored trace under a fresh id, the question as typed, the asking user's alias and the request time; the packet and decisions are the stored ones", () => {
    const at = new Date("2026-09-06T03:04:05.000Z");
    const trace = seededTrace(seeded, "trace-new", "  why did GA-1201A trip in February 2025 and what is the setpoint?", "ENG-DEMO", at);
    expect(trace.id).toBe("trace-new");
    expect(trace.question).toBe("  why did GA-1201A trip in February 2025 and what is the setpoint?");
    expect(trace.user_alias).toBe("ENG-DEMO");
    expect(trace.server_ts).toBe(at.toISOString());
    expect(trace.packet).toEqual(seededPacket);
    expect(trace.packet.mode).toBe("seeded");
    expect(trace.gate_results).toEqual(seededTraceStored.gate_results);
    expect(trace.rulepack).toEqual(seededTraceStored.rulepack);
    expect(trace.retrieved_chunk_ids).toEqual(seededTraceStored.retrieved_chunk_ids);
    expect(seededTraceStored.id).toBe("trace-seeded-gs-01"); // the stored trace is untouched
  });
});
