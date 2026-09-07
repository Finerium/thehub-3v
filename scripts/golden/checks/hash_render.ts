// hash_render (9.11, INV-1 "procedures never paraphrased"). `{opl_id, steps[, count][, only]}` asserts that the
// packet serves that lesson as a Procedure (9.8) with those step numbers, each carrying hash_ok, so a step that
// failed its source hash could not have reached the render (a mismatch blocks the render with
// render.integrity_blocked instead).
//
// `{artefact, compare, equal}` compares a draft before and after a decision, and `{opl_id, section, block}` or
// `{opl_id, block, verbatim}` asserts a hashed render inside a template block rather than the procedure. Neither
// is reachable from POST /api/ask alone, so both report unsupported by name.
import { asNumbers, asString, fail, guard, pass, type CheckModule } from "./types";

const KNOWN = ["opl_id", "steps", "count", "only"] as const;

export const hash_render: CheckModule = (args, ctx) => {
  const stop = guard(args, KNOWN);
  if (stop) return stop;
  const oplId = asString(args.opl_id);
  const steps = asNumbers(args.steps);
  if (oplId === null || steps === null) return fail("hash_render without `opl_id` and `steps`");
  const packet = ctx.answer.packet;
  if (!packet) return fail("no packet to read the procedure from");
  const procedure = packet.procedure;
  if (!procedure) return fail(`no procedure served, expected ${oplId}`);
  if (procedure.opl_id !== oplId) return fail(`procedure ${procedure.opl_id}, expected ${oplId}`);

  const rendered = procedure.steps.map((s) => s.n);
  const missing = steps.filter((n) => !rendered.includes(n));
  if (missing.length > 0) return fail(`${oplId} steps ${missing.join(", ")} not rendered (rendered: ${rendered.join(", ") || "none"})`);
  const unhashed = procedure.steps.filter((s) => steps.includes(s.n) && s.hash_ok !== true);
  if (unhashed.length > 0) return fail(`${oplId} steps ${unhashed.map((s) => s.n).join(", ")} rendered without hash_ok`);

  const count = typeof args.count === "number" ? args.count : null;
  if (count !== null && rendered.length !== count) return fail(`${oplId} rendered ${rendered.length} steps, expected ${count}`);
  if (args.only === true && rendered.length !== steps.length) {
    return fail(`${oplId} rendered ${rendered.length} steps, expected only ${steps.length}`);
  }
  return pass();
};
