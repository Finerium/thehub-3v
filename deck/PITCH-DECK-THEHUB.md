# Pitch Deck Copywriting: The Hub (7 slide plus lampiran, CALIBER 2026 Case 1)
## Tim 3V | Politeknik Negeri Bandung | CALIBER 2026, Case 1: Manufacturing Knowledge Hub

**Catatan tim.** The deck is exactly 7 content slides plus an appendix, which is the mandatory structure of the CALIBER 2026 booklet, page 10, and the order of those 7 slides is fixed: Cover, Background & Problem Statement, Solution, Business Impact, Feasibility & Roadmap, Conclusion, Team Profile. Appendix slides are unlimited, and only highly relevant evidence belongs there. Everything that goes ON a slide is written in English, because the deck is an English deliverable (blueprint 4.4, and `tools/banned-strings.sh` check 9 enforces it over the extracted PDF text); only the editorial labels of this working document (Judul, Teks slide, Visual, Catatan) stay Indonesian. This file is copy, not the artefact: the artefact is `deck/src/deck.html`, printed by `deck/build.ts` into `deliverables/TheHub_deck.pdf`, and every figure on a slide is a native SVG in `deck/figures/`. No number below is typed by hand into the deck: a fixture-bearing quantity carries its key and the build substitutes the value from `bundle/fixtures.json`, `bundle/manifest.json` or `supplied/team-facts.json`, so a stale number cannot survive a build. Density rule of the deck build: no slide body over 120 words of running prose, tables and figure labels excluded, so the prose below may be cut at layout time and may never gain a claim. House rules that the copy respects everywhere: the coverage figure is an exposure and not a saving; no number is generated; the P&ID sidecars are agent transcription pending review; the golden set does not pass and is quoted as it stands; the software is not a control system and has no write path toward one; not one sentence of a lesson, a datasheet or a work order appears here, because the corpus is the organiser's property (tags, document ids, rule ids and counts are ours to print).

Slide to booklet requirement: **Cover** slide 1 (team name, chosen use case); **Background & Problem Statement** slide 2 (current challenges, supporting facts, why it matters); **Solution** slide 3 (high-level objective, workflow, key technologies); **Business Impact** slide 4 (expected evaluation, measurable benefits, KPIs, success metrics); **Feasibility & Roadmap** slide 5 (technical, operational, legal, cybersecurity, data governance and organisational readiness, plus the roadmap and its timeline); **Conclusion** slide 6 (solution, key value, expected outcomes); **Team Profile** slide 7 (team name, university, supervisor, member table); **Appendix** A1 to A9.

---

## SLIDE 1. COVER

**Judul:** The Hub

**Teks slide:**
The knowledge hub that knows what it is missing.

Team 3V · Politeknik Negeri Bandung
Case: CALIBER 2026, Case 1: Manufacturing Knowledge Hub (AI-Powered Knowledge Integration)
Theme: Future-Ready Operational Excellence: Knowledge, Reliability, and Smart Manufacturing
Built on corpus version v1, bundle 1.0.6, digest 918706e4, 98 controlled files

**Visual:** `figures/surfaces.svg` (1, tengah, lebar penuh, hero). Three product surfaces reduced to their layout at the proportions the deployed application uses: Home (the gap, its method, the seeded chips), Ask (one claim a line, a citation on each), Coverage Console (the three bands, the threshold control). Placement note: it is a drawing of the layout, never a screen capture, because every real surface renders the organiser's corpus and no raster figure may enter the deck. The five identifier lines sit as a definition list at the foot; the wordmark and the tagline own the top third and are left to breathe.

---

## SLIDE 2. BACKGROUND & PROBLEM STATEMENT

**Judul:** Background & Problem Statement

**Teks slide:**
Of the 57 work orders recording an unplanned failure on these 8 assets, 14 match no same-asset lesson at all, and 41 carry nothing beyond a copied row. The method travels with the number on every surface that shows it: t = 0.62, both layers, window 2n, recomputed on every corpus version. The threshold is a control on the Coverage Console, not a claim.

The record also damages itself, and it does so in ways a person cannot see by reading one document at a time. 47 work orders reproduce a narrative field verbatim inside a lesson of their own asset: the row is reprinted, nothing is taught. Seven lessons a set, exactly 4 days apart, on all eight assets: an authoring cadence, not a plant's, and the supplied corpus is synthetic. Beneath that sit the governance traps: 28 lessons name another asset on their cross-reference line, 6 cause-and-effect sheets carry no drawing number, 8 planned jobs are flagged as a breakdown, and 26 closeouts of 211 rows leave the outcome fields empty.

