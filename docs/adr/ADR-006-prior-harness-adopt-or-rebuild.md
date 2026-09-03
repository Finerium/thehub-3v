# ADR-006 Prior harness artefacts: adopt or rebuild

## Context

The PRD states that a harness, fixtures, sidecars, a golden set and a rule pack exist and are runnable today. Ghaisan left the decision to Crown and may or may not drop the repository in.

## Decision

The rule: if `supplied/prior-harness/` exists, the Orchestrator recons it, adopts every artefact that passes G1 and reproduces the fixture under the pinned extractor, keeps human provenance labels as they are, and rebuilds only what fails. If it does not exist, the Orchestrator rebuilds the harness from the PRD's Chapter 19 and Appendix C, reproduces the H-basis claims of Appendix A as validation targets, transcribes the P&ID sidecars itself under the provenance rules of ADR-007, and writes the golden set from Chapter 21 and Appendix D with the category counts stated there.

The outcome (2026-09-03): `supplied/prior-harness/` existed. It was adopted into the fresh repository `thehub-harness` (deviation D-10) under uv and Python 3.12.14, with `contracts/` inside it as the one home of every JSON Schema. The fixture `packages/fixtures.json` rebuilt byte-identical to the supplied one under `pdftotext` 26.02.0: corpus digest 918706e4 (SHA-256 over sorted relative paths and file digests; 98 files, 56 lessons), 14 of 57 unplanned-failure work orders uncovered on the generous layer and 41 of 57 on the strict layer at t = 0.62, 174 integrity findings. The only failing tests were `test_value_model.py`, which read the PRD's chapter files and belong to the deck build; they were relocated out of the harness. Provenance labels were kept as they were, except where ADR-007 forbids them (D-12).

## Alternatives

- Rebuild from the PRD's Chapter 19 and Appendix C: the branch not taken, because the supplied harness reproduced the fixture.

## Consequences

- No fixture value moved in the rebuild, so no fixture deviation was logged.
- The rule stands: any fixture value that differs from the PRD after a rebuild supersedes the PRD value in the product and the deck and is logged as a deviation with the diff.

## Status

Accepted 2026-09-03
