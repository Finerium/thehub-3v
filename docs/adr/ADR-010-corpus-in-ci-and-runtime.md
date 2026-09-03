# ADR-010 The corpus in CI and at runtime

## Context

The corpus is the organiser's property and cannot be committed to a public repository, yet CI must run G1, the harness and the extraction reproducibility test, and the deployment must render document pages.

## Decision

The corpus lives in one private repository, `Finerium/thehub-corpus`, holding only the corpus and its inventory. CI reads it through a read-only deploy key the Orchestrator creates with `gh` and stores as a secret in each repository that needs it, never through a personal access token. The seeding job runs where the corpus exists (the build machine or CI). Page derivatives (width-limited PNG or WebP, metadata stripped) are stored in PostgreSQL as bytea rows with their document, page, width and source SHA-256, served by a role-checked route, one page at a time. The original PDFs are never uploaded to Vercel and never leave the private repository and the build environments.

## Alternatives

- Committing the corpus, or extracted text beyond citation length, to a public repository: forbidden (invariant 7; a CI check fails on any run of corpus text longer than 200 characters in a tracked file).
- A personal access token for CI access: rejected in favour of a read-only deploy key.
- An object store for page derivatives: not load-bearing; PostgreSQL holds them.

## Consequences

- No object store is load-bearing.
- The export carries only the seeded page images it needs at render size.

## Status

Accepted 2026-09-03