This is what an engineer needs at start-up, in troubleshooting, in maintenance and in abnormal operation; the case names improper execution as the risk.

**Visual:** `figures/bands.svg` (1, kolom kiri, besar, dominan). The three coverage bands over the unplanned-failure population at the frozen threshold: 14 no lesson at all, 27 copied row only, 16 taught by a lesson, each bar length computed from the fixture value printed beside it, so a bar cannot disagree with its number. `figures/traps.svg` (1, kolom kanan, penuh). New figure: the six counted findings (47, 4, 28, 6, 8, 26) plus the Integrity Register total of 174, each row naming the rule that produced it. Placement note: the method chip (t = 0.62, both layers, window 2n) sits directly under the headline sentence, never in a footnote.

---

## SLIDE 3. SOLUTION

**Judul:** Solution

**Teks slide:**
One versioned corpus, one cited answer, one measured account of what the records never taught.

KQ1. Versioned, offline ingestion of every controlled document into typed packages keyed on the equipment tag; edges from the documents' own cross-references, never inferred.

KQ2. Ask in natural language, receive an evidence packet: claims cited to approved revisions, numerals only from typed fields, procedures verbatim under hash. Safety intent is classified in deterministic code before any model call, so a request to defeat a protective function is refused with the governing sheet, its LOGIC line and SIL, the documented start permissives, the latched-reset note and the permit route, while a documented bypass is served verbatim rather than paraphrased.

KQ3. It reads what operations already produce and drafts the missing lesson into the plant's own approval chain. Continues on slide 4.

Key technologies: typed asset graph; one gateway module with per-role pins, a per-role token budget and a daily spend cap; gates G1 to G3; the rule pack as data; the evaluation harness.

Organiser's own key: "Equipment-level maintenance history using Equipment Tag as the common key across datasets".

**Visual:** `figures/lanes.svg` (1, kolom kanan, besar). The workflow in three lanes, each closed by the gate that enforces it: lane 1 build (corpus versioned, extract and canonicalise with pdftotext -raw pinned, typed asset graph on the equipment tag, coverage recipe at t = 0.62 both layers) under G1; lane 2 answer (question classified by the rule pack before any call, retrieve spans from approved revisions only, compose claims, evidence packet with a citation on every claim) under G2; lane 3 self-healing (measure the gap, draft the lesson, review and redline, publish and recount) under G3. Placement note: the three KQ panels stack down the left column, one label each, so a judge can see the case book's three questions answered in the same reading order the booklet asks them.

---

## SLIDE 4. BUSINESS IMPACT

**Judul:** Business Impact

**Teks slide:**
Uncaptured-knowledge exposure, both layers, on this corpus. It is an exposure and not a saving: recorded downtime hours and recorded maintenance cost, from a column the workbook's own Explanation sheet labels a dummy value. It is what the work cost, not what a product recovers.

| Layer | Records | Breakdowns | Downtime | Recorded cost |
| --- | --- | --- | --- | --- |
| No lesson at all | 14 of 57 | 5 | 74.5 h | IDR 93,721,000 |
| Nothing taught | 41 of 57 | 14 | 146.0 h | IDR 198,418,000 |

Benefit model, every factor visible, over an 18-month window. Every factor that is not a fixture value is labelled ASSUMPTION at the point of use, and both ends of every range are printed, because a range with one end hidden is a forecast.

| Line | Arithmetic | Result |
| --- | --- | --- |
| B1 recurrence avoidance | exposure times r (0.14 to 0.62) times ASSUMPTION 30% | IDR 4.0 to 17.6 m |
| B2 engineer search time | ASSUMPTION 2 to 6 questions a shift times ASSUMPTION 6 to 12 min times 1,650 shifts times ASSUMPTION IDR 250,000/h, so 330 to 1,980 engineer-hours | IDR 82.5 to 495.0 m |
| B3 authoring effort | ASSUMPTION 6 less 1 h a lesson times the backlog (14 or 41), so 70 to 205 hours | IDR 17.5 to 51.3 m |
| B4 onboarding packs | qualitative, deliberately uncosted | not costed |
| **Benefit against cost of ownership** | IDR 104.0 to 563.8 m against IDR 105.0 to 132.5 m | 3.4 to 22.9 months |

