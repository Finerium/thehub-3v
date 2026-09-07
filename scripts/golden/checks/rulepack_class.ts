// rulepack_class (9.11, 9.10, INV-2). The runner asserts the class the lane decided for this question and, where
// the case names them, the rule id, the matched phrase, the protective function and the detected language.
//
// `decided_before_model_call: true` is the AC-ANS-08 assertion. The trace records no timestamp per gateway call,
// so the runner asserts the observable consequence instead: a refused request records no prompt at all, which can
// only hold if the classification ran before any provider call.
// ponytail: prompts-empty is the available proxy; the exact ordering assertion belongs to the recorded-call test
// beside the gateway, which sees both timestamps.
//
// A case that classifies a supplied `text`, names a suppression vocabulary or asserts the outbound screen over an
// artefact reaches past the ask lane into the rule-pack port itself; those are the harness's rule-pack equality
// tests and the outbound-screen tests, and they report unsupported by name here.
import { asString, fail, guard, pass, unsupported, type CheckModule } from "./types";

const KNOWN = ["class", "rule_id", "matched_phrase", "function", "language", "decided_before_model_call", "recorded_with"] as const;

export const rulepack_class: CheckModule = (args, ctx) => {
  const stop = guard(args, KNOWN);
  if (stop) return stop;
  const packet = ctx.answer.packet;
  if (!packet) return fail("no packet to read the class from");
  const trace = ctx.answer.trace;

  const wantedClass = asString(args.class);
  if (wantedClass !== null && packet.rulepack.class !== wantedClass) {
    return fail(`class ${packet.rulepack.class}, expected ${wantedClass}`);
  }

  const ruleId = asString(args.rule_id);
  if (ruleId !== null) {
    const seen = packet.refusal?.rule_id ?? trace?.rulepack.rule_id ?? null;
    if (seen === null) return trace === null ? unsupported("rule_id needs the trace, which was not read") : fail(`no rule id recorded, expected ${ruleId}`);
    if (seen !== ruleId) return fail(`rule ${seen}, expected ${ruleId}`);
  }

  if (args.matched_phrase !== undefined) {
    const seen = packet.refusal?.matched_phrase ?? trace?.rulepack.matched_phrase ?? null;
    if (seen === null || seen.length === 0) return fail("no matched phrase recorded");
  }

  const fn = asString(args.function);
  if (fn !== null) {
    const seen = packet.refusal?.function?.seq_id ?? null;
    if (seen !== fn) return fail(`protective function ${seen ?? "none"}, expected ${fn}`);
  }

  const language = asString(args.language);
  if (language !== null) {
    if (!trace) return unsupported("language needs the trace, which was not read");
    if (trace.language_detected !== language) return fail(`language ${trace.language_detected}, expected ${language}`);
  }

  if (args.decided_before_model_call === true) {
    if (!trace) return unsupported("decided_before_model_call needs the trace, which was not read");
    if (packet.outcome === "refusal" && trace.prompts.length > 0) {
      return fail(`a refused request recorded ${trace.prompts.length} prompt(s); the class was not decided before the model call`);
    }
  }

  if (args.recorded_with !== undefined && !trace) return unsupported("recorded_with needs the trace, which was not read");

  return pass();
};
