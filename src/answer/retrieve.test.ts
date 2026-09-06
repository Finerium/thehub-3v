// Retrieval (ARCHITECTURE 7 step 6; blueprint 8.4; AC-ANS-02, AC-ANS-14, AC-NFR-06): candidates are chunks of the
// scope's current served revisions, k = 12, the rerank fixes the order whatever order the database returned them
// in, each chunk cites the first span-table span it contains (page-exact, hash-exact) or itself, and the labelled
// history toggle is the one way a superseded revision is read, its citation marked superseded. The query module is
// the in-memory fake over the synthetic asset; nothing here opens a connection.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Citation } from "@/contracts/generated/evidence_packet";
import { db } from "@/db/client";
import { SERVED_APPROVAL_STATUSES } from "@/gates/g2";
import { quoteHash } from "@/lib/hash";
import { VERSION_ID, chunkCandidates, resetAsset, spans, state } from "../../tests/fixtures/answer/asset";
import { rerank } from "./rerank";
import { RETRIEVAL_K, citationOf, retrieve, termsOf } from "./retrieve";
import type { RetrieveOptions, Scope } from "./types";

vi.mock("@/db/queries/retrieval", async () => (await import("../../tests/fixtures/answer/asset")).fakeQueries);

const QUESTION = "Why did GA-9901A trip on VSHH-9901?";
const scope: Scope = {
  tags: ["GA-9901A"],
  instrument_tags: ["VSHH-9901"],
  document_ids: ["doc-ds-9901a", "doc-il-9901a", "doc-wb"],
  revision_ids: ["rev-ds-3", "rev-il-2", "rev-wb"],
  basis: ["equipment tag GA-9901A named in the question"],
  family_ids: [],
};
const opts: RetrieveOptions = { k: RETRIEVAL_K, include_superseded: false, visible_version_ids: [VERSION_ID] };
const spanById = new Map(spans.map((s) => [s.spanId, s] as const));

beforeEach(() => {
  resetAsset();
});