KQ3 completes here: coverage is measured on the published method, the missing lesson is drafted from evidence, and the EDMS, AIMS and historian contracts are specified, not connected, so a pilot activates them without changing the product.

Success metrics are quoted as measured, not as hoped. The golden set stands at 19 of 102 cases, with 13 of 16 hard gates, against an acceptance target of 92 of 102 with every hard gate proved; that gap is published inside the product on the Evaluation page with the full failure list, and it is the honest measure of how far the answer lane is from the target. Day one, with every AI feature switched off, the Integrity Register already lists 174 findings against the document set, computed by rule and reproducible from the bundle.

**Visual:** `figures/debt.svg` (1, kolom kanan, besar). Knowledge debt per asset, eight rows ranked by the harness's composite over uncovered downtime, uncovered recorded cost, repeat-family share and incomplete closeouts: YD-2301 0.94 (42.0 h, IDR 44.9 m) leads, then KC-4501 0.55, GA-1201A 0.39, DC-3401A 0.30, CT-7801 0.30, FA-8901 0.22, LV-6701 0.14, EA-5601 0.12. `figures/kpis.svg` (1, bawah kolom kiri, lebar kolom). New figure: the measured numbers against their targets with the reds left in, golden set 19 of 102 against 92 of 102 and hard gates 13 of 16 against 16 of 16 both drawn in the defect colour, then determinism (4 of 50 cases changed verdict on a re-run, not met), browser suite 169 pass 0 fail, accessibility 0 serious and 0 critical over 20 pages, production smoke 7 of 7, pre-submit 13 checks 0 failing with 2 human-gated, and the four artefacts at 6,822,279 of 10,000,000 bytes. Placement note: the two tables are layout elements, not images; the coefficients behind the debt composite are labelled ASSUMPTION in the contract, in the fixture and on every surface that shows them, so the deck never presents them as a finding.

---

## SLIDE 5. FEASIBILITY & ROADMAP

**Judul:** Feasibility & Roadmap

**Teks slide:**
Read-only posture, no new process, and every claim paired with the claim it does not make.

Technical: one extractor, one canonical form, one frozen recipe; every model role on one pinned provider and model id through one gateway (ADR-001), with the verifier question-blind. Operational: no new process, because The Hub fills the Prepared box in the approval chain the plant already runs. Legal: corpus terms honoured, Law No. 27 of 2022 obligations met by role coding and metadata stripping, no safety claim and no conformity claim. Cybersecurity: a Purdue Level 3.5 replica, IEC 62443 zones and conduits, and no write path toward any control system anywhere in the product. Data governance: versioned corpus, provenance on every span, approval status on every citation. Organisational readiness: one coordinator at 0.2 FTE, one engineer for two half-days, one read-only export.

The roadmap is operator side, its durations are the team's own and are labelled ASSUMPTION, and each phase carries a gate a sponsor can refuse to pass on evidence the product itself displays. A. Pilot, one process unit (site corpus, vocabulary calibration, a coverage baseline, first drafts), 12 weeks, gate: coverage trending down on the published method, draft acceptance at target, no safety event attributable to the tool. B. Plant scale (all units on site, AIMS activated, a historian mirror from the replica), 2 to 3 quarters, gate: the operator's own integration security review signed off, zone and conduit boundaries included. C. Group scale (federation across sites, new and acquired ones, digital-twin deep links), tracks the operator, gate: per-site data-protection and security review, and a coverage baseline published per site before any federation.

The team's own build calendar is not the operator-side roadmap and is not drawn here.

**Visual:** `figures/arch.svg` (1, kolom kiri, besar). The read boundary drawn one way: Purdue Level 0 to 3 (control and safety systems, historian, EDMS, AIMS, the controlled document set) reads into Level 3.5 connector contracts marked "specified, not connected" and "no write path, anywhere", then into The Hub's own stack, the one gateway, gates G1 to G3, the separate draft store and the evaluation harness. `figures/readiness.svg` (1, lebar penuh, tengah). New figure: the six readiness dimensions the booklet names, each with what is ready and, beside it, what is deliberately not claimed. `figures/roadmap.svg` (1, lebar penuh, bawah). Phase, scope, duration with its ASSUMPTION marker, and the gate to advance. Placement note: the three figures stack, so the slide reads posture, then readiness, then time; the roadmap keeps the full sheet width because its gate column is the part a sponsor reads.

