# AI disclosure

Team 3V, CALIBER 2026, Case 1. This file states, for the Committee, exactly where a model was used in making this
entry, which models, what a human decided, and which parts of the product itself are machine-drafted and labelled
as such inside the product. Nothing here is qualified or softened. If a judge would want to know it, it is here.

---

## 1. What was built with model assistance

**All of the code, and most of the prose.** This repository, the `thehub-harness` repository and the submission
artefacts (the offline export, the deck source, the video pipeline, this documentation and the Report) were written
by an orchestrated run of Claude Code, directed throughout by the owner, Ghaisan Khoirul Badruzaman. The model wrote
the source, the tests, the documentation and the deck and video sources; it provisioned platform resources through
their command-line tools; it ran the harness and the evaluation.

What the model never did:

- It never saw a credential. Secrets moved only by shell redirection into a process environment, and no thread ever
  read, printed, copied or echoed one (ADR-012).
- It never published a lesson into the corpus. Publication is gate G3, and only a human in the Manager role passes
  it.
- It never typed a number onto a surface. Every figure the product, the README or the deck displays binds to
  `bundle/fixtures.json`, the bundle or the seeded database, and a CI check fails the build when a stated figure and
  the data disagree.
- It never edited a golden case to make a result look better. Where a case was found to be wrong, that is recorded
  as a finding about the case, and six such findings stand.

## 2. Which models

| Where | Model | Role |
| --- | --- | --- |
| Building this entry | Claude Code, on Claude Fable 5.1 (Anthropic), and on Claude Opus 5 after the Fable allowance was exhausted mid-run | Wrote the code, the tests, the documentation and the deliverable sources under the owner's direction |
| Inside the product, every model role: AG-1 Extractor, AG-2 Composer, AG-3 Drafter, AG-4 Verifier and Redliner | **Z.ai GLM-5.3-Flash** | Reached through exactly one module, `src/gateway/`, which is the only code path in the repository that calls a provider (ADR-001) |
| Inside the product, embeddings | **Xenova/multilingual-e5-small**, open weights, run locally, hash-pinned and fetched during the build | Retrieval fill only (ADR-009) |

There is no second provider and no fallback model. One provider and one model id is an architectural invariant, not
a configuration choice: a silent switch to another model would make every stored trace inaccurate. An audit script
(`scripts/audits/provider-egress.sh`) asserts that no other outbound provider call exists anywhere in the source.

Every generated artefact (an answer trace, a draft, an evaluation run) records the model id, the prompt version (the
SHA-256 of the prompt file), the gateway configuration hash and the corpus version it was produced against. That is
what makes `/trace/:id` a replay rather than a description.

## 3. What a human decided

The following were decided by the owner and are not model output. They are recorded as decisions with dates in
`docs/adr/` and in the run's deviation log.

- The product concept, the scope discipline (Case 1 only), and the five mechanical guarantees.
- The provider and the model id for every runtime role, including the decision to run one model for all four roles
  and to replace "a different model for the verifier" with prompt separation, question-blindness and the six
  deterministic gate checks (ADR-001).
- The coverage recipe and its threshold, frozen and published before the numbers were read, together with the
  decision that the gap is never stated as a bare percentage.
- The decision that the live deployment sits entirely behind login, with no signed reviewer link, because the corpus
  is the organiser's property (ADR-013).
- The decision to withhold the faculty supervisor's name and to carry a labelled line instead, and to record that as
  a compliance risk rather than to conceal it.
- The decision to ship the measured evaluation result rather than a target, and to publish the failure diagnosis.
- Acceptance of the Report and of the submission itself.

Every change to the code reached `main` through a run of deterministic checks: unit tests, lint, type check,
`gitleaks`, the product-name and banned-strings scans, the fixed-wordings audit, the no-corpus-text check and the
README numbers check. Fresh-context review fleets, read-only and separate from the threads that wrote the code,
reviewed each artefact, and their findings were recorded. Branch protection requiring a human review is applied at
the release checkpoint.

## 4. What is machine-drafted inside the product, and how it is labelled

The product does not present model output as human work anywhere. Where a machine produced or transcribed something,
the artefact carries a provenance label in its own stored data, and every render of it shows that label. This is
ADR-007, applied under deviation D-12.

| What | Stored label | What the surface shows |
| --- | --- | --- |
| The P&ID sidecars: hotspots, as-drawn text, drawn setpoints | `provenance.basis = "agent_transcription"`, `review_status = "pending"`, `reviewed_by` and `reviewed_at` null | A provenance line on every P&ID index and every hotspot stating that the sheet was transcribed from the image by an agent, pending human review, and was not extracted from text |
| The hand-verified readings adopted from the prior harness | The same pair of labels | The same provenance line wherever a reading is shown |
| Failure-family membership | `basis = "agent_classification"`, `review_status = "pending"` | The family's basis is stated with its explicit membership |
| The coverage labels used to validate the lexical proxy | `coverage_labels.status = "machine_drafted_pending_human"`, also `method.labels_status` in the fixture | The Coverage Console states that the labels are machine-drafted and that human adjudication is outstanding; the published numbers remain the lexical proxy, not the labels |
| A lesson published through the guided loop | `machine_drafted = true` with an `approver_alias` | The fixed badge wording `machine-drafted` beside the approving human's alias, on the lesson and on any citation that resolves to it |
| An engineer's note filling a draft slot | The fixed line in `src/lib/fixed-strings.ts` | Rendered under every published SME note, stating that the value is unverified |
| The debt-ranking coefficients | `basis = "ASSUMPTION"`, frozen in the contract | The literal label `ASSUMPTION` beside the coefficients wherever they appear |
| The optional GA-1201A tag series | Its own provenance, generated by the team | The badge `SIMULATED` on every render; it is never an answer to a question about a real reading |
| The EDMS, AIMS and historian connectors | Not connected | The fixed label `specified, not connected` on every connector panel |
| Every protective-function answer and setpoint ladder | The contract's own fixed sentence | The as-built caveat, closing the answer |

These wordings are fixed strings with exactly one home, `src/lib/fixed-strings.ts`, and a CI audit fails the build if
any of them is retyped elsewhere. A label cannot drift by being rewritten in a component.

The reverse also holds: a document the corpus supplies is never labelled as machine work. The one extractor is
`pdftotext -raw`, build 26.02.0, pinned in CI (ADR-005), and extracted text is text, not model output.

## 5. Commits and attribution

By the owner's policy, commits in these repositories carry no AI-tooling trailer and no session trailer. They are
authored as Ghaisan Khoirul Badruzaman with an English message. This is a deliberate publication choice, not an
attempt to obscure how the work was done: this file and the README are the disclosure, and they are linked from the
front page of the repository a judge opens first.

## 6. The corpus

The organiser's corpus is the organiser's property. It is used for this entry only. It is never committed to a
public repository, no extracted text is tracked, no run of it longer than a citation appears in any public file, the
deployment carries `noindex` with a `robots` disallow, pages are served one at a time to an authenticated role, and
there is no bulk route (ADR-010, and invariant 7 of the blueprint). The private mirror `thehub-corpus` is read by CI
through a read-only deploy key and by nothing else.

## 7. What the product does not do

The Hub reads controlled documents and maintenance records and answers questions about them, with a citation on
every claim. It does not attempt to foresee equipment failures, does not raise or rank operational alerts, does not
assign or chase work, and aggregates nothing by person. **It is not a control system and has no write path toward
one**, and it must never be placed anywhere its output could actuate, inhibit, bypass or override a protective
function.
