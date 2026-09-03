# The Hub, implementation architecture

Scope: how The Hub is built inside the locked bounds of `blueprint-thehub.md` (sections 1, 7, 8, 9, 11, 12) and the deviation log `.crown/notes.md` (D-01 to D-13). The blueprint arbitrates every fact; this document only says where each thing lives, which module owns it and how the pieces meet. A name, type or enum here that differs from blueprint section 9 is a defect of this document. Invariants are cited as INV-n (section 1), ADRs as ADR-nnn (section 8.2), criteria as AC-xxx (section 11), deviations as D-nn.

Reading order for a builder on track Tn: section 1 (layout), section 2 (seam), section 3 (schema), then the section of the lane the track builds, then section 12 (what the track owes and who verifies it).

## 1. Repositories and file layout

Three repositories under the `finerium` GitHub identity (D-10, ADR-010, blueprint 8.3). Commits by `Ghaisan Khoirul Badruzaman <ghaisan.khoirul.b@gmail.com>` (D-03), no trailer (D-04), no `.claude/` or process file tracked (ADR-008, INV-10).

| repo | visibility | what | build and test |
| --- | --- | --- | --- |
| `thehub-3v` | public | the application, the gateway, the TypeScript ports, ADRs, README, deliverables, the Report | `pnpm install --frozen-lockfile`, `pnpm gate:quick`, `pnpm test:e2e`, `pnpm export:demo`, `pnpm build` |
| `thehub-harness` | public | the Python reference implementation, the package sources, the contracts (one home), the bundle release | `uv sync --frozen`, `make fixtures`, `make test`, `make bundle` |
| `thehub-corpus` | private | the organiser's corpus, unmodified, plus `INVENTORY.sha256` | none; read by CI through a read-only deploy key |

### 1.1 `thehub-3v` (Next.js 16.3.4 App Router, TypeScript strict, pnpm 10.33)

```
src/app/
  layout.tsx, globals.css, not-found.tsx (designed 404), error.tsx (designed 5xx, no stack trace)
  login/page.tsx                                   surface 14 (public)
  (hub)/layout.tsx                                 requireSession(); everything below is behind login (D-07)
  (hub)/page.tsx                                   1 Home /
  (hub)/ask/page.tsx                               2 Ask
  (hub)/trace/[id]/page.tsx                        3 Trace
  (hub)/documents/[id]/page.tsx                    4 Document viewer (#page=n&span=<span_id>)
  (hub)/assets/page.tsx, assets/[tag]/page.tsx     5 Assets
  (hub)/failures/page.tsx, failures/[tag]/page.tsx 6 Failure Memory
  (hub)/coverage/page.tsx, coverage/clusters/[id]/page.tsx   7 Coverage Console
  (hub)/drafts/page.tsx, drafts/[id]/page.tsx      8 Drafts
  (hub)/integrity/page.tsx                         9 Integrity Register
  (hub)/evaluation/page.tsx                        10 Evaluation
  (hub)/demo/loop/page.tsx                         11 Guided loop (per-session sandbox)
  (hub)/tour/page.tsx                              12 Tour, the post-login landing (D-07: /tour/:token not built)
  (hub)/admin/page.tsx                             13 Admin (Admin role only)
  api/health/route.ts                              14 public; SELECT 1, active corpus version, commit
  api/ask/route.ts                                 ndjson two-stage stream (9.8); maxDuration 120
  api/trace/[id]/route.ts
  api/search/route.ts
  api/documents/[id]/route.ts, api/documents/[id]/pages/[n]/route.ts
  api/assets/route.ts, api/assets/[tag]/route.ts, api/assets/[tag]/failures/route.ts
  api/coverage/route.ts, api/coverage/clusters/[id]/route.ts
  api/drafts/route.ts (POST 202 + waitUntil, maxDuration 300), api/drafts/[id]/route.ts,
  api/drafts/[id]/decision/route.ts, api/drafts/[id]/repropose/route.ts, api/drafts/[id]/publish/route.ts
  api/sme-notes/route.ts
  api/integrity/route.ts (JSON or text/csv by Accept)
  api/evaluation/latest/route.ts, api/evaluation/runs/route.ts (CI_INGEST_TOKEN)
  api/connectors/route.ts, api/connectors/[name]/schema/route.ts (repository file byte for byte)
  api/admin/corpus/versions/route.ts, api/admin/corpus/activate/route.ts (Admin session or ADMIN_JOB_TOKEN)
  api/auth/login/route.ts, api/auth/logout/route.ts, api/auth/session/route.ts
  api/auth/tour/[token]/route.ts                   NOT BUILT (D-07); the contract entry is kept with x-status
src/proxy.ts            Next.js 16 convention (verified: middleware.ts is deprecated and renamed proxy.ts, Node runtime);
                        cookie-presence redirect of page routes to /login; never the authority (authorize() is)
src/components/         the design-system inventory of blueprint 6.4, one hand (T5); tokens in src/components/tokens.css
src/contracts/          Zod, GENERATED from ../thehub-harness/contracts by scripts/contracts/generate.ts; never hand-edited
src/db/                 schema.ts (Drizzle), migrations/ (SQL), seed/ (bundle loader), client.ts (pooled URL)
src/auth/               session.ts, authorize.ts, matrix.ts (9.9 as data), password.ts (bcryptjs)
src/gateway/            index.ts (the only provider egress), config.ts (GatewayRole per role), record.ts, embedding.ts
src/rulepack/           matcher.ts (pure function of pack and text), load.ts; data comes from bundle/rulepack/v1.json
src/coverage/           tokenise.ts, stoplist.ts, window.ts, layers.ts, summary.ts, debt.ts (TS port, ADR-002)
src/gates/              g1.ts, g2/{c1..c6}.ts + g2/index.ts, g3.ts (100 percent line coverage, AC-EVAL-08)
src/answer/             scope.ts, retrieve.ts, rerank.ts, templates.ts, permit.ts, confidence.ts, compose.ts, verify.ts,
                        screen.ts (outbound rule pack), stream.ts, seeded.ts, trace.ts
src/loop/               draft.ts (AG-3), verbatim.ts, redline.ts, state.ts (machine), lease.ts, sandbox.ts, activation.ts
src/lib/                canonical.ts, hash.ts, ids.ts, log.ts (pino), ratelimit.ts, paginate.ts, errors.ts, fixed-strings.ts
prompts/<role>/v<N>.md  AG-1, AG-2, AG-3, AG-4/verify, AG-4/redline (9.16); prompt_version = sha256 of the file
bundle/                 the pulled harness release (section 2); chunks.jsonl, text/, pages/ untracked (.gitignore)
recordings/<case_id>/<role>.json   Tier B replay recordings (9.16), dehydrated (section 9.4)
scripts/                contracts/generate.ts, bundle/pull.ts, db/{migrate,seed,reset}.ts, seeded-version-id.ts,
                        golden/run.ts, export/build.ts, smoke.ts, audits/*.sh (deterministic checks, run in CI)
deck/                   src/deck.html (fx directives), figures/*.svg, build.ts, out/
video/                  beats.ts (Playwright), captions.srt, narration.md, narration/*.wav (optional), encode.sh, out/
deliverables/           TheHub_prototype.html, TheHub_deck.pdf, TheHub_demo.mp4, SHA256SUMS.txt (committed at freeze)
tools/                  presubmit.sh, no-corpus-text.sh, audit-authors.sh, mock-sweep.sh, banned-strings.sh
docs/                   ARCHITECTURE.md (this), adr/ADR-001..012.md, runbook.md (seed, activation, rotation, recovery), api.md (generated)
tests/e2e/              Playwright (test-author only); unit tests live beside code as *.test.ts (Vitest)
.github/workflows/      tier-a.yml, tier-b.yml, keepalive.yml, nightly.yml, seed.yml
.env.example, vercel.json, DISCLOSURE-AI.md (D-04), LICENSE, CHANGELOG.md, README.md, Report.md (end of run)
```

Package scripts: `gate:quick` = eslint + `tsc --noEmit` + vitest; `test:e2e`; `contracts:check` (regenerate, expect no diff, validate every bundle file against both JSON Schema and Zod); `bundle:pull`; `db:migrate` (unpooled URL), `db:seed`, `db:reset` (CI and recovery only); `export:demo`; `deck:build`; `video:capture`, `video:encode`; `golden:a`, `golden:b`, `golden:b:replay`; `smoke`.

### 1.2 `thehub-harness` (Python 3.12 via uv, pytest, mypy, ruff)

