# ADR-011 Page-render and rate-limit storage

## Context

The application runs as more than one function instance, and AC-NFR-18 forbids load-bearing server-side in-memory state. The rate limits of blueprint 9.9 are 30 asks and 5 draft creations per minute per account and 120 requests per minute per address, with exhaustion rendering a designed 429 that names the limit and the reset moment.

## Decision

Rate limits are counted in PostgreSQL (fixed-window counters keyed by account and by address), not in per-instance memory, so limits hold across function instances. Page derivatives follow ADR-010 and live in PostgreSQL as bytea rows.

## Alternatives

- Per-instance in-memory counters: rejected, a limit would reset with every new instance.
- A cache service for counters or page renders: not adopted; nothing outside PostgreSQL is load-bearing.

## Consequences

- One system holds all state: sessions, leases, rate-limit counters and page derivatives.
- No cache service is load-bearing; two concurrent instances pass the integration suite (AC-NFR-18).

## Status

Accepted 2026-09-03
