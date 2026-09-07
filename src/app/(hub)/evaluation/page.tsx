// Surface 10, Evaluation (blueprint 6.2 surface 10, 6.3, 9.7, 9.11, 11.8 AC-EVAL-03 and AC-EVAL-04; register
// mechanism-visibility, 7.2). The latest ingested run with its model ids, prompt versions, rule-pack version,
// corpus version and harness commit; the per-category pass rates with the two hard-gated categories first; the full
// failure list with case ids and reasons; a category the run holds no case for stating so in the fixed sentence.
//
// AC-EVAL-03 binds this sheet twice, and both bindings live outside it. It renders only ingested runs: the rows come
// from evaluation_run and evaluation_result, which CI writes through POST /api/evaluation/runs under its own token.
// And it computes no pass rate of its own: the rate, the counts, the category order and the no-case sentence are all
// produced by src/db/queries/evaluation.ts, the same read GET /api/evaluation/latest serves, so the page and the
// route can never disagree. Everything below formats numbers it was handed.
import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { requireSession } from "@/auth/session";
import { DesignedState } from "@/components/DesignedState";
import { EmptyState } from "@/components/EmptyState";
import { GlassPanel } from "@/components/GlassPanel";
import { VersionBadge } from "@/components/VersionBadge";
import { cx } from "@/components/cx";
import { goldenFixture } from "@/db/queries/admin-view";
import {
  CATEGORIES,
  HARD_GATE_CATEGORIES,
  latestEvaluation,
  type EvaluationCategory,
  type EvaluationLatest,
} from "@/db/queries/evaluation";
import { versionLabel, type VersionLabel } from "@/db/queries/failures";
import { log } from "@/lib/log";
import "@/components/system.css";

export const metadata: Metadata = { title: "Evaluation" };

// The latest run is read at request time, so an ingestion is visible on the next render.
export const dynamic = "force-dynamic";

const ROUTE = "/evaluation";
const INGEST_ROUTE = "/api/evaluation/runs";
const HASH_PREFIX = 12;
const DIGEST_PREFIX = 8;

const stagger = (i: number) => ({ "--i": i }) as CSSProperties;
const count = (n: number): string => n.toLocaleString("en-US");
const rate = new Intl.NumberFormat("en-US", { style: "percent", maximumFractionDigits: 1 });

const stamp = (iso: string): string => {
  const at = new Date(iso);
  return Number.isNaN(at.getTime()) ? iso : `${at.toISOString().slice(0, 19).replace("T", " ")}Z`;
};

const VERDICT_TONE = { pass: "bg-verified", fail: "bg-defect", skipped: "bg-ink-500/40" } as const;
const VERDICT_INK: Record<string, string> = { pass: "text-verified", fail: "text-defect", skipped: "text-ink-500" };

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="eyebrow">{label}</p>
      <p className="mono mt-1 text-[13px] leading-snug break-all text-ink-900">{children}</p>
    </div>
  );
}

/**
 * One category as the read handed it over: the counts of its three verdicts drawn to scale on one track, the rate
 * beside them, and the fixed sentence where the run held no case. A hard-gated category is drawn in the defect
 * token the moment a case of it is anything but a pass, because one such case blocks a release (AC-EVAL-04).
 */
function CategoryRow({ row }: { row: EvaluationCategory }) {
  const blocked = row.hard_gate && row.cases > 0 && row.passed !== row.cases;
  const segments = (
    [
      ["pass", row.passed],
      ["fail", row.failed],
      ["skipped", row.skipped],
    ] as const
  ).filter(([, n]) => n > 0);

  return (
    <li
      className="grid grid-cols-[minmax(0,17rem)_minmax(0,1fr)_auto] items-center gap-x-5 gap-y-2 border-b border-edge/70 py-3 last:border-b-0 max-lg:grid-cols-1"
      data-category={row.category}
      data-hard-gate={row.hard_gate ? "" : undefined}
    >
      <h3 className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-[15px]">
        {row.category}
        {row.hard_gate ? (
          <span className="badge" data-tone={blocked ? "defect" : "verified"}>
            hard gate
          </span>
        ) : null}
      </h3>

      {row.no_cases === null ? (
        <div
          className="flex h-[14px] w-full min-w-[8rem] overflow-hidden rounded-[3px] bg-paper-deep shadow-[inset_0_0_0_1px_var(--film-edge)]"
          role="img"
          aria-label={`${row.passed} of ${row.cases} cases pass, ${row.failed} fail, ${row.skipped} skipped`}
        >
          {segments.map(([verdict, n]) => (
            <span
              key={verdict}
              className={cx("h-full", VERDICT_TONE[verdict])}
              style={{ width: `${(n / row.cases) * 100}%` }}
              title={`${n} ${verdict}`}
            />
          ))}
        </div>
      ) : (
        <p className="text-[12.5px] text-ink-500">{row.no_cases}</p>
      )}

      <p className="mono text-[12.5px] whitespace-nowrap text-ink-700">
        {row.no_cases === null ? (
          <>
            <span className="font-medium text-ink-900">{count(row.passed)}</span> of {count(row.cases)}
            {row.failed > 0 ? <span className="text-defect">, {count(row.failed)} fail</span> : null}
            {row.skipped > 0 ? <span className="text-ink-500">, {count(row.skipped)} skipped</span> : null}
            {row.pass_rate === null ? null : <span className="ml-2 text-ink-500">{rate.format(row.pass_rate)}</span>}
          </>
        ) : (
          <span className="text-ink-500">no case</span>
        )}
      </p>
    </li>
  );
}

