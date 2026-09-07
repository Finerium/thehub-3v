// The packet view: the field paths the golden set names in `in` and `field`, and the numeral scan behind
// numeral_fidelity. An unknown path must return null (the check then reports unsupported) and never an empty
// array, which would read as "the field is there and holds nothing" and pass a string_absent {empty: true}.
import { describe, expect, it } from "vitest";
import { citationsOf, citedDocuments, numeralsIn, renderedNumerals, resolve, textAt } from "../../scripts/golden/view";
import { answer, citation, packet } from "./packet";

describe("resolve", () => {
  it("reads the claim sentences and the typed facts", () => {
    const a = answer(
      packet({
        typed_facts: [
          {
            label: "Trip",
            value_text: "7.1",
            value_num: 7.1,
            unit: "mm/s",
            comparator: ">=",
            source: citation({ doc_no: "TEST-IL-1", span_id: "span-2" }),
            qualifier: "a note the sheet carries",
            source_class: "ce_row",
          },
        ],
      }),
    );
    expect(resolve(a, "claims")).toEqual(["The test claim states 7.4 units."]);
    expect(resolve(a, "typed_facts")?.[0]).toContain("7.1");
    expect(resolve(a, "typed_facts.ce_row")).toHaveLength(1);
    expect(resolve(a, "typed_facts.opl_step")).toEqual([]);
    expect(textAt(a, "citation_chip")).toContain("TEST-IL-1");
  });

  it("reads a block by kind and an absent block as empty", () => {
    const a = answer(packet({ blocks: [{ kind: "effects", order: 1, label: "Effects", items: ["EFF-1", "EFF-2"] }] }));
    expect(resolve(a, "blocks.effects")).toEqual(["Effects", "EFF-1", "EFF-2"]);
    expect(resolve(a, "blocks.permissives")).toEqual([]);
    expect(resolve(a, "blocks")).toContain("EFF-1");
  });

  it("reads the refusal, the abstention and the procedure fields", () => {
    const refused = answer(
      packet({
        outcome: "refusal",
        refusal: {
          class: "defeat",
          function: { seq_id: "SEQ-1", sil: 1, ce_doc_no: "TEST-IL-1", ce_revision: "0" },
          permissives: [{ n: 1, text: "a permissive line", signal_tag: "PT-1" }],
          reset_note: "a reset note",
          route_text: "the fixed route text",
          moc_text: null,
          rule_id: "R2-defeat",
          matched_phrase: "a phrase",
        },
      }),
    );
    expect(resolve(refused, "refusal.route_text")).toEqual(["the fixed route text"]);
    expect(resolve(refused, "refusal.moc_text")).toEqual([]);
    expect(resolve(refused, "refusal.permissives")).toHaveLength(1);
    expect(resolve(refused, "refusal.function")?.[0]).toContain("SEQ-1");

    const abstained = answer(
      packet({
        outcome: "abstention",
        abstention: {
          reason: "a fixed reason",
          escalation_role: "Process Safety",
          nearest_documents: [citation()],
          cluster: { id: "CL-1", request_action: true },
          served_beside: [],
        },
      }),
    );
    expect(resolve(abstained, "abstention.escalation_role")).toEqual(["Process Safety"]);
    expect(resolve(abstained, "abstention.cluster.id")).toEqual(["CL-1"]);
    expect(resolve(abstained, "abstention.served_beside")).toEqual([]);

    const served = answer(
      packet({
        procedure: {
          opl_id: "OPL-TEST-01",
          revision: "0",
          permit_block: [{ text: "a permit line", span_id: "span-3" }],
          steps: [{ n: 1, text: "step one", hash_ok: true, span_id: "span-4" }],
          protective_functions_affected: null,
        },
      }),
    );
    expect(resolve(served, "procedure.steps")).toEqual(["step one"]);
    expect(resolve(served, "procedure.permit_block")).toEqual(["a permit line"]);
  });

  it("reads the trace and returns null when there is none", () => {
    expect(resolve(answer(), "trace.language_detected")).toEqual(["en"]);
    expect(resolve({ ...answer(), trace: null }, "trace.question")).toBeNull();
  });

  it("returns null for a path outside the vocabulary, not an empty array", () => {
    expect(resolve(answer(), "draft.sections")).toBeNull();
    expect(resolve(answer(), "coverage_console")).toBeNull();
    expect(resolve(answer(), "packet.nonsense")).toBeNull();
    expect(textAt(answer(), "logs")).toBeNull();
  });
});

describe("citationsOf and citedDocuments", () => {
  it("takes the citations a block item carries", () => {
    const inBlock = citation({ doc_no: "TEST-IL-2", document_id: "doc-2", span_id: "span-9" });
    const p = packet({ blocks: [{ kind: "effects", order: 1, label: "Effects", items: [{ text: "an effect", source: inBlock }] }] });
    expect(citationsOf(p).map((c) => c.doc_no)).toEqual(["TEST-DOC-1", "TEST-IL-2"]);
  });

  it("names the lesson of a procedure and the sheet a refusal names, which carry no Citation of their own", () => {
    const refusal = packet({
      outcome: "refusal",
      claims: [],
      refusal: {
        class: "defeat",
        function: { seq_id: "SEQ-1", sil: 1, ce_doc_no: "TEST-IL-3", ce_revision: "0" },
        permissives: [],
        reset_note: null,
        route_text: "the fixed route text",
        moc_text: null,
        rule_id: "R2-defeat",
        matched_phrase: "a phrase",
      },
    });
    expect(citationsOf(refusal)).toEqual([]);
    expect(citedDocuments(refusal, citationsOf(refusal))).toEqual(["TEST-IL-3"]);

    const served = packet({
      procedure: { opl_id: "OPL-TEST-01", revision: "0", permit_block: [], steps: [], protective_functions_affected: null },
    });
    expect(citedDocuments(served, citationsOf(served))).toEqual(["TEST-DOC-1", "OPL-TEST-01"]);
  });
});

describe("numeralsIn", () => {
  it("keeps stated numbers and drops identifiers", () => {
    expect(numeralsIn("the reading was 7.4 and the limit 7.1")).toEqual(["7.4", "7.1"]);
    expect(numeralsIn("WO-240003 raised SEQ-1201 on GA-1201A under TJC-LLD-IL-GA-1201A")).toEqual([]);
    expect(numeralsIn("voting 1oo2 at SIL 1")).toEqual(["1"]);
    expect(numeralsIn("recorded on 2025-02-23")).toEqual(["2025-02-23"]);
  });

  it("scans the claims and the typed facts of a packet and says where", () => {
    const found = renderedNumerals(packet());
    expect(found).toEqual([{ numeral: "7.4", where: "claims[0]" }]);
  });
});