---

## SLIDE 6. CONCLUSION

**Judul:** Conclusion

**Teks slide:**
A cited answer at the moment of need, and a measured account of the knowledge the records never taught, falling as the plant's own chain publishes what was missing.

For the engineer: a trusted answer with its source, or an honest abstention with a named escalation. For the supervisor: a drafted lesson to review instead of a blank page. For the organisation: a measured account of what its records never taught, and a number that falls.

The loop is the expected outcome, and it closes in the product rather than in a slide: measure the gap (14 records with no lesson), draft from evidence into the six-section house template, open the REQUIRES ENGINEER INPUT slot the machine will not fill, the engineer signs it as a stored and dated SME note, the redline verdict comes back question-blind and never edits, gate G3 is taken by a human in the Manager role, the version increments in one transaction, coverage recounts on both layers at t = 0.62, and the same question is asked again and answered from a lesson that did not exist ten minutes earlier. Machine output lives in draft tables no retrieval query reads, and step 6 is the only path out of them.

The Hub that knows what it is missing.

**Visual:** `figures/loop.svg` (1, kolom kiri, besar, dominan). The nine steps of the self-healing loop with the gate drawn at step 6 and the gap smaller at step 9. Placement note: the three value panels (engineer, supervisor, organisation) sit down the right column under the lede, and the closing line takes the accent colour at the foot of that column; nothing else on the slide competes with it.

---

## SLIDE 7. TEAM PROFILE

**Judul:** Team Profile

**Teks slide:**
Team: 3V. University: Politeknik Negeri Bandung.
Faculty supervisor: as registered with the CALIBER 2026 Committee.

| No. | Name | Major | Semester | Area of expertise | Contribution |
| --- | --- | --- | --- | --- | --- |
| 1 | Ghaisan Khoirul Badruzaman | D4 Teknik Informatika (Sarjana Terapan), Jurusan Teknik Komputer dan Informatika | 3 | System architecture, data method, build orchestration | Product architecture, the harness and the frozen coverage method, the provider decision in ADR-001, the PRD, the deck and the video, correspondence with the Committee, final integration and the submission |
| 2 | Hafiz Fauzan Syafrudin | D4 Teknik Informatika (Sarjana Terapan), Jurusan Teknik Komputer dan Informatika | 3 | Data engineering and evaluation | Ingestion pipeline and versioned packages, extraction review, the golden set and the evaluation harness, coverage labelling, the drafting path and the two drafts the video shows |
| 3 | Elang Permadi Lau | D4 Teknik Informatika (Sarjana Terapan), Jurusan Teknik Komputer dan Informatika | 3 | Application engineering and delivery | The product surfaces and the guided loop route, deployment, availability and the nightly reset, the Evaluation page, the seeded demo data, the export and the screen capture |

The supervisor's name is withheld here at the team's request; it is on file with the Committee from registration. Every other cell above is printed from the team record at build time.

**Visual:** none beyond the table. Placement note: the team and university line sits in a panel above the table, the supervisor line immediately under it, and the six mandated column headings (No., Name, Major, Semester, Area of expertise, Contribution) stay verbatim and case-sensitive, because the pre-submit check matches them that way. No photograph, no logo strip, no decorative panel.

**Catatan placeholder (state of `supplied/team-facts.json`, read-only).** Still carrying a `TBD_` marker: `TBD_SUPERVISOR_NAME` and `TBD_SUPERVISOR_TITLE` (replaced on the slide by the fixed labelled line above, per deviation D-08, and recorded as a compliance risk in the Report rather than hidden); `TBD_SEMESTER` on all three members (deviation D-08 fixes the semester at 3 for all three and `deck/build.ts` applies that decision in the open at build time, printing it in the build log, because `supplied/` is read-only, so the built PDF prints 3 while the facts file still shows the marker); `TBD_FINAL_WINDOW` and `TBD_REGISTRATION_DATE` (dropped from the deliverable path by D-08, so no slide reads them). The team string is `3V`, exactly as registered. No name, major, area or contribution in the table above was invented: every one of those cells is the facts file's own string.

---

## LAMPIRAN DECK (A1 to A9, appendix slides, unlimited by the booklet, evidence only)

