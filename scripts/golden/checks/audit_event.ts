// audit_event (9.11, 9.7). `{action, present[, carries]}` reads the audit rows written for this trace and asserts
// that the action was written (or was not), and that the payload carries the named fields. The audit payload rules
// of 9.7 are frozen: an answer event never carries the question text or a span, and the two safety events carry
// the request text pseudonymised under `request_text`, so a case that asks for `question` is satisfied by that
// field and by nothing else.
//
// The rows come from the database the application writes to, read by the runner over DATABASE_URL. With no
// database in reach (a Tier B run against production), the whole check reports unsupported rather than passing.
import { asString, asStrings, fail, guard, pass, unsupported, type CheckModule } from "./types";

const KNOWN = ["action", "present", "carries", "after"] as const;

/** 9.7: the safety events carry the request text as typed and pseudonymised; the case may name it `question`. */
const FIELD_ALIASES: Record<string, string[]> = { question: ["request_text"] };

export const audit_event: CheckModule = (args, ctx) => {
  const stop = guard(args, KNOWN);
  if (stop) return stop;
  const action = asString(args.action);
  if (action === null) return fail("audit_event without `action`");
  if (args.after !== undefined) return unsupported("`after` names a state this runner does not reach");
  if (ctx.audit === null) return unsupported("no database in reach to read the audit log");

  const rows = ctx.audit.filter((row) => row.action === action);
  const present = args.present !== false;
  if (!present) return rows.length === 0 ? pass() : fail(`${rows.length} ${action} row(s) written, expected none`);
  if (rows.length === 0) return fail(`no ${action} row written for this trace`);

  const carries = asStrings(args.carries);
  if (carries === null) return pass();
  const missing = carries.filter((field) => {
    const names = [field, ...(FIELD_ALIASES[field] ?? [])];
    return !rows.some((row) => names.some((name) => row.payload[name] !== undefined && row.payload[name] !== null));
  });
  return missing.length === 0 ? pass() : fail(`${action} payload does not carry ${missing.join(", ")}`);
};
