// The log schema (AC-NFR-14) and the half of AC-NFR-11 the header tests cannot reach: "logs carry trace id, route,
// role alias and gate outcome and never a retrieved span or the question text except in the two safety events".
//
// Two halves, because a log has two ways of leaking. The first half reads real output: the exported logger's
// destination is swapped for a sink, the module's own emitters are called, and the JSON that comes out is asserted
// key by key, then handed to `scripts/audits/secret-scan.sh`, the one place the shape of a credential is defined
// (AC-NFR-20). A planted fake proves the audit is looking rather than passing an empty file.
//
// The second half reads the source, because redaction only covers the two key names it is given: `question` and
// `password` at one level of nesting. A retrieved span logged as `span`, `text` or `payload` would sail past it.
// So every `log.*({ ... })` call site in src/ is parsed and its keys are checked against the names that carry
// corpus text or a credential, and the five line families the criteria name are asserted to exist. Test files are
// excluded from that scan: the redaction cases below pass exactly the keys the scan forbids, on purpose.
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { log, logError, logRequest } from "./log";

type Line = Record<string, unknown>;

const root = process.cwd();
const emitted: Line[] = [];
const serialised: string[] = [];
const sink = {
  write(chunk: string): void {
    serialised.push(chunk);
    emitted.push(JSON.parse(chunk) as Line);
  },
};

// The destination lives on the logger under a pino symbol and is read at write time, so swapping it captures the
// real logger with its real options: base null, ISO time, the redaction paths, the level formatter.
const holder = log as unknown as Record<symbol, unknown>;
let previousStream: unknown;
let previousLevel: string;

beforeEach(() => {
  emitted.length = 0;
  serialised.length = 0;
  previousStream = holder[pino.symbols.streamSym];
  previousLevel = log.level;
  holder[pino.symbols.streamSym] = sink;
  log.level = "info"; // the unit project runs the logger at `silent` so a test run stays quiet
});

afterEach(() => {
  holder[pino.symbols.streamSym] = previousStream;
  log.level = previousLevel;
});

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

// Invented values, none of them real and none of them corpus text: a sentence that stands for a retrieved span,
// and three credentials assembled from split literals so this tracked file never carries the shape the audit
// looks for while the runtime string does.
const SPAN = "synthetic span text standing in for a retrieved corpus sentence";
const QUESTION = "synthetic question text that must never reach a log line";
const PLANTED_URL = "postgres" + "ql://hub_app:npg" + "_planted0000fake0000@ep-planted-fake-000000.aws.neon.tech/hub";
const PLANTED_VALUE = "planted0000fake0000value";

describe("the request line (AC-NFR-11, AC-NFR-14)", () => {
  it("is one JSON line carrying the request id, the route, the role alias and nothing else", () => {
    logRequest({
      request_id: "0f3b7a1e-2c4d-4a6b-8e10-9d5c3b2a1f00",
      route: "/api/ask",
      method: "POST",
      status: 200,
      role_alias: "ENG-DEMO",
      duration_ms: 42,
    });

    expect(serialised).toHaveLength(1);
    const text = serialised[0] as string;
    expect(text.endsWith("\n"), "a request writes one line").toBe(true);
    expect(text.trimEnd().includes("\n"), "and only one").toBe(false);

    const line = emitted[0] as Line;
    // base: null, so no pid and no hostname; the level as a label; the time as ISO.
    expect(Object.keys(line).sort()).toEqual(
      ["duration_ms", "event", "level", "method", "request_id", "role_alias", "route", "status", "time"].sort(),
    );
    expect(line.event).toBe("request");
    expect(line.level).toBe("info");
    expect(line.time).toMatch(ISO);
    expect(line.request_id).toBe("0f3b7a1e-2c4d-4a6b-8e10-9d5c3b2a1f00");
    expect(line.role_alias).toBe("ENG-DEMO");
    expect(line.status).toBe(200);
  });

  it("carries the trace id and the gate outcome when the route has them, and a null alias when there is no session", () => {
    logRequest({
      request_id: "req-2",
      route: "/api/health",
      method: "GET",
      status: 200,
      role_alias: null,
      duration_ms: 1,
      trace_id: "trace-2",
      gate_outcome: "seeded",
    });

    const line = emitted[0] as Line;
    expect(line.role_alias).toBeNull();
    expect(line.trace_id).toBe("trace-2");
    expect(line.gate_outcome).toBe("seeded");
  });
});

describe("the error line (AC-NFR-14: no stack toward a user, the stack in the log)", () => {
  it("keeps name, message and stack under err, with the request id and the route", () => {
    logError("req-3", "/api/drafts", new Error("the database refused the write"));

    const line = emitted[0] as Line;
    expect(line.event).toBe("error");
    expect(line.level).toBe("error");
    expect(line.request_id).toBe("req-3");
    expect(line.route).toBe("/api/drafts");
    const err = line.err as Record<string, unknown>;
    expect(err.name).toBe("Error");
    expect(err.message).toBe("the database refused the write");
    expect(typeof err.stack).toBe("string");
  });

  it("degrades a thrown non-Error to a message rather than dropping the event", () => {
    logError("req-4", "/api/search", "a string was thrown");
    // `err` is pino's error key, so what the module hands it goes through pino's error serializer: the message is
    // kept and the stack of a value that never had one comes out empty.
    const err = (emitted[0] as Line).err as Record<string, unknown>;
    expect(err).toMatchObject({ message: "a string was thrown", stack: "" });
    expect(err.name).toBeUndefined();
  });
});

