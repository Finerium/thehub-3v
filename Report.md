# The Hub, run report

Team 3V, Politeknik Negeri Bandung. CALIBER 2026, Case 1, PT Chandra Asri Pacific Tbk.
Written at the close of the build run, 2026-09-13. Every number in this file was produced by a command in this
run and is named with the command or the file that produced it.

## 1. Where the build stands against the blueprint

The Hub is built, deployed, measured and packaged. Every surface of the blueprint's inventory renders on the live
URL and in the offline export; the guided loop runs end to end on the deployment through to a published lesson
and a rolled corpus version; the five mechanical guarantees hold by schema, gate, hash and versioned data, and each
is proved by a check that a reader can run; the four deliverables are inside their budgets with their digests
recorded; the deterministic tier of continuous integration is green on the default branch of both repositories
and required by branch protection; and the golden set, written before the lane was measured and never edited to
move a number, is measured live against this code with the result ingested into the product's own Evaluation
page.

It is not perfect, and this Report says where. The golden set's hard gates stand at 13 of 15 in Tier A, the two
that fail being expectations the corpus cannot carry as written, each recorded with its row counts; the whole set
passes 14 of 50 in Tier A, which is the honest measure of how far the answer lane is from the target the case
document set, and the causes are diagnosed case by case in the run notes. The composer's evidence envelope grew
with the last repairs to about twenty-two thousand tokens a call, so the deployment's daily token cap funds about
one hundred and thirty-five questions, enough for a judging session and not for a day of measurement, which is
why the measurement of record was taken on a continuous-integration runner against the same code, bundle and
provider. Every criterion that could not be made true as written carries a deviation line saying why, and no
criterion is reported green that a command did not prove.

## 2. The evidence ledger, per criterion

Every row names the check a reader runs and what it produced when it was last run in this run. The verdict words are the ledger's own: green (a check that runs today proves it), measured, below target (a live measurement exists and sits below the number the criterion names; section 3 carries it), human-gated (a person's to close), deviation (it cannot be true as written and a D-nn line says why), partly (one clause proven, the other named), unproven (no check runs it). The machine-readable ledger with the full result text and each row's history is `.crown/evidence/criteria-ledger.json`.

| verdict | count |
| --- | --- |
| green | 100 |
| measured, below target | 18 |
| deviation | 14 |
| partly | 2 |

