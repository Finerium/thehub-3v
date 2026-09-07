# Changelog

Every entry below is a checkpoint that actually landed on `main`, dated by its commit. The run is a single
build toward one submission, so the versions are the run's own milestones (M0, M1, ...) rather than a
release train; the corpus the application serves is versioned separately, as a corpus version derived from
a harness bundle, and each entry names the bundle it seeded.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Nothing is listed here that is
not in the history: `git log --oneline` is the authority, and a claim that cannot be traced to a commit does
not belong in this file.

## [Unreleased]

The deliverable track: the offline export, the deck, the video, the pre-submit script and the repository
front matter. What is present and what is not is stated in the README's honest limits.

### Added

- `README.md`, the repository front page: the live URL, the three Key Questions and their answers, the
  architecture figure, the five mechanical guarantees with the file that enforces each, the numbers table
  generated from `bundle/fixtures.json`, the repository map, the measured evaluation result, and the
  honest limits.
- `scripts/readme-numbers.ts` with `pnpm readme:numbers`: the README's table is generated from
  `bundle/fixtures.json` and `evaluation/last-run.json`, and the eight figures its prose uses and the two
  data labels of `docs/architecture.svg` are checked against the same files. `scripts/audits/readme-numbers.sh`
  runs it in Tier A through `pnpm audit`, so a fixture that moves and a README that does not is a red build.
- The front matter of the other two repositories: `thehub-harness/README.md`, which states what the harness
  is for, how to run it, and why it restates no number of its own; and `thehub-corpus/README.md`, which
  states the organiser's ownership and that the mirror is private and stays private.
- `tools/presubmit.sh`: the thirteen submission checks of the PRD's 26.4, exiting non-zero on any failure
  and naming the human-gated remainders on a frozen bundle.
- `tools/banned-strings.sh`: the AC-DEL-06 list (legacy product names, Case 2 vocabulary presented as a
  feature, a saving attached to the exposure figure) over any set of paths. Both scans now read one
  prepared text, so `tools/quoted-strings.txt` is the one home of every exemption rather than of the
  English scan's alone: a Case 2 term the deck DECLARES OUT OF SCOPE is listed there by hand, because a
  grep cannot tell a claim from a denial, and an entry that spans a PDF's line wrap is listed at the
  shortest span that survives on one line. The first run against the built deck found both cases.
- `docs/runbook.md`: seed, activation, credential rotation, recovery, the nightly job, and what to do when
  the provider is unreachable or the day's budget is spent.
- `docs/DISCLOSURE-AI.md` rewritten for the Committee: what was built with model assistance, which models,
  what a human decided, and which labels mark machine-drafted content inside the product.
- `LICENSE`: all rights reserved, source published for verification.
- `docs/architecture.svg`: the three lanes and the three repositories as one figure.
- `evaluation/last-run.json`: the tallies of the last complete golden run, as the runner reported them.

## [M1] Surfaces and the loop, corpus version v1 live - 2026-09-07

Corpus version v1 seeded from bundle 1.0.1, then reconciled to bundle 1.0.2 so every workbook row carries a
span and can be cited.

### Added

- The answer lane: scope resolution, lexical-first retrieval with a vector fill, a deterministic rerank,
  typed facts and blocks per moment template, composition, the question-blind verifier, the six gate checks
  C1 to C6, the confidence band, the outcome (answer, partial, abstention, refusal) and the persisted trace.
- The self-healing lane: the coverage recipe and the debt ranking ported from the harness under the ADR-002
  equality gate (422 assessments, 70 summary cells), the draft state machine as the one writer of a draft's
  state, G3 publishing in one transaction under an advisory lock with the recount, the drafting lane
  (AG-3, the verbatim and numeric checks, the AG-4 redline, the lease watchdog, the visitor sandbox,
  re-proposal).
- The surfaces: Home, Ask, Trace, the document viewer with span anchors, Assets and the asset page, Failure
  Memory, the Coverage Console, the Integrity Register with its CSV export, Drafts, the guided loop route,
  the tour as the post-login landing, Admin and Evaluation.
- The golden runner in two tiers with a check module per contract type, an honest fourth state for a check
  the ask lane cannot answer, the evaluation ingest and read routes, and the Tier A and Tier B workflows.
- The bundle pull from the harness release with its SHA256SUMS and manifest checks, and the TypeScript G1
  over the bundle beside the Python one.

### Changed

- The drafting envelope sheds the approved lessons' section bodies above a byte budget (63 to 39 kB,
  22,400 to 15,500 input tokens); the AG-3 role moves to 16,384 output tokens and 75 s so a live draft
  finishes inside the route ceiling.
- The evidence set is built once and fed to the composer, the verifier and C1, so the three cannot
  disagree about what was retrieved.
- Retrieval reserves one slot per document class, so an asset's lessons cannot crowd out its cause-and-
  effect sheet or its datasheet.

### Fixed

- A citation chip resolves its span on a client navigation, not only on a full load; the anchor travels in
  the query as well as the fragment.
- The numeral check reads the composed sentences and requires every typed fact to carry the citation its
  value came from, instead of scanning the packet's transcribed rows as if the answer had invented them.
- A NULL reason no longer satisfies the deadline arm of the draft transition constraint.

## [M0] Skeleton live behind login - 2026-09-05

### Added

- The database client, the migrations and the equipment-master seed; the in-house session layer, the
  `authorize(role)` matrix, the route gate and `GET /api/health` with `SELECT 1`, the active corpus version
  and the deployed commit.
- The one provider gateway (`glm-5.3-flash`, JSON mode, per-role budgets, `gateway_call` rows, recordings)
  with the local ONNX embedding pin beside it.
- The design tokens of blueprint section 7, the application shell scoped to the `(hub)` route group, the
  role badge, the designed 404 and the error boundary.
- The application role `thehub_app` and `DATABASE_URL_APP` (D-20), so the application can never delete an
  audit row.
- Migrations and the pinned model fetch run inside the Vercel build, so a deployment never precedes its
  own schema.

## [Foundation] - 2026-09-03

### Added

- The Next.js 16 scaffold with `noindex` headers and a `robots` disallow, the pinned lockfile, and the
  Vercel project pinned to the `sin1` region.
- Zod derived from the frozen JSON Schema contracts, the Drizzle schema, ADR-001 to ADR-013 and the
  implementation architecture document.

### Removed

- The marketplace integration's auto-installed agent skill (trace policy, ADR-008): no build-tooling trace
  is committed to a public repository.