```
harness/       analyze_corpus.py (fixtures), pdftext.py (the one extractor call, `pdftotext -raw`), canonical.py, workbook.py,
               opl.py, integrity.py, coverage.py, debt.py, dates.py, rulepack.py (reference matcher), master.py,
               chunks.py (structural chunking), pages.py (pymupdf renders, metadata-free), embed.py (ONNX lane),
               ag1.py (extractor role, build time, reviewed output committed), g1.py, bundle.py (writer + manifest)
packages/      tracked package sources (fixtures.json, chains.json, families.json, pid_sidecars/, spot pins, labels, aliases)
golden/cases.yaml, rulepack/v1.json, contracts/*.schema.json (JSON Schema 2020-12, the ONE home of every schema)
tests/         pytest; legacy/ (v1.0 audit scripts, not collected)
tools/         copy_audit.py, banned_strings.py, no_corpus_in_repo.py, computed.py, fx.py
Makefile       fixtures | packages | test | check | chunks | pages | embed | bundle | release | clean-cache
bundle/        generated, untracked; the release tarball excludes chunks.jsonl, text/ and pages/
```

The prior harness under `supplied/prior-harness/` was adopted per ADR-006 and D-10 (fresh repository, artefacts that pass G1, history not rewritten). Adopted state verified on disk: `golden/cases.yaml` holds 102 cases with the 9.11 category counts and 16 hard gates; `packages/fixtures.json` records `inventory.extractor` = `pdftotext -raw (pdftotext version 26.02.0)`; `rulepack/v1.json` exists with fixture groups positive 30, negative 21, outbound 6, moments 4. Gaps against section 9 are listed in section 13.

### 1.3 `thehub-corpus` (private)

`CALIBER-2026_The-Case/` (98 files plus the case book), `INVENTORY.sha256`, `README.md`. Read by CI with `actions/checkout` and the `CORPUS_DEPLOY_KEY` secret (read-only ed25519 deploy key, never a personal token, ADR-010). Nothing else is ever added.

### 1.4 Contracts flow (INV-1, AC-FND-03)

`thehub-harness/contracts/*.schema.json` is the single source. Python validates package artefacts with `jsonschema`; `thehub-3v/scripts/contracts/generate.ts` runs `json-schema-to-zod` (devDependency, generation time only) into `src/contracts/`, committed; `pnpm contracts:check` regenerates and fails on a diff, then validates every bundle file with both validators. Drizzle `src/db/schema.ts` pins the same enums by importing the Zod enums. One schema file per 9.x type: manifest, inventory, fixtures (10.5 keys), documents, revisions, edges, spans, claims, chunk, interlocks, datasheet_params, datasheet_spot, revision_spot, pid_sidecar, hand_verified, work_orders, failure_events, families, chains, coverage_method, coverage_assessment, coverage_summary, coverage_labels, debt_cluster, proof_tests, integrity_finding, area_aliases, bom, opls, rulepack, golden_case, evidence_packet, answer_trace, draft (9.6 types), corpus_version, evaluation, audit_event, gateway (9.13), edms, aims, historian (9.14, served byte for byte by `/api/connectors/:name/schema`).

## 2. The seam: bundle, G1, seed, corpus versions

The harness produces; the application consumes only through the bundle of blueprint 9.1 (INV-5, ADR-002, ADR-010).

