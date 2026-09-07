// numeral_fidelity (9.11, INV-1 "no number generated"). `{from: "expected.numerals_allowed"}` reads the case's
// closed set and asserts that every numeral the packet renders in a claim sentence or a typed fact is in it. The
// gate that actually enforces this is G2's C3 inside the lane; this check is the golden set's independent net over
// the rendered answer, so a number that reaches the reader without a source is caught from outside the lane too.
//
// A numeral is accounted for when it is the `value` of an allowed entry, or occurs inside that entry's `unit`
// (the allowance "0.12 mm/100mm" carries the 100 of its own unit). Identifiers are removed before the scan by
// view.numeralsIn, so a tag, a document number or a voting arrangement is never read as a stated number.
import { renderedNumerals } from "../view";
import { asString, fail, guard, pass, type CheckModule } from "./types";

const KNOWN = ["from"] as const;

export const numeral_fidelity: CheckModule = (args, ctx) => {
  const from = asString(args.from);
  if (from === null) return guard(args, []) ?? fail("numeral_fidelity without `from` is not evaluated here");
  const stop = guard(args, KNOWN);
  if (stop) return stop;
  if (from !== "expected.numerals_allowed") return fail(`unknown source ${from}`);
  const packet = ctx.answer.packet;
  if (!packet) return fail("no packet to scan");

  const allowed = ctx.goldenCase.expected.numerals_allowed;
  const accounted = (numeral: string): boolean =>
    allowed.some((entry) => entry.value === numeral || entry.unit.includes(numeral));

  const unaccounted = renderedNumerals(packet).filter((n) => !accounted(n.numeral));
  if (unaccounted.length === 0) return pass();
  const named = [...new Set(unaccounted.map((n) => `${n.numeral} in ${n.where}`))];
  return fail(`${named.length} numeral(s) outside the allowed set: ${named.slice(0, 8).join("; ")}`);
};
