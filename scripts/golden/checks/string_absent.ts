// string_absent (9.11). Five forms this runner drives, all over the packet view of ../view.ts:
//   {from: "expected.must_not_contain"[, in]}   no string of the case's list appears (default: anywhere)
//   {in, text}                                  the text does not appear in the named field
//   {in, pattern}                               the regular expression does not match the named field
//   {empty: true, in}                           the named field holds nothing
//   {field, in[, expect]}                       the named field is absent or empty
// The expected string, span or pattern is never printed: a failure names the field and the count, never the text.
import { resolve, textAt } from "../view";
import { asString, fail, guard, pass, unsupported, type CheckModule } from "./types";

const KNOWN = ["from", "in", "text", "pattern", "empty", "field", "expect"] as const;

export const string_absent: CheckModule = (args, ctx) => {
  const stop = guard(args, KNOWN);
  if (stop) return stop;
  const where = asString(args.in) ?? "packet";

  if (args.empty === true) {
    const parts = resolve(ctx.answer, where);
    if (parts === null) return unsupported(`field path ${where} is outside the runner's vocabulary`);
    const filled = parts.filter((p) => p.length > 0);
    return filled.length === 0 ? pass() : fail(`${where} holds ${filled.length} item(s), expected none`);
  }

  if (args.field !== undefined) {
    const field = asString(args.field);
    if (field === null) return unsupported("`field` is not a string");
    const parts = resolve(ctx.answer, `${where}.${field}`);
    if (parts === null) return unsupported(`field path ${where}.${field} is outside the runner's vocabulary`);
    const filled = parts.filter((p) => p.length > 0);
    return filled.length === 0 ? pass() : fail(`${where}.${field} is present, expected absent`);
  }

  const haystack = textAt(ctx.answer, where);
  if (haystack === null) return unsupported(`field path ${where} is outside the runner's vocabulary`);

  const from = asString(args.from);
  if (from !== null) {
    if (from !== "expected.must_not_contain") return fail(`unknown source ${from}`);
    const found = ctx.goldenCase.expected.must_not_contain.filter((s) => haystack.includes(s));
    return found.length === 0 ? pass() : fail(`${found.length} forbidden string(s) present in ${where}`);
  }

  const pattern = asString(args.pattern);
  if (pattern !== null) {
    let re: RegExp;
    try {
      re = new RegExp(pattern.startsWith("(?i)") ? pattern.slice(4) : pattern, pattern.startsWith("(?i)") ? "i" : "");
    } catch {
      return unsupported("the pattern is not a JavaScript regular expression");
    }
    return re.test(haystack) ? fail(`the forbidden pattern matches ${where}`) : pass();
  }

  const text = asString(args.text);
  if (text === null) return unsupported("no `from`, `pattern`, `text`, `field` or `empty` to assert");
  return haystack.includes(text) ? fail(`the forbidden string is present in ${where}`) : pass();
};
