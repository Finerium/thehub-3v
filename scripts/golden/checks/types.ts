// What a check module is (blueprint 9.11: the eleven check types) and the context every one of them reads.
//
// A module returns one of three outcomes and never throws:
//   pass         the assertion holds (with an optional note the report prints)
//   fail         the assertion does not hold; `detail` names what was found, never a claim text or a question
//   unsupported  the runner cannot evaluate these arguments yet; `detail` names the argument keys
//
// `unsupported` is the honest third state. A check whose arguments reach outside what this runner drives (a draft,
// an export, the coverage console, a second corpus version) is reported, counted and printed rather than passed,
// so the report never reads greener than the runner is.
import type { Case } from "../cases";
import type { Answer } from "../view";

export type AuditRow = { action: string; trace_id: string | null; payload: Record<string, unknown> };

export type CheckContext = {
  goldenCase: Case;
  answer: Answer;
  /** The HTTP status of the case's POST /api/ask. */
  status: number;
  route: string;
  /** The active corpus version label at the start of the run. */
  corpusVersion: string;
  /** The audit rows of this trace, or null when no database was reachable (Tier B against production). */
  audit: AuditRow[] | null;
  /** The answers of the cases already run in this run, by case id (trace_replays reads them). */
  earlier: Map<string, Answer>;
};

export type Verdict =
  | { status: "pass"; note?: string }
  | { status: "fail"; detail: string }
  | { status: "unsupported"; detail: string };

export type CheckModule = (args: Record<string, unknown>, ctx: CheckContext) => Verdict;

export const pass = (note?: string): Verdict => (note === undefined ? { status: "pass" } : { status: "pass", note });
export const fail = (detail: string): Verdict => ({ status: "fail", detail });
export const unsupported = (detail: string): Verdict => ({ status: "unsupported", detail });

/** The argument keys this module does not implement, in file order. */
export function unknownKeys(args: Record<string, unknown>, known: readonly string[]): string[] {
  return Object.keys(args).filter((k) => !known.includes(k));
}

/** unsupported() naming the keys, or null when every key is known. */
export function guard(args: Record<string, unknown>, known: readonly string[]): Verdict | null {
  const extra = unknownKeys(args, known);
  return extra.length === 0 ? null : unsupported(`arguments not evaluated by the runner: ${extra.join(", ")}`);
}

export function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asStrings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === "string") ? (value as string[]) : null;
}

export function asNumbers(value: unknown): number[] | null {
  return Array.isArray(value) && value.every((v) => typeof v === "number") ? (value as number[]) : null;
}
