// C4, the approval filter (blueprint 8.4 "approved current revisions only", 9.2 DocumentRevision, 9.8 Citation;
// AC-ANS-02, AC-ANS-14): a claim is served only from revisions whose approval status is in the served set and that
// are not superseded. The served set is read off the seeded corpus (thehub-harness bundle revisions.json, corpus
// version v1, 130 rows): every current revision carries approved, issued_for_construction, issued_for_operation or
// unknown (the workbook and the P&IDs have no approval block), and only the superseded A and B revisions carry
// issued_for_review and issued_for_approval. The labelled history toggle (include_superseded, traced) is the one way
// a superseded or unserved revision passes, and its citation keeps superseded true so the chip can label it. A claim
// with one unserved citation among served ones is dropped: provenance or nothing.
import { describe, expect, it } from "vitest";
import { claim, input, span } from "../../../tests/fixtures/g2";
import { runG2, SERVED_APPROVAL_STATUSES } from "./index";

const OPL_TEXT = span("sp-opl-1").text;

describe("the served set", () => {
  it("is approved, issued_for_construction, issued_for_operation and unknown (the statuses of current revisions)", () => {
    expect([...SERVED_APPROVAL_STATUSES].sort()).toEqual([
      "approved",
      "issued_for_construction",
      "issued_for_operation",
      "unknown",
    ]);
  });
});

describe("C4 approval filter", () => {
  it("every served status passes: operation, construction, approved (the lesson, whitelisted) and unknown", () => {
    const list = [
      claim("s1", "VSHH-1201 trips GA-1201A at 7.1 mm/s.", ["sp-ds-1"]),
      claim("s2", "The CT-7801 fan motor is rated 45 kW at 1480 rpm.", ["sp-ct-0"]),
      claim("s3", OPL_TEXT, ["sp-opl-1"]),
      claim("s4", "The seal on GA-1201A was replaced after 3 hours of downtime.", ["sp-wo-1"]),
    ];
    const r = runG2(input({ claims: list, whitelisted_spans: [OPL_TEXT] }));
    expect(r.dropped).toEqual([]);
    expect(r.kept.map((c) => c.citations[0].approval_status)).toEqual([
      "issued_for_operation",
      "issued_for_construction",
      "approved",
      "unknown",
    ]);
  });

  it("a superseded revision issued for review is dropped by C4 with the revision and its status in the reason", () => {
    const c = claim("s1", "The CT-7801 fan motor is rated 37 kW at 1480 rpm.", ["sp-ct-a"]);
    const r = runG2(input({ claims: [c] }));
    expect(r.kept).toEqual([]);
    expect(r.dropped).toHaveLength(1);
    expect(r.dropped[0].claim).toEqual(c);
    expect(r.dropped[0].check).toBe("C4");
    expect(r.dropped[0].reason).toMatch(/issued_for_review|ISSUED FOR REVIEW/);
    expect(r.dropped[0].reason).toContain("sp-ct-a");
  });

  it("a superseded revision issued for approval is dropped by C4", () => {
    const r = runG2(input({ claims: [claim("s1", "The CT-7801 fan motor is rated 45 kW at 1450 rpm.", ["sp-ct-b"])] }));
    expect(r.dropped.map((d) => d.check)).toEqual(["C4"]);
  });

  it("a superseded revision is dropped even when its status is in the served set", () => {
    const r = runG2(input({ claims: [claim("s1", "VSHH-1201 trips GA-1201A at 6.8 mm/s.", ["sp-ds-old"])] }));
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => d.check)).toEqual(["C4"]);
    expect(r.dropped[0].reason).toMatch(/superseded/i);
  });

  it("one unserved citation among served ones drops the claim", () => {
    const r = runG2(
      input({ claims: [claim("s1", "The CT-7801 fan motor is rated 45 kW at 1480 rpm.", ["sp-ct-0", "sp-ct-a"])] }),
    );
    expect(r.kept).toEqual([]);
    expect(r.dropped.map((d) => d.check)).toEqual(["C4"]);
  });

  it("omitting include_superseded means false", () => {
    const base = input({ claims: [claim("s1", "VSHH-1201 trips GA-1201A at 6.8 mm/s.", ["sp-ds-old"])] });
    const { include_superseded: _omitted, ...without } = base;
    expect(_omitted).toBe(false);
    expect(runG2(without).dropped.map((d) => d.check)).toEqual(["C4"]);
  });
});

describe("C4 under the labelled history toggle (include_superseded traced, AC-ANS-14)", () => {
  const history = [
    claim("s1", "The CT-7801 fan motor is rated 37 kW at 1480 rpm.", ["sp-ct-a"]),
    claim("s2", "The CT-7801 fan motor is rated 45 kW at 1450 rpm.", ["sp-ct-b"]),
    claim("s3", "VSHH-1201 trips GA-1201A at 6.8 mm/s.", ["sp-ds-old"]),
    claim("s4", "The CT-7801 fan motor is rated 45 kW at 1480 rpm.", ["sp-ct-0"]),
  ];

  it("superseded revisions A, B and the older operation revision pass beside the current one", () => {
    const r = runG2(input({ claims: history, include_superseded: true }));
    expect(r.dropped).toEqual([]);
    expect(r.kept.map((c) => c.id)).toEqual(["s1", "s2", "s3", "s4"]);
  });

  it("their citations keep superseded true and their own status text, so the chip labels history", () => {
    const r = runG2(input({ claims: history, include_superseded: true }));
    expect(r.kept.map((c) => [c.citations[0].revision, c.citations[0].superseded, c.citations[0].approval_status_text])).toEqual([
      ["A", true, "ISSUED FOR REVIEW"],
      ["B", true, "ISSUED FOR APPROVAL"],
      ["2", true, "ISSUED FOR OPERATION"],
      ["0", false, "ISSUED FOR CONSTRUCTION"],
    ]);
  });

  it("the toggle changes C4 only: the other checks still run", () => {
    const r = runG2(
      input({
        claims: [claim("s1", "The CT-7801 fan motor is rated 37 kW at 1500 rpm.", ["sp-ct-a"])],
        include_superseded: true,
      }),
    );
    expect(r.dropped.map((d) => d.check)).toEqual(["C3"]);
  });
});
