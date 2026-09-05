// Typed errors the gateway raises or hands to its callers. The designed states of blueprint 6.3 render from these,
// never from a provider message; none of them carries an envelope, a span or a secret.

// The daily budget of a role is spent (ARCHITECTURE 9.3): invoke() returns outcome "budget_exhausted" without a
// provider call, and the caller throws this to render the designed 429 budget state (AC-ANS-20) while the seeded
// chips and every read-only surface keep working.
export class BudgetExhaustedError extends Error {
  readonly role: string;
  readonly tokens_used: number;
  readonly tokens_per_day: number;
  readonly spend_idr: number;
  readonly spend_cap_idr_per_day: number;
  readonly day: string;

  constructor(input: {
    role: string;
    tokens_used: number;
    tokens_per_day: number;
    spend_idr: number;
    spend_cap_idr_per_day: number;
    day: string;
  }) {
    super(`gateway budget exhausted for role ${input.role} on ${input.day}`);
    this.name = "BudgetExhaustedError";
    this.role = input.role;
    this.tokens_used = input.tokens_used;
    this.tokens_per_day = input.tokens_per_day;
    this.spend_idr = input.spend_idr;
    this.spend_cap_idr_per_day = input.spend_cap_idr_per_day;
    this.day = input.day;
  }
}

// A recorded call did not match the request rebuilt for replay (blueprint 9.16, ARCHITECTURE 9.4): both hashes are
// named so a reviewer sees which prompt version or pin moved.
export class ReplayMismatchError extends Error {
  readonly case_id: string;
  readonly role: string;
  readonly recomputed_sha256: string;
  readonly recorded_sha256: string[];
  readonly recomputed_prompt_version: string | null;
  readonly recorded_prompt_versions: Array<string | null>;

  constructor(input: {
    case_id: string;
    role: string;
    recomputed_sha256: string;
    recorded_sha256: string[];
    recomputed_prompt_version: string | null;
    recorded_prompt_versions: Array<string | null>;
  }) {
    super(
      `replay mismatch for ${input.case_id}/${input.role}: recomputed request_sha256 ${input.recomputed_sha256}` +
        ` (prompt_version ${input.recomputed_prompt_version ?? "null"}), recorded ` +
        (input.recorded_sha256.length === 0
          ? "no recording"
          : input.recorded_sha256
              .map((h, i) => `${h} (prompt_version ${input.recorded_prompt_versions[i] ?? "null"})`)
              .join(", ")),
    );
    this.name = "ReplayMismatchError";
    this.case_id = input.case_id;
    this.role = input.role;
    this.recomputed_sha256 = input.recomputed_sha256;
    this.recorded_sha256 = input.recorded_sha256;
    this.recomputed_prompt_version = input.recomputed_prompt_version;
    this.recorded_prompt_versions = input.recorded_prompt_versions;
  }
}
