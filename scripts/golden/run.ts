// The golden runner (blueprint 9.11, 11.7 AC-EVAL-02, 04, 07; ARCHITECTURE 12 track T6).
//
//   pnpm golden:a                       Tier A against BASE_URL
//   pnpm golden:b                       Tier B live (the gateway calls the provider)
//   pnpm golden:b:replay                Tier B with the gateway serving recordings/ (9.16)
//   pnpm golden:a --ids GS-09,GS-10     a named subset
//   pnpm golden:a --out .golden         where the JSON report and the Markdown summary are written
//   pnpm golden:a --ingest              POST the report to /api/evaluation/runs under CI_INGEST_TOKEN
//   pnpm golden:b --ingest --ingest-url https://...   run here, ingest there (Tier B live ingests into production)
//
// One case is one POST /api/ask under the case's role (Engineer by default), read as the two-line NDJSON stream of
// 9.8. The runner then evaluates the case's `expected` block and every check of `checks` through the modules under
// ./checks, and writes { run, results } plus a per-category Markdown summary with the two hard-gated categories
// first. The exit status is non-zero when a hard-gated case fails or is skipped: a skipped hard gate is a gate that
// was not proved, which must not read as a pass (AC-EVAL-04, 16 of 16).
//
// What the runner never does: print a question, a claim sentence or a span (a failure names the check, the field
// path and counts), print a password or an environment value, or turn a check it cannot evaluate into a pass.
//
// Replay: RECORD_MODE and RECORD_DIR are read by the gateway inside the running application, not by this process,
// so `golden:b:replay` only has an effect when the application under BASE_URL was started with them set. The
// runner says so once at the start of a replay run rather than reporting green against a live provider.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { ROLE_TABLE, TASKS } from "../../src/gateway/config";
import { seededVersionFromBundle } from "../../src/lib/version-id";
import { packVersion } from "../../src/rulepack";
import { auditReader } from "./audit";
import { casesPath, loadCases, select, type Case, type Tier } from "./cases";
import { ask, health, login, readTrace, LoginFailed, type Role } from "./client";
import { runCheck, type CheckContext } from "./checks";
import { resolves } from "./checks/citation_resolves";
import { evaluationPayload, write, type Failure, type Report, type Result, type Run } from "./report";
import { citationsOf, citedDocuments, renderedNumerals, textAt, type Answer } from "./view";

const ROOT = path.resolve(import.meta.dirname, "..", "..");
const ASK_ROUTE = "POST /api/ask";

type Options = { tier: Tier; ids: string[] | null; baseUrl: string; out: string; ingest: boolean; ingestUrl: string; casesFile: string };

function parseArgs(argv: string[]): Options {
  const value = (flag: string): string | null => {
    const at = argv.indexOf(flag);
    return at === -1 ? null : (argv[at + 1] ?? null);
  };
  const tier = (value("--tier") ?? "all") as Tier;
  if (tier !== "A" && tier !== "B" && tier !== "all") throw new Error(`--tier must be A, B or all, not ${tier}`);
  const ids = value("--ids");
  return {
    tier,
    ids: ids === null ? null : ids.split(",").map((s) => s.trim()).filter((s) => s.length > 0),
    baseUrl: (value("--base-url") ?? process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, ""),
    out: value("--out") ?? path.join(ROOT, ".golden"),
    ingest: argv.includes("--ingest"),
    ingestUrl: (value("--ingest-url") ?? value("--base-url") ?? process.env.BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, ""),
    casesFile: value("--cases") ?? casesPath(ROOT),
  };
}

function gitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim();
  } catch {
    return "";
  }
}

function pins(): { model_ids: Record<string, string>; prompt_versions: Record<string, string> } {
  const model_ids: Record<string, string> = {};
  const prompt_versions: Record<string, string> = {};
  for (const task of TASKS) {
    const cfg = ROLE_TABLE[task];
    model_ids[cfg.role] = cfg.model_id;
    if (cfg.prompt_version !== null) prompt_versions[cfg.role] = cfg.prompt_version;
  }
  return { model_ids, prompt_versions };
}

function harnessCommit(): string {
  try {
    const manifest: unknown = JSON.parse(readFileSync(path.join(ROOT, "bundle", "manifest.json"), "utf8"));
    const commit = (manifest as { harness_commit?: unknown }).harness_commit;
    return typeof commit === "string" ? commit : "";
  } catch {
    return "";
  }
}