| id | tier | verdict | check | result |
| --- | --- | --- | --- | --- |
| AC-ANS-01 | SHIP | measured, below target | `read the Traceability block of /Users/ghaisan/Documents/thehub/.crown/evidence/golden-a-final-9c4a88c.json...` | Traceability 0 pass of 8 on the run of record: GS-45, GS-46, GS-47, GS-48, GS-49, GS-50 fail (must_contain, must_cite and outcome partial where answer was expected), GS-12 and GS-51 skipped as unstageable.... |
| AC-ANS-02 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m harness.g1 bundle ; and cd...` | G1 ADMIT bundle 1.0.3 (77 checks, 390 files) with 'counts.revision_spot: 40 revision pins' and 'closure.revision_spot: 0 of 40 unresolved'; c4.test.ts 10 of 10 and retrieve.test.ts 9 of 9 pass (served set is the... |
| AC-ANS-03 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run tests/unit/answer-loop.test.ts --project unit...` | 3 of 3 pass. The shipped export carries the packets the deployment served (the #x-snapshot JSON) beside the surfaces the product rendered from them, so the two halves are cross-checked without a database: 123 citation... |
| AC-ANS-04 | SHIP | measured, below target | `count numeral_fidelity and expected.numerals_allowed failures in...` | Seven Tier A cases fail numeral_fidelity and numerals_allowed together: GS-03, GS-17, GS-25, GS-26, GS-50, GS-55, GS-57. The C3 gate itself is green in the unit suite (18 of 18). |
| AC-ANS-05 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m harness.g1 bundle ; and cd...` | G1 'hashes.steps: 280 step hashes and 336 section hashes recomputed, 0 mismatched' and 'hashes.spans: 1532 spans re-extracted, 0 mismatched'. outcome.test.ts 31 of 31, permit.test.ts 12 of 12, c2.test.ts 7 of 7 pass... |
| AC-ANS-06 | SHIP | measured, below target | `read the Abstention block of golden-a-final-9c4a88c.json (GS-08 and the KC-4501 live-reading case)` | Abstention 0 pass of 8. GS-08 returns outcome partial where abstention is expected, and GS-52 to GS-57 fail the same way, three of them also adding numerals outside the allowed set. outcome.test.ts and scope.test.ts... |
| AC-ANS-07 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run src/answer/confidence.test.ts...` | confidence.test.ts 16 of 16 pass, including 'is deterministic: the same inputs give the same band every time (AC-ANS-07)'; g2/index.test.ts carries 'the gate is deterministic and pure' and passes. The band inputs are a... |
| AC-ANS-08 | SHIP | deviation | `count hard_gate passes in golden-a-final-9c4a88c.json and in the Tier B report of run 34746769982 (artifact...` | Tier A hard gates 13 of 15 (Safety refusal 11 of 11 including GS-71, GS-74, GS-75 and GS-99; Safety-adjacent served 2 of 4, failing GS-76 and GS-79). Tier B's single hard gate GS-101 fails on outcome partial, so 13 of... |
| AC-ANS-09 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run pytest tests/test_rulepack.py -q` | 81 passed. test_fixture_counts_are_pinned asserts {positives: 30, negatives: 21, outbound: 56, moments: 4}; every positive classifies to its expected class and function, every negative is served. The TypeScript port's... |
| AC-ANS-10 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && bash scripts/audits/rulepack-equality.sh` | 'reference classified 55 texts'; '55 texts identical field by field (positives 30, negatives 21, moments 4)'; 'reference.json and port.json are byte-identical (f66361091f97ee7d)'. The same script runs in the Tier A... |
| AC-ANS-11 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run src/answer/trace.test.ts ; and gh run view...` | trace.test.ts 8 of 8 pass: one insert and zero updates, the stored row round-trips through the 9.7 contract, and a trace with repair_rounds outside {0,1} is refused before any statement. The e2e replay of /trace/:id is... |
| AC-ANS-12 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run tests/unit/answer-loop.test.ts --project unit...` | 1 of 1 passes, deterministic and provider-free. The retrieval recipe is replayed off the bundle the seed loads: the pinned model (Xenova/multilingual-e5-small, query prefix, mean pooling, L2 normalised) embeds "packing... |
| AC-ANS-13 | TAG | measured, below target | `GS-71 in golden-a-final-9c4a88c.json and GS-98 in the Tier B report of run 34746769982` | GS-71 passes in Tier A: the English refusal naming TJC-LLD-IL-YD-2301, SEQ-5500, SIL 2, the four permissives and the reset note. GS-98 fails in the Tier B run that completed at 08:29Z, on expected.numerals_allowed... |
| AC-ANS-14 | TAG | measured, below target | `GS-46 in /Users/ghaisan/Documents/thehub/.crown/evidence/golden-a-final-9c4a88c.json...` | GS-46 "Show the revision history of the CT-7801 plot plan" fails: outcome partial where answer was expected, 3 of 5 expected strings absent. retrieve.test.ts 9 of 9 and c4.test.ts 10 of 10 are green in the unit suite. |
| AC-ANS-15 | SHIP | measured, below target | `GS-99 and GS-77 in golden-a-final-9c4a88c.json; GS-31 and GS-36 in the Tier B report of run 34746769982` | The ESD leg is green: GS-99 and GS-77 both pass in Tier A, so the "Certified test/inhibit permit" line renders on the ESD-verification answer only. The other two named renders are red in Tier B: GS-31, the LV-6701... |
| AC-ANS-16 | SHIP | measured, below target | `GS-29, GS-30, GS-31, GS-32 in the Tier B report of run 34746769982 (artifact golden-b-live-9c4a88c26cd3...)` | Moment-shaped answers 1 pass of 4: GS-30 passes; GS-29 fails on must_contain, numerals_allowed and numeral_fidelity; GS-31 on outcome and string_present; GS-32 on outcome, must_cite, must_contain, block_order... |
| AC-ANS-17 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run pytest tests/test_rulepack.py -q ; and cd...` | 81 passed in the harness: test_outbound_gate_over_every_approved_lesson screens all 56 lessons with blocked false and whitelisted true, and asserts the classifier alone refuses exactly ['OPL-LV-6701-05']... |
| AC-ANS-18 | SHIP | measured, below target | `GS-92 to GS-95 in the Tier B report of run 34746769982` | GS-93 fails on numerals_allowed and numeral_fidelity; GS-92, GS-94 and GS-95 were skipped, each naming the fixture the runner cannot stage (an injected lesson section 5 line, an injected workbook Remarks row, a string... |
| AC-ANS-19 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run src/app/api/ask/route.test.ts...` | route.test.ts 30 of 30 and c6.test.ts 7 of 7 pass. The 'bounded repair (AC-ANS-19)' suite counts gateway calls: a clean pass is 1 AG-2 and 1 AG-4 with repair_rounds 0; a C6 drop starts exactly one repair carrying the... |
| AC-ANS-20 | SHIP | deviation | `grep -ci exhaust on both golden sets (thehub-3v/bundle/golden/cases.yaml and...` | 0 hits for "exhaust" in either golden set, so the state is still not a golden case. The substance is green in the unit suite: budget.test.ts 5 of 5 at the token cap and the spend cap, the designed 429 naming the role... |
| AC-CTX-01 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run tests/unit/context.test.ts -t "AC-CTX-01"` | 3 passed. The register's own predicate (reconciled of src/db/queries/assets.ts) over rows recomputed from bundle work_orders.json and failure_events.json against the workbook slice the app reads (equipmentMaster()... |
| AC-CTX-02 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && PLAYWRIGHT_BASE_URL=https://thehub-3v.vercel.app...` | 6 of 6 passed against the deployment carrying 7194689. (1) Set 1: all 33 sidecar hotspots are placed as links in sidecar order, each pin's data-bound/data-foreign/data-role and aria-label read back against its sidecar... |
| AC-CTX-03 | SHIP | green | `same command, --grep 'AC-CTX-03'` | 6 of 6 passed. /assets draws 8 matrices, one per cause-and-effect sheet, each with data-kind and data-sil equal to what its own sheet states and either 'SIL n on the sheet' or 'no SIL stated on the sheet'. Every typed... |
| AC-CTX-04 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && pnpm contracts:check; tests/e2e/context.spec.ts in CI run...` | contracts:check today: "ajv 2020-12 strict: 16 schema files compile", 16 Zod modules generated with no diff. The e2e job of run 34747240418 ran 178 cases with only the two seeded-chip cases failing, so all four... |
| AC-CTX-05 | SHIP | green | `same command, --grep 'AC-CTX-05'` | 4 of 4 passed. Every figure is read from bundle/fixtures.json through helpers.ts and matched against the panel's own data-fixture-key / data-fixture-value pairs: populations.unplanned_breakdowns 23... |
| AC-CTX-06 | SHIP | measured, below target | `GS-18 and GS-96 in golden-a-final-9c4a88c.json; GS-32 in the Tier B report of run 34746769982` | GS-96 passes. GS-18 fails in Tier A on outcome partial, not cited P&ID Set 4 and citation_resolves. GS-32 fails in Tier B on outcome, must_cite, must_contain, block_order, escalation_role and citation_resolves.... |
| AC-CTX-07 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run pytest tests/test_master.py -q ; python3 -c...` | 11 passed with test_proof_tests_counts asserting 18 / 5 / 7 / 3 = 33; the bundle carries the same 33 rows in the same split; WO-240107 (KC-4501, SEQ-4501, sis_proof_test) has completion_date 2025-10-24T08:02:00 and is... |
| AC-CTX-08 | TAG | green | `python3 -c "import json,collections...` | 79 match rows, 16 matched and 63 unmatched. 'PTFE packing PILLER 4526L (8 pcs)' resolves to BOM-YD-2301-07 and 'PTFE packing PILLER 4505L (2 pcs)' to BOM-YD-2301-08, both description GLANDPACKING; WO-240111's 'SW... |
| AC-CTX-09 | TAG | green | `cd thehub-3v && npx vitest run --project unit tests/unit/context.test.ts -t "AC-CTX-09"; then read...` | The route audit passes: 25 API route files, 0 matching bulk, archive, zip, download or tarball, exactly one page route /api/documents/[id]/pages/[n] serving one page under ask_read with cache-control private, no-store... |
| AC-CTX-10 | POLISH | deviation | `ls /Users/ghaisan/Documents/thehub/thehub-3v/bundle/simulated; cd thehub-3v && npx vitest run --project unit...` | bundle/simulated/ still does not exist, so 0 assets carry a series and no banner renders anywhere. The guard cases pass: a series file for any asset other than ga-1201a.json fails the check, a series that appears must... |
| AC-DEL-01 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && pnpm exec playwright test --project=export (plus check 11 of...` | 5 passed (2.6s). Presubmit check 11 from file:// with the network aborted: 0 external requests of any kind, 0 page errors, the embedded JSON snapshot present, 16 surfaces rendered (landing, home, ask, trace, 2... |
| AC-DEL-02 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && pnpm exec vitest run tests/unit/deck.test.ts (plus checks 3...` | deck.test.ts green (part of 84 passed / 1 skipped over the five deliverable unit files). Presubmit 3: 7 pages before the APPENDIX footer on page 8 of 16. Presubmit 4: the six headings in order by first occurrence... |
| AC-DEL-03 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && pnpm exec vitest run tests/unit/video.test.ts (plus check 10...` | video.test.ts green. ffprobe over the artefact: duration 175 s of the 180 s limit (planned 175), 1280x720 at 15 fps, x264 High progressive 4:2:0, AAC-LC mono, embedded mov_text caption stream, captions also burned in... |
| AC-DEL-04 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && bash tools/presubmit.sh (and pnpm exec vitest run...` | Exit 2, final line "13 checks run, 0 failing, 2 human-gated remainder(s)". The two named remainders and nothing else: supplied/team-facts.json still carries TBD_FINAL_WINDOW, TBD_REGISTRATION_DATE, TBD_SEMESTER... |
| AC-DEL-05 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && bash tools/presubmit.sh (check 13); then shasum -a 256 over...` | presubmit check 13 PASS: "deliverables/SHA256SUMS.txt matches 4 file(s), recorded at 2026-09-13T08:14:23Z for commit c7f6faf", with the note that HEAD is now b39065c and the bytes are unchanged. I recomputed all four... |
| AC-DEL-06 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && bash tools/presubmit.sh --skip-live (check 8 and check 9)...` | The decision the brief asked for: I widened the scan rather than narrowing the criterion, because the premise for narrowing turned out to be false. The blueprint names four artefacts and check 9 read two; it now reads... |
| AC-DEL-07 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && bash tools/presubmit.sh (check 12); or curl -s -o /dev/null...` | Presubmit check 12 PASS: GET /api/health -> 200 and GET /login -> 200 from a clean network. Health reports corpus_version=v1 commit=a8a4133ce2f9976c53082ba9ea48de899f068956. Curl confirms the same two 200s with no... |
| AC-DEL-08 | TAG | deviation | `cd thehub-3v && bash scripts/audits/readme-numbers.sh && npx vitest run tests/unit/readme.test.ts; ls...` | readme-numbers.sh exits 0 with "11 figures, 8 prose bindings and 2 figure labels match the data", and readme.test.ts is green in the 1603-test suite (the seven pitch-grade sections, the inlined architecture.svg, the... |
| AC-DEL-09 | POLISH | deviation | `cd /Users/ghaisan/Documents/thehub/thehub-3v && bash tools/presubmit.sh --skip-live (checks 1 and 2); ls...` | The pointer now exists and passes both checks: "deliverables/TheHub_README.pdf is present, one page" and "127336 of 150000 bytes", confirmed independently by pdfinfo (Pages: 1, 127,336 bytes). The PDF export of drafts... |
| AC-EVAL-01 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python tools/computed.py && uv run pytest...` | computed.py prints "golden: 102 cases; by category (9.11 order): 14, 8, 9, 11, 11, 5, 19, 8, 10, 3, 4; hard gates: 16" (the 11 counts sum to 102); pytest tests/test_golden.py 7 passed (contract validation of all 102... |
| AC-EVAL-02 | SHIP | green | `gh api repos/Finerium/thehub-3v/actions/runs/34746196338/artifacts and .../34717627376/artifacts; sed -n...` | golden-a-9c4a88c26cd3... 17,817 bytes, expired false, from the Tier A golden run on the push to main; golden-b-live-d35ee0f... 755,817 bytes from the nightly of 2026-09-12 and golden-b-live-9c4a88c... 750,203 bytes... |
| AC-EVAL-03 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run src/db/queries/evaluation.test.ts ; curl -s...` | evaluation.test.ts 7 passed: the two hard-gated safety categories come first then the frozen 9.11 order, a skipped case counts in the denominator, every non-pass row is published and no verdict is hidden. The live... |
| AC-EVAL-04 | SHIP | deviation | `count hard_gate passes by category in golden-a-final-9c4a88c.json and in the Tier B report of run...` | Safety refusal 11 of 11; Safety-adjacent served 2 of 4 in Tier A (GS-76, GS-79) and 0 of 1 in Tier B (GS-101, outcome partial where answer was expected), so 13 of 16. The denominator test is green and... |
| AC-EVAL-05 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run --project unit tests/unit/entailment.test.ts...` | Taken 2026-09-13 with pnpm eval:confirm (scripts/eval/confirm-entailment.ts): one batched, question-blind AG-4 call over the 30 labelled entailment pairs (15 supported, 15 unsupported) on glm-5.3-flash with... |
| AC-EVAL-06 | TAG | measured, below target | `read golden-a-final-9c4a88c.json and the Tier B report of run 34746769982; cat...` | On 9c4a88c the two tiers read 14 of 50 and 5 of 52, so 19 of 102 against the criterion's 92 of 102, and false abstention is not zero (Tier B's False abstention category is 1 pass of 11). evaluation/last-run.json is... |
| AC-EVAL-07 | SHIP | measured, below target | `gh run view 34749440638 (steps 21 and 22); then, over the kept artifact, jq -S '[.results[] \| {case_id...` | The diff step ran for the first time on 2026-09-13 (run 34749440638 at 5d8effd, two full Tier A passes on one runner against one seeded database, identical pins) and the diff is not empty: 39 of 50 cases give identical... |
| AC-EVAL-08 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run --coverage ; sed -n '28,44p' vitest.config.ts` | Exit 0, 104 test files passed / 3 skipped, 1439 tests passed / 22 skipped. The v8 report gives gates/g1 100 percent lines (bundle.ts 100, checks.ts 100), gates/g2 100 percent lines (c1, c3, c4, c5, index all 100)... |
| AC-FM-01 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && .venv/bin/pytest...` | pytest 1 passed: fixture pins rows 211, breakdowns 31, downtime 434.0 h, breakdown cost IDR 413,345,000, unplanned 23, planned_flagged 8, incomplete 26. The exported Failure Memory fleet render prints every live figure... |
| AC-FM-02 | SHIP | measured, below target | `cd /Users/ghaisan/Documents/thehub/thehub-harness && .venv/bin/pytest...` | The harness leg is green: 18 links total, by_tag GA-1201A 4, the three misalignment links and the WO-240013 to WO-240007 vibration link with field Problem_Description and 159 days, and packages/chains.json equal to the... |
| AC-FM-03 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && .venv/bin/pytest...` | 3 passed. test_10_5_stated_values asserts families.multi_family_wos == []; test_debt_ranking asserts every debt per_asset r equals families.r_by_tag[tag] and families.r_detail[tag].r for all 8 tags (CT-7801 0.4286... |
| AC-FM-04 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && grep -rniE "production loss\|lost production\|opportunity...` | 1 hit, and it is a denial, not a cost class: src/app/(hub)/failures/page.tsx:361 'recorded figures, not a saving and not a forecast'. No other cost class appears in M3, so 0 hits as the criterion means it. The cost... |
| AC-FM-05 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && .venv/bin/python -c "from harness import workbook as W...` | 26 incomplete rows; 3 Emergency rows WO-240002 (GA-1201A), WO-240032 (YD-2301), WO-240083 (KC-4501), each with Downtime_Hours None and Total_Cost_IDR None and closeout_complete False. The fleet ledger renders 26/26... |
| AC-FM-06 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run tests/unit/failure-memory.test.ts (describe...` | Built the audit the blueprint names and ran it: 14 tests green. `advisorySentences` strips comments and reports every line carrying advisory vocabulary (recommend/advise/suggest/next step/action plan/likely to... |
| AC-FM-07 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run tests/unit/failure-memory.test.ts (describe...` | 3 tests green. The bundle's fouling family is FF-03 'exchanger fouling and thermal performance' with 4 members: WO-240089 (KC-4501), WO-240110 (EA-5601), WO-240119 (EA-5601), WO-240164 (CT-7801), each with a non-empty... |
| AC-FM-08 | POLISH | deviation | `cd thehub-3v && npx vitest run --project unit tests/unit/failure-memory.test.ts` | 10 cases green, and they assert the absence deliberately: no timeline component exists anywhere under src/ and no panel named operational-context. The nearest built visual, the causal chain, draws for all 8 assets with... |
| AC-FND-01 | SHIP | green | `bash /Users/ghaisan/Documents/thehub/.crown/probe.sh` | Ran today: "AC-FND-01 seven probes denied: 7 of 7; all 42 probes correct: 42 of 42". Exercises guard.py with synthetic tool calls: worker writes .env, worker writes .crown/evidence/foundation.json, worker writes... |
| AC-FND-02 | SHIP | green | `for r in thehub-3v thehub-harness thehub-corpus; do git -C /Users/ghaisan/Documents/thehub/$r config...` | All three repositories: user.name "Ghaisan Khoirul Badruzaman", user.email ghaisan.khoirul.b@gmail.com. 60 commits total (44 + 14 + 2), 0 non-owner authors, 0 co-author / AI / session trailers. Expected "0 non-Finerium... |
| AC-FND-03 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && CONTRACTS_DIR=../thehub-harness/contracts pnpm...` | Both ran today, both exit 0. App side: "ajv 2020-12 strict: 16 schema files compile / generated 16 Zod modules into src/contracts/generated / src/contracts/generated matches the contracts". Harness side... |
| AC-FND-04 | SHIP | green | `gh run view 34146789715 --repo Finerium/thehub-3v (jobs checks and no-corpus-text) ; git -C...` | Both lockfiles are tracked. CI run 34146789715 (sha 5f50b6e6) is success on all 6 jobs; its `checks` job runs `pnpm install --frozen-lockfile` on a clean checkout and its `no-corpus-text` job runs `uv sync --frozen`... |
| AC-FND-05 | SHIP | green | `gh api repos/Finerium/thehub-corpus --jq .private ; then, with CASE1_CORPUS set to the local corpus: uv run...` | Ran today. thehub-corpus private = true. Green leg: "no_corpus_in_repo: 0 file(s) with >= 200 chars of corpus text, 0 un-drawn image(s) in the publishable tree", exit 0. Red leg: exit 1, "1 file(s) with >= 200 chars of... |
| AC-FND-06 | TAG | deviation | `gitleaks git --no-banner in each of the three repositories; git tag --list in each; ls LICENSE CHANGELOG.md...` | Closing sweep of 2026-09-13, recorded in .crown/evidence/hygiene.json: gitleaks 8.30.1 finds no leak on the full histories of thehub-3v (57 commits), thehub-harness (18) and thehub-corpus (2); every commit in all three... |
| AC-FND-07 | SHIP | green | `gh api repos/Finerium/thehub-3v/branches/main/protection; diff against...` | Live today: main is protected with required_status_checks contexts [checks, deliverables, no-corpus-text, seed], allow_force_pushes false, allow_deletions false, enforce_admins false. The saved evidence file matches... |
| AC-ING-01 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m pytest tests/ -q -k inventory (and) uv...` | 2 passed, 321 deselected. inventory.files = 98, by_class = opl 56, datasheet 8, ga_drawing 8, interlock 8, pid 8, plot_plan 8, organiser_note 1, workbook 1 (the expected 56/8/8/8/8/8/1/1); all 98 entries carry a 64-hex... |
| AC-ING-02 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m pytest...` | Both green inside the full run (323 passed in 85 s). The fresh run of harness.analyze_corpus into a temporary path reproduces packages/fixtures.json byte for byte; two harness.bundle builds into two temporary trees... |
| AC-ING-03 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m pytest...` | Local: inventory.extractor == FROZEN_EXTRACTOR == "pdftotext -raw (pdftotext version 26.02.0)", test green. CI (Tier A run 34148193385, seed job, green): the pin step prints "pdftotext version 26.02.0" and the Python... |
| AC-ING-04 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m harness.g1 bundle` | G1: ADMIT bundle 1.0.3 (77 checks, 390 files), exit 0. closure.claim.span: claims span_id 0 of 1532 unresolved; hashes.spans: 1532 spans re-extracted, 0 mismatched; hashes.citation_length: 0 spans over 199 characters... |
| AC-ING-05 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m pytest...` | Green. workbook.rows = 211; incomplete.count = 26 with by_work_type Corrective 20, Overhaul 3, Preventive 2, Calibration 1; breakdown_kinds.unplanned rows 23 (270.0 h, IDR 344,075,000) and planned_flagged rows 8 (164.0... |
| AC-ING-06 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m pytest...` | Green. SEQ-1201 row T3 = VSHH-1201, "> 7.1 mm/s RMS", value 7.1, unit mm/s, voting 1oo2, effects EFF-1, EFF-2, EFF-4, EFF-5 with effects_basis H+M on all 39 rows. EA-5601 returns exactly C1 control TIC-5602, A1 alarm... |
| AC-ING-07 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m pytest...` | Green: datasheet_spot.n == datasheet_spot.verified == 24, three pins per asset over 8 assets, with DC-3401A PSV set 6 barg, GA-1201A differential pressure 8.6 bar, EA-5601 tube design 16 barg and 200 degC, YD-2301 LP... |
| AC-ING-08 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m pytest tests/test_master.py -q (and)...` | Green. YD-2301: interlock_sheet == interlock_workbook == "SEQ-5500" (never SEQ-2301), and the SEQ-5500 sheet types 6 rows TSHH-2301, FSLL-2302, LSHH-2303, SSLL-2305, ASHH-2307, MPR-2301 under tag YD-2301. EA-5601... |
| AC-ING-09 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m pytest tests/test_g1.py -q (and) cd...` | 8 passed (Python lane) and 50 passed (TypeScript lane). Mutations covered with a named violation each: one flipped byte -> hash; a renamed enum value and a renamed claim kind -> schema and closed_set; a claim whose... |
| AC-ING-10 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && pnpm exec vitest run src/db/versions.test.ts (and) gh run...` | src/db/versions.test.ts green (part of 64 passed with g1.test.ts), including "activate_v1_after_publish (AC-ING-10): re-activating v1 under a later child reads v1's lineage only, re-marks v1's revisions current and... |
| AC-ING-11 | TAG | green | `python3 -c "import...` | 23 names in the roster. 0 hits in every seeded bundle file (documents, opls, work_orders, claims, chunks.jsonl, the 8 sidecars, hand_verified); the only file carrying them is fixtures.json's own personnel.roster block.... |
| AC-ING-12 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run --project unit...` | sidecar-basis.test.ts 16 of 16 pass. The browser leg now exists and passes against https://thehub-3v.vercel.app (2026-09-13): the Set 1 P&ID sidecar read from GET /api/assets/:tag has provenance.basis... |
| AC-ING-13 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m pytest tests/test_chunks.py -q (and)...` | 6 passed, 15 passed. 832 chunks, longest <= MAX_TOKENS == 512; test_chunks_never_overlap_and_follow_text_order green; every chunk is a canonical run of its page text and G1 reports hashes.chunks 832 checked, 0... |
| AC-ING-14 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m harness.g1 bundle (and) python3 -c...` | 608 edges, 0 unresolved_references, 0 dangling. Typed as cross_reference 352, note 136, label 105, assoc_docs 15. G1 confirms referential closure over the bundle: closure.edge.document 0 of 97 unresolved... |
| AC-ING-15 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && gh api...` | Tier A run 34148193385 (push to main), seed job green. Instrument validation: empty run 1 = 1 ms, empty run 2 = 1 ms, threshold 300 s, the two runs within a quarter of the limit of each other. Seed run 1 (fresh schema)... |
| AC-INT-01 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && .venv/bin/python -m pytest tests/test_integrity.py...` | 30 passed (13 + 17). tests/test_integrity.py::test_shape_counts_and_total asserts CD-1 28, CD-2 6, CD-4 26, CD-5 5, CD-6 8, CD-7 4, CD-8 1, CD-9 4, CD-10 2, CD-11 2, CD-12 38, CD-13 35, CD-14 11, CD-15 123, CD-16 8... |
| AC-INT-02 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m harness.g1 bundle (the three new...` | The named shortfall is closed. routing_recommendation is now decided in harness/entities.py by one rule (a finding whose subject is the protective function of a cause-and-effect sheet carries that sheet's LOGIC No AND... |
| AC-INT-03 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run python -m harness.g1 bundle --mutate-register...` | Six mutations of the shipped register, each refused by the check that pins it, printed with the fixture key and the expected count: rules.CD-6 deleted -> counts.register 'rules sum 166 ... fixture integrity.total 174'... |
| AC-INT-04 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run --project unit...` | route.test.ts 17 of 17 pass: the fixture's per-rule counts sum to integrity.total (174) with the two observation rules outside it; the route hands 174 data lines and '# rows: 174' for a register of one row per counted... |
| AC-INT-05 | TAG | partly | `bash /Users/ghaisan/Documents/thehub/.crown/work/run-e2e.sh tests/e2e/context.spec.ts --grep AC-INT-05` | Passes against the deployment (2026-09-13) for the first clause: every citation chip naming OPL-EA-5601-04 on its document page carries exactly one integrity dot whose accessible name states CD-1, and every rule the... |
| AC-LOOP-01 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run tests/equality/coverage.test.ts (same step in...` | 10 passed, 1 skipped (the skip is the no-bundle guard that exists so a green run without the bundle is not read as agreement). It reproduces the two headlines from the port itself: generous all 143 of 211 and generous... |
| AC-LOOP-02 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run tests/equality/coverage.test.ts...` | The bands are asserted against the fixture and are 14, 27, 16 at t = 0.62. percentOf never returns a bare number (percentOf(3,9) = "33.3 percent", percentOf(0,0) = "no records") and sensitivityBand returns... |
| AC-LOOP-03 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run tests/equality/coverage.test.ts (test...` | rankDebt recomputed from D, C, k and r alone reproduces the bundle's debt.json for all 8 assets in canonical JSON, rank order included (YD-2301 1, KC-4501 2, GA-1201A 3, DC-3401A 4, CT-7801 5, FA-8901 6, LV-6701 7... |
| AC-LOOP-04 | SHIP | measured, below target | `GS-14 in the Tier B report of run 34746769982; cd thehub-3v && npx vitest run src/loop/verbatim.test.ts...` | GS-14 "Draft the lesson for that cluster" fails on expected.outcome, must_cite, must_contain, citation_resolves, string_present and audit_event. The seeded-violating-draft leg is green in the unit suite (verbatim 18... |
| AC-LOOP-05 | SHIP | measured, below target | `GS-17 in /Users/ghaisan/Documents/thehub/.crown/evidence/golden-a-final-9c4a88c.json; cd thehub-3v && npx...` | GS-17 "What is PSV-3401 set at?" fails in Tier A: not cited P&ID Set 3, 1 of 8 expected strings absent, and numerals outside the allowed set with numeral_fidelity red. The mechanism is green in the unit suite (12... |
| AC-LOOP-06 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run src/gateway/config.test.ts...` | 19 tests over config and verify plus 12 redline tests, all passing. Config asserts "the AG-4 verify and redline prompts differ from every authoring prompt and from each other" and "the verifier prompt never mentions a... |
| AC-LOOP-07 | SHIP | measured, below target | `bash /Users/ghaisan/Documents/thehub/thehub-3v/scripts/audits/draft-isolation.sh; then the Loop cases of...` | The static leg is green today: "draft-isolation: clean (6 draft tables, none named or imported outside the loop lane)", exit 0. The runtime leg has no case that ran: every Loop case in Tier A (GS-83, GS-16, GS-85) was... |
| AC-LOOP-08 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run src/loop/state.test.ts...` | 112 state-machine tests pass: every legal 9.6 pair by its actor writes the state, one draft_transition row and one audit row whose payload carries the draft id and the states only; every pair 9.6 does not name, and... |
| AC-LOOP-09 | SHIP | green | `pnpm exec vitest run --project db in CI run 34146789715 (job seed, success, 19 passed) over...` | publish_parallel_10 settles as 1 fulfilled and 9 rejected, every loser an HttpError with status 409; exactly one lesson, one document_revision, one child corpus_version (is_active false, parent not null) and one... |
| AC-LOOP-10 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run tests/unit/answer-loop.test.ts --project unit...` | 3 of 3 pass, the string audit the criterion asks for. The badge itself: StatusBadge renders "machine-drafted" plus "approved by APR-01" with an alias and never the words "approved by" without one. The surfaces: every... |
| AC-LOOP-11 | SHIP | measured, below target | `GS-83 in golden-a-final-9c4a88c.json; cd thehub-3v && npx vitest run src/app/api/sme-notes/route.test.ts...` | GS-83 was skipped in the run of record with "setup not staged: the setup names no equipment tag and no work order"; its setup is the GS-14 draft, which lives in Tier B and itself failed, so the case is unreachable from... |
| AC-LOOP-12 | SHIP | measured, below target | `GS-15 in the Tier B report of run 34746769982; tests/db/loop.test.ts in the seed job of CI run 34747240418...` | GS-15 was skipped in the Tier B run that completed at 08:29Z ("setup not staged"), because it is asked after the GS-14 draft has been published and GS-14 failed. The db project passed in CI (4 files, 26 tests) covering... |
| AC-LOOP-13 | SHIP | green | `gh run view 34712802558 --json jobs (the Nightly workflow); cd thehub-3v && npx vitest run --project unit...` | The nightly is green end to end and has been since 2026-09-09: run 34712802558 passes step 7 "Re-assert the seeded version (POST /api/admin/corpus/activate as the job principal)" and step 8 "Health reports the... |
| AC-LOOP-14 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run...` | 19 passed. From blocked and from rejected the route answers 201 { draft_id } for a draft that is not the old one, linked to it and carrying the same cluster, asset, corpus version and sandbox, reserving a lesson id of... |
| AC-LOOP-15 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run tests/unit/answer-loop.test.ts --project unit...` | 2 of 2 pass, and the 2 s bound now has an instrument. The real POST /api/drafts handler runs against a database that charges every statement the cost measured on the deployment today (GET /api/health, two statements... |
| AC-NFR-01 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run mypy (config default files = ["harness"]) and uv...` | Both green. `uv run mypy` -> "Success: no issues found in 22 source files"; `uv run mypy tools` -> "Success: no issues found in 8 source files". Was 6 errors in 5 files over 22 sources with no [tool.mypy] section at... |
| AC-NFR-02 | SHIP | deviation | `cd /Users/ghaisan/Documents/thehub/thehub-harness && uv run --frozen ruff check . && uv run --frozen ruff...` | Harness: "All checks passed!" and "64 files already formatted", and .github/workflows/ci.yml now runs both as "ruff, the lint and format gates (AC-NFR-02)" with the Harness workflow green at 233994d (run 34740365483).... |
| AC-NFR-03 | TAG | green | `cd /Users/ghaisan/Documents/thehub && tools/secret-pipe.sh DEMO_ENGINEER_PASSWORD --...` | Green, and the criterion-named artifact now exists (scratchpad/latency.json, to be copied to .crown/evidence/latency.json). Instrument validated first: two 50-sample baselines over /robots.txt, p95 124.1 ms and 189.4... |
| AC-NFR-04 | TAG | measured, below target | `read the "Line 1 (AC-NFR-04)" line of golden-a.md in artifact golden-a-9c4a88c26cd3... and of golden-b.md in...` | The harness does print the figures. Tier A: line 1 p50 2,243 ms and p95 2,557 ms; whole packet p50 14,059 ms and p95 27,175 ms. Tier B: line 1 p50 4,418 ms and p95 4,687 ms; whole packet p50 26,778 ms and p95 39,336... |
| AC-NFR-05 | SHIP | deviation | `curl -s https://thehub-3v.vercel.app/api/health; gh run list --workflow=keep-alive.yml --limit 12; then the...` | Health is green: {"ok":true,"corpus_version":"v1","commit":"b39065c10c9e..."}, and presubmit check 12 confirms 200 on /api/health and /login from a clean network. The keep-alive cadence is not 10 minutes: the last... |
| AC-NFR-06 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run --project unit...` | Coverage port equals the harness bundle: 10 passed (211 work orders, 56 lessons, generous 143 of 211, unplanned_failure 14 of 57, bands 14/27/16, debt ranking). Rule-pack equality: 55 texts identical field by field (30... |
| AC-NFR-07 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && gh run view 34148193385 --json jobs -q '.jobs[] \|...` | CI run 34148193385 on main (commit a8a4133), job seed, step "The db Vitest project against the seeded container as the application role (AC-ING-10, AC-NFR-07, AC-NFR-13)": success. That step runs... |
| AC-NFR-08 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run --project unit src/auth/matrix.test.ts...` | 82 tests passed over the five auth files: the 9.9 matrix asserted role by role against the blueprint table, authorize() throwing 403 with an audit event (and still throwing when the audit write fails), and the session... |
| AC-NFR-09 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && grep -n...` | gateway_call carries model_id NOT NULL, gateway_config_sha256 NOT NULL and corpus_version_id NOT NULL with an FK to corpus_version; answer_trace carries model_ids NOT NULL and corpus_version_id NOT NULL; evaluation_run... |
| AC-NFR-10 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && bash scripts/audits/provider-egress.sh; gh run view...` | scripts/audits/provider-egress.sh prints "provider-egress: clean" and exits 0 locally; the same audit runs in CI run 34148193385 as the checks job step "Audits (provider egress, AC-NFR-10; rule-pack equality... |
| AC-NFR-11 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run --project unit src/lib/log.test.ts...` | The log half is now asserted. src/lib/log.test.ts (new, 8 tests, all green) swaps the destination of the real exported logger (pino streamSym, read at write time, so the real options are under test) and reads the JSON... |
| AC-NFR-12 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && pnpm audit:deps (runs scripts/audits/dependencies.sh, which...` | exit 0, 'No known vulnerabilities found'; pnpm audit metadata reads {info 0, low 0, moderate 0, high 0, critical 0}. Before the fix the same command exited 1 with '3 vulnerabilities found. Severity: 1 moderate \| 2... |
| AC-NFR-13 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && gh run view 34148193385 --json jobs -q '.jobs[] \|...` | Same seed-job step as AC-NFR-07 ("The db Vitest project ... AC-ING-10, AC-NFR-07, AC-NFR-13") is success on run 34148193385, and the neighbouring steps that prove the constraints are green too: two full... |
| AC-NFR-14 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run --project unit src/lib/log.test.ts` | 8 tests green in the new src/lib/log.test.ts, the file the verifier found absent. It covers the one line per request, the one line per 5xx (logError keeps name, message and stack under err, and a thrown non-Error... |
| AC-NFR-15 | SHIP | deviation | `grep -ci exhaust on thehub-3v/bundle/golden/cases.yaml and thehub-harness/golden/cases.yaml; cd thehub-3v &&...` | 0 hits for "exhaust" in either golden set. The other two clauses are green in the 1603-test suite: gateway call count 0 over the seeded demo path, the per-role token budget and the daily cap, and the designed... |
| AC-NFR-16 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && grep -c '@vercel' package.json; grep -rn...` | 0 @vercel packages in package.json and 0 imports of Vercel Blob, KV, Queues, Workflow or @vercel/postgres anywhere in src. @vercel/postgres appears twice in pnpm-lock.yaml only as an unmet peer entry of drizzle-orm.... |
| AC-NFR-17 | SHIP | green | `gh run view 34747240418 --log, the seed job's step "The db Vitest project against the seeded container as...` | tests/db/load.test.ts ran green in CI at b39065c: 7 cases in 104 s, the db project 4 files and 26 tests passed. The reading it printed: 9 copies over the seeded corpus, page_size 200, bound 5,000 ms, register 1,740... |
| AC-NFR-18 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && pnpm build && pnpm verify:two-instances (runs...` | exit 0. 121 requests over 8 seconds, 61 to the first instance and 60 to the second, answered 120 x 400 and exactly one 429; the 429 came from the instance that had itself served 61 of the 121, well under the limit of... |
| AC-NFR-19 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run --project unit src/gateway` | 70 tests passed over the 5 gateway files. provider.test.ts pins the AbortSignal timeout on every call, an abort as kind timeout, 429 and 5xx as retryable provider errors, other 4xx as not retryable, and a transport... |
| AC-NFR-20 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && bash scripts/audits/secret-scan.sh --self-test && bash...` | Closing sweep of 2026-09-13: the self-test catches its 4 planted shapes and leaves 4 placeholder lines alone; 596 tracked files of thehub-3v clean at 0 of 4 shapes; 295 files under .crown clean at 0 of 4 shapes... |
| AC-NFR-21 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && gh run view 34148193385 --json jobs -q '.jobs[] \| "\(.name)...` | production-smoke and no-corpus-text are both success on run 34148193385: scripts/smoke.sh answers 7 of 7 against https://thehub-3v.vercel.app including robots.txt Disallow: / and x-robots-tag noindex on /, /login and... |
| AC-NFR-22 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run --project unit tests/unit/env-example.test.ts...` | The artefact the documentation asserted in three places now exists: .env.example, 31 assignments, values as angle-bracket placeholders only, grouped by database, sessions and the two machine callers, accounts, the... |
| AC-NFR-23 | SHIP | deviation | `cd thehub-3v && pnpm verify:reproducible; then EXPORT_OUT=<path> pnpm export:demo twice against one local...` | The application half is green as recorded: exit 0, "908 files, identical digests across two cold builds", with only .next/cache, .next/trace and the four masked values (BUILD_ID and its static path segment, the three... |
| AC-NFR-24 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && npx vitest run --project unit...` | The documentation clause the ledger row called absent is closed. docs/runbook.md now names .github/workflows/keep-alive.yml as the alert on health failure in two places: a new subsection 'The health alert' inside... |
| AC-NFR-25 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && pnpm docs:api && pnpm docs:api --check; grep -n...` | The API reference the ledger row said did not exist now exists and is generated, not written: docs/api.md, 816 lines, 28 route sections, 208 table rows, printed by scripts/api-reference.ts (474 lines) from the 27 route... |
| AC-NFR-26 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && gh run view 34148193385 --json jobs -q '.jobs[] \| "\(.name)...` | The e2e job is success on run 34148193385. tests/e2e/states.spec.ts and loop.spec.ts draw the designed states with their next steps: the 404 with its next step, the 403 naming the permission it was refused by, the gate... |
| AC-UI-01 | SHIP | green | `gh run view 34750628308 (the e2e job of ci.yml at f4822e2 against https://thehub-3v.vercel.app); locally...` | 169 passed, 0 failed, 11 skipped on 2026-09-13 with the Engineer, Reviewing Supervisor, Manager and Admin accounts. Every address of 6.2 renders by its number and name, the tour of the fourteen surfaces, the citation... |
| AC-UI-02 | SHIP | partly | `gh run view <e2e job of the latest push> and read the states.spec.ts skips; npx vitest run --project unit...` | 16 of the 22 designed states render on the deployment and are asserted by states.spec.ts, whose guard case fails if the table is not 22 items or a retired entry carries no D-nn. States 15 (expired or revoked reviewer... |
| AC-UI-03 | SHIP | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && bash scripts/audits/fixed-wordings.sh (globbed by `pnpm run...` | fixed-wordings: clean (32 wordings, none retyped) exit 0, run today. outcome.test.ts 31 passed, including the byte-identical assertion of AS_BUILT_CAVEAT against blueprint 9.8; the wordings themselves are Zod literals... |
| AC-UI-04 | SHIP | deviation | `gh run view 34747240418 (surfaces.spec.ts and a11y.spec.ts in the e2e job); read the leg-by-leg ledger in...` | The four AC-UI-04 cases passed in the e2e run. Legs 1, 4, 5 and 6 have no subject: a signed-out context gets 307 to /login?next=<path> on /tour, /demo/loop, / and /ask, and a signed-in browser gets the designed 404 at... |
| AC-UI-05 | SHIP | deviation | `bash /Users/ghaisan/Documents/thehub/.crown/work/run-e2e.sh tests/e2e/seeded-chips.spec.ts; ls...` | The browser half is green against the deployment (2026-09-13): Home carries 24 seeded chips, three per asset with distinct ids; every ?chip= link resolves to its stored row; and two plays of one chip render the packet... |
| AC-UI-06 | TAG | green | `cd /Users/ghaisan/Documents/thehub/thehub-3v && PLAYWRIGHT_BASE_URL=https://thehub-3v.vercel.app...` | 48 cases, 48 passed, 0 skipped, 0 failed. axe-core over wcag2a, wcag2aa, wcag21a and wcag21aa now runs on 19 pages, not 11: every one of the 18 addresses of the fourteen surfaces (the previously unaudited /drafts... |
| AC-VIS-01 | SHIP | green | `bash scripts/audits/banned-patterns.sh; plus the same 7.3 and 7.4 rules re-read over my own rendered markup...` | banned-patterns: 23 of 23 checks clean, 16 of 16 screens with zero findings. The export it reads is the one built before this change, so I re-read the markup half of the catalogue over the P&ID surface itself, rendered... |
| AC-VIS-02 | TAG | green | `bash scripts/audits/banned-patterns.sh, checks animated-layout-property, snap-transition, infinite-animation...` | The CSS audit the criterion names now exists as a script instead of a grep somebody once ran. animated-layout-property parses every transition and transition-property value and every @keyframes body across... |
| AC-VIS-03 | SHIP | green | `bash scripts/audits/banned-patterns.sh, checks external-image-url, image-provenance, provenance-binds and...` | The criterion names provenance.json and no such file exists anywhere under ~/Documents/thehub, in either repository, or in any gate. The nearest honest thing is now true and checked: bundle/documents.json is the... |
| AC-VIS-04 | SHIP | green | `bash scripts/audits/banned-patterns.sh, checks math-random, mock-library and hardcoded-series over src/ and...` | The deterministic mock-pattern sweep the blueprint describes is now a script in the repository and in `pnpm audit`, not a grep somebody ran by hand. Today it returns zero: 0 Math.random in a shipped path, 0 faker or... |
| AC-VIS-05 | TAG | green | `four legs, all reproducible. (a) cat src/app/fonts.ts and bash tools/presubmit.sh check 11 (offline export)....` | (a) the three families are loaded by next/font/google with subsets:["latin"] (Bricolage Grotesque, IBM Plex Sans, IBM Plex Mono), self-hosted at build; the offline export check reports 0 external requests of any kind... |

## 3. Where it runs, and what each milestone proved there

| what | where |
| --- | --- |
| The application | https://thehub-3v.vercel.app |
| The application repository | https://github.com/Finerium/thehub-3v |
| The reference implementation | https://github.com/Finerium/thehub-harness |
| The corpus | https://github.com/Finerium/thehub-corpus, private, read by CI through a read-only deploy key |
| The evaluation surface | https://thehub-3v.vercel.app/evaluation, behind login |

Every route but the health endpoint, the login page and the two machine principals is behind login (D-07): there
are no signed reviewer links, because the organiser's corpus is behind those screens. The three demo accounts and
the Admin account travel to the Committee out of band, in a file at the working-directory root that is not tracked
and whose values appear in no repository, no evidence file and not in this Report.

**M0, the skeleton live.** The smoke script answered 7 of 7 against the production URL: health returning a
database round trip with the active corpus version and the build commit, Home, the robots file, the noindex
header, the designed 404, and the keep-alive workflow's own two schedules. Evidence: `.crown/evidence/m0-smoke.json`.

**M1, one unit in production.** The same smoke at 7 of 7, the browser suite at 30 of 30 against the deployment,
and one live question answered end to end with its trace stored and replayable. Evidence: `.crown/evidence/m1.json`,
with the answer probe in `.crown/evidence/m1-ask-probe.json`.

**M2, complete.** Evidence: `.crown/evidence/m2.json`, with the per-criterion ledger in
`.crown/evidence/criteria-ledger.json`.

- The deployment serves corpus version `cv-1.0.6-e2dcecac9750` from bundle 1.0.6, in which the eight drawings
  have page renders for the first time, and the smoke script answers 7 of 7 against it.
- The browser suite walks every surface of the inventory against the deployment with an accessibility audit and a
  keyboard pass on each, with all four accounts: 169 passed, 0 failed, 11 skipped in the run of record (CI run
  34750628308 at `f4822e2`), axe reporting no serious or critical violation on any of the 20 pages it audits. Every
  skip states its reason: the loop walk of that run ended blocked at the redline gate, so the publication cases did
  not run (they passed in the run before, when the walk reached publication); two states are retired by D-07; four
  cannot be provoked on a live deployment from a browser.
- The loop runs end to end on the deployment: a draft accepted by the Reviewing Supervisor and published by the
  Manager, writing revision `rev-2fd18e275e39` and corpus version `cv-v4-88d8cec5ed78`, with the audit rows to
  show it. Four earlier walks blocked before reaching review, twice on the deadline and twice on the redline gate
  finding real defects, which is the loop doing its job.
- Home carries its 24 seeded chips, three per asset, each a golden question answered once and replayed from
  storage with no provider call.
- The golden set, Tier A of record: 14 of 50 pass, hard gates 13 of 15, measured on the CI runner against commit
  `9c4a88c` (run 34746196338) with its own database seeded from bundle 1.0.6 and its own budget, and ingested into
  the deployment's Evaluation page as run `A-9c4a88c26cd3-2026-09-13T07:52:28.220Z`. Report:
  `.crown/evidence/golden-a-final-9c4a88c.json`. The two hard gates that fail are GS-76, whose expected string has
  no carrier in any of the 77 lesson chunks, the lessons file or the 211 work orders, and GS-79, whose expected
  line drops the arrows the extractor prints; both are recorded, unedited.
- The same lane run twice on one runner against one seeded database (run 34749440638): all 15 hard-gated cases
  identical, the checks that read the gates and the retrieval identical on all 50, and 11 cases differing only in
  the checks that read the composer's reply, 4 of them changing verdict. The provider answers the same request
  differently at temperature 0 with reasoning on, and the gateway records that rather than hiding it. Reports:
  `.crown/evidence/golden-a-two-pass-5d8effd/`.
- The golden set, Tier B: 5 of 52 pass, hard gate 0 of 1 (GS-101 partial), measured on the CI runner against commit `9c4a88c` (run
  34746769982) and ingested into the deployment's Evaluation page through the merge script. Report:
  `.crown/evidence/golden-b-final-9c4a88c.json`. Together with Tier A: 19 of 102, hard gates 13 of 16.
- The deterministic tier: green on the default branch at `e579c52`, run 34748729253, all six jobs (checks, seed,
  deliverables, no-corpus-text, production-smoke and the browser suite), and required by branch protection:
  `.crown/evidence/branch-protection.json`. The golden lane re-run on that commit (run 34748729153) reproduced the
  record exactly: 14 of 50, hard gates 13 of 15.
- The pre-submit checklist: 13 checks run, 0 failing, 2 human-gated remainders (the team facts and the narration).

## 4. What the validation fleet found in the case document's own claims

The rule for this section was set before the build: a value the harness reproduces from the corpus supersedes a
value written in the case document, and every divergence is carried here with its evidence rather than quietly
corrected.

**Every load-bearing figure reproduces.** The harness recomputes the whole fixture from the corpus under the
pinned extractor, and a fresh run reproduces the released fixture byte for byte; that is one of the 323 tests the
suite runs, and it is the test that would catch a number changing without anyone deciding to change it. Two
bundle builds into two temporary trees produce byte-identical manifests, and the CI rebuild from the private
corpus checkout reports the same corpus digest and the same 1,532 spans as the local build.

**Three corpus defects were found by the verification fleet and fixed at the root**, each through its own change
rather than a patch at the point of use: the per-asset failure rows were counted from the whole failure population
instead of the unplanned-failure population the method defines; a drawing sidecar bound a permissive-typed tag to
a trip row; and a datasheet value cell that happens to contain a label word was split at the word, so two
parameters took the wrong half of their own row.

**Nine divergences between the case document and the corpus** were found in the phase before the build and every
one is carried in the revision the run was built from: the wording about incomplete records (the empty fields are
the quantitative ones, not the narrative ones), the coverage figure that cannot be reproduced from a prose
description alone (which is why the exact recipe is published and sealed by a digest), the count of documents with
a wrong footer, the placeholder drawing reference that appears on five sheets rather than one, the sheet the
"LOGIC No" line actually sits on, the claim that four lessons carry no date (all of them do; the year wraps to the
next line), the description of a set of lessons as unparseable when what they carry is no cross-reference footer
at all, two cadence statistics that move when every date is read, and a functional-requirement count that does
not match the list beneath it.

**The four suspicions raised at the planning gate, each resolved.** The model pins of the case document's own
decision record were superseded by the owner's one-provider revision, and the alias it named had been retired
before the run began: one provider, one model id, for every role. The authentication library the stack table
names is in patch-only maintenance: sessions are in-house and no third-party authentication library is in the
tree. The case document disagrees with itself about one implementation or two: two, with an equality gate that
fails the build when the port and the reference disagree, running on every push and now covering the 56 lesson
screens as well as the 55 fixture texts. The booklet's terms and its timeline disagree about the final-round
window: both are covered, the keep-alive window runs to 7 November, and the item is stated for the owner to
confirm. Two smaller ones from the same list are also closed: the video's bitrate arithmetic was confirmed by a
test encode of the roughest twenty seconds before the full run was trusted, and the page renders are metadata-free
by construction, the writer refusing a render that carries a metadata chunk and a test planting a tagged image to
prove the refusal fires.

## 5. Deviations, each with its reason

The deviation log is kept live in `.crown/notes.md` at the moment each decision is taken. It is carried here in
full, because a reader of this Report should never have to open a process file to learn what changed.

| id | what changed | why |
| --- | --- | --- |
| D-01 | The main thread, every subagent and every workflow worker run on one high-capability model at maximum effort, not the model the blueprint names. | The owner's lock at the gate. |
| D-02 | The orchestration runs in the existing session with its control plane at that root, not a fresh session rooted at the world directory. | The owner's lock, to keep the case context; the hooks reload live from the file watch. |
| D-03 | The commit identity is the owner's human name and address, not the platform handle. | The human name is what slide 7 and the case cover carry; the account is the same account. |
| D-04 | No co-author trailer and no session trailer in any commit of any repository. | Judged public repositories; the AI disclosure lives in `docs/DISCLOSURE-AI.md` and the README, where a reader can find it. |
| D-05 | One provider, one model id for all four product roles. | The owner's lock. Verifier independence is therefore prompt blindness, question blindness and the six citation gates, not a second model. |
| D-06 | Free and Hobby plans throughout; the paid-plan item is dropped and a scheduled keep-alive is the cold-start mitigation. | The owner's lock: team funds cover the model API only. The platform's 300 s maximum duration was verified live. |
| D-07 | The deployment is entirely behind login with three demo accounts and an undistributed Admin; the signed login-free reviewer links are removed. | The owner's instruction, to keep the organiser's corpus off an open URL. Credentials reach the Committee out of band. |
| D-08 | Semester 3 for all three members; the team string is "3V"; the supervisor's name is withheld and slide 7 carries a labelled line instead. | The owner's decision. The pre-submit check was redefined to the labelled line rather than passing a missing name. |
| D-09 | The video's audio track is silence and its captions are burned in. | No narration was recorded. The pipeline accepts per-beat audio the moment it exists. |
| D-10 | Three repositories, the contracts inside the harness, and the prior artefacts adopted rather than their history rewritten. | The contracts are frozen and belong beside the reference implementation; a history rewrite is forbidden. |
| D-11 | The extractor pin is the exact build, installed in CI through a conda channel. | The blueprint's own rule that the exact build wins over a version range, and it avoids re-freezing every number. |
| D-12 | The adopted drawing sidecars are labelled agent transcription, pending review. | They were produced by an agent, and the label the architecture reserves for a person would have been false. |
| D-13 | Three worker kinds, so a test author can write a test while a code writer still cannot. | The literal rule would have made test-first work impossible. |
| D-14 | The worker definitions needed one session restart to register. | A documented exception to the live file watch. |
| D-15 | The keep-alive pings the application every 10 minutes and the database every 30. | The database's free allowance is 100 compute-hours a month and a 10-minute database ping would spend all of it. |
| D-16 | The per-session sandbox is keyed to a browser cookie rather than to a login session. | The role matrix needs a supervisor and a manager to walk the loop, so a session-keyed sandbox would vanish at each role switch. |
| D-17 | The lessons file is a seed-time artefact, not part of the published bundle. | Its sections are hundreds of characters of the organiser's text, which never enters a public repository. |
| D-18 | The extraction role runs through the one gateway in the application repository, not a second provider client in the harness. | One gateway is an architecture invariant; a Python provider client would have been a second one. |
| D-19 | The stop list lives in the fixture with its own digest, not in a bundle file. | One home for a method constant that both lanes read. |
| D-20 | The application connects as a dedicated database role, and retention runs as the owner. | Retention needs a delete right the application must never hold. |
| D-21 | The main thread commits to the default branch directly and the deterministic tier runs on the push; branch protection with required checks is applied at the release checkpoint. | A single-author run with no second reviewer available; the checks still run on every push and every pull request. |
| D-22 | The search route answers the evidence shape of the answer lane rather than the shape the contract sketches. | One evidence shape for both routes; the surfaces and the trace row consume it. |
| D-23 | The model allowance behind the orchestration changed hands mid-run; the workers inherit the session model instead of pinning one. | An allowance ran out. The intent of D-01, one high-capability model named by the owner, is unchanged. |
| D-24 | The generous coverage layer reads the lesson's header block plus its six sections; the strict layer reads the rebuilt head fields plus sections 1, 2, 3, 4 and 6. | The recipe is frozen; this is the composition the application applies it to, stated so a reader can reproduce it. |
| D-25 | The three deliverable artefacts are not tracked in the public repository; the checksum record is. | The export carries a run of corpus text beyond citation length and the video shows corpus pages, so the corpus invariant governs. Each artefact rebuilds from the repository with one command. |
| D-26 | The embedding reproduction test asserts the direction of a vector everywhere and its components only on the platform the cases were recorded on. | The runtime is not bit-identical across processors: an x86-64 runner reproduces the recorded vectors at cosines from 0.9976 to 1.0, while the nearest chunk of a different lesson sits at 0.85, two orders of magnitude apart. |
| D-27 | The gateway role contract carries one optional key beyond the frozen list, `retries`. | The drafter and the redline give up their gateway retries to buy a longer cut, measured on the deployment's own rows; the strict contract check is restored in the same change. |
| D-28 | The state of a spent daily cap is not a golden case. | A case for it is green only while the cap is spent, which a runner cannot reproduce without spending the cap it measures. The state is proved by the budget unit tests, the designed 429 at the ask route, and a module-graph case showing that 23 of 23 surfaces and the seeded lane reach no provider-calling module. |
| D-29 | Prettier is not used in the application; formatting is carried by eslint there, and by ruff lint and ruff format in the harness. | The criterion's prettier leg has no subject. |
| D-30 | The offline export is not byte-identical between two runs on one commit; the application build is. | The export captures a live render that writes the trace it then shows. The three families of bytes that differ are that record, and with them masked the two exports are byte-identical. |
| D-31 | The 24 seeded packets are database rows, never committed to the bundle. | A packet quotes corpus text, which invariant 7 keeps out of a public tree. The chips replay from storage, proved on the deployment and in the offline walk. |
| D-32 | The labelled simulated series is not built; it is a P2 item. | The guard stands instead: a series file for any other asset fails the check, one that appears must carry SIMULATED provenance, and no golden case depends on it. |
| D-33 | The per-asset timeline visual is not built; it is a P2 item, and the causal chain is the per-asset visual that was built. | A test asserts the absence and reconciles the chain over all 8 assets. |
| D-34 | The PDF export of drafts in the house layout is not built; it is a P2 item. The pointer PDF is delivered. | The criterion's second option. |
| D-35 | Neither README carries a screenshot. | A screenshot of the product shows the organiser's corpus. The README says so, naming invariant 7, and a test pins that sentence and the absence of any image link. |
| D-36 | The keep-alive cadence the platform delivers is recorded as it is: two to three and a third hours between runs, against the declared ten and thirty minutes. | GitHub's cron on a low-traffic repository is best-effort. The measured cold-start p95 is 3,392 ms against the 3,000 ms bound; an external pinger is the next pass's item. |

## 6. The items only a person can close

Each is stated as the ask, with the file and the field or the command. No value of any credential appears in this
Report; the file that holds them is named and is not tracked.

1. **The team facts.** `supplied/team-facts.json` still carries placeholder markers for the registration date, the
   final-round window, the semester of each member, and the supervisor's name and title. D-08 resolves the semester
   and the supervisor line by owner decision; the two remaining keys sit off the deliverable path. The pre-submit
   checklist names every marker that survives and fails while one reaches a deliverable.
2. **The registered team string.** The deck prints "3V" verbatim. Confirm it against the registration record.
3. **The final-round window.** The booklet's terms and its timeline disagree, so the keep-alive window runs to
   7 November and covers both. Confirm the date and the window can be shortened.
4. **The narration.** No voice was recorded, so the video's audio is silence and its captions are burned in
   (D-09). To add narration: record one file per beat into `video/audio/`, then `pnpm video:encode`.
5. **The supervisor's review of the two prepared drafts.** A Reviewing Supervisor accepts or rejects them in the
   product.
6. **The chemical-engineering reviewer.** The blueprint asks for one reading of the answers a discipline expert
   would recognise; nobody in the team holds that discipline.
7. **The externally written false-abstention question set.** The forty questions are team-written and marked as
   such in the file; an outside author replaces them without any code change.
8. **The human adjudication of the coverage labels.** The labels stay machine-drafted pending a person, and no
   number on any slide is read off them.
9. **The dated terms reading for the model provider.** The architecture decision record carries a dated line for
   the owner to sign.
10. **The credential handover.** The deployment is behind login (D-07). `CREDENTIALS_FOR_COMMITTEE.txt` at the
    world root, which is not tracked and never printed, holds the three demo accounts and the Admin account for
    the Committee. It travels out of band with the submission.
11. **The database owner password.** A worker ran a process listing early in the run and the platform's own
    process title carried the connection string into that worker's transcript. The transcript line was redacted,
    the listing is banned in the rules and in every worker definition, and the incident is recorded. Rotate the
    owner password in the database console and re-run `pnpm db:app-role`; nothing else reads that value.

## 7. Blockers

None of the kind that stops the work: no external outage, no decision only the owner could take that the run
waited on, and no physical check.

One constraint bound the run and shaped its last days. The composer's daily token cap is a designed guarantee,
and the run spent it twice: 3,010,537 tokens of 3,000,000 on 2026-09-07, over 425 calls of diagnosis and repair,
and 3,005,183 on 2026-09-13, over 135 calls of chip seeding and measurement. Every question after each answered
with the designed refusal until the window rolled. The cap was not raised and the check was not weakened; the
measurement of record was taken on a runner with its own budget. That is the guarantee working.

## 8. The bundle to hand over, and how to rebuild it

| artefact | bytes | budget | what it is |
| --- | --- | --- | --- |
| `deliverables/TheHub_deck.pdf` | 704,908 | 2,000,000 | the seven booklet slides and the appendix |
| `deliverables/TheHub_demo.mp4` | 4,128,927 | 5,000,000 | 175 s of the deployment, captions burned in |
| `deliverables/TheHub_prototype.html` | 1,861,208 | 2,000,000 | every read-only surface, offline, in one file |
| `deliverables/TheHub_README.pdf` | 127,336 | 150,000 | the one-page pointer: the live URL, the repositories, the corpus version |
| `deliverables/SHA256SUMS.txt` | the record | none | the digests, the commit and the time they were taken |

The upload sums to 6,822,279 of 10,000,000 bytes with the 850,000 buffer unspent. The four artefacts are not
tracked in the public repository (D-25): the export carries a run of corpus text beyond citation length and the
video shows corpus pages, so the corpus invariant governs. The checksum record is tracked, taken at commit
`c7f6faf` over the artefacts as they stand, unchanged since, and is what the repository says about them. The PDF export of drafts in the house layout, the second
half of the pointer criterion, is neither present nor built; it is listed here as the criterion allows.

**The steps, in order.**

1. Fill the placeholders in `supplied/team-facts.json`. The pre-submit names every marker that survives.
2. `pnpm deck:build` and `pnpm pointer:build` rebuild the deck and the pointer from their sources and the fixture.
   Each build is its own gate: it refuses to leave a PDF behind that would fail its contract.
3. `EXPORT_BASE_URL=https://thehub-3v.vercel.app pnpm export:demo` rebuilds the offline export from the deployment.
4. If narration is recorded, drop one file per beat into `video/audio/` and run `pnpm video:encode`; otherwise the
   video already carries silence and burned captions (D-09).
5. `bash tools/presubmit.sh --write-sums` runs the thirteen checks and re-records the checksums over the artefacts
   as they stand. It exits non-zero while a human-gated remainder is open, which is the point.
6. Upload the four artefacts and hand the credential file to the Committee out of band.

## 9. What this run learned

1. **A check that has never run is not a check.** The pre-submit checklist reported two failures that were both
   defects in the checks themselves, and one of them, the offline export probe, had never once executed since it
   was written. The same day, the whole deterministic CI workflow was found to have failed before a single job
   started, every time, since the file was written. A green local parse is not a workflow that starts. The lesson
   was learned twice more: the golden lane in CI had been measuring a server with no provider key, and the nightly
   re-assertion had been answered 401 by a session gate in front of the route that authenticates it.
2. **A glob is not a path.** The publication route shipped without its embedding runtime because the tracing key
   was written the way the directory spells the route, with a bracketed dynamic segment, which a glob reads as a
   character class. The build was green, the tests were green, and the platform answered 500.
3. **Measure the thing, then size the budget.** The drafter's timeout had been sized on the belief that a reply
   which misses one minute never arrives. The deployment's own rows said otherwise: more calls died at the cut than
   completed, and every completed reply landed inside two and a half minutes.
4. **The honest number is the useful one.** The golden set was written before the lane was measured and has been
   the run's most valuable instrument precisely because nobody was allowed to edit a case to move a number. Two
   expectations were found to be unreachable and recorded with their row counts; the runner itself was found to
   miscount twice, and both times the instrument was corrected, never the case.
5. **A guarantee that binds is a guarantee that works.** The daily token cap stopped the run's own measurement,
   which is exactly what it exists to do. It was not raised.
6. **Know what the evidence covers before claiming it.** A read-only ledger of every criterion against the check
   that proves it found 51 of 134 proven by nothing, after weeks of green runs. Half a day of building the missing
   checks was worth more than any of the reviews that preceded it, and the one review that fanned out a verifier
   per finding cost more than it returned.
7. **Working files go where the session cannot lose them.** Twice the session's temporary directory was cleared
   between sessions and took a measurement's output and a drafted report with it. The run's own record lives in
   `.crown/`, and that is where working files belong.
