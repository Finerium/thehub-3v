# ADR-008 Trace policy and NFR-23

## Context

All repositories are public from creation, except `thehub-corpus` (ADR-010). Crown's default for public pitch repositories is trace-free. The PRD's NFR-23 asks for branch protection requiring one human review per merge, which would stop an autonomous run at every merge.

## Decision

Repositories are public and trace-free: no `.claude/` directory or process file is committed; no co-author trailer and no session trailer appear in any commit (both denied by the commit hook, deviation D-04); every commit is authored as `Ghaisan Khoirul Badruzaman <ghaisan.khoirul.b@gmail.com>` under the finerium GitHub account (deviation D-03), with an English message. AI involvement is disclosed once, in `docs/DISCLOSURE-AI.md` and the README, not per commit.

Merges go through pull requests with required status checks: Tier A, lint, type check, gitleaks, the product-name and banned-strings grep, the copy audit, the no-corpus-text check. The human-review requirement is replaced during the run by fresh-context verification fleets (read-only verifier workers, deviation D-13) whose schema results `{artifact, pass, findings[{severity, what}]}` are recorded in the pull request; Ghaisan's acceptance of the Report is the human acceptance. After the run, branch protection may be tightened to require a human review.

## Alternatives

- Branch protection requiring one human review per merge during the run: rejected, it would stop the run at every merge.
- Per-commit AI-tooling trailers: rejected by owner policy for judged public repositories.

## Consequences

- The validation loop of the PRD's 29.1 (how AI-generated work is validated) holds in substance.
- The deck's appendix slide and `docs/DISCLOSURE-AI.md` describe the loop as it actually ran.

## Status

Accepted 2026-09-03
