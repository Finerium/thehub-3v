// string_present (9.11). Four forms this runner drives, all over the packet view of ../view.ts:
//   {from: "expected.must_contain"}       every string of the case's list appears somewhere in the packet
//   {in, text}                            the text appears in the named field
//   {in, ordered[, count][, order_by]}    the strings appear in the named field in that order
//   {field, in[, value][, nonempty]}      the named field is there, non-empty, or equal to `value`
// `order_by` names how the order is decided in the product and adds nothing the runner can assert beyond the
// order itself, so it is accepted and the order is checked. Anything else reports unsupported by name.
import { resolve, textAt } from "../view";
import { asString, asStrings, fail, guard, pass, unsupported, type CheckContext, type CheckModule, type Verdict } from "./types";

const KNOWN = ["from", "in", "text", "ordered", "order_by", "count", "field", "value", "nonempty"] as const;

/** The strings of `ordered`, in order, inside `haystack`; the first one out of order, or null. */
export function firstOutOfOrder(haystack: string, ordered: string[]): string | null {
  let at = 0;
  for (const needle of ordered) {
    const found = haystack.indexOf(needle, at);
    if (found === -1) return needle;
    at = found + needle.length;
  }
  return null;
}

function fieldForm(args: Record<string, unknown>, ctx: CheckContext): Verdict {
  const field = asString(args.field);
  const where = asString(args.in);
  if (field === null || where === null) return unsupported("field form without `in`");
  const path = where === "packet" || where === "trace" ? `${where}.${field}` : `${where}.${field}`;
  const parts = resolve(ctx.answer, path);
  if (parts === null) return unsupported(`field path ${path} is outside the runner's vocabulary`);
  const value = asString(args.value);
  if (value !== null) {
    return parts.some((p) => p.includes(value)) ? pass() : fail(`${path} does not hold the expected value`);
  }
  return parts.length > 0 && parts.some((p) => p.length > 0) ? pass() : fail(`${path} is empty`);
}

export const string_present: CheckModule = (args, ctx) => {
  const stop = guard(args, KNOWN);
  if (stop) return stop;

  if (args.field !== undefined) return fieldForm(args, ctx);

  const where = asString(args.in) ?? "packet";
  const haystack = textAt(ctx.answer, where);
  if (haystack === null) return unsupported(`field path ${where} is outside the runner's vocabulary`);

  const from = asString(args.from);
  if (from !== null) {
    if (from !== "expected.must_contain") return fail(`unknown source ${from}`);
    const missing = ctx.goldenCase.expected.must_contain.filter((s) => !haystack.includes(s));
    return missing.length === 0
      ? pass()
      : fail(`${missing.length} of ${ctx.goldenCase.expected.must_contain.length} expected strings absent from ${where}`);
  }

  const ordered = asStrings(args.ordered);
  if (ordered !== null) {
    const outOfOrder = firstOutOfOrder(haystack, ordered);
    if (outOfOrder !== null) return fail(`${where} does not hold the ${ordered.length} strings in order`);
    const count = typeof args.count === "number" ? args.count : null;
    const parts = resolve(ctx.answer, where) ?? [];
    if (count !== null && parts.length !== count) return fail(`${where} holds ${parts.length} items, expected ${count}`);
    return pass();
  }

  const text = asString(args.text);
  if (text === null) return unsupported("no `from`, `ordered`, `text` or `field` to assert");
  return haystack.includes(text) ? pass() : fail(`the expected string is absent from ${where}`);
};