describe("retrieve", () => {
  it("returns the served current chunks of the scope in rerank order, k = 12, lexical hits first", async () => {
    const { evidence, chunks } = await retrieve(db, scope, QUESTION, [0.1, 0.2, 0.3], opts);
    expect(chunks.map((c) => c.chunk_id)).toEqual(["rev-il-2/c001", "rev-il-2/c003", "rev-wb/c005", "rev-ds-3/c001", "rev-ds-3/c002"]);
    expect(evidence).toEqual(chunks.map((c) => c.citation));
    for (const c of evidence) expect(() => Citation.parse(c)).not.toThrow();
    const query = state.calls.find((c) => c.fn === "candidateChunks")?.args[0] as { k: number; servedStatuses: readonly string[]; tags: readonly string[]; terms: string; includeSuperseded: boolean };
    expect(query.k).toBe(12);
    expect(RETRIEVAL_K).toBe(12);
    expect(query.servedStatuses).toEqual(SERVED_APPROVAL_STATUSES);
    expect(query.tags).toEqual(["GA-9901A", "VSHH-9901"]);
    expect(query.includeSuperseded).toBe(false);
    expect(query.terms).not.toMatch(/ga-9901a|vshh-9901/);
    expect(query.terms).toContain("trip");
  });

  it("gives the same set in the same order whatever order the database returned the candidates (AC-NFR-06)", async () => {
    const first = await retrieve(db, scope, QUESTION, [0.1, 0.2, 0.3], opts);
    state.chunkOrder = [...state.chunkOrder].reverse();
    const second = await retrieve(db, scope, QUESTION, [0.1, 0.2, 0.3], opts);
    state.chunkOrder = [state.chunkOrder[3], state.chunkOrder[0], state.chunkOrder[5], state.chunkOrder[1], state.chunkOrder[7], state.chunkOrder[2], state.chunkOrder[6], state.chunkOrder[4]].filter((id): id is string => id !== undefined);
    const third = await retrieve(db, scope, QUESTION, [0.1, 0.2, 0.3], opts);
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    const served = chunkCandidates.filter((c) => scope.revision_ids.includes(c.revisionId) && c.isCurrent);
    expect(first.chunks.map((c) => c.chunk_id)).toEqual(rerank(served).map((c) => c.chunkId));
  });

  it("cites the first span-table span the chunk contains, page-exact and hash-exact, with the document's open findings", async () => {
    const { chunks } = await retrieve(db, scope, QUESTION, [0.1, 0.2, 0.3], opts);
    const il = chunks.find((c) => c.chunk_id === "rev-il-2/c001");
    expect(il?.citation).toMatchObject({ span_id: "sp-il-1", page: 1, quote_hash: spanById.get("sp-il-1")?.quoteHash, doc_no: "SYN-IL-GA-9901A", revision: "2", approval_status: "issued_for_operation", superseded: false, integrity_findings: [] });
    expect(il?.anchor_text).toBe(spanById.get("sp-il-1")?.anchorText);
    expect(quoteHash(il?.anchor_text ?? "")).toBe(il?.citation.quote_hash);
    const ds = chunks.find((c) => c.chunk_id === "rev-ds-3/c001");
    expect(ds?.citation.span_id).toBe("sp-ds-1"); // two spans on the page are contained; the lowest ordinal is cited
    expect(ds?.citation.integrity_findings).toEqual(["IR-03"]);
    expect(ds?.rank).toEqual({ lexical: 0, cosine: 0.8 });
  });

  it("a chunk that contains no span cites itself: span_id is the chunk id and quote_hash the chunk's own", async () => {
    const { chunks } = await retrieve(db, scope, QUESTION, [0.1, 0.2, 0.3], opts);
    const wb = chunks.find((c) => c.chunk_id === "rev-wb/c005");
    expect(wb?.citation.span_id).toBe("rev-wb/c005");
    expect(wb?.citation.quote_hash).toBe(quoteHash(wb?.text ?? ""));
    expect(wb?.anchor_text).toBe(wb?.text);
    expect(wb?.citation.approval_status).toBe("unknown");
  });

  it("never reads a superseded or unserved revision by default, nor a revision outside the scope", async () => {
    const { chunks } = await retrieve(db, scope, QUESTION, [0.1, 0.2, 0.3], opts);
    const ids = chunks.map((c) => c.chunk_id);
    expect(ids).not.toContain("rev-ds-2/c001");
    expect(ids).not.toContain("rev-ds-1/c001");
    expect(ids).not.toContain("rev-ds-9902/c001");
    for (const c of chunks) expect(c.citation.superseded).toBe(false);
    expect(state.calls.some((c) => c.fn === "revisionsOf")).toBe(false);
  });

  it("the labelled history toggle admits the superseded revisions of the scope's documents, each citation marked superseded (AC-ANS-14)", async () => {
    const { chunks } = await retrieve(db, scope, QUESTION, [0.1, 0.2, 0.3], { ...opts, include_superseded: true });
    const revisionsCall = state.calls.find((c) => c.fn === "revisionsOf");
    expect(revisionsCall?.args).toEqual([scope.document_ids, [VERSION_ID], true]);
    const ids = chunks.map((c) => c.chunk_id);
    expect(ids).toContain("rev-ds-2/c001");
    expect(ids).toContain("rev-ds-1/c001");
    expect(ids).not.toContain("rev-ds-9902/c001");
    expect(chunks.find((c) => c.chunk_id === "rev-ds-2/c001")?.citation).toMatchObject({ revision: "2", superseded: true });
    expect(chunks.find((c) => c.chunk_id === "rev-ds-1/c001")?.citation).toMatchObject({ revision: "1", approval_status: "issued_for_review", superseded: true });
    // The superseded chunk with the highest cosine still ranks below every lexical hit.
    expect(ids.indexOf("rev-ds-1/c001")).toBeGreaterThan(ids.indexOf("rev-wb/c005"));
  });

  it("an empty scope retrieves nothing", async () => {
    const empty: Scope = { tags: [], instrument_tags: [], document_ids: [], revision_ids: [], basis: [], family_ids: [] };
    expect(await retrieve(db, empty, "What is the weather?", [0.1, 0.2, 0.3], opts)).toEqual({ evidence: [], chunks: [] });
  });
});

describe("termsOf and citationOf", () => {
  it("termsOf is the question's content terms without the tags, for plainto_tsquery", () => {
    const terms = termsOf(QUESTION, ["GA-9901A", "VSHH-9901"]);
    expect(terms.split(" ")).toContain("trip");
    expect(terms).not.toContain("ga-9901a");
    expect(terms).not.toContain("vshh-9901");
  });

  it("citationOf uses the document id as doc_no when the document has none and marks a non-current revision superseded", () => {
    const c = citationOf({ docNo: null, documentId: "doc-x", revision: "A", approvalStatus: "issued_for_review", approvalStatusText: "IFR", isCurrent: false, page: 3, spanId: "sp-x", quoteHash: "0".repeat(64) }, ["IR-01"]);
    expect(c).toEqual({ doc_no: "doc-x", document_id: "doc-x", revision: "A", approval_status: "issued_for_review", approval_status_text: "IFR", page: 3, span_id: "sp-x", quote_hash: "0".repeat(64), integrity_findings: ["IR-01"], superseded: true });
  });
});
