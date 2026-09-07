// The eleven check types of blueprint 9.11, one module each. The registry is exhaustive over the enum of
// contracts/golden_case.schema.json, so a new check type in the contract fails the type check here before it can
// reach a run as a silent pass.
import type { GoldenCase } from "../../../src/contracts/generated/golden_case";
import { audit_event } from "./audit_event";
import { block_order } from "./block_order";
import { citation_resolves } from "./citation_resolves";
import { hash_render } from "./hash_render";
import { http_status } from "./http_status";
import { numeral_fidelity } from "./numeral_fidelity";
import { rulepack_class } from "./rulepack_class";
import { string_absent } from "./string_absent";
import { string_present } from "./string_present";
import { trace_replays } from "./trace_replays";
import { version_increment } from "./version_increment";
import type { CheckContext, CheckModule, Verdict } from "./types";

export type CheckType = GoldenCase["checks"][number]["type"];

export const CHECKS: Record<CheckType, CheckModule> = {
  citation_resolves,
  numeral_fidelity,
  string_present,
  string_absent,
  rulepack_class,
  block_order,
  hash_render,
  http_status,
  audit_event,
  version_increment,
  trace_replays,
};

/** Runs one check; a module that throws is a failure of the runner, reported as one and never as a pass. */
export function runCheck(check: GoldenCase["checks"][number], ctx: CheckContext): Verdict {
  const evaluate = CHECKS[check.type];
  try {
    return evaluate(check.args as Record<string, unknown>, ctx);
  } catch (error) {
    return { status: "fail", detail: `the ${check.type} module threw: ${error instanceof Error ? error.message : String(error)}` };
  }
}

export type { CheckContext, CheckModule, Verdict } from "./types";
