# ADR-002 Two implementations of the coverage recipe and the rule pack, with an equality gate

## Context

The PRD asks for one implementation called by both consumers (its 15.2) and for a byte-identical check between the harness output and the application's recomputation (its 28.1). The application runs on Vercel serverless, where Python is unavailable, and coverage is recomputed inside the publication transaction (G3).

## Decision

The Python harness (`thehub-harness`) is the reference implementation a judge runs with `make fixtures` and `make test`. The application carries a TypeScript port of the tokeniser, the stop list, the window scorer, both layers (generous and strict), the debt formula and the rule-pack matcher (`src/coverage`, `src/rulepack`). CI asserts field-by-field, byte-identical equality of the two on the seeded corpus and runs the rule pack from both entry points over the pack's own fixtures. The stop list, the threshold and the lexicons live in data files consumed by both: the fixture's `method` block (`t` = 0.62, window multiplier 2, the stop list and its SHA-256) and `rulepack/v1.json`, read by pointer from the application (blueprint 8.3).

## Alternatives

- One shared implementation called by both consumers, as the PRD's 15.2 asks: not available, because the runtime has no Python and the recomputation runs inside the publication transaction.

## Consequences

- A divergence between the two implementations fails the build.
- A change to the recipe, the threshold, the stop list or a lexicon is a change to a shared data file and re-runs every table and every deliverable (invariant 5).

## Status

Accepted 2026-09-03
