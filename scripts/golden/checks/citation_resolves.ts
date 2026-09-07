// citation_resolves (9.11). The bulk form `{from: "expected.must_cite"}` is the one this runner drives: every
// document the case says the answer must cite resolves to a citation the packet carries, matched on the citation's
// document number or on a lesson or work-order id inside it (the harness's naming rule: TJC-LLD-..., OPL-...,
// WO-..., "P&ID Set N"). `min_count` raises the floor on how many citations the packet must carry.
//
// The targeted forms bind one document to a corpus row, field, edge, chain or drawn label ({doc, row, row_kind},
// {doc, field, value}, {doc, edge_to, resolved}, ...). Those resolve against the corpus and the packages, not
// against the packet, so they belong to the harness's own tests; here they report unsupported by name.
import { citedDocuments } from "../view";
import { asString, fail, guard, pass, type CheckModule } from "./types";

const KNOWN = ["from", "min_count"] as const;

/** A named document resolves when one of the packet's source documents carries its number or lesson id. */
export function resolves(documents: string[], wanted: string): boolean {
  const needle = wanted.toLowerCase();
  return documents.some((doc) => doc.toLowerCase().includes(needle));
}

export const citation_resolves: CheckModule = (args, ctx) => {
  const from = asString(args.from);
  if (from === null) return guard(args, []) ?? fail("citation_resolves without `from` is not evaluated here");
  const stop = guard(args, KNOWN);
  if (stop) return stop;
  if (from !== "expected.must_cite") return fail(`unknown source ${from}`);

  const packet = ctx.answer.packet;
  if (!packet) return fail("no packet to read the citations from");
  const documents = citedDocuments(packet, ctx.answer.citations);
  const missing = ctx.goldenCase.expected.must_cite.filter((doc) => !resolves(documents, doc));
  const minCount = typeof args.min_count === "number" ? args.min_count : null;
  if (missing.length > 0) return fail(`${missing.length} of ${ctx.goldenCase.expected.must_cite.length} not cited: ${missing.join(", ")}`);
  if (minCount !== null && ctx.answer.citations.length < minCount) {
    return fail(`${ctx.answer.citations.length} citations, min_count ${minCount}`);
  }
  return pass();
};