describe("redaction (INV-1: provenance or nothing, never the question text)", () => {
  it("censors question and password at the top level and one level of nesting, and prints neither value", () => {
    log.info({
      event: "planted",
      question: QUESTION,
      password: PLANTED_VALUE,
      envelope: { question: QUESTION, password: PLANTED_VALUE, span: SPAN },
    });

    const text = serialised[0] as string;
    expect(text).not.toContain(QUESTION);
    expect(text).not.toContain(PLANTED_VALUE);
    const line = emitted[0] as Line;
    expect(line.question).toBe("[redacted]");
    expect(line.password).toBe("[redacted]");
    expect(line.envelope).toMatchObject({ question: "[redacted]", password: "[redacted]" });
    // The guard is two key names deep and no deeper: a span logged under another name is not censored, which is
    // why the source scan below forbids the names rather than trusting the censor.
    expect(text).toContain(SPAN);
  });
});

describe("no log line carries a credential (AC-NFR-20, one definition of the shapes)", () => {
  const audit = (file: string) =>
    spawnSync("bash", [path.join(root, "scripts", "audits", "secret-scan.sh"), file], { cwd: root, encoding: "utf8" });

  it("passes every line this file emitted through scripts/audits/secret-scan.sh, and reddens on a planted fake", () => {
    logRequest({ request_id: "req-5", route: "/api/ask", method: "POST", status: 200, role_alias: "MGR-DEMO", duration_ms: 7 });
    logError("req-5", "/api/ask", new Error("no credential belongs in an error message"));
    log.info({ event: "planted", password: PLANTED_VALUE, envelope: { password: PLANTED_URL } });

    const dir = mkdtempSync(path.join(os.tmpdir(), "thehub-log-secret-"));
    try {
      const clean = path.join(dir, "emitted.log");
      writeFileSync(clean, serialised.join(""));
      const green = audit(clean);
      expect(green.stdout + green.stderr).toContain("secret-scan: clean");
      expect(green.status).toBe(0);

      // The control: the same file with one credential-shaped line in it. Without this, a green run above would
      // only prove the audit read nothing.
      const planted = path.join(dir, "planted.log");
      writeFileSync(planted, `${serialised.join("")}{"event":"planted","url":"${PLANTED_URL}"}\n`);
      const red = audit(planted);
      expect(red.status).toBe(1);
      expect(red.stdout).toContain("the CONN shape matched");
      expect(red.stdout).not.toContain(PLANTED_URL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, 30_000);
});

// --- the source scan ----------------------------------------------------------------------------------------
// Every `log.<level>({ ... })` in src/, with the keys of its object literal. Test files are excluded: the cases
// above pass the forbidden keys on purpose.
type CallSite = { file: string; line: number; keys: string[] };

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

function callSites(): CallSite[] {
  const sites: CallSite[] = [];
  for (const file of sourceFiles(path.join(root, "src"))) {
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/\blog\s*\.\s*(?:info|warn|error|debug|trace|fatal)\s*\(\s*\{/g)) {
      const open = source.indexOf("{", match.index + match[0].length - 1);
      let depth = 0;
      let end = open;
      while (end < source.length) {
        if (source[end] === "{") depth += 1;
        else if (source[end] === "}" && --depth === 0) break;
        end += 1;
      }
      const literal = source.slice(open, end + 1);
      sites.push({
        file: path.relative(root, file),
        line: source.slice(0, match.index).split("\n").length,
        keys: [...literal.matchAll(/(?:^|[{,\s])([A-Za-z_$][\w$]*)\s*:/g)].map((m) => m[1] as string),
      });
    }
  }
  return sites;
}

describe("what the source is allowed to log (AC-NFR-11)", () => {
  // Names that carry a retrieved span, the question, an answer or a credential. `payload` is on the list because
  // the audit row of the two safety events holds the question there (9.7): the row may, the log line may not.
  const FORBIDDEN = new Set([
    "question", "question_text", "prompt", "prompt_text", "answer", "answer_text", "span", "spans", "snippet",
    "snippets", "quote", "quotes", "evidence", "sentence", "sentences", "text", "body", "payload", "password",
    "secret", "token", "api_key", "apiKey", "authorization", "connection_string", "url",
  ]);

  it("names no key that would carry a corpus sentence, the question or a credential", () => {
    const sites = callSites();
    expect(sites.length, "the scan found the log call sites").toBeGreaterThan(10);
    const offenders = sites
      .map((s) => ({ where: `${s.file}:${s.line}`, bad: s.keys.filter((k) => FORBIDDEN.has(k)) }))
      .filter((s) => s.bad.length > 0);
    expect(offenders).toEqual([]);
  });

  it("still emits the five line families the criteria name", () => {
    const sources = sourceFiles(path.join(root, "src")).map((f) => readFileSync(f, "utf8"));
    const has = (needle: string) => sources.some((s) => s.includes(needle));
    // One line per request and the 5xx (src/lib/log.ts), per gate decision (the answer route), per provider call
    // (the gateway) and the mirror of every audit row (src/lib/audit.ts).
    for (const family of ['event: "request"', 'event: "error"', 'event: "gate"', 'event: "gateway_call"', 'event: "audit"']) {
      expect(has(family), `${family} is emitted nowhere in src/`).toBe(true);
    }
  });
});
