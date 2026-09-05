// Typed errors for the designed states of blueprint 6.3 that an API route can produce (ARCHITECTURE 3.4, 7, 9.3):
// thrown anywhere on a request path, rendered as the designed JSON by toResponse() in API routes; the page-level
// DesignedState belongs to the surfaces track. The body shape is the one AuthError uses ({ error, request_id, ...
// fields }): codes and fields, no prose, so the surfaces own every wording. AuthError itself (401, 403 with the
// auth.role_violation event) stays in src/auth/authorize.ts, which writes the audit row before throwing.
import { NextResponse } from "next/server";
import type { Scope } from "./ratelimit";
import { REQUEST_ID_HEADER } from "./request-id";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly fields: Record<string, unknown> = {},
    readonly extraHeaders: Record<string, string> = {},
  ) {
    super(code);
    this.name = new.target.name;
  }

  toResponse(requestId: string): NextResponse {
    return NextResponse.json(
      { error: this.code, request_id: requestId, ...this.fields },
      { status: this.status, headers: { [REQUEST_ID_HEADER]: requestId, ...this.extraHeaders } },
    );
  }
}

// The designed 429 rate-limit state names the limit and the moment it resets (9.9, AC-NFR-11).
export class RateLimited extends HttpError {
  constructor(
    readonly scope: Scope,
    readonly limit: number,
    readonly resetsAt: Date,
  ) {
    super(
      429,
      "rate_limited",
      { scope, limit, resets_at: resetsAt.toISOString() },
      { "retry-after": String(Math.max(1, Math.ceil((resetsAt.getTime() - Date.now()) / 1000))) },
    );
  }
}

// The designed 429 budget state names the role's budget (9.13 GatewayRole.budget) and its reset, the next UTC day
// (ARCHITECTURE 9.3); seeded chips and every read-only surface keep working (AC-ANS-20, AC-NFR-15).
export class BudgetExhausted extends HttpError {
  constructor(
    readonly role: string,
    readonly budget: { tokens_per_day: number; spend_cap_idr_per_day: number },
    readonly resetsAt: Date,
  ) {
    super(429, "budget_exhausted", { role, budget, resets_at: resetsAt.toISOString() });
  }
}

// A 403 outside the matrix check of authorize() (for example publication.rejected on a state the role may not act on).
export class Forbidden extends HttpError {
  constructor(readonly reason?: string) {
    super(403, "forbidden", reason === undefined ? {} : { reason });
  }
}

export class NotFound extends HttpError {
  constructor(
    readonly entity: string,
    readonly id?: string,
  ) {
    super(404, "not_found", id === undefined ? { entity } : { entity, id });
  }
}

// A stored procedure step whose text no longer hashes to its source_hash: the render is blocked, never paraphrased,
// and the caller writes render.integrity_blocked (AC-ANS-05). 409: the stored state conflicts with its own hash.
export class HashMismatch extends HttpError {
  constructor(readonly integrity: { opl_id: string; step_n: number | null; span_id: string | null }) {
    super(409, "hash_mismatch", integrity);
  }
}