// The `expected` block of 9.11, evaluated beside the checks. must_contain and must_not_contain read the whole
// rendered packet (claims, typed facts, blocks, procedure, refusal, abstention and the declared gaps): a case such
// as GS-01 pins effect ids that render in blocks.effects, so a narrower reading would fail a correct answer.
function evaluateExpected(goldenCase: Case, answer: Answer, corpusVersion: string): Failure[] {
  const failures: Failure[] = [];
  const packet = answer.packet;
  const expected = goldenCase.expected;
  if (!packet) return [{ check: "expected.outcome", detail: "no packet was streamed" }];

  if (packet.outcome !== expected.outcome) {
    failures.push({ check: "expected.outcome", detail: `outcome ${packet.outcome}, expected ${expected.outcome}` });
  }

  const rendered = textAt(answer, "packet") ?? "";
  const documents = citedDocuments(packet, answer.citations);
  const notCited = expected.must_cite.filter((doc) => !resolves(documents, doc));
  if (notCited.length > 0) {
    failures.push({ check: "expected.must_cite", detail: `not cited: ${notCited.join(", ")}` });
  }

  const absent = expected.must_contain.filter((s) => !rendered.includes(s));
  if (absent.length > 0) {
    failures.push({ check: "expected.must_contain", detail: `${absent.length} of ${expected.must_contain.length} expected strings absent` });
  }
  const forbidden = expected.must_not_contain.filter((s) => rendered.includes(s));
  if (forbidden.length > 0) {
    failures.push({ check: "expected.must_not_contain", detail: `${forbidden.length} forbidden string(s) present` });
  }

  const accounted = (numeral: string): boolean =>
    expected.numerals_allowed.some((entry) => entry.value === numeral || entry.unit.includes(numeral));
  const loose = [...new Set(renderedNumerals(packet).filter((n) => !accounted(n.numeral)).map((n) => `${n.numeral} in ${n.where}`))];
  if (loose.length > 0) {
    failures.push({ check: "expected.numerals_allowed", detail: `outside the allowed set: ${loose.slice(0, 8).join("; ")}` });
  }

  if (expected.block_order) {
    const kinds: string[] = packet.blocks.map((b) => b.kind);
    let at = 0;
    for (const kind of expected.block_order) {
      const found = kinds.indexOf(kind, at);
      if (found === -1) {
        failures.push({ check: "expected.block_order", detail: `${kind} absent or out of order (rendered: ${kinds.join(", ") || "none"})` });
        break;
      }
      at = found + 1;
    }
  }

  if (expected.escalation_role !== undefined) {
    const seen = packet.abstention?.escalation_role ?? null;
    if (seen !== expected.escalation_role) {
      failures.push({ check: "expected.escalation_role", detail: `escalation role ${seen ?? "none"}, expected ${expected.escalation_role}` });
    }
  }

  if (expected.rulepack_class !== undefined && packet.rulepack.class !== expected.rulepack_class) {
    failures.push({ check: "expected.rulepack_class", detail: `class ${packet.rulepack.class}, expected ${expected.rulepack_class}` });
  }

  if (expected.corpus_version_delta === 0 && packet.corpus_version !== corpusVersion) {
    failures.push({ check: "expected.corpus_version_delta", detail: `corpus version ${packet.corpus_version}, expected ${corpusVersion}` });
  }

  return failures;
}

async function ingest(baseUrl: string, report: Report): Promise<void> {
  const token = process.env.CI_INGEST_TOKEN;
  if (!token) throw new Error("CI_INGEST_TOKEN is not set in the environment");
  const payload = evaluationPayload(report, seededVersionFromBundle(path.join(ROOT, "bundle")).id);
  const response = await fetch(`${baseUrl}/api/evaluation/runs`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
    body: JSON.stringify(payload),
  });
  if (response.status !== 200 && response.status !== 201) {
    throw new Error(`POST /api/evaluation/runs returned ${response.status}`);
  }
}