| step | where | command | output |
| --- | --- | --- | --- |
| extract, parse, score | build machine or CI with the corpus | `make fixtures && make packages` | `packages/*` (tracked), `.cache/` text |
| chunk, render, embed | where the corpus exists | `make chunks pages embed` | `bundle/chunks.jsonl` (with 384-dim vectors), `bundle/pages/<doc>/<n>.webp`, both untracked anywhere public |
| bundle | same | `make bundle` | `bundle/` per 9.1 with `manifest.json` (every file's sha256, `extractor`, `recipe_sha256`, `stop_list_sha256`, `rulepack_version`, `embedding_model: null`) |
| release | build machine | `make release` (`gh release create v<semver>`) | `thehub-bundle-<semver>.tar.gz` = the bundle minus `chunks.jsonl`, `text/`, `pages/`; the manifest still lists them (path, sha256, bytes) so G1 can verify the locally produced copies |
| pull | `thehub-3v` | `pnpm bundle:pull <semver>` | `bundle/` tracked public parts; the manifest is the pin (`bundle/manifest.json`) |
| G1 (TS) | `src/gates/g1.ts` | `pnpm db:seed --bundle bundle/` | admits or names the violation |
| seed | where `chunks.jsonl` and `pages/` exist (build machine for production Neon; CI service container for AC-ING-15) | same | deterministic rows; corpus version v1 |

G1 in TypeScript checks exactly the 9.1 list: every listed file's SHA-256, every file against its Zod schema, fixture counts (98 files, 56 lessons, 211 work orders, register total 174), referential closure (every `span_id`, `document_id`, `document_revision_id`, `wo_number`, `opl_id`, `bom_item_id` resolves inside the bundle), closed-set membership (every enum and every `entity_binding` in its candidate set), and every quoted span's hash recomputed as `sha256(canonical(anchor_text))` from the bundle's own text (`claims.json` anchors and `chunks.jsonl` text); the Python `harness/g1.py` recomputes the same hashes from the extracted page text. Four mutation tests (AC-ING-09) are the gate's specification.

Corpus versioning (9.7, ADR-010, AC-ING-10): the seed inserts `corpus_version` v1 with `id = "cv-" + bundle_version + "-" + manifest_sha256.slice(0, 12)` (deterministic so CI, the nightly job and the smoke script can name it from `bundle/manifest.json` through `scripts/seeded-version-id.ts`), `manifest_sha256`, `corpus_sha256`, `extractor`, `embedding_model`, `embedding_dim = 384`, `model_pins` for AG-1 to AG-4 and embedding (D-05: every GLM role `glm-5.3-flash`), `is_active = true`. Every later version is a child (`parent_version_id`) created only by G3 (section 8.6). Activation (`POST /api/admin/corpus/activate`) flips `is_active` to the named version and applies the lineage rule of section 3.4; nothing is ever deleted.

The seed also loads `seeded/packets.json`, `seeded/traces.json` into `answer_trace` (mode `seeded`) and the chip map into `seeded_chip` (9.17), `seeded/drafts.json` into the `draft` schema with `session_scope = null` (replay sources for the guided route, section 8.5), `rulepack/v1.json` into memory at build (the matcher reads the file, never the database), `integrity_findings.json` into `integrity_finding`, and `simulated/ga-1201a.json` (POLISH, optional) into `simulated_series`.

## 3. The database schema

PostgreSQL on Neon with `pgvector`; Drizzle ORM; SQL migrations under `src/db/migrations/` applied with the unpooled URL (9.15); the application connects with the pooled URL. Two schemas: `public` for everything the retrieval path may read, `draft` for blueprint 9.6 (INV-1 "drafts physically separate", AC-LOOP-07). Table names are the 9.x type names in snake_case; column names are the 9.x field names verbatim; nested arrays and objects that no query filters on are `jsonb` validated by the Zod type at the boundary. Every displayed number binds to one of these tables, `bundle/fixtures.json` or the bundle (INV-6, blueprint 10.3).

### 3.1 `public` tables

| table | primary key | notes |
| --- | --- | --- |
| `corpus_version` | `id` | partial unique index `corpus_version_one_active ON (is_active) WHERE is_active`; `parent_version_id` FK self; `model_pins` jsonb NOT NULL; `embedding_model`, `embedding_dim` NOT NULL |
| `document` | `id` | `class` enum DocumentClass; `sha256` unique |
| `document_revision` | `id` | FK document, corpus_version; partial unique index `one_current_revision ON (document_id) WHERE is_current`; `approval_status` enum ApprovalStatus |
| `document_edge` | (`from_document_id`, `to_document_id`, `edge_kind`, `source_span_id`) | `edge_kind` enum |
| `span` | `id` | FK document_revision; `quote_hash` char(64); `anchor_text` is citation length (the 200-character rule is a CI check on tracked files, not a column limit) |
| `claim` | `id` | FK span; `extracted_by` jsonb |
| `chunk` | `id` | FK document_revision; `embedding vector(384)` (dimension = `corpus_version.embedding_dim`, asserted by a test, AC-ING-13); storage-only generated column `text_tsv tsvector` (config `simple`) with a GIN index; HNSW index on `embedding` (cosine); `unit_kind` enum; unique (`document_revision_id`, `page`, `ordinal`) |
| `page_derivative` | (`document_id`, `page`, `width`) | `format` (`webp`), `source_sha256`, `bytes bytea`, metadata-free (ADR-010, ADR-011) |
| `equipment` | `tag` | `criticality_datasheet` enum; `pid_document_id` FK document |
| `area` | `code` | |
| `interlock` | (`equipment_tag`, `ce_doc_no`) | `seq_id` nullable, unique where not null; `notes` jsonb; `permissive_gate` |
| `interlock_row` | `id` | FK equipment, span; `effects` jsonb; `voting` null on non-trip rows |
| `start_permissive` | (`seq_id`, `n`) | FK span |
| `datasheet_param` | `id` | FK equipment, span |
| `instrument_tag` | `tag` | FK equipment; `sources` text[] |
| `pid_sidecar` | `set` | FK document; `hotspots`, `defects`, `provenance` jsonb (D-12: adopted sidecars carry `basis: "agent_transcription"`, `review_status: "pending"`) |
| `work_order` | `wo_number` | FK equipment; `completeness_flags` jsonb; enums per 9.4 |
| `failure_event` | `wo_number` | FK work_order |
| `failure_family` | `id` | `members` jsonb; `basis`, `review_status` enums |
| `causal_link` | `id` | FK work_order twice, span; package artefact, never computed at answer time (9.4 rule) |
| `proof_test` | `wo_number` | FK work_order |
| `bom_item` | `id` | FK equipment, span |
| `bom_match` | (`wo_number`, `part_string`) | FK bom_item nullable twice |
| `coverage_method` | `corpus_version_id` | one row per version; `threshold` CHECK = 0.62; `strict_sections`, `unscoreable_ids` jsonb |
| `coverage_assessment` | (`wo_number`, `layer`, `corpus_version_id`) | `matched_lesson` FK opl nullable |
| `coverage_summary` | (`corpus_version_id`, `population`, `layer`) | `bands`, `sensitivity` jsonb |
| `debt_cluster` | `id` | FK equipment, corpus_version; `uncovered_wo_numbers` text[]; `factors`, `coefficients` jsonb; unique (`corpus_version_id`, `equipment_tag`) |
| `opl` | `opl_id` | FK document_revision (unique); `sections`, `permit_lines`, `footer` jsonb |
| `opl_step` | (`opl_id`, `n`) | `source_hash` char(64); FK span |
| `troubleshooting_row` | (`opl_id`, `n`) | |
| `integrity_finding` | `id` | `rule_id`, `severity`, `discipline`, `document_id` FK, `span_id` FK nullable, `state` (`open` or `resolved`, section 13 decision), `safety_function` boolean, `routing_recommendation` nullable, `corpus_version_id`; totals pinned to `fixtures.json` (AC-INT-01) |
| `app_user` | `id` | `username` unique; `password_hash` bcrypt; `is_demo`; exactly three demo rows plus Admin (AC-NFR-20) |
| `session` | `id` | FK app_user; `expires_at` = created + 8 h; `reviewer_link_id` always null (D-07) |
| `reviewer_link` | `id` | kept as frozen 9.7; never written (D-07); schema carries `x-status: not built in this run (D-07)` |
| `session_sandbox` | `session_id` | FK session, `corpus_version_id` FK; the visitor's sandbox version (section 8.5) |
| `seeded_chip` | `id` | `equipment_tag` FK, `question`, `golden_case_id` nullable, `trace_id` FK answer_trace; 24 rows (9.17) |
| `answer_trace` | `id` | immutable (no UPDATE path in code; AC-ANS-11); `packet` jsonb; `corpus_version_id` FK; `mode` inside packet |
| `evaluation_run` | `id` | `ingested_by` = `ci` |
| `evaluation_result` | (`run_id`, `case_id`) | FK evaluation_run |
| `audit_log` | (`id`, `action`, `server_ts`) | partitioned, append-only (section 3.3); `payload` jsonb per the 9.7 payload rules |
| `gateway_call` | `id` | 9.13 GatewayCall plus `created_at`; the budget counter reads it (section 9.3) |
| `rate_limit_counter` | (`scope`, `key`, `window_start`) | `count` int; fixed 60 s windows (ADR-011) |
| `simulated_series` | (`equipment_tag`, `tag`) | POLISH only; provenance `SIMULATED`, `generated_by: team` |

`corpus_version_id` is NOT NULL wherever 9.x carries it; `model_id`, `prompt_version`, `gateway_config_sha256` are NOT NULL on `gateway_call`, `answer_trace.model_ids` and every draft row (AC-NFR-09). Foreign keys everywhere (AC-NFR-13). All `server_ts` and `*_at` columns are `timestamptz`; money is `bigint` rupiah; hours are `numeric(6,1)`.

### 3.2 `draft` schema (blueprint 9.6)

`draft.draft_document` (`id` PK; `state` enum DraftState; `lease_expires_at`; `corpus_version_id` FK public.corpus_version; `opl_id_reserved` unique; `previous_draft_id` FK self; `session_scope` FK public.session nullable), `draft.draft_field` (`id` PK; FK draft; `provenance`, `numeric_provenance` jsonb; CHECK `(is_slot AND text = 'REQUIRES ENGINEER INPUT') OR (NOT is_slot AND provenance IS NOT NULL)`), `draft.redline_verdict` ((`draft_id`, `round`) PK; `round` CHECK in (1, 2)), `draft.draft_transition` (`id` PK; FK draft; CHECK over the allowed pairs, below), `draft.sme_note` (`id` PK; FK draft, field; `provenance` CHECK = `'human, dated, unreviewed'`; `citeable` default false).

Transition guard, one SQL CHECK constraint on `draft.draft_transition (from_state, to_state)` over exactly the 9.6 pairs: (proposed,drafted) (drafted,redlined) (redlined,in_review) (redlined,drafted) (redlined,blocked) (in_review,in_review) (in_review,accepted) (in_review,rejected) (accepted,published) (accepted,rejected) (blocked,proposed) (rejected,proposed) and (x,blocked) for every non-terminal x with `reason = 'deadline_exceeded'`; the actor legality (system, Reviewing Supervisor, Manager) is enforced by `src/loop/state.ts` and `authorize()`; `draft_document.state` is written only by `state.ts` inside the same transaction as its `draft_transition` row (no trigger; the CHECK is what AC-LOOP-08's direct-write test hits).

Isolation: no module under `src/answer/` or `src/db/queries/retrieval*` imports a `draft.*` table; `scripts/audits/draft-isolation.sh` greps the compiled query layer for the `draft.` schema prefix outside `src/loop/` and `src/app/api/drafts` and fails on a hit (AC-LOOP-07 static leg); the runtime leg is golden case "answerable only by a draft, expects abstention".

### 3.3 `audit_log`, append-only at the grant level (9.7, AC-NFR-07)

Declarative partitioning by LIST on `action`: partition `audit_log_safety` for `safety.request_refused` and `safety.request_served` (retained for the deployment's life), partition `audit_log_general` (DEFAULT) sub-partitioned by RANGE on `server_ts` per month. Migration statements, verbatim in `src/db/migrations/00nn_audit_grants.sql`:

```sql
REVOKE UPDATE, DELETE ON public.audit_log, public.audit_log_safety, public.audit_log_general FROM CURRENT_USER;
```

The application and the migration runner share the one Neon role the integration provisions, so the revoke targets that role (a dedicated application role is the upgrade path; AC-NFR-07's test attempts an UPDATE and a DELETE and expects the database to refuse, which this satisfies). New monthly sub-partitions are created by the migration for the deployment window and by the nightly job one month ahead, each followed by the same REVOKE. The 30-day retention of general events runs as partition DROP (a DDL right the revoke does not touch) in the nightly job for monthly partitions whose upper bound is older than 30 days; a general row therefore lives 30 to 61 days; safety partitions are never dropped. Reading the safety partition writes `audit.safety_events_read` (9.7).

### 3.4 Sessions, rate limits, leases and versions in Postgres (AC-NFR-18)

No in-memory state is load-bearing: sessions in `session`, limits in `rate_limit_counter` (upsert `ON CONFLICT DO UPDATE SET count = count + 1 RETURNING count`; keys `ask:<user_id>` 30 per minute, `draft:<user_id>` 5 per minute, `addr:<ip>` 120 per minute; a hit above the limit renders the designed 429 naming the limit and `window_start + 60 s`), draft leases in `draft.draft_document.lease_expires_at`, the sandbox in `session_sandbox`, warm caches only as optimisation. Lineage rule applied by activation: for the activated version V, `document_revision.is_current` is true for the latest revision per document whose `corpus_version_id` is V or an ancestor of V, false for every revision outside that lineage; rows are never deleted (AC-ING-10 `activate_v1_after_publish`).

## 4. The extractor pin and the canonical form (INV-5, ADR-005, D-11)

One extractor everywhere: poppler `pdftotext -raw`, exact build 26.02.0. The recorded string is the fixture's `inventory.extractor` = `pdftotext -raw (pdftotext version 26.02.0)`, built by `harness/pdftext.py` from `pdftotext -v` and written into `manifest.extractor` and `corpus_version.extractor`. Build machine: poppler 26.02.0 (verified in the opening note). CI: `mamba-org/setup-micromamba` with `poppler=26.02.0` from conda-forge (verified available for linux-64 and osx-arm64), no container image. `tests/test_fixtures.py::test_inventory` asserts the exact string in both environments (AC-ING-03); a CI step prints `pdftotext -v` and greps `26.02.0` before any coverage figure is trusted. `-layout` is forbidden outside `legacy/` (Makefile `check`).

Canonical form, frozen in 9.2, implemented twice and tested for equality: `harness/canonical.py` and `src/lib/canonical.ts` apply NFKC, join soft hyphens (U+00AD) so a line-broken word is one token, collapse whitespace runs to one space, trim, keep case and punctuation; `sha256(utf8(canonical(s)))` is the span identity. A shared fixture `contracts/fixtures/canonical_cases.json` (inputs and expected hashes, no corpus text) is asserted by both test suites; the TypeScript G1 recomputes every bundle hash with it.

## 5. Authentication under D-07 (INV-3, ADR-003, AC-NFR-08)

ADR-003's second branch: an in-house session layer, because D-07 removed the reviewer-link exchange and Better Auth would add a dependency for a behaviour four small files express. Better Auth and Auth.js are not installed.

| element | implementation |
| --- | --- |
| accounts | `app_user` rows seeded by `pnpm db:seed` from environment: `DEMO_ENGINEER_PASSWORD`, `DEMO_SUPERVISOR_PASSWORD`, `DEMO_MANAGER_PASSWORD` (roles Engineer, Reviewing Supervisor, Manager; `is_demo = true`) and `ADMIN_PASSWORD` (Admin, `is_demo = false`, never distributed); usernames `engineer`, `supervisor`, `manager`, `admin`; aliases are role aliases, never personal names |
| hashing | `bcryptjs`, cost 12, in `src/auth/password.ts`; the seed re-hashes only when the environment value changes (compare with the stored hash) |
| login | `POST /api/auth/login { username, password }` (Zod) -> `session` row (`id` = 32 random bytes base64url, `expires_at` = now + 8 h) -> cookie `thehub_session = <id>.<hmac_sha256(id, AUTH_SECRET)>`, `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=28800`; rotating `AUTH_SECRET` invalidates every cookie; failures are uniform (no username enumeration) and rate-limited under `addr:<ip>` |
| logout | `POST /api/auth/logout` deletes the row and clears the cookie; `GET /api/auth/session` returns `{ alias, role, expires_at }` or 401 |
| authorize | one helper `authorize(request, permission)` in `src/auth/authorize.ts`; `permission` is one of the seven matrix columns of 9.9 (`ask_read`, `view_drafts`, `create_draft`, `decide`, `publish`, `activate_version`, `add_sme_note`); the role -> column matrix lives as data in `src/auth/matrix.ts` with the Manager's `decide` restricted to reject-from-accepted inside `state.ts`; a missing session throws 401, a role without the column throws 403 and writes `auth.role_violation` (9.7) before the designed state renders; every route handler and every server component calls it (the proxy is never the authority, per the Next.js proxy documentation's own warning) |
| principals | CI: `Authorization: Bearer <CI_INGEST_TOKEN>` on `POST /api/evaluation/runs` only; job: `Bearer <ADMIN_JOB_TOKEN>` on `POST /api/admin/corpus/activate` only, audited as actor `job:nightly-activation`; both compared with `crypto.timingSafeEqual` |
| public | `GET /api/health` and `/login` (page and `POST /api/auth/login`) only; `robots.txt`; everything else redirects (pages, via `src/proxy.ts` cookie check with matcher excluding `/api`, `/_next`, `/login`, `/robots.txt`, `favicon.ico`) or returns 401 (API) |
| not built | self-registration, password reset, `GET /api/auth/tour/:token`, `ReviewerLink` writes, `REVIEWER_LINK_SECRET` use (listed in `.env.example` as 9.15 states, marked `not built in this run (D-07)`); the route audit of AC-NFR-08 asserts their absence |
| landing | after login the user lands on `/tour` (D-07), which ends on `/demo/loop`; the Reviewer mode banner is not rendered anywhere (no reviewer sessions exist) |

## 6. The embedding route (ADR-009 second branch, INV-5)

Verified fact: `embedding-3` is not served on `api.z.ai`, so no hosted embedding API is used. Pin: `Xenova/multilingual-e5-small`, file `onnx/model_quantized.onnx` (118,308,185 bytes per the Hugging Face tree listing; the fp32 file is 470,268,533 bytes and exceeds Vercel's 250 MB uncompressed function limit), plus `tokenizer.json` and `tokenizer_config.json` from the same repository, 384 dimensions, mean pooling over the attention mask, L2 normalisation, prefixes `query: ` for questions and `passage: ` for chunks (the model's own convention). The SHA-256 of each file is computed once by `harness/embed.py --pin` at adoption, written to `packages/embedding_pin.json` (tracked), to `corpus_version.embedding_model` as `Xenova/multilingual-e5-small/onnx/model_quantized.onnx sha256:<hex>` with `embedding_dim = 384`, and into ADR-009 and ADR-001; a hash mismatch at load fails closed in both lanes.

| lane | runtime | role |
| --- | --- | --- |
| Python (build) | `onnxruntime` + `tokenizers`, `harness/embed.py` | chunk vectors into `chunks.jsonl` once per corpus version |
| Node (runtime) | `@huggingface/transformers` pinned exact version with `env.allowRemoteModels = false`, `env.localModelPath = models/`, `dtype: "q8"` (which loads `model_quantized.onnx`), `pooling: "mean"`, `normalize: true`, in `src/gateway/embedding.ts` | query vectors on `POST /api/ask` and `GET /api/search`; chunk vectors for a lesson published by G3 |

Equality test (ADR-002 spirit, one script per lane over `contracts/fixtures/embedding_cases.json`, twelve English and Indonesian strings, no corpus text): vectors from the two lanes agree with max absolute difference at most 1e-4 per dimension after normalisation; the `onnxruntime` release is pinned to the same version in `uv.lock` and `pnpm-lock.yaml`. Lexical retrieval is authoritative for tags (section 7.3); the vector side is a ranking aid, so a divergence beyond tolerance is a build failure, never a silent re-rank.

Function size and cold start, measured before acceptance (ADR-009 consequence, AC-NFR-04's instrument, recorded by the main thread under `.crown/evidence/`): the ask route's traced bundle must stay under 250 MB (model 118 MB plus `onnxruntime-node`'s linux-x64 binary; `outputFileTracingExcludes` drops the other platforms' binaries and `outputFileTracingIncludes` adds `models/**` to the ask, search and publish routes only, so no other function carries the model); the session is created lazily at module scope and reused across invocations under fluid compute; `GET /api/health` responds first and then calls `waitUntil(embedder.warm())` so the 10-minute keep-alive keeps one warm instance (the route still holds no data and no session). Fallback ladder if the instrument fails the 2 s evidence target or the size limit: (1) `VERCEL_SUPPORT_LARGE_FUNCTIONS=1` (documented up to 5 GB on fluid compute); (2) live queries ranked lexically only with the vector side disabled for live questions, recorded as a deviation; never a hosted embedding API (ADR-009).

## 7. The answer lane (INV-1, INV-2, INV-4, blueprint 8.4, 9.8, 9.9, 9.10, 9.16)

`POST /api/ask` (Node route handler, `maxDuration = 120`, `Content-Type: application/x-ndjson`), body `{ question, template?, mode? }` validated by Zod; `x-request-id` = the trace id on every response. Steps, in this order, each stamped into the `answer_trace` row:

1. `authorize(ask_read)`; rate limit `ask:<user_id>` and `addr:<ip>`; budget check (section 9.3) for a live question, rendering the designed budget-exhausted state (AC-ANS-20) without touching the seeded path.
2. Seeded path (`src/answer/seeded.ts`): `canonical(question)` equal to a `seeded_chip.question` -> both lines streamed from the stored trace with `mode: "seeded"`, zero provider calls, a new trace row that references the stored packet (AC-UI-05, AC-NFR-15).
3. Rule pack inbound (`src/rulepack/matcher.ts`, pure function of `bundle/rulepack/v1.json` and the text, rules R1 to R5 in pack order, EN and ID lexicons, `window_tokens`, the four suppression vocabularies from the file): `defeat` or `permanent_change` -> a single line `{ stage: "packet", outcome: "refusal" }` with the Refusal of 9.8 filled from `interlock`, `start_permissive` and the pack's `routing_text` (MoC text only on `permanent_change`), audit `safety.request_refused` with the request text pseudonymised, rule and phrase; `rulepack.decided_at` precedes every gateway timestamp (AC-ANS-08). `documented_bypass` marks the packet for verbatim service of the named lesson (`Procedure` with `permit_block` above `steps`, every step rendered from `opl_step` under `source_hash`, a hash mismatch blocks the render with `render.integrity_blocked`), audit `safety.request_served`. `none` continues.
4. Language detection (`language_detected`) from the pack's lexicons; the moment template from the request or the pack's `moment_keywords`.
5. Scope (`scope.ts`, deterministic): equipment tags, instrument tags and `area_aliases` matched in the question, expanded through `document_edge` and `instrument_tag.sources` to the asset's documents; a family link is added only when the question names one and is labelled in `scope.basis` (AC-ANS-01).
6. Retrieval (`retrieve.ts`, SQL): candidates are chunks of current revisions with `approval_status` in the served set of the version lineage visible to the session (section 8.5), filtered to the scope's revisions; lexical stage `text_tsv @@ plainto_tsquery('simple', ...)` plus an exact tag match ranks first (authoritative for tags); vector stage `embedding <=> query` orders the lexical candidates and fills to k = 12; `rerank.ts` orders by (lexical hit, cosine, `document_revision_id`, `page`, `ordinal`) so identical inputs give an identical set (AC-NFR-06); `include_superseded` is only honoured from the labelled history toggle and is traced.
7. Line 1 flushed: `{ stage: "evidence", trace_id, corpus_version, scope, rulepack, evidence: Citation[] }`, within 2 s of the request (AC-NFR-04), before any provider call.
8. Typed facts and blocks (`templates.ts`, `permit.ts`, deterministic from `interlock_row`, `start_permissive`, `datasheet_param`, `proof_test`, `bom_match`, `causal_link`, `opl`): block order per template, exactly the AC-ANS-16 orders; the permit block renders only `opl.permit_lines` of the cited lesson; a block with no evidence is omitted.
9. AG-2 compose (section 9): envelope `{ question, template, scope, evidence, typed_facts, repair: null }`; output `{ claims, gaps, suggested_outcome }`.
10. AG-4 verify (question-blind): `{ pairs: [{ sentence_id, sentence, spans }] }`, one batched call; a parse failure is `not_entailed`.
11. G2 (`src/gates/g2`): C1 citation resolution, C2 quote fidelity (hash recomputed in the canonical form), C3 numeric fidelity (every numeral typed with unit in a cited source row, else the sentence goes), C4 approval filter, C5 rule-pack clearance of the outbound text with approved-lesson spans whitelisted first (`screen.ts`, AC-ANS-17), C6 entailment from the verdicts; the gate decides, the verifier never does.
12. Repair once (AC-ANS-19): if C6 or C3 dropped a sentence, AG-2 is called again with `repair: { verdicts }` and may only drop or reword the named sentences; then AG-4 and G2 run again; no third attempt; `repair_rounds` 0 or 1.
13. Outcome: `answer`, `partial` (gaps declared), or `abstention` (reason, escalation role from the fixed set, three nearest same-asset documents, cluster action where a `debt_cluster` covers the asset, `served_beside` typed facts such as the ladder beside a live-reading abstention); the fixed as-built caveat closes every protective-function answer; `confidence.ts` computes the band from `{ question_coverage, source_count, approval_share }` with fixed thresholds (section 13).
14. Persist `answer_trace` (immutable), `gateway_call` rows, `audit_log` (`answer.issued` or `answer.abstained`, never the question text or a span), then line 2 `{ stage: "packet", packet }`, then close.

`mode: "search"` and `GET /api/search` are retrieval-only (steps 1, 3, 5, 6) and make no provider call. Timeouts, retries and budgets are gateway configuration (section 9). Every designed state of 6.3 that the lane can produce (429 budget, 429 rate, provider unreachable, hash mismatch, 403) is a typed error in `src/lib/errors.ts` rendered by `DesignedState`.

## 8. The self-healing lane (INV-1, INV-3, ADR-002, ADR-004, blueprint 8.4, 9.5, 9.6)

### 8.1 Coverage and debt port with the equality gate (ADR-002, AC-LOOP-01)

`src/coverage/` ports the frozen recipe of 9.5 field by field: `tokenise.ts` (lower-cased alphanumerics, tag-like tokens kept whole, single characters dropped, the 65-word stop list from `bundle/coverage/stop_list.txt` hashed as `stop_list_sha256`), `window.ts` (windows of twice the field's content-word count advancing one token, largest share of distinct content words in one window), `layers.ts` (generous over whole lesson text, strict over header fields and sections 1, 2, 3, 4, 6 cut at the watermark), `summary.ts` (populations, bands, sensitivity ladder), `debt.ts` (0.4 D/Dmax + 0.3 C/Cmax + 0.2 k + 0.1 r, k by criticality, r by family share, `incomplete_uncovered` beside the score). The equality gate is a Vitest test that runs the port over the seeded corpus inputs and compares `coverage_scores`, both summaries at every t of the ladder and `debt.per_asset` byte for byte (canonical JSON) with `bundle/coverage_scores.json`, `bundle/fixtures.json` and `bundle/debt.json`; a divergence fails the build. The rule-pack equality test (AC-ANS-10) does the same over `rulepack.fixtures` from both entry points.

### 8.2 Drafting through `waitUntil` (ADR-004, AC-LOOP-15)

`POST /api/drafts { cluster_id }` under `authorize(create_draft)` and `draft:<user_id>` limit: insert `draft.draft_document` in state `proposed` with `lease_expires_at = now + 240 s`, `opl_id_reserved` = the asset's next lesson id, `session_scope` per section 8.5; return 202 `{ draft_id, state: "proposed" }` within 2 s; then `waitUntil(runDraft(draft_id))` in the same invocation (`maxDuration = 300`, Vercel Hobby's verified default and maximum). `runDraft` is idempotent per draft id (it re-reads the state and returns if the draft is past `proposed`): AG-3 with the cluster's evidence and the six-section house template -> `drafted`; the verbatim check (`verbatim.ts`: no work-order narrative field reproduced verbatim in sections 1, 2, 3, 4 or 6 of the composed strict text; a hit blocks with field and section named, AC-LOOP-04); the numeric check (every numeral carries a `numeric_provenance` entry or its element is a slot); AG-4 redline round 1 -> `redlined`; `pass` -> `in_review`; `block` -> `drafted` and one retry (round 2) -> `in_review` or `blocked`. The client polls `GET /api/drafts/:id`; a poll that finds a non-terminal state past `lease_expires_at` moves it to `blocked` with reason `deadline_exceeded` (a transition row and an audit event), never a stranded draft; a blocked draft is re-proposable (`POST /api/drafts/:id/repropose`, 201 new linked draft, 409 on a published one).

### 8.3 Redline independence (D-05, AC-LOOP-06)

AG-4 runs on `glm-5.3-flash` like every role (D-05), so independence is prompt-and-question-blindness: `prompts/AG-4/redline/v<N>.md` and `prompts/AG-4/verify/v<N>.md` differ from every authoring prompt (a configuration test asserts distinct file hashes); the redline envelope `{ draft, evidence_refs, template_rules }` has no edit field in its Zod output schema; the draft body is byte-identical before and after the redline (a test hashes it); the verifier envelope never contains the question (a recorded-call test greps the request).

### 8.4 State machine, matrix, SME note

`src/loop/state.ts` is the one writer of `draft_document.state`: `transition(draft_id, to_state, actor, reason, edit_diff)` inside a transaction re-reads the row `FOR UPDATE`, checks the 9.6 pair and the actor role, writes `draft_transition` and the matching `AuditAction` (`draft.created`, `draft.redlined`, `draft.accepted`, `draft.rejected`, `draft.reproposed`, `draft.published`). `POST /api/drafts/:id/decision` (`decide`): Reviewing Supervisor `accept`, `edit` (in_review -> in_review with `edits[]` applied to `draft_field.text` and the diff recorded), `reject`; Manager `reject` only from `accepted`; an Admin attempt is 403 and audited. `POST /api/sme-notes` (`add_sme_note`, every role but Admin): the note fills exactly one slot field (`is_slot` true) with `provenance = "human, dated, unreviewed"`, author alias and role, `citeable = false`; the drafter never writes a slot; after publication the note renders with the fixed unverified-value line of 9.6 (`fixed-strings.ts`, string-matched in CI, AC-UI-03).

### 8.5 Per-session sandbox (blueprint section 2, AC-LOOP-13, NFR-17)

Every draft created through the product by a demo account carries `session_scope = session.id`; the queue and detail routes show `session_scope IS NULL OR session_scope = current session`. Seeded drafts from `bundle/seeded/drafts.json` carry `session_scope = null` and are replay sources: a `POST /api/drafts` for a cluster that has a seeded draft on the seeded corpus version clones it into the session (fields, verdict, transitions replayed proposed -> drafted -> redlined -> in_review) with zero provider calls, which is the guided route's "request a lesson" (NFR-17: the guided loop route renders stored output; AC-NFR-15); a cluster without a seeded draft runs AG-3 live under the cap. Publication by a demo session creates a child `corpus_version` that is never activated and maps it in `session_sandbox`; `visibleVersionIds(session)` = the active version's lineage plus the session's sandbox version, used by retrieval, the Console, the version badge and the recount, so one visitor's publication never reaches another's numbers. Admin cannot publish and the three demo accounts are the only publishers, so every publication in this deployment is sandboxed; `activation.ts` (nightly) re-asserts the seeded version and applies the lineage rule of section 3.4, deleting nothing.

### 8.6 G3, one transaction under an advisory lock (INV-3, AC-LOOP-09, AC-LOOP-12)

`POST /api/drafts/:id/publish` under `authorize(publish)`, `src/gates/g3.ts`, one Drizzle transaction:

1. `SELECT pg_advisory_xact_lock(hashtext('thehub.g3'))` (one publisher at a time across instances).
2. Re-read the draft `FOR UPDATE`; state `published` -> 409; state not `accepted` -> 422 `{ gate: "G3", reason }`; any open slot without an SME note -> 422 `outstanding_slot`.
3. Create `document` (class `opl`, `doc_no = opl_id_reserved`) and `document_revision` (revision `0`, `approval_status = "approved"`, `approved_by_alias` = the Manager's alias, `is_current = true`, `corpus_version_id` = the new version's id), the `opl` row (`machine_drafted = true`, `approver_alias`), `opl_step` rows with `source_hash`, `span` rows, `chunk` rows embedded through the Node lane (section 6), `document_edge` rows from the draft's provenance refs.
4. Create the child `corpus_version` (`parent_version_id` = the session's visible version, `label` = next `v<n>`, `is_active = false`, pins copied), `coverage_method` copied, `coverage_assessment`, `coverage_summary` and `debt_cluster` recomputed by the port of section 8.1 for the new version (both layers, same `recipe_sha256` and `stop_list_sha256` as the baseline).
5. Flip `sme_note.citeable = true`; `transition(accepted -> published, Manager)`; `audit_log` `draft.published` with the version id; `session_sandbox` upsert.
6. Commit; respond 200 `{ document_revision_id, corpus_version, coverage_recount }`.

`publish_parallel_10` yields one revision, one version and nine 409s because every loser waits on the lock and then reads `published`; a retried request reads `published` and gets 409; a non-privileged attempt gets 403 and `publication.rejected`. Test-first: the transaction is written against its tests (AC-LOOP-09) before any surface calls it.

## 9. The gateway (INV-4, ADR-001, D-05, blueprint 9.13, 9.16)

### 9.1 One module

`src/gateway/index.ts` exports `invoke(role, envelope, schema)` and `embed(texts)`; nothing else imports `fetch` toward a provider (`scripts/audits/provider-egress.sh` fails on any `api.z.ai`, `openai`, `anthropic`, `deepseek` string or on `fetch(` in a file outside `src/gateway/`, AC-NFR-10). Provider: `https://api.z.ai/api/paas/v4` (OpenAI-compatible chat completions), `response_format: { type: "json_object" }` with the JSON instruction inside the prompt, `reasoning_effort` set explicitly per role (the platform cannot disable reasoning), temperature 0. The response is parsed and validated against the role's Zod output schema; a parse or schema failure is `outcome: "parse_failed"` and the caller's rule applies (AG-4: `not_entailed`; AG-3: retry once then block; AG-2: one retry then abstention).

### 9.2 Role configuration (`src/gateway/config.ts`, 9.13 `GatewayRole`)

| role | model_id | effort | response_format | max_tokens | timeout_ms | prompt |
| --- | --- | --- | --- | --- | --- | --- |
| AG-1 Extractor (build) | glm-5.3-flash | high | json_object | 8192 | 120000 | prompts/AG-1/v1.md |
| AG-2 Composer | glm-5.3-flash | low | json_object | 2048 | 20000 | prompts/AG-2/v1.md |
| AG-3 Drafter | glm-5.3-flash | high | json_object | 8192 | 120000 | prompts/AG-3/v1.md |
| AG-4 Verifier | glm-5.3-flash | low | json_object | 2048 | 20000 | prompts/AG-4/verify/v1.md |
| AG-4 Redliner | glm-5.3-flash | low | json_object | 2048 | 60000 | prompts/AG-4/redline/v1.md |
| embedding | Xenova/multilingual-e5-small (local_onnx) | n/a | n/a | n/a | 5000 | null |

The effort levels are ADR-001's per-role settings kept under D-05's single model id; a change is configuration plus the confirmation run (AC-EVAL-05). `gateway_config_sha256` = sha256 of the canonical JSON of the whole role table and is written on every `gateway_call`, trace and draft together with `model_id`, `prompt_version` (sha256 of the prompt file) and `corpus_version_id`. Every envelope is a typed JSON object whose fields are declared data; no field is concatenated into an instruction string (AC-ANS-18).

### 9.3 Timeouts, retries, budgets (AC-NFR-19, NFR-17)

`AbortSignal.timeout(timeout_ms)` on every call; transport failures (timeout, 5xx, 429 from the provider) retry with backoff 500 ms then 2000 ms, at most two retries, each attempt its own `gateway_call` row (`timeout`, `provider_error`) with one `ok` row per logical call, so AC-ANS-19's "at most two composer calls" counts logical `invoke` calls. Budgets are configuration constants per role: `tokens_per_day` and `spend_cap_idr_per_day` (with `price_idr_per_1k_tokens` per role from the provider's published price list, recorded in ADR-001 when set); the check sums `gateway_call.input_tokens + output_tokens` per role for the current UTC day before a live call and returns `outcome: "budget_exhausted"` -> the designed 429 budget state that keeps seeded chips and every read-only surface working; the Admin surface displays the constants as read from configuration.

### 9.4 Recording for Tier B replay, never storing corpus text

`src/gateway/record.ts` writes `recordings/<case_id>/<role>.json` = `{ request_sha256, request, response, model_id, prompt_version, recorded_at }` where `request` is dehydrated: every evidence or span text field is replaced by `{ span_id, quote_hash }` (and a chunk by `{ chunk_id, quote_hash }`), and `request_sha256` is computed over the hydrated canonical JSON that was actually sent. Replay (`golden:b:replay`) rebuilds the request from the seeded database (spans and chunks by id, hashes re-checked), recomputes `request_sha256`, and serves the recorded `response` on a match; a miss fails the case with the recorded and recomputed hashes named, which is how a prompt or pin change forces a reviewed re-recording (9.16). The no-corpus-text check runs over `recordings/` like every tracked path; a model response longer than the citation limit that quotes a span verbatim is truncated at record time to the citation length with the span id kept, so the recording stays under the 200-character rule.

## 10. Deploy topology (ADR-008, ADR-010, ADR-011, ADR-012, D-06, AC-NFR-05, AC-NFR-16)

| piece | configuration |
| --- | --- |
| Vercel Hobby, fluid compute | project wired to `finerium/thehub-3v`: production from `main`, previews from pull requests; `vercel.json` `{ "regions": ["sin1"] }`; `maxDuration` set explicitly per route (`api/ask` 120, `api/drafts` 300, everything else default); verified limits: 300 s default and maximum, 2 GB memory, 4.5 MB body, 250 MB uncompressed function; `next.config.ts` sends `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet` and the NFR-11 baseline headers on every response; `public/robots.txt` is `User-agent: *` / `Disallow: /` |
| Neon Free, `sin1`, pgvector | provisioned by the Orchestrator through `vercel install neon` (ADR-012); pooled `DATABASE_URL` for the application and the harness, `DATABASE_URL_UNPOOLED` for migrations only; scale-to-zero stays on (D-06), so the keep-alive is the cold-start mitigation; the seed for production runs from the build machine with dotenv (secret-blind) |
| secrets | `.env.example` lists every 9.15 name with a placeholder; values move only through `thehub/tools/secret-pipe.sh` into `vercel env add` and `gh secret set`; gitleaks on every push and on history (AC-FND-06, AC-NFR-20) |
| GitHub Actions `tier-a.yml` | on pull requests and pushes to `main`: `pnpm install --frozen-lockfile`, `gate:quick`, `contracts:check`, `scripts/audits/*` (provider egress, draft isolation, mock-pattern sweep, banned strings, fixed wordings, fonts, no-corpus-text, product-name grep, copy audit), gitleaks, `uv sync --frozen` + micromamba `poppler=26.02.0` + `make test` + the extractor-string assertion, the corpus checkout by deploy key, `make chunks pages` into a `pgvector/pgvector:pg17` service container, `db:migrate && db:seed` (timed twice for AC-ING-15), the coverage and rule-pack equality tests, `golden:a` against `next start` on the runner with results posted to the runner's own app under `CI_INGEST_TOKEN`, and `golden:b:replay` from `recordings/` |
| `tier-b.yml` | nightly and on `workflow_dispatch`, plus on pull requests whose paths touch `src/rulepack/**`, `src/gates/**`, `prompts/**` or `bundle/rulepack/**`: the Tier A job plus `golden:b` live with `ZAI_API_KEY`; results ingested into production with `CI_INGEST_TOKEN` (`POST /api/evaluation/runs`, actor `ci`) |
| `keepalive.yml` | cron `*/10 * * * *` until 2026-11-07 (the step exits when the date is past), `curl` of `/api/health` and `/` on the production URL (D-06 primary mitigation; the health route warms the embedder, section 6) |
| `nightly.yml` | cron at 17:00 UTC (00:00 Asia/Jakarta): `POST /api/admin/corpus/activate { version_id }` with `ADMIN_JOB_TOKEN`, the id from `scripts/seeded-version-id.ts` over `bundle/manifest.json`; then the audit partition step of section 3.3 and `rate_limit_counter` cleanup through the same job route |
| `seed.yml` | `workflow_dispatch` only: the reproducible seed (corpus by deploy key, `make bundle`, G1, `db:seed`) against a named database URL secret; used for recovery, never on a schedule |
| branch protection on `main` | required checks: Tier A, lint, typecheck, gitleaks, product-name and banned-strings grep, copy audit, no-corpus-text (AC-FND-07); merges through pull requests by the main thread; human review requirement replaced during the run by the verification fleets whose schema results are recorded in the pull request (ADR-008) |
| logs and health | pino JSON, one line per request, gate decision and provider call, with `trace_id`, `route`, `role alias`, `gate outcome`, never a span or the question text outside the two safety events (AC-NFR-11, AC-NFR-14); `/api/health` returns `{ ok, corpus_version, commit }` from `SELECT 1`, the active version and `VERCEL_GIT_COMMIT_SHA`; a structured error event on every 5xx with the request id; no paid error tracker (AC-NFR-24) |
| not used | Vercel Queues, Workflow, KV, Blob, any AI gateway service, any second provider, any object store (AC-NFR-16); no write path toward any control system exists anywhere (INV-8) |

## 11. The deliverable pipelines (blueprint 9.12, AC-DEL-01 to 09)

| pipeline | source | mechanism | assertions |
| --- | --- | --- | --- |
| export `TheHub_prototype.html` | `scripts/export/build.ts` | logs in with the build-time demo Engineer session against a local `next start`, pulls the JSON snapshot `{ corpus_version, packets, drafts, traces, register, evaluation_run, assets, coverage, fixtures_subset }` through the API, renders the read-only surfaces with `react-dom/server` `renderToStaticMarkup` over the same components, inlines CSS and a small vanilla script for chips, drawers and tabs, embeds only the page derivatives the shown citations need at render size, subsets the three font families (fallback to a metric-matched system stack if the file exceeds 2,000,000 bytes, recorded); first screen = the reviewer landing with the live URL (no signed link, D-07) and the tour | `wc -c` at most 2,000,000; opens from `file://` in headless Chromium with all network blocked and every read-only surface reachable; no external request |
| deck `TheHub_deck.pdf` | `deck/src/deck.html`, `deck/figures/*.svg`, `deck/build.ts` | every fixture-bearing number is a `data-fx="<10.5 key>"` element substituted from `bundle/fixtures.json` and `supplied/team-facts.json` (the `TBD_` placeholders render visibly); every non-fixture number carries `nonfx` in the source; native SVG figures only; printed to PDF by Playwright Chromium with the fonts subset; slide order and headings verbatim from the booklet; slide 7 carries `Faculty supervisor: as registered with the CALIBER 2026 Committee` (D-08) and the mandated team table | presubmit checks 3 to 9; at most 2,000,000 bytes; 7 pages before the first APPENDIX footer; no slide body over 120 words; the value model of the PRD's Chapter 23 recomputed by a test from the fixture |
| video `TheHub_demo.mp4` | `video/beats.ts`, `video/captions.srt`, `video/narration.md`, `video/encode.sh` | Playwright records the six beats on the deployed instance with the seeded version active (1280x720) after the nightly activation; a test encode of the roughest 20 s confirms the rate; ffmpeg concatenates, burns captions, encodes x264 two-pass `-tune stillimage -b:v 190k -maxrate 260k -bufsize 520k` at 15 fps, AAC-LC mono 32 kbps from `video/narration/b<n>.wav` when present or `anullsrc` silence (D-09), embeds a `mov_text` caption stream; the on-screen caption states every model output is replayed from storage | `ffprobe` duration at most 180 s (planned 175); at most 5,000,000 bytes; caption stream present |
| presubmit `tools/presubmit.sh` | the 13 checks of the PRD's 26.4 | 1 the three files present; 2 byte sum at most 10,000,000 by `wc -c`; 3 at most 7 pages before APPENDIX; 4 the six headings whole-word in order by position; 5 KQ1, KQ2, KQ3 present; 6 redefined under D-08: a labelled supervisor line present on the Team Profile page and the six table headings in order on that page; 7 no `TBD_` placeholder marker in any deliverable; 8 banned strings clean across deck text, narration script, captions and export; 9 English only outside marked quotations; 10 video at most 180 s with the caption track present; 11 the export opens from `file://` offline with every read-only surface rendering (headless); 12 the live URL check (see section 13, open point 1); 13 `deliverables/SHA256SUMS.txt` written with the commit and time, read back and compared | exits non-zero on any failure; on the frozen bundle reports only the human-gated remainders by name (the `TBD_` facts and the narration) |
| `SHA256SUMS.txt` | presubmit check 13 | `shasum -a 256` over the three files with `# commit:` and `# recorded:` header lines; a repository record, never uploaded | read back and compared (AC-DEL-05) |
| pointer PDF (optional, POLISH) | `deck/pointer.html` | same print path | at most 150,000 bytes, one page |

Byte budget: deck 2,000,000; video 5,000,000; export 2,000,000; pointer 150,000; buffer 850,000 never spent; ceiling 10,000,000. Banned strings (AC-DEL-06): SIMPUL, PUSAKA, WARISAN, SIAGA, SAKSI, Case 2 vocabulary as a feature, any "saving" beside the exposure figure, Indonesian stop words outside a marked quotation; `tools/banned-strings.sh` is the one list, shared with the harness's `tools/banned_strings.txt`.

## 12. The fleet plan along section 12

Worker kinds (D-13): `builder` writes source, docs, deck, video and prompt files; `test-author` writes tests, golden cases, recordings, CI workflows and test configuration; `verifier` is read-only and returns `{artifact, pass, findings[{severity: blocker|minor, what}]}`. Workers push branches and open pull requests; the main thread merges and authors every evidence file. Fleet law: staging at 2 or 3 agents before scale, write-as-you-go, schema or it did not happen, rounds until zero on the reds only, deterministic checks as scripts. Test-first (tests land before the code they gate): G1, G2 C1 to C6, G3 and the state machine, the rule-pack port, the coverage port, the canonical form.

| track | depends on | builders (kind: produces) | test-authors | verification fleet (12.1) | gate |
| --- | --- | --- | --- | --- | --- |
| T0 Foundation | none | main thread: control plane, repositories, secrets, Vercel and Neon, contracts, ADRs, this document | test-author: `contracts:check`, the M0 smoke script | Contracts review (one agent per schema file against section 9); Architecture review (one fresh-context reviewer of this document against every ADR and invariant) | foundation gate -> `checkpoint(foundation)`; M0 |
| T1 Harness and packages | corpus, extractor pin | builder A: `harness/` adoption and the bundle writer, `make chunks pages embed bundle release`; builder B (one hand): `rulepack/v1.json` reshaped to 9.10; builder C: `golden/cases.yaml` tiers and the 9.11 fields, AG-1 claims reviewed and committed | test-author: `tests/` (fixture reproduction, spans, G1 mutations, rule-pack fixture counts, canonical cases) | Reproduction fleet (one agent per Appendix A group of 10.4); Extraction review; Sidecar review (one agent per set, D-12 labels) | `make test` green, bundle released, fixture keys of 10.5 present |
| T2 Data layer | T0 contracts; bundle format | builder: `src/db/schema.ts`, migrations (section 3), `db:seed` with G1, page derivatives, corpus versioning and activation, `session_sandbox` | test-author: G1 mutation tests, `activate_v1_after_publish`, constraint-violation tests (AC-NFR-13), audit revoke test, `db:reset` timing | Contracts review on the Drizzle schema | seed of corpus version v1 on production; M1 smoke rows |
| T3 Answer engine core | T2 schema, rule pack file | builder A: `src/gateway/` (section 9); builder B (one hand): `src/rulepack/` port and its suppressions; builder C: `src/answer/` (scope, retrieval, templates, permit, confidence, stream, seeded), `src/gates/g2`, prompts AG-2 and AG-4/verify | test-author: gate tests first (C1 to C6, 100 percent lines), rule-pack equality, recorded-call tests (no question in AG-4), gateway call counter, fault injection (AC-NFR-19) | Rule-pack red team (both languages; blocker: a defeat served or a documented procedure refused) | AC-ANS-08 and AC-EVAL-04 hard gates at 16 of 16; M1 `POST /api/ask` live on UC-1 |
| T4 Loop backend | T2, T3 gateway | builder A: `src/coverage/` port (section 8.1); builder B (one hand): `src/gates/g3.ts` and `src/loop/state.ts`; builder C: `src/loop/` drafting, verbatim, redline, lease, sandbox, activation, prompts AG-3 and AG-4/redline | test-author: equality gate, G3 tests (`publish_parallel_10`, retry, 403, 422), state-machine and CHECK tests, verbatim and slot tests, lease expiry, sandbox isolation | Security review before TAG (authn, authz, envelopes) | AC-LOOP-01, 08, 09, 12, 13 green |
| T5 Surfaces | contracts 9.8 and 9.9, T2 seed; T3 packets as they land | builder A (one hand): the design system of 6.4 and tokens of 7.1; builders B to E: the fourteen surfaces in the registers of 7.2, the designed states of 6.3, the export builder | test-author: Playwright smoke (AC-UI-01), state tour (22 states), chip-to-span, axe and keyboard walk, fixed-wording and stylesheet audits | Banned-pattern audit (one agent per screen plus the silhouette test); State tour; Chip-to-span; Real-data adversarial (one agent per display surface); Accessibility | AC-VIS-01 14 of 14; AC-UI-02; AC-DEL-01 |
| T6 Verification-following | rides alongside | none (scripts only) | test-author: `scripts/golden/run.ts` in two tiers, recordings, replay, latency instruments with baseline validation, mutation tests, the security gate configuration | Acceptance grading per milestone (fresh-context graders over the evidence manifest) | AC-EVAL-02, 07, 08 |
| T7 Deliverables | frozen M2 deployment, fixture, team facts | builder A (one hand): deck copy voice and `deck/`; builder B: `video/`; builder C: README with the inter-repo SVG, `docs/runbook.md`, DISCLOSURE-AI.md, CHANGELOG | test-author: presubmit fixtures (inject a placeholder, expect red) | Deck compliance; Critique fleet (five to seven lenses) on the tour, the loop route and the deck; README and hygiene review per repository | AC-DEL-02 to 08; `checkpoint(release)` |

Milestone gates, verified against the production URL by `scripts/smoke.ts` (logs in with the demo Engineer through dotenv on the build machine or the CI secret; never prints a value):

- M0 (AC-M0-01 to 06): `/api/health` 200 with `SELECT 1`, the active version and the commit; `/` after login renders the corpus status card from the seeded equipment master; `/robots.txt` is `Disallow: /`; `X-Robots-Tag` on every response; a designed 404; `keepalive.yml` present and running; Tier A green on a pull request.
- M1 (AC-M1-01 to 08): G1 admitted the bundle; v1 carries the manifest hash; the fixture headline keys assert; the Set 1 sidecar validates; `/assets/GA-1201A`, `/failures/GA-1201A`, `/integrity` (174), `/coverage` (14 of 57 generous, 41 of 57 strict) render from the seeded database; `POST /api/ask` answers UC-1 live with the trace persisted and the chip landing on its span.
- M2: every SHIP and TAG criterion green with evidence, the loop on the seeded path and the sandbox, the export, the deck, the video and presubmit green, the Report committed.

## 13. Open points and recorded deviations that bind this document

Deviations applied here: D-01 (Fable 5.1 everywhere; the model policy of blueprint 13 is superseded), D-02 (control plane at the ChandraAsri-Competition root), D-03 (author identity string), D-04 (no trailers; DISCLOSURE-AI.md), D-05 (glm-5.3-flash for AG-1 to AG-4; section 9.2), D-06 (Hobby and Free plans; keep-alive as the primary mitigation; section 10), D-07 (fully behind login; section 5; the export carries the live URL only), D-08 (supervisor line and presubmit check 6; section 11), D-09 (silent audio with burned captions), D-10 (three repositories, contracts inside the harness; section 1), D-11 (pdftotext 26.02.0 through micromamba; section 4), D-12 (adopted sidecars and hand-verified readings as `agent_transcription`, `pending`; section 3.1), D-13 (worker kinds; section 12).

Decisions taken where the blueprint is silent (each the smallest faithful option; the main thread records any it adopts as policy):

1. Presubmit check 12 under D-07: the PRD's "no redirect to a login page" and "every signed reviewer link resolves" cannot both hold behind login; proposed redefinition: `GET /api/health` and `GET /login` return 200 from a clean network, the reviewer-link leg dropped. Needs a D-nn line from the main thread before T7 writes the check.
2. Session sandbox: `session_sandbox` table and the never-activated child version (section 8.5) implement AC-LOOP-13 without touching a frozen type; the lineage rule of section 3.4 defines `is_current` after activation.
3. `integrity_finding.state` values `open` and `resolved` (the blueprint names two lifecycle states without naming them).
4. Confidence band thresholds: `high` when `question_coverage >= 0.8`, `source_count >= 2` and `approval_share >= 0.8`; `low` when `question_coverage < 0.5` or `approval_share < 0.5`; otherwise `medium`; inputs traced (AC-ANS-07).
5. Retrieval k = 12 chunks; the rerank key of section 7 step 6; `mode: "search"` on `POST /api/ask` streams line 1 and a line 2 packet with outcome `partial`, no claims and the gap `Search mode: evidence listed, no answer composed`.
6. `maxDuration` 120 on `api/ask`, 300 on `api/drafts`; draft lease 240 s; retry backoff 500 ms and 2000 ms; timeouts per role in section 9.2.
7. Audit retention by monthly partition drop (30 to 61 days for general events) so UPDATE and DELETE stay revoked (section 3.3).
8. Prompt files for AG-4's two tasks under `prompts/AG-4/verify/` and `prompts/AG-4/redline/`, keeping the role name of 9.13.
9. Embedding pin file `onnx/model_quantized.onnx` (118 MB) rather than fp32 (470 MB) or fp16 (235 MB) because of the 250 MB function limit; equality tolerance 1e-4; `@huggingface/transformers` as the Node runtime with remote models disabled.
10. Deterministic corpus version id `cv-<bundle_version>-<manifest_sha256[0:12]>` so the nightly job and CI can name v1 from the manifest.
11. Cookie `thehub_session` signed with `AUTH_SECRET` (HMAC) so rotation logs everyone out; bcryptjs cost 12.
12. Recordings are dehydrated to span and chunk ids plus quote hashes (section 9.4); seeded drafts replay into the session on `POST /api/drafts` for clusters that have one.

Open points for the main thread and the tracks:

- The adopted `rulepack/v1.json` top-level keys (`intent_classes`, `matching_rules`, `moments`, `tokenisation`, `gap_tokens`, `protective_functions`) differ from the frozen 9.10 names (`lexicons`, `rules`, `documented_bypass_entities`, `generic_protective_tokens`, `moment_keywords`, `fixtures.positives` and `fixtures.negatives`); T1's rule-pack hand reshapes the file to 9.10 before T3 ports it, keeping the 30 positive, 21 negative, 6 outbound and 4 moment fixtures.
- The adopted `golden/cases.yaml` carries no `tier` field (9.11 requires A or B per case) and its `checks` and `origin` fields must be verified against 9.11; T1 assigns tiers before T6 writes the runner.
- The adopted `fixtures.json` spells some 10.5 keys differently (`coverage_bands` for `coverage.bands`, `demo_wo` for `demo`, `lead_time` at top level for `workbook.lead_time`, `labelled` for `coverage_labels`); the harness may add keys and never rename one, so T1 adds the 10.5 spellings and keeps the old ones as aliases or records a deviation.
- `thehub-harness/contracts/` does not exist yet; foundation step 8 creates it before `contracts:check` can run.
- The Z.ai price constants for the spend cap, the `glm-5.3-flash` model id confirmation by a live models call and the dated terms reading belong to ADR-001 (human-gated line for the terms).
- The embedding function size and cold start are unmeasured until M1; the fallback ladder of section 6 applies if the instrument fails.
- Human-gated items unchanged from blueprint section 15: team facts (`TBD_`), the registered team string, the final-round window, narration, the supervisor's review of the two drafts, coverage-label adjudication, the external false-abstention set, the post-run emptying, the upload.