| Slide | Judul | What it carries | Visual |
| --- | --- | --- | --- |
| A1 | Compliance map, and the three answers in full | The three Key Questions and the six Expected Solution components against modules M1 to M7, plus the KQ1, KQ2 and KQ3 sentences in full, the ones slides 3 and 4 compress under the same labels | `figures/heatmap.svg` (1, kolom kiri): one hatched cell, ES5, the single honest partial, shipping as read-only connector contracts plus the operational-context layer rather than as a connection |
| A2 | The five guarantees, and the gate that enforces each | No number is generated (G1, schema, numeric fidelity over the golden set); procedures are never paraphrased (content hash on the stored text); provenance or nothing (G2 plus the question-blind verifier AG-4); drafts are physically separate (G3, schema); safety intent is classified in code before any model call (the versioned rule pack, as data) | table, elemen layout |
| A3 | Outcome KPIs, and the evaluation set | The freeze criteria against their pilot targets, the business KPIs with their baseline on this corpus, and the golden set by category: Grounded answering 14, Traceability 8, Abstention 9, False abstention 11, Safety refusal 11, Safety-adjacent served 5, Adversarial phrasing 10, Trap integrity 19, Operational context 3, Moment-shaped answers 4, Loop 8, total 102 of which 16 hard-gated | two tables, elemen layout |
| A4 | Data sources beyond the baseline | None in the MVP: the build adds no data source to the supplied corpus at all, and each of the six candidates (historian mirror, capture at job close, digital-twin deep links, EDMS registry sync, published company facts, ISO 30401 framing) carries its phase and a one-line business justification | table, elemen layout |
| A5 | AI-tool usage, and how the work was validated | What a model did in the build and what it never did, one provider and one model id for every role in the product through one gateway, and the four-layer validation loop (deterministic checks, fresh-context review, independence stated honestly, human acceptance) | two panels plus a table, elemen layout |
| A6 | Readiness detail: legal, cybersecurity, data governance | Corpus terms, personal data, the safety claim that is not made, network posture, access and identity, data governance, and inference locality as a named gate before any site corpus | table, elemen layout |
| A7 | Reproduction | The harness command (`uv sync --frozen`, `make fixtures`, `make test`, `make bundle`), the pinned inputs (extractor pdftotext -raw 26.02.0, canonical form 1, corpus digest 918706e41dad6323, bundle 1.0.6, recipe digest 964d739cea9a2a09, t = 0.62 window 2n both layers) and a fixture excerpt as the deck reads it | code blocks plus a table, elemen layout |
| A8 | Capability matrix, stated honestly | ES1, ES2, ES3, ES4 and ES6 built; ES5 partial (specified, not connected); live model calls not used on the demo path; a verifier on a second provider family not built; the row "Prediction, alerting, work assignment" marked out of scope; narration on the video human-gated | table with state chips, elemen layout |
| A9 | External facts, with citations and access dates | The seven claims that reach outside the corpus, each with its source and the date it was re-checked (2026-08-27); a claim whose source could not be re-verified was dropped rather than softened | table, elemen layout |

Optional tenth appendix slide, only if the room is technical: `docs/architecture.svg` (1, lebar penuh) as "The three lanes over the three repositories", which is the README's own figure and carries the repository split (`thehub-corpus` private, `thehub-harness` public reference implementation, `thehub-3v` public application) plus the deploy-key and bundle arrows between them. Do not add it to the 7 content slides.

---

### Fakta terkunci (sumber tiap angka, pakai persis, jangan digeser)

