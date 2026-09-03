# AI disclosure

This repository and its siblings (`thehub-harness`, and the private `thehub-corpus`) were built by an orchestrated run of Claude Code on Claude Fable 5.1 (Anthropic), directed by the owner, Ghaisan Khoirul Badruzaman, for Team 3V's entry to CALIBER 2026 Case 1. The model wrote the code, the documentation, the deck source and the Report from the PRD v1.1 and the blueprint, provisioned platform resources through CLIs, and ran the harness. It never saw a secret (ADR-012), never published a lesson (only a human in the Manager role publishes, through gate G3), and never typed a number onto a surface (every figure binds to the fixture, the bundle or the seeded database).

## How the work was validated

The validation loop of the PRD's Chapter 29.1 ran as ADR-008 records it: every change merged through a pull request with required deterministic checks (Tier A tests, lint, type check, gitleaks, the product-name and banned-strings grep, the copy audit, the no-corpus-text check); fresh-context verification fleets, read-only and separate from the threads that wrote the code, reviewed each artefact and their schema results were recorded in the pull request; the owner's acceptance of the Report is the human acceptance. Branch protection may be tightened to require a human review after the run.

## Runtime model roles

Every product model role (AG-1 Extractor, AG-2 Composer, AG-3 Drafter, AG-4 Verifier and Redliner) runs on Z.ai GLM-5.3-Flash through one gateway module, the only code path that calls a provider (ADR-001). The embedding role is a local, hash-pinned open-weights model (ADR-009). No other provider is called. Safety intent is classified in deterministic code before any model call; the verifier never sees the question and never edits; the gates decide. Every generated artefact (trace, draft, evaluation run) records the model id, the prompt version (the SHA-256 of the prompt file), the gateway configuration hash and the corpus version.

## Commits

By owner policy, commits carry no AI-tooling trailer; they are authored as Ghaisan Khoirul Badruzaman with an English message. This file and the README are the disclosure.

## Corpus

The organiser's corpus is the organiser's property. It is used for this entry only and is never committed to a public repository; nothing longer than a citation leaves with the code (ADR-010).
