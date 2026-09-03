# ADR-007 Provenance of agent-transcribed artefacts

## Context

The PRD's sidecars, hand-verified readings and family classifications are labelled manual or analyst; nothing in a sidecar may be model output presented as extracted text. The adopted P&ID sidecars (`packages/pid_sidecars/set_01.json` to `set_08.json`) and `packages/hand_verified.json` were produced on 2026-08-27 by an agent under the role alias EXEC-1 and carried the label "manual transcription of the image".

## Decision

An artefact the Orchestrator transcribes from an image or classifies itself carries provenance `basis: agent_transcription` with `reviewed_by: null`, `reviewed_at: null` and `review_status: pending`. The interface states at every point of use that the hotspots and readings were transcribed from the image by an agent, pending human review, and not machine-extracted from text. The same applies to family membership (`basis: agent_classification`, pending human review) and to the machine-drafted coverage labels. When a human review is recorded, the labels flip to `manual` or `analyst` with the reviewer alias and date.

Under this rule the adopted sidecars and hand-verified readings are relabelled `basis: agent_transcription`, `review_status: pending` (deviation D-12): "manual" was exactly the label this ADR forbids for agent output.

## Alternatives

- Keeping the "manual" label the prior harness applied: rejected, it would present agent output as human work.

## Consequences

- The PRD's wording of FR-111's acceptance is adapted without weakening its honesty.
- The human review of the sidecars and readings is a named human-gated item.
- The seeded database carries the label as data, and every render of a hotspot or reading shows it.

## Status

Accepted 2026-09-03
