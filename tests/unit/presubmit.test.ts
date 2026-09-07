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

function presubmit(): SpawnSyncReturns<string> {
  return spawnSync("bash", [SCRIPT, "--dir", sandbox, "--skip-live"], { cwd: REPO, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

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
