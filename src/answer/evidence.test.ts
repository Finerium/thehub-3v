// The one evidence set (blueprint 9.8 Citation, Block and TypedFact, 9.16; ARCHITECTURE section 7 steps 8 to 11;
// AC-ANS-03): a packet cites two kinds of span, the chunks retrieval returned and the span every typed fact and
// every block item carries as its own source, and both belong to the set the composer writes from, the verifier is
// given the texts of, and C1 resolves against. The live UC-1 trace failed because the set held the chunks alone, so
// these cases pin the shape that fix produces: the retrieved order first, the typed facts and the block items
// appended, one entry per span, a text behind every quote_hash, and nothing the span table does not carry.
// Hermetic: the query layer is a mock over the fixture spans; no database, no network, no corpus text.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Citation } from "@/contracts/generated/evidence_packet";
import { db } from "@/db/client";
import {
  EVIDENCE_SET_ORDER,
  UNKNOWN_SPAN_ID,
  UNRETRIEVED_SPAN_ID,
  chunks,
  citation,
  evidenceBlocks,
  spanSourceOf,
  spanSources,
  typedFacts,
  typedFactsWithUnretrieved,
  unretrievedFact,
} from "../../tests/fixtures/answer";
import { buildEvidenceSet, citationsIn, type EvidenceInput } from "./evidence";

const q = vi.hoisted(() => ({ spansByIds: vi.fn() }));
vi.mock("@/db/queries/retrieval", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/db/queries/retrieval")>()),
  spansByIds: q.spansByIds,
}));

const input = (overrides: Partial<EvidenceInput> = {}): EvidenceInput => ({
  retrieved: chunks,
  typed_facts: [],
  blocks: [],
  ...overrides,
});

beforeEach(() => {
  q.spansByIds.mockImplementation(async (_db: unknown, ids: readonly string[]) => spanSources(ids));
});

describe("citationsIn (9.8: Block.items is unknown[], the citation sits at a different depth per kind)", () => {
  it("finds every Citation of an item at any depth, in the item's own key order, and skips a null one", () => {
    const out: Citation[] = [];
    for (const block of evidenceBlocks) citationsIn(block.items, out);
    expect(out.map((c) => c.span_id)).toEqual([
      UNRETRIEVED_SPAN_ID, // inside the interlock row's typed fact
      "sp-ds-old", // inside the return-to-service item's nested permissive list
      "sp-ce-1", // beside that item, after the nested list in key order
      UNKNOWN_SPAN_ID, // the lesson's own citation
    ]);
    expect(out.every((c) => Citation.safeParse(c).success)).toBe(true);
  });

  it("walks an array, an object and a nested list, and treats a non-object as nothing", () => {
    const out: Citation[] = [];
    citationsIn([null, "sp-ds-1", 7, { note: [{ deep: citation("sp-ds-2") }] }], out);
    expect(out.map((c) => c.span_id)).toEqual(["sp-ds-2"]);
  });

  it("does not recurse into a Citation it has taken, so a span id is pushed once per occurrence", () => {
    const out: Citation[] = [];
    citationsIn({ a: citation("sp-ds-1"), b: citation("sp-ds-1") }, out);
    expect(out.map((c) => c.span_id)).toEqual(["sp-ds-1", "sp-ds-1"]);
  });
});

describe("buildEvidenceSet (the set the composer, the verifier and C1 share)", () => {
  it("with no typed fact and no block is the retrieved chunks in rerank order, and asks the query layer nothing", async () => {
    const set = await buildEvidenceSet(db, input());
    expect(set.map((s) => s.span_id)).toEqual(chunks.map((c) => c.citation.span_id));
    expect(q.spansByIds).not.toHaveBeenCalled();
  });

  it("carries the text behind each citation's quote_hash: the chunk's anchor text, not the chunk text", async () => {
    const [first] = await buildEvidenceSet(db, input());
    const chunk = chunks[0];
    if (first === undefined || chunk === undefined) throw new Error("fixture mismatch");
    expect(first.text).toBe(chunk.anchor_text);
    expect(first).toEqual({ ...chunk.citation, text: chunk.anchor_text });
  });

  it("keeps the retrieved order first, then the typed facts in their order, then the block items in block order", async () => {
    const set = await buildEvidenceSet(db, input({ typed_facts: typedFactsWithUnretrieved, blocks: evidenceBlocks }));
    expect(set.map((s) => s.span_id)).toEqual(EVIDENCE_SET_ORDER);
    expect(set.slice(0, chunks.length).map((s) => s.span_id)).toEqual(chunks.map((c) => c.citation.span_id));
  });

  it("dedupes by span_id with the first mention winning, so a retrieved span keeps its chunk entry", async () => {
    const twice = [...chunks, ...chunks];
    const set = await buildEvidenceSet(db, input({ retrieved: twice, typed_facts: typedFacts }));
    expect(set).toHaveLength(chunks.length);
    expect(new Set(set.map((s) => s.span_id)).size).toBe(set.length);
    for (const fact of typedFacts) expect(set.some((s) => s.span_id === fact.source.span_id)).toBe(true);
  });

  it("appends the span of a typed fact retrieval did not return, with that span's anchor text (the UC-1 defect)", async () => {
    const set = await buildEvidenceSet(db, input({ typed_facts: typedFactsWithUnretrieved }));
    expect(chunks.some((c) => c.citation.span_id === UNRETRIEVED_SPAN_ID)).toBe(false);
    const appended = set.find((s) => s.span_id === UNRETRIEVED_SPAN_ID);
    expect(appended).toEqual({ ...unretrievedFact.source, text: spanSourceOf(UNRETRIEVED_SPAN_ID).anchorText });
    expect(q.spansByIds).toHaveBeenCalledTimes(1);
    expect(q.spansByIds.mock.calls[0]?.[1]).toEqual([UNRETRIEVED_SPAN_ID]);
  });

  it("leaves out a span id the span table does not carry: provenance or nothing", async () => {
    const set = await buildEvidenceSet(db, input({ blocks: evidenceBlocks }));
    expect(set.map((s) => s.span_id)).not.toContain(UNKNOWN_SPAN_ID);
    expect(q.spansByIds.mock.calls[0]?.[1]).toContain(UNKNOWN_SPAN_ID);
  });

  it("gives every item a non-empty text, so C2 can recompute the hash of what the composer and the verifier saw", async () => {
    const set = await buildEvidenceSet(db, input({ typed_facts: typedFactsWithUnretrieved, blocks: evidenceBlocks }));
    expect(set.length).toBeGreaterThan(0);
    for (const item of set) expect(item.text.length, item.span_id).toBeGreaterThan(0);
  });

  it("never aliases the lane's citations: an item's integrity_findings is its own array", async () => {
    const set = await buildEvidenceSet(db, input({ typed_facts: [unretrievedFact] }));
    for (const item of set) item.integrity_findings.push("IR-99");
    expect(chunks[0]?.citation.integrity_findings).toEqual([]);
    expect(unretrievedFact.source.integrity_findings).toEqual([]);
  });
});