function Run({ latest, version }: { latest: EvaluationLatest; version: VersionLabel | null }) {
  const { run, categories, failures } = latest;
  const cases = categories.reduce((n, c) => n + c.cases, 0);
  const passed = categories.reduce((n, c) => n + c.passed, 0);
  const hard = categories.filter((c) => c.hard_gate);
  const hardCases = hard.reduce((n, c) => n + c.cases, 0);
  const hardPassed = hard.reduce((n, c) => n + c.passed, 0);
  const empty = categories.filter((c) => c.no_cases !== null);

  return (
    <>
      {/* The pins: what this run was, exactly, so its result can be reproduced. */}
      <GlassPanel className="rise p-6" aria-labelledby="pins-heading" data-component="run-pins">
        <div className="blockhead">
          <h2 id="pins-heading" className="text-[20px]">
            The run
          </h2>
          <span className="text-[12px] text-ink-500">
            ingested by {run.ingested_by}, tier {run.tier}
          </span>
        </div>
        <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Run id">{run.id}</Field>
          <Field label="Harness commit">{run.harness_commit.slice(0, HASH_PREFIX)}</Field>
          <Field label="Rule-pack version">{run.rulepack_version}</Field>
          <Field label="Corpus version">
            {version === null ? run.corpus_version_id : version.label}{" "}
            <span className="text-ink-500">{run.corpus_version_id}</span>
          </Field>
          <Field label="Started">{stamp(run.started_at)}</Field>
          <Field label="Finished">{stamp(run.finished_at)}</Field>
        </div>

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="eyebrow">Model ids</p>
            <table className="reg mt-2">
              <caption className="sr-only">The model id each role ran on</caption>
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">Model id</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(run.model_pins).map(([role, model]) => (
                  <tr key={role}>
                    <th scope="row" className="mono whitespace-nowrap font-medium text-ink-900">
                      {role}
                    </th>
                    <td className="mono text-[12px]">{model}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div>
            <p className="eyebrow">Prompt versions</p>
            <table className="reg mt-2">
              <caption className="sr-only">The prompt file version each role ran under</caption>
              <thead>
                <tr>
                  <th scope="col">Role</th>
                  <th scope="col">Prompt version</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(run.prompt_versions).map(([role, version_]) => (
                  <tr key={role}>
                    <th scope="row" className="mono whitespace-nowrap font-medium text-ink-900">
                      {role}
                    </th>
                    <td className="mono text-[11.5px] break-all">{version_.slice(0, HASH_PREFIX)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </GlassPanel>

      {/* The categories, hard-gated first. */}
      <section className="rise" style={stagger(2)} aria-labelledby="categories-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="categories-heading" className="text-[20px]">
            Categories
          </h2>
          <span className="mono text-[12.5px] text-ink-700">
            <span className="font-medium text-ink-900">{count(passed)}</span> of {count(cases)} cases pass;{" "}
            <span className="font-medium text-ink-900">{count(hardPassed)}</span> of {count(hardCases)} hard-gated
          </span>
        </div>
        <GlassPanel className="mt-4 p-5" aria-label="Per-category results">
          <p className="max-w-prose text-[12.5px] text-ink-700">
            Every category of the golden set is listed, in the frozen order, with the two hard-gated safety categories first
            because one case outside pass in either of them blocks a release. The track is drawn to the case counts of the run;
            the rate beside it is the one the read computed from those same rows.
          </p>
          <p className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12px] text-ink-700">
            {(["pass", "fail", "skipped"] as const).map((v) => (
              <span key={v} className="inline-flex items-center gap-1.5">
                <span className={cx("h-[12px] w-[10px] rounded-[2px]", VERDICT_TONE[v])} aria-hidden />
                {v}
              </span>
            ))}
            {empty.length > 0 ? (
              <span className="text-ink-500">
                {count(empty.length)} {empty.length === 1 ? "category holds" : "categories hold"} no case on this run and say so
              </span>
            ) : null}
          </p>
          <ol className="mt-3 m-0 list-none p-0">
            {categories.map((c) => (
              <CategoryRow key={c.category} row={c} />
            ))}
          </ol>
        </GlassPanel>
      </section>

      {/* Every case that did not pass, with its reason. */}
      <section id="failures" className="rise" style={stagger(3)} aria-labelledby="failures-heading">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h2 id="failures-heading" className="text-[20px]">
            Failures
          </h2>
          <span className="text-[12px] text-ink-500">every case of this run whose verdict is not pass, none summarised away</span>
        </div>
        {failures.length === 0 ? (
          <EmptyState
            className="mt-4"
            title="No case failed on this run"
            explanation="Every case the run carried returned the verdict it expected, and none was skipped. A case that failed would be listed here with its id, its category, what was expected and the reason the harness recorded."
          />
        ) : (
          <GlassPanel className="mt-4 p-5" aria-label="The failure list">
            <div className="overflow-x-auto">
              <table className="reg" data-component="failure-list">
                <caption className="sr-only">Every case whose verdict is not pass, with its category, expectation and recorded reason</caption>
                <thead>
                  <tr>
                    <th scope="col">Case</th>
                    <th scope="col">Category</th>
                    <th scope="col">Hard gate</th>
                    <th scope="col">Verdict</th>
                    <th scope="col">Expected</th>
                    <th scope="col">Reason recorded</th>
                  </tr>
                </thead>
                <tbody>
                  {failures.map((f) => (
                    <tr key={f.case_id} id={`case-${f.case_id}`}>
                      <th scope="row" className="mono whitespace-nowrap font-medium text-ink-900">
                        {f.case_id}
                      </th>
                      <td className="whitespace-nowrap text-[12.5px]">{f.category}</td>
                      <td className="whitespace-nowrap">
                        {f.hard_gate ? (
                          <span className="badge" data-tone="defect">
                            hard gate
                          </span>
                        ) : (
                          <span className="text-[12px] text-ink-500">no</span>
                        )}
                      </td>
                      <td className={cx("mono text-[12px] whitespace-nowrap", VERDICT_INK[f.verdict])}>{f.verdict}</td>
                      <td className="max-w-[34ch] text-[12.5px] leading-snug text-ink-700">{f.expected}</td>
                      <td className="max-w-[46ch] text-[12.5px] leading-snug">
                        {f.failure_reason === null ? (
                          <span className="text-ink-500">the run recorded no reason for this case</span>
                        ) : (
                          <span className="verbatim">{f.failure_reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </GlassPanel>
        )}
      </section>
    </>
  );
}

/** The designed state of 6.3 for a surface whose rows have not been written yet, with the set named beside it. */
function NoRun() {
  const golden = goldenFixture();
  const known = new Set<string>(CATEGORIES);
  const rows = golden === null ? [] : [...CATEGORIES.filter((c) => c in golden.by_category), ...Object.keys(golden.by_category).filter((c) => !known.has(c))];

  return (
    <div className="rise grid gap-4 xl:grid-cols-[minmax(0,30rem)_minmax(0,1fr)] xl:items-start">
      <DesignedState
        inline
        code="no run"
        title="No run has been ingested yet"
        explanation="This sheet renders ingested runs and nothing else. CI posts a finished run and one row per golden case to the ingestion route under its own token; until one arrives there is no pass rate to show, and none is put in its place."
        reason="evaluation_run: no row"
        next={{ href: "/coverage", label: "Coverage Console" }}
      >
        <p className="mt-4 max-w-prose text-[12.5px] text-ink-700">
          The route is <span className="mono">POST {INGEST_ROUTE}</span>, open to the CI principal alone; an unauthenticated post
          is rejected and audited. No account, Admin included, can post a result through a surface, and this page runs no case
          of its own.
        </p>
      </DesignedState>

      {golden === null ? (
        <EmptyState
          title="The golden set is not readable from this runtime"
          explanation="The category counts come from the harness fixture bundled with the build. This runtime cannot read that file, so the set is not described here rather than described from memory."
        />
      ) : (
        <GlassPanel className="p-6" aria-labelledby="golden-heading" data-component="golden-set">
          <div className="blockhead">
            <h2 id="golden-heading" className="text-[20px]">
              The set a run is measured against
            </h2>
            <span className="text-[12px] text-ink-500">read from the harness fixture, not from a run</span>
          </div>
          <p className="mt-2 max-w-prose text-[12.5px] text-ink-700">
            These are case counts, not results. Every case carries machine-checkable checks and its sources in the harness&rsquo;s
            golden file, and the hard-gated cases are the two safety categories: a regression in either of them blocks a
            release.
          </p>
          <div className="mt-5 grid gap-6 sm:grid-cols-3">
            <div>
              <p className="eyebrow">Cases in the set</p>
              <p className="mono mt-1 text-[38px] leading-none font-medium text-ink-900">{count(golden.size)}</p>
            </div>
            <div>
              <p className="eyebrow">Categories</p>
              <p className="mono mt-1 text-[38px] leading-none font-medium text-ink-900">{count(rows.length)}</p>
            </div>
            <div>
              <p className="eyebrow">Hard-gated cases</p>
              <p className="mono mt-1 text-[38px] leading-none font-medium text-ink-900">{count(golden.hard_gate_count)}</p>
            </div>
          </div>
          <table className="reg mt-5">
            <caption className="sr-only">The golden set&rsquo;s categories with the number of cases in each</caption>
            <thead>
              <tr>
                <th scope="col">Category</th>
                <th scope="col">Gate</th>
                <th scope="col" className="num">
                  Cases
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((name) => (
                <tr key={name}>
                  <th scope="row">{name}</th>
                  <td className="whitespace-nowrap">
                    {(HARD_GATE_CATEGORIES as readonly string[]).includes(name) ? (
                      <span className="badge" data-tone="caveat">
                        hard gate
                      </span>
                    ) : (
                      <span className="text-[12px] text-ink-500">soft</span>
                    )}
                  </td>
                  <td className="mono num">{count(golden.by_category[name] ?? 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </GlassPanel>
      )}
    </div>
  );
}

export default async function EvaluationPage() {
  await requireSession();

  let latest: EvaluationLatest | null;
  try {
    latest = await latestEvaluation();
  } catch (error) {
    log.error({ event: "evaluation.read_failed", route: ROUTE, message: error instanceof Error ? error.message : String(error) });
    return (
      <DesignedState
        code="503"
        tone="defect"
        title="The database did not answer"
        explanation="This sheet reads the latest ingested run and its per-case results at request time. The read failed, so no verdict is shown in their place."
        next={{ href: ROUTE, label: "Try again" }}
      />
    );
  }

  const version = latest === null ? null : await versionLabel(latest.run.corpus_version_id).catch(() => null);

  return (
    <div className="flex flex-col gap-8">
      <header className="rise flex flex-wrap items-end justify-between gap-4" style={stagger(0)}>
        <div>
          <h1 className="text-[34px]">Evaluation</h1>
          <p className="mt-1 max-w-prose text-[13.5px] text-ink-700">
            The honesty surface. It shows the latest run CI ingested, with the model ids, prompt versions, rule-pack version,
            corpus version and harness commit it ran under, every category&rsquo;s result and every case that did not pass with
            the reason the harness recorded. It scores nothing itself and hides no failure.
          </p>
        </div>
        {version ? <VersionBadge label={version.label} digestPrefix={version.corpus_sha256.slice(0, DIGEST_PREFIX)} active={version.is_active} /> : null}
      </header>

      {latest ? <Run latest={latest} version={version} /> : <NoRun />}

      <p className="rise max-w-prose text-[12px] text-ink-500" style={stagger(6)}>
        Verifier independence in this build is model and prompt independence inside one provider: the verifier runs its own
        prompt file and system role, never sees the question and never edits. The deterministic gates, the hash rendering, the
        typed-numeral rule and the isolated draft store carry the anti-fabrication guarantee and do not depend on the
        verifier&rsquo;s family. <Link href="/trace" className="draw">A single answer&rsquo;s trace</Link> replays the same
        evidence for one question.
      </p>
    </div>
  );
}
