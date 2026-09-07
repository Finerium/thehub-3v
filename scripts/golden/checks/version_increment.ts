// version_increment (9.11, 9.3). `{delta: 0, after}` is the assertion this runner can make: the corpus version
// the packet was answered against is still the version the run started on, so whatever the case did left the
// lineage where it was (the Engineer publish attempt of GS-16, refused at G3).
//
// `{delta: 1, ...}` follows a Manager publication through G3 into a new corpus version, which the loop harness
// drives and this runner does not; it reports unsupported with the delta named. `previous_readable` asserts that
// the earlier version still answers, which needs both versions in hand for the same reason.
import { asString, fail, guard, pass, unsupported, type CheckModule } from "./types";

const KNOWN = ["delta", "after", "previous_readable", "compared_to"] as const;

export const version_increment: CheckModule = (args, ctx) => {
  const stop = guard(args, KNOWN);
  if (stop) return stop;
  const delta = typeof args.delta === "number" ? args.delta : null;
  if (delta === null) return fail("version_increment without `delta`");
  if (delta !== 0) return unsupported(`delta ${delta} needs a publication this runner does not drive`);
  if (args.previous_readable !== undefined) return unsupported("`previous_readable` needs a second corpus version");
  const packet = ctx.answer.packet;
  if (!packet) return fail("no packet to read the corpus version from");
  const after = asString(args.after) ?? "the case";
  return packet.corpus_version === ctx.corpusVersion
    ? pass()
    : fail(`corpus version ${packet.corpus_version} after ${after}, expected ${ctx.corpusVersion}`);
};
