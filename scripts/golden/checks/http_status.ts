// http_status (9.11). The runner drives one route, POST /api/ask, so a check that names that route is compared
// with the status the case's own request returned. Every http_status in the golden set at v1 names a drafting,
// publication or note route, which the loop harness drives and this runner does not, so they report unsupported
// with the route named.
import { asString, fail, guard, pass, unsupported, type CheckModule } from "./types";

const KNOWN = ["route", "role", "status"] as const;

export const http_status: CheckModule = (args, ctx) => {
  const stop = guard(args, KNOWN);
  if (stop) return stop;
  const route = asString(args.route);
  const status = typeof args.status === "number" ? args.status : null;
  if (route === null || status === null) return fail("http_status without `route` and `status`");
  if (route !== ctx.route) return unsupported(`${route} is not driven by the golden runner`);
  const role = asString(args.role);
  if (role !== null && role !== (ctx.goldenCase.input.role ?? "Engineer")) {
    return unsupported(`${route} as ${role} is not the role the case was run under`);
  }
  return ctx.status === status ? pass() : fail(`${route} returned ${ctx.status}, expected ${status}`);
};