- Corpus: 98 controlled files, 8 classes, 8 equipment tags, 56 lessons parsed, 211 workbook rows, corpus digest `918706e41dad6323` (the cover and the slide 2 kicker print its first eight characters, `918706e4`), bundle `1.0.6`, recipe digest `964d739cea9a2a09`. Source: `bundle/fixtures.json` `inventory.files_total`, `inventory.by_class`, `equipment_master`, `lessons.n`, `workbook.rows`, `inventory.corpus_sha256`, `bundle/manifest.json` `bundle_version`, `method.recipe_sha256`.
- Population of every coverage figure: 57 work orders recording an unplanned failure. Source: `populations.unplanned_failure`.
- Coverage at the frozen threshold t = 0.62, both layers, window 2n: 14 of 57 with no lesson at all (generous layer), 41 of 57 with nothing beyond a copied row (strict layer). Bands over the same population: 14 no lesson, 27 copied row only, 16 taught. Source: `coverage.generous.unplanned_failure[t=0.62]`, `coverage.strict.unplanned_failure[t=0.62]`, `coverage.bands.unplanned_failure[t=0.62]`.
- Exposure, generous layer: 5 breakdowns, 74.5 h, IDR 93,721,000. Strict layer: 14 breakdowns, 146.0 h, IDR 198,418,000. It is an exposure and not a saving, and the cost column is a value the workbook's own Explanation sheet labels a dummy. Source: the same two coverage keys, fields `breakdowns`, `downtime_h`, `cost_idr`.
- Record damage and governance traps: 47 (`verbatim.any_field`), 4 days (`dates.within_set_gap_d`), 28 (`integrity.CD-1.count`), 6 (`integrity.CD-2.count`), 8 (`populations.planned_flagged`), 26 of 211 (`workbook.incomplete.rows`, `workbook.rows`), 174 total (`integrity.total`).
- Knowledge debt, eight assets: YD-2301 0.94 / 42.0 h / IDR 44.9 m, KC-4501 0.55 / 16.0 h / IDR 20.2 m, GA-1201A 0.39 / 6.5 h / IDR 12.6 m, DC-3401A 0.30 / 0.0 h / IDR 13.4 m, CT-7801 0.30 / 10.0 h / IDR 16.5 m, FA-8901 0.22, LV-6701 0.14, EA-5601 0.12. The coefficients are labelled ASSUMPTION, never a finding. Source: `debt.per_asset`.
- Repeat-family share r, used in B1: 0.14 (DC-3401A) to 0.62 (KC-4501). Source: `families.r_by_tag`.
- Causal links between failure records: 18 across the record, 4 of them on GA-1201A, each carrying the verbatim sentence that links it, stated as a basis and never as a claim of cause. Source: `chains.links`, `chains.by_tag.GA-1201A`.
- Golden set: 102 cases across eleven categories, 16 hard-gated. Last complete two-tier run of record, recorded 2026-09-13 against corpus version `cv-1.0.6-e2dcecac9750`: 19 of 102 pass, 13 of 16 hard gates (tier A 14 of 50 with 13 of 15, tier B 5 of 52 with 0 of 1). Acceptance target: 92 of 102 with every hard gate proved. Source: `golden.size`, `golden.hard_gate_count`, `evaluation/last-run.json`, README "The numbers", Report sections 1 and 3.
- Determinism: the same lane run twice on one runner against one seeded database gave identical verdicts on all 15 hard-gated cases and on every check that reads the gates and the retrieval, with 11 cases differing only in the checks that read the composer's reply and 4 of those changing verdict. The criterion is not met and says so. Source: Report section 3.
- Deployment evidence: production smoke 7 of 7; browser suite 169 passed, 0 failed, 11 skipped with every skip stating its reason; accessibility audit reporting no serious or critical violation on any of the 20 pages it audits; the loop run end to end on the deployment through a published lesson and a rolled corpus version. Source: Report section 3.
- Submission: `TheHub_deck.pdf` 704,908 bytes of 2,000,000; `TheHub_demo.mp4` 4,128,927 of 5,000,000; `TheHub_prototype.html` 1,861,208 of 2,000,000; `TheHub_README.pdf` 127,336 of 150,000; the four together 6,822,279 of 10,000,000, buffer unspent; pre-submit 13 checks, 0 failing, 2 human-gated remainders. Source: Report section 8.
- Benefit model (the only arithmetic on any slide, every factor visible, each assumption labelled at the point of use): B1 IDR 4.0 to 17.6 m, B2 IDR 82.5 to 495.0 m, B3 IDR 17.5 to 51.3 m, B4 not costed, benefit IDR 104.0 to 563.8 m against cost of ownership IDR 105.0 to 132.5 m, 3.4 to 22.9 months over an 18-month window. Source: the deck's own value model, recomputed by a test from the fixture and its labelled assumptions.
- Fixed wordings that are never retyped or improvised on any surface: "an exposure and not a saving", "specified, not connected", "machine-drafted", "REQUIRES ENGINEER INPUT", "as registered with the CALIBER 2026 Committee", the as-built caveat and the `SIMULATED` label. They live in `src/lib/fixed-strings.ts` and `scripts/audits/fixed-wordings.sh` checks them.

### Jawaban pertanyaan tersulit (ringkas; versi panjang: Report, README, appendix A5, A6, A8)

