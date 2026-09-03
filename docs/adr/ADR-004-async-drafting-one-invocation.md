# ADR-004 Asynchronous drafting inside one function invocation

## Context

Drafting runs two model roles (AG-3, then AG-4) and a possible retry, and can exceed a minute. The PRD forbids a queue and a worker pool. Vercel functions on fluid compute allow work after the response through `waitUntil` within the function's maximum duration, verified on 2026-09-03 at 300 seconds (default and maximum) on the Hobby plan the deployment runs on (deviation D-06).

## Decision

`POST /api/drafts` inserts the draft in state `proposed` with a lease and returns 202. The same invocation continues the AG-3 and AG-4 work through `waitUntil`, with the function's maximum duration set explicitly to the plan's allowed maximum (300 s). The client polls. A draft whose lease expires without a terminal state is moved to `blocked` with reason `deadline_exceeded` by the next poll, never left stranded. Drafting is idempotent per draft id.

## Alternatives

- A queue and a worker pool: forbidden by the PRD.

## Consequences

- No proprietary queue is load-bearing.
- A timed-out draft is re-proposable; the deadline-exceeded draft is one of the designed states of blueprint 6.3.

## Status

Accepted 2026-09-03
