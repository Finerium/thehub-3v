// The submission checklist as a test (the PRD's 26.4, blueprint 9.12 and 11.9 AC-DEL-04, AC-DEL-05).
//
// tools/presubmit.sh is the last gate before an upload, so it is the one script nobody gets to run for the first
// time on the last evening. Two runs prove it here, both against a throwaway copy of deliverables/ so that neither
// the tracked artefacts nor deliverables/SHA256SUMS.txt is touched by a test:
//
//   1. The clean run, `--skip-live`. Thirteen checks run, and the only one that does not pass is the live leg the
//      flag withheld: every other check on the current tree passes or is named as an owner's remainder. That is
//      AC-DEL-04 read literally, and it is what makes a green presubmit mean something on the evening it matters.
//      The run is skipped, with a message, when the three artefacts are not built in this checkout.
//   2. The planted run, always. A TBD_ marker is written into the copied export and the script must exit non-zero
//      naming it (AC-DEL-05, the placeholder leg of check 7). A marker check that has never fired is a marker check
//      nobody knows works, and a placeholder reaching a judge is the exact failure the PRD's 26.4 exists to stop.
//   3. The checksum leg of check 13, both ways (AC-DEL-05). The record is written into the copy with --write-sums,
//      compared, then a deliverable is changed under it and the same check must fail. Until this landed the check
//      regenerated the record before reading it, so it could not fail on a stale record however wrong the record
//      was; the sandbox record is seeded here for the same reason the clean run needs one.
//
// The live leg (check 12) is never exercised here: a unit test reaches no network. `--skip-live` reports it as
// unproved rather than passed, which is the behaviour asserted below.
import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { appendFileSync, copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const REPO = process.cwd();
const SCRIPT = path.join(REPO, "tools", "presubmit.sh");
const DELIVERABLES = path.join(REPO, "deliverables");

/** The three mandatory uploads of blueprint 9.12; the optional pointer PDF is copied when it exists. */
const MANDATORY = ["TheHub_prototype.html", "TheHub_deck.pdf", "TheHub_demo.mp4"];
const OPTIONAL = ["TheHub_README.pdf"];

/** The checklist's own count, the marker it looks for and the line it prints when the live leg is withheld. */
const CHECKS = 13;
const MARKER = "TBD_";
const LIVE_WITHHELD = "skipped by --skip-live";

const built = MANDATORY.every((f) => existsSync(path.join(DELIVERABLES, f)));

const sandbox = mkdtempSync(path.join(os.tmpdir(), "thehub-presubmit-"));
afterAll(() => rmSync(sandbox, { recursive: true, force: true }));

for (const name of [...MANDATORY, ...OPTIONAL]) {
  const source = path.join(DELIVERABLES, name);
  if (existsSync(source)) copyFileSync(source, path.join(sandbox, name));
}
// Without a built export there is nothing for check 7 to scan, and a marker check with no file to read would pass
// for the wrong reason. A stub carries the placeholder leg on a checkout whose deliverables are not built yet.
if (!existsSync(path.join(sandbox, "TheHub_prototype.html"))) {
  writeFileSync(path.join(sandbox, "TheHub_prototype.html"), "<!doctype html><title>stub</title><body>no export in this checkout</body>\n");
}

function presubmit(...extra: string[]): SpawnSyncReturns<string> {
  return spawnSync("bash", [SCRIPT, "--dir", sandbox, "--skip-live", ...extra], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

// The copy is a fresh set of deliverables with no record of its own, so check 13 is given one to compare against.
// The tracked deliverables/SHA256SUMS.txt is never read or written by this file.
const seeded = presubmit("--write-sums");

type Verdict = { number: number; title: string; kind: "PASS" | "FAIL" | "NOT BUILT" | "HUMAN"; detail: string };

/** The width of the verdict column the checklist prints, `    PASS       ` and its three siblings. */
const COLUMN = "    PASS       ".length;

/** The report as the checklist prints it: every verdict line under the numbered check it belongs to. */
function verdicts(output: string): Verdict[] {
  const found: Verdict[] = [];
  let current = { number: 0, title: "" };
  for (const line of output.split("\n")) {
    const header = /^\s*(\d+)\. (.+)$/.exec(line);
    if (header) {
      current = { number: Number(header[1]), title: header[2] as string };
      continue;
    }
    // The verdict column is fixed width (`printf '    PASS       %s\n'`), so the detail is read by position and
    // keeps a leading count the way the script printed it.
    const kind = line.slice(0, COLUMN).trim();
    if (line.startsWith("    ") && (kind === "PASS" || kind === "FAIL" || kind === "NOT BUILT" || kind === "HUMAN")) {
      found.push({ ...current, kind, detail: line.slice(COLUMN) });
    }
  }
  return found;
}

const clean = presubmit();
const cleanReport = `${clean.stdout}${clean.stderr}`;
const cleanVerdicts = verdicts(cleanReport);

describe("tools/presubmit.sh, the clean run (AC-DEL-04)", () => {
  it("runs the thirteen checks of the PRD's 26.4", () => {
    expect(cleanReport).toContain(`${CHECKS} checks run`);
    expect(new Set(cleanVerdicts.map((v) => v.number)).size).toBeGreaterThan(0);
    expect(Math.max(...cleanVerdicts.map((v) => v.number))).toBe(CHECKS);
  });

  it("reports the live leg as unproved rather than passed when --skip-live withholds it (D-07)", () => {
    const live = cleanVerdicts.filter((v) => v.detail.includes(LIVE_WITHHELD));
    expect(live, "--skip-live did not report the live leg at all").toHaveLength(1);
    expect(live[0]?.kind).toBe("FAIL");
    expect(live[0]?.title).toContain("live deployment");
  });

  it("names its human-gated remainders instead of passing them", () => {
    const human = cleanVerdicts.filter((v) => v.kind === "HUMAN");
    expect(human.length, "no remainder was named; D-08 and D-09 both leave one open").toBeGreaterThan(0);
    expect(cleanReport).toMatch(/\d+ human-gated remainder/);
    for (const remainder of human) expect(remainder.detail.length).toBeGreaterThan(0);
  });

  it.skipIf(!built)("passes every check that can run on this tree, so only the withheld live leg is outstanding", () => {
    const failing = cleanVerdicts.filter((v) => v.kind === "FAIL" || v.kind === "NOT BUILT");
    const unexpected = failing.filter((v) => !v.detail.includes(LIVE_WITHHELD));
    expect(
      unexpected.map((v) => `check ${v.number} (${v.title}): ${v.detail}`),
      "a check that does not need a network is failing on the current tree",
    ).toEqual([]);
    // Exit 1 and not 0: `--skip-live` leaves the live leg unproved, and the script refuses to call that a pass.
    expect(clean.status).toBe(1);
  });
});

describe("tools/presubmit.sh, the checksum record of check 13 (AC-DEL-05)", () => {
  const SUMS = path.join(sandbox, "SHA256SUMS.txt");
  const check13 = (report: string) => verdicts(report).filter((v) => v.title.includes("SHA256SUMS.txt"));

  it("records the digests only when asked, with the commit and the time", () => {
    expect(seeded.status, `--write-sums did not run:\n${seeded.stdout}${seeded.stderr}`).not.toBe(2);
    const record = readFileSync(SUMS, "utf8");
    expect(record).toMatch(/^# commit {4}[0-9a-f]{7,40}$/m);
    expect(record).toMatch(/^# recorded {2}\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/m);
    expect(check13(`${seeded.stdout}${seeded.stderr}`).some((v) => v.kind === "PASS" && v.detail.includes("--write-sums"))).toBe(true);
  });

  it("compares the record it finds instead of rewriting it", () => {
    const before = readFileSync(SUMS, "utf8");
    const report = `${clean.stdout}${clean.stderr}`;
    expect(check13(report).some((v) => v.kind === "PASS" && v.detail.includes("matches"))).toBe(true);
    expect(readFileSync(SUMS, "utf8"), "the run rewrote the record it was meant to compare").toBe(before);
  });

  // The negative control this check existed without: a deliverable rebuilt after the record was written.
  it("fails when a deliverable changes under the record, and passes again once it is re-recorded", () => {
    const deck = path.join(sandbox, "TheHub_deck.pdf");
    const original = existsSync(deck) ? readFileSync(deck) : null;
    const target = original === null ? path.join(sandbox, "TheHub_prototype.html") : deck;
    const bytes = readFileSync(target);
    try {
      appendFileSync(target, "\n<!-- one byte more than the record knows about -->\n");
      const stale = presubmit();
      const report = `${stale.stdout}${stale.stderr}`;

      expect(stale.status, `a changed deliverable did not fail the checklist:\n${report.slice(0, 3000)}`).not.toBe(0);
      expect(check13(report).some((v) => v.kind === "FAIL" && v.detail.includes("does not match the deliverables as they stand"))).toBe(true);
      expect(report).toContain(`${path.basename(target)}: FAILED`);

      const rerecorded = presubmit("--write-sums");
      expect(check13(`${rerecorded.stdout}${rerecorded.stderr}`).some((v) => v.kind === "PASS")).toBe(true);
    } finally {
      writeFileSync(target, bytes);
      presubmit("--write-sums");
    }
  }, 600_000);

  it("fails when there is no record at all rather than writing one", () => {
    const record = readFileSync(SUMS, "utf8");
    try {
      rmSync(SUMS);
      const report = `${presubmit().stdout}`;
      expect(check13(report).some((v) => v.kind === "FAIL" && v.detail.includes("--write-sums"))).toBe(true);
      expect(existsSync(SUMS), "the comparing run created the record it was meant to compare against").toBe(false);
    } finally {
      writeFileSync(SUMS, record);
    }
  }, 600_000);
});

describe("tools/presubmit.sh, the English scan of check 9 (AC-DEL-06)", () => {
  it("reads all four artefacts the criterion names, the export included", () => {
    const check9 = cleanVerdicts.filter((v) => v.title.includes("English only"));
    expect(check9.length, "check 9 printed no verdict at all").toBeGreaterThan(0);
    expect(check9[0]?.title).toContain("the export");
    if (built) {
      expect(check9[0]?.kind).toBe("PASS");
      // deck text, narration, captions, export: the four of AC-DEL-06, none of them exempt as a whole file.
      expect(check9[0]?.detail).toContain("4 path(s)");
    }
  });

  // The export was outside this scan until the check was widened, so the scan had never fired on it. It fires now.
  it("catches an Indonesian sentence planted in the export", () => {
    const planted = path.join(sandbox, "TheHub_prototype.html");
    const before = readFileSync(planted, "utf8");
    try {
      appendFileSync(planted, "\n<p>Sistem ini dibuat untuk membantu operator dan tidak menggantikan prosedur</p>\n");
      const report = `${presubmit().stdout}`;
      const check9 = verdicts(report).filter((v) => v.title.includes("English only"));
      expect(check9.some((v) => v.kind === "FAIL" && v.detail.includes("--english reported a hit"))).toBe(true);
      expect(report).toContain("an Indonesian word appears outside");
    } finally {
      writeFileSync(planted, before);
      presubmit("--write-sums");
    }
  }, 600_000);

  it("scans the export as prepared text, with only its script, style and base64 payloads removed", () => {
    const script = readFileSync(SCRIPT, "utf8");
    expect(script).toContain("<script");
    expect(script).toContain("data:[^");
    // The names scan still reads the raw file: nothing is exempt from a legacy product name.
    const names = script.slice(script.indexOf("check \"Banned strings"), script.indexOf("check \"English only"));
    expect(names).toContain('targets+=("$EXPORT")');
    expect(names).not.toContain("EXPORT_TEXT");
  });
});

describe("tools/presubmit.sh, the placeholder leg of check 7 (AC-DEL-05)", () => {
  it("finds no marker in the deliverables as they stand", () => {
    const check7 = cleanVerdicts.filter((v) => v.title.includes("placeholder marker"));
    expect(check7.length, "check 7 printed no verdict at all").toBeGreaterThan(0);
    expect(check7.some((v) => v.kind === "PASS" && v.detail.includes(`no ${MARKER} marker`))).toBe(true);
  });

  it("exits non-zero and names the file when a marker is planted in a deliverable", () => {
    const planted = path.join(sandbox, "TheHub_prototype.html");
    const before = readFileSync(planted, "utf8");
    try {
      appendFileSync(planted, `\n<!-- ${MARKER}SUPERVISOR_NAME -->\n`);
      const result = presubmit();
      const report = `${result.stdout}${result.stderr}`;
      const check7 = verdicts(report).filter((v) => v.title.includes("placeholder marker"));

      expect(result.status, `a planted ${MARKER} marker did not fail the checklist:\n${report.slice(0, 4000)}`).not.toBe(0);
      expect(check7.some((v) => v.kind === "FAIL" && v.detail.includes(`the placeholder marker ${MARKER} survives`))).toBe(true);
      expect(report).toContain(planted);
    } finally {
      writeFileSync(planted, before);
    }
    // The whole checklist runs here, and check 11 launches Chromium over the export, so this is not a 5 s test.
  }, 300_000);
});