1. **"Your golden set passes 19 of 102. Why should anyone trust the product?"** Because the guarantees are not carried by the pass rate. They are carried by schema, gate, hash and versioned data: a numeral with no typed source is dropped, a procedure whose hash moved is blocked rather than summarised, a claim whose span does not resolve is deleted, and an answer with nothing left is an abstention with a named escalation. The pass rate measures how often the answer lane meets an expectation written before it was built, it is published in-product with the full failure list, and it is 19 of 102 with 13 of 16 hard gates today against a target of 92 of 102. A build that hid that number would be the one to distrust.
2. **"Then why publish a failing number at all?"** The evaluation set was written from the case's own expectations before the lane was measured, and no case has been edited to move a number. Twenty root causes were ranked, four readers took one failure class each and proved every case against the deployment and its stored traces, and six expectations were found unreachable as written and recorded as findings about those cases rather than chased. The failures are a work list, not a mood.
3. **"Is the coverage figure a business case?"** No. It is an exposure and not a saving: recorded downtime hours and recorded maintenance cost, taken from a column the workbook's own Explanation sheet labels a dummy value. The benefit model is a separate block, every factor visible and each assumption labelled ASSUMPTION at the point of use, and both ends of every range are printed.
4. **"Is t = 0.62 arbitrary?"** It is frozen, published and reproducible: the recipe text, its SHA-256, the tokeniser, the stop list and its SHA-256 all ship in the fixture, both layers are always published together, and the fixture carries the same counts at t = 0.50, 0.55, 0.60, 0.65, 0.70 and 0.75 so a reader can see the shape of the curve. On the Coverage Console the threshold is a control the reader moves, not a claim the deck makes.
5. **"The corpus is synthetic. What does that prove?"** The method, which is the transferable part. Seven lessons a set exactly 4 days apart is an authoring cadence, the deck says so, and the caveat travels with every value. The pipeline, the recipe, the gates and the loop run on whatever controlled document set a site exports, and the pilot phase begins by recomputing the same baseline on the site's own corpus.
6. **"Your verifier runs on the same provider as the composer."** Stated, not implied away: one provider and one model id by owner decision, recorded in ADR-001. Independence here is a separate question-blind prompt (the verifier never sees the question and never edits) plus the six deterministic gate checks, the hash rendering, the typed-numeral rule and the isolated draft store, none of which depend on the verifier's family. It is on the Evaluation page and in appendix A5 as well as here.
7. **"Could it ever touch the plant?"** No write path toward any control system exists anywhere in the codebase, in any environment: no driver, no credential, no network route. Every specified operational read is taken from a Purdue Level 3.5 replica, the connector contracts are read-only and marked specified, not connected, and no connector is ever drawn as live. It is not a control system and it makes no safety claim and no conformity claim against any standard named anywhere in the deck.
8. **"Where are the screenshots, and why is the demo behind a login?"** Both come from the same rule: the corpus is the organiser's property. It is used for this entry only, never committed to a public repository, never served in bulk, one page at a time to an authenticated role, with the deployment unlisted and carrying a no-index directive. The offline export is the way to see the product without an account. The deck's figures are drawn layouts for the same reason, and no raster figure is allowed in the deck at all.
9. **"Your P&ID pages have no text layer. What did you do?"** The eight P&IDs are image drawings, and the sidecars beside them are agent transcription pending review, disclosed as exactly that on every one of them and never presented as extracted text. The hotspots resolve to the tag card without the sheet drawn behind them, which is written into the honest-limits list rather than left for a judge to find.
10. **"Is this the Case 2 product with a different name?"** No. Case 1 only. Nothing here forecasts a failure, ranks anything by urgency, assigns work, or aggregates anything by person; the row that names those capabilities sits in the capability matrix under "out of scope", and the rule is enforced by a grep over every deliverable, not by good intentions.
11. **"Why is the supervisor's name missing from slide 7?"** Deviation D-08: the name is withheld at the team's request and the slide carries the labelled line "as registered with the CALIBER 2026 Committee" instead. It is on file with the Committee from registration, and the Report records it as a compliance risk rather than hiding it.
12. **"How much of this was written by a model?"** Disclosed in full on appendix A5 and in `docs/DISCLOSURE-AI.md`: the three repositories were built by an orchestrated run directed by the team lead; the model wrote code, documentation, the deck source and the report, and it never saw a secret, never published a lesson and never typed a number onto a surface. Inside the product every model role runs through one gateway module, safety intent is classified in deterministic code before any model call, and only a human in the Manager role publishes, through gate G3, in one transaction.
