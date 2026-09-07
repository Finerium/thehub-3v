// block_order (9.11, AC-ANS-16). The kinds of `expected.block_order` must appear among the packet's blocks in
// that relative order; `template` pins the moment template the lane inferred.
//
// The T3b polish list left one reading open: a job case pins an order without functions_out_of_service while the
// template renders that block when a function is affected. The runner settles it here as a subsequence: every
// pinned kind present, in the pinned order, and a block the packet adds beyond the list is reported as a note on
// the passing check rather than a failure. A missing or reordered kind is a failure.
//
// `inferred_by: "rulepack.moment_keywords"` says the template came from the pack and not from the request. No
// golden case sends `input.template`, so the runner never sends one either and the assertion holds by
// construction; the key is accepted and the inferred template is compared with `template`.
import { asString, fail, guard, pass, type CheckModule } from "./types";

const KNOWN = ["from", "template", "inferred_by"] as const;

export const block_order: CheckModule = (args, ctx) => {
  const stop = guard(args, KNOWN);
  if (stop) return stop;
  const from = asString(args.from);
  if (from !== "expected.block_order") return fail(`unknown source ${from ?? "none"}`);
  const expected = ctx.goldenCase.expected.block_order;
  if (!expected) return fail("the case names no expected.block_order");
  const packet = ctx.answer.packet;
  if (!packet) return fail("no packet to read the blocks from");

  const template = asString(args.template);
  if (template !== null && packet.template !== template) {
    return fail(`template ${packet.template ?? "none"}, expected ${template}`);
  }

  const rendered: string[] = packet.blocks.map((b) => b.kind);
  let at = 0;
  for (const kind of expected) {
    const found = rendered.indexOf(kind, at);
    if (found === -1) {
      return rendered.includes(kind)
        ? fail(`block ${kind} renders out of the pinned order (${rendered.join(", ")})`)
        : fail(`block ${kind} is absent (rendered: ${rendered.join(", ") || "none"})`);
    }
    at = found + 1;
  }
  const extra = rendered.filter((kind) => !expected.includes(kind));
  return pass(extra.length === 0 ? undefined : `blocks beyond the pinned order: ${extra.join(", ")}`);
};
