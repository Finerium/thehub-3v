// Scope resolution (ARCHITECTURE 7 step 5; blueprint 8.4; AC-ANS-01): deterministic from the seeded asset master,
// every step written as one basis line; an instrument tag binds its asset and its source documents; an area alias
// binds every asset of the area; one hop through document_edge never crosses to another asset's documents; a
// failure family joins only when the question names it and is labelled as the link it is; an unknown tag resolves
// to nothing and offers the nearest asset by stem. The query module is the in-memory fake over the synthetic asset.
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db/client";
import { familyLinkBasis } from "@/lib/fixed-strings";
import { FAMILY, OTHER_TAG, TAG, VERSION_ID } from "../../tests/fixtures/answer/asset";
import { contentTerms, nearestAssetTags, questionTags, resolveScope } from "./scope";
import { Scope } from "./types";

vi.mock("@/db/queries/retrieval", async () => (await import("../../tests/fixtures/answer/asset")).fakeQueries);
vi.mock("@/auth/sandbox", () => ({ visibleVersionIds: vi.fn(async () => [VERSION_ID]) }));

const ASSET_DOCUMENTS = ["doc-ds-9901a", "doc-ga-9901a", "doc-il-9901a", "doc-opl-9901a-01", "doc-opl-9901a-07", "doc-pid-9901a", "doc-pp-99", "doc-wb"];
const ASSET_REVISIONS = ["rev-ds-3", "rev-ga-0", "rev-il-2", "rev-opl1", "rev-opl2", "rev-pid-0", "rev-pp-0", "rev-wb"];

describe("resolveScope (AC-ANS-01)", () => {
  it("an equipment tag and an instrument tag: the asset, its documents by subject and typed references, one edge hop, the current revisions, every step in basis", async () => {
    const scope = await resolveScope(db, "Why did GA-9901A trip on VSHH-9901?", null);
    expect(() => Scope.parse(scope)).not.toThrow();
    expect(scope.tags).toEqual([TAG]);
    expect(scope.instrument_tags).toEqual(["VSHH-9901"]);
    expect(scope.document_ids).toEqual(ASSET_DOCUMENTS);
    expect(scope.revision_ids).toEqual(ASSET_REVISIONS);
    expect(scope.family_ids).toEqual([]);
    expect(scope.basis).toEqual([
      `equipment tag ${TAG} named in the question`,
      "instrument tag VSHH-9901 (initiator) named in the question",
      "instrument_tag.sources of VSHH-9901: doc-il-9901a",
      `documents of ${TAG} by subject_tag and typed references: 7`,
      "document_edge note from doc-il-9901a to doc-wb",
      `current revisions in versions ${VERSION_ID}: 8`,
    ]);
  });

  it("never admits another asset's documents through an edge: the C&E sheet's cross-reference to LV-9902's datasheet is not followed", async () => {
    const scope = await resolveScope(db, "Why did GA-9901A trip?", null);
    expect(scope.document_ids).not.toContain("doc-ds-9902");
    expect(scope.revision_ids).not.toContain("rev-ds-9902");
    expect(scope.tags).not.toContain(OTHER_TAG);
    expect(JSON.stringify(scope)).not.toContain(OTHER_TAG);
  });

  it("an instrument tag alone binds its asset, and the basis says so", async () => {
    const scope = await resolveScope(db, "What does VSHH-9901 do?", null);
    expect(scope.tags).toEqual([TAG]);
    expect(scope.instrument_tags).toEqual(["VSHH-9901"]);
    expect(scope.basis[0]).toBe(`instrument tag VSHH-9901 (initiator) named in the question binds ${TAG}`);
    expect(scope.document_ids).toEqual(ASSET_DOCUMENTS);
  });

  it("an area alias binds every asset of the area", async () => {
    const scope = await resolveScope(db, "Which equipment in the Feed Area has a trip?", null);
    expect(scope.tags).toEqual([TAG, OTHER_TAG]);
    expect(scope.basis).toContain(`area alias "Feed Area" names area 99: ${TAG}, ${OTHER_TAG}`);
    expect(scope.document_ids).toContain("doc-ds-9902");
  });

  it("a failure family joins the scope only when the question names it, labelled as the link it is", async () => {
    const named = await resolveScope(db, `Which work orders fall in the ${FAMILY.label} family on ${TAG}?`, null);
    expect(named.family_ids).toEqual([FAMILY.id]);
    expect(named.tags).toEqual([TAG, OTHER_TAG]);
    expect(named.basis).toContain(familyLinkBasis(FAMILY.id, FAMILY.label, [TAG, OTHER_TAG]));
    expect(named.document_ids).toContain("doc-ds-9902");

    const unnamed = await resolveScope(db, `Which work orders are related on ${TAG}?`, null);
    expect(unnamed.family_ids).toEqual([]);
    expect(unnamed.tags).toEqual([TAG]);
    expect(unnamed.document_ids).not.toContain("doc-ds-9902");
    expect(unnamed.basis.some((b) => b.startsWith("family link"))).toBe(false);
  });

  it("an unknown tag resolves to nothing and offers the nearest asset by stem without adding it (AC-ANS-06)", async () => {
    const scope = await resolveScope(db, "Why did GA-9901B trip?", null);
    expect(scope).toEqual({ tags: [], instrument_tags: [], document_ids: [], revision_ids: [], basis: [`no equipment tag matched; nearest by tag stem: ${TAG} (not added to the scope)`], family_ids: [] });
    const nothing = await resolveScope(db, "What is the weather?", null);
    expect(nothing.basis).toEqual(["no equipment tag, instrument tag, area alias or family matched"]);
    expect(nothing.document_ids).toEqual([]);
  });

  it("is deterministic: the same question resolves to the same scope twice, and case does not matter for a tag", async () => {
    const a = await resolveScope(db, "Why did GA-9901A trip on VSHH-9901?", null);
    const b = await resolveScope(db, "why did ga-9901a trip on vshh-9901?", null);
    expect(b).toEqual(a);
  });
});

describe("the pure helpers", () => {
  it("contentTerms drops the stop list and duplicates, lower case, in order", () => {
    const terms = contentTerms("Why did the GA-9901A trip? The trip.");
    expect(terms).toContain("ga-9901a");
    expect(terms.filter((t) => t === "trip")).toHaveLength(1);
    expect(terms).not.toContain("the");
    expect(terms).toEqual(terms.map((t) => t.toLowerCase()));
  });

  it("questionTags upper-cases and dedupes the tags written in the question, in order", () => {
    expect(questionTags("vshh-9901 on ga-9901a and GA-9901A")).toEqual(["VSHH-9901", "GA-9901A"]);
    expect(questionTags("no tag here")).toEqual([]);
  });

  it("nearestAssetTags offers the master tags sharing a stem with an unknown tag, never a known one", () => {
    expect(nearestAssetTags("Why did GA-9901B trip?", [TAG, OTHER_TAG])).toEqual([TAG]);
    expect(nearestAssetTags(`Why did ${TAG} trip?`, [TAG, OTHER_TAG])).toEqual([]);
    expect(nearestAssetTags("Why did KC-4501 trip?", [TAG, OTHER_TAG])).toEqual([]);
  });
});