async function main(): Promise<number> {
  const options = parseArgs(process.argv.slice(2));
  const startedAt = new Date();
  const all = loadCases(options.casesFile);
  const chosen = select(all, options.tier, options.ids);
  if (chosen.length === 0) throw new Error(`no case matches --tier ${options.tier}${options.ids ? ` --ids ${options.ids.join(",")}` : ""}`);

  if (process.env.RECORD_MODE === "replay") {
    console.log("replay: the gateway reads RECORD_MODE and RECORD_DIR inside the application, so the instance under");
    console.log(`  ${options.baseUrl} must itself have been started with them; this process only sets them for itself.`);
  }

  const { corpus_version: corpusVersion } = await health(options.baseUrl);
  const readAudit = await auditReader();
  if (readAudit === null) console.log("no database in reach: every audit_event check will report unsupported");

  const sessions = new Map<Role, string>();
  const sessionFor = async (role: Role): Promise<string> => {
    const known = sessions.get(role);
    if (known) return known;
    const cookie = await login(options.baseUrl, role);
    sessions.set(role, cookie);
    return cookie;
  };

  const results: Result[] = [];
  const answers = new Map<string, Answer>();

  for (const goldenCase of chosen) {
    const base = {
      case_id: goldenCase.id,
      category: goldenCase.category,
      hard_gate: goldenCase.hard_gate,
      tier: goldenCase.tier,
      expected: goldenCase.expected.outcome,
      notes: [] as string[],
      unsupported: [] as Failure[],
    };

    // A setup names a state the case assumes (a published draft, a seeded fixture, an injected string). The runner
    // drives POST /api/ask alone, so it satisfies none of them and says so rather than running the case blind.
    if (goldenCase.input.setup) {
      results.push({ ...base, pass: false, verdict: "skipped", failures: [], skipped_reason: `setup not satisfied by the runner: ${goldenCase.input.setup}`, trace_id: null, latency_ms: 0, line1_ms: null });
      continue;
    }

    const wanted = goldenCase.input.role ?? "Engineer";
    if (wanted === "Admin") {
      results.push({ ...base, pass: false, verdict: "skipped", failures: [], skipped_reason: "Admin holds no ask right (9.9)", trace_id: null, latency_ms: 0, line1_ms: null });
      continue;
    }
    const role: Role = wanted;

    let cookie: string;
    try {
      cookie = await sessionFor(role);
    } catch (error) {
      const detail = error instanceof LoginFailed ? error.message : String(error);
      results.push({ ...base, pass: false, verdict: "skipped", failures: [], skipped_reason: detail, trace_id: null, latency_ms: 0, line1_ms: null });
      continue;
    }

    const asked = await ask(
      options.baseUrl,
      cookie,
      { question: goldenCase.input.question, ...(goldenCase.input.template ? { template: goldenCase.input.template } : {}) },
      goldenCase.id,
    );
    const trace = asked.trace_id ? await readTrace(options.baseUrl, cookie, asked.trace_id) : null;
    const answer: Answer = { packet: asked.packet, citations: asked.packet ? citationsOf(asked.packet) : [], trace };
    answers.set(goldenCase.id, answer);

    const failures: Failure[] = [];
    if (asked.error !== null) failures.push({ check: "ask", detail: asked.error });
    failures.push(...evaluateExpected(goldenCase, answer, corpusVersion));

    const context: CheckContext = {
      goldenCase,
      answer,
      status: asked.status,
      route: ASK_ROUTE,
      corpusVersion,
      audit: readAudit && asked.trace_id ? await readAudit(asked.trace_id) : null,
      earlier: answers,
    };
    for (const check of goldenCase.checks) {
      const verdict = runCheck(check, context);
      if (verdict.status === "fail") failures.push({ check: check.type, detail: verdict.detail });
      else if (verdict.status === "unsupported") base.unsupported.push({ check: check.type, detail: verdict.detail });
      else if (verdict.note) base.notes.push(`${check.type}: ${verdict.note}`);
    }

    results.push({
      ...base,
      pass: failures.length === 0,
      verdict: failures.length === 0 ? "pass" : "fail",
      failures,
      skipped_reason: null,
      trace_id: asked.trace_id,
      latency_ms: asked.latency_ms,
      line1_ms: asked.line1_ms,
    });
    const mark = failures.length === 0 ? "pass" : "FAIL";
    console.log(`${goldenCase.id} ${goldenCase.tier} ${goldenCase.hard_gate ? "gate " : "     "}${mark} line1 ${asked.line1_ms ?? "-"} ms total ${asked.latency_ms} ms${base.unsupported.length > 0 ? ` (${base.unsupported.length} not evaluated)` : ""}`);
  }

  const run: Run = {
    tier: options.tier,
    base_url: options.baseUrl,
    started_at: startedAt.toISOString(),
    finished_at: new Date().toISOString(),
    ...pins(),
    rulepack_version: packVersion,
    corpus_version: corpusVersion,
    harness_commit: harnessCommit(),
    git_sha: gitSha(),
  };
  const report: Report = { run, results };
  mkdirSync(options.out, { recursive: true });
  const suffix = options.tier.toLowerCase();
  const jsonPath = path.join(options.out, `golden-${suffix}.json`);
  const markdownPath = path.join(options.out, `golden-${suffix}.md`);
  write(report, jsonPath, markdownPath);
  console.log(`report ${jsonPath}`);
  console.log(`summary ${markdownPath}`);

  if (options.ingest) {
    await ingest(options.ingestUrl, report);
    console.log(`ingested into ${options.ingestUrl}/api/evaluation/runs`);
  }

  const hardFailed = results.filter((r) => r.hard_gate && r.verdict !== "pass");
  const passed = results.filter((r) => r.verdict === "pass").length;
  console.log(`${passed} of ${results.length} passed; hard gates ${results.filter((r) => r.hard_gate && r.verdict === "pass").length} of ${results.filter((r) => r.hard_gate).length}`);
  if (hardFailed.length > 0) {
    console.log(`hard-gated cases not passing: ${hardFailed.map((r) => `${r.case_id} (${r.verdict})`).join(", ")}`);
    return 1;
  }
  return 0;
}

main().then(
  (code) => {
    process.exitCode = code;
  },
  (error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  },
);
