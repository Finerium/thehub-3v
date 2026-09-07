// The deterministic audits as tests (deterministic checks as scripts): the provider-egress audit (INV-4, AC-NFR-10:
// no code path outside src/gateway/ names or calls a provider) and the draft-isolation audit (ARCHITECTURE 3.2,
// AC-LOOP-07 static leg: no file outside the loop lane reaches the draft schema) always run; the rule-pack equality
// gate (ADR-002, AC-ANS-10: the Python reference and the TypeScript port classify every fixture text
// byte-identically) runs when the harness checkout and its uv environment sit beside this repository, and in CI
// (ci.yml) otherwise. Every one of them is a script `pnpm audit` runs, so a green test here is the same check CI runs.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const harness = process.env.HARNESS_DIR ?? path.join(root, "..", "thehub-harness");
const harnessReady =
  existsSync(path.join(harness, "harness", "rulepack.py")) &&
  existsSync(path.join(harness, ".venv")) &&
  spawnSync("uv", ["--version"], { encoding: "utf8" }).status === 0;

function run(script: string, args: string[] = []) {
  return spawnSync("bash", [path.join(root, "scripts", "audits", script), ...args], { cwd: root, encoding: "utf8" });
}

describe("scripts/audits/provider-egress.sh (INV-4, AC-NFR-10)", () => {
  it("finds no provider name and no fetch( outside src/gateway/", () => {
    const result = run("provider-egress.sh");
    expect(result.stdout + result.stderr).toContain("provider-egress: clean");
    expect(result.status).toBe(0);
  });
});

describe("scripts/audits/draft-isolation.sh (ARCHITECTURE 3.2, AC-LOOP-07 static leg)", () => {
  it("finds no draft table named, imported or queried outside the loop lane", () => {
    const result = run("draft-isolation.sh");
    expect(result.stdout + result.stderr).toContain("draft-isolation: clean");
    expect(result.status).toBe(0);
    // The tables are read from src/db/schema.ts, so the count is the audit's own proof that it read the schema:
    // the six of ARCHITECTURE 3.2 and 9.6 (draft_document, draft_field, draft_troubleshooting_row,
    // redline_verdict, draft_transition, sme_note). A schema that gains a draft table moves this number.
    expect(result.stdout).toContain("(6 draft tables");
  });

  it("is run by `pnpm audit`, which globs the audit scripts", () => {
    const runner = readFileSync(path.join(root, "scripts", "audits", "run.sh"), "utf8");
    expect(runner).toContain("scripts/audits/*.sh");
    expect(existsSync(path.join(root, "scripts", "audits", "draft-isolation.sh"))).toBe(true);
  });

  // The negative control: without it a green audit proves only that the grep found nothing, not that it looks.
  // Each file is a way the answer lane could reach a draft, and each is written outside every lane path.
  describe("catches a file outside the lane", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "thehub-draft-isolation-"));
    const write = (name: string, source: string): string => {
      const file = path.join(dir, name);
      writeFileSync(file, source);
      return file;
    };

    it.each([
      ["that imports a draft table binding", "binding.ts", 'import { draftField } from "@/db/schema";\n'],
      ["that names a draft table in SQL", "sql.ts", 'export const q = sql`select n from draft_troubleshooting_row`;\n'],
      ["that writes the draft. schema prefix", "prefix.ts", 'export const q = "select * from draft.future_table";\n'],
    ])("%s", (_what, name, source) => {
      const file = write(name, source);
      const result = run("draft-isolation.sh", [file]);
      expect(result.status).toBe(1);
      expect(result.stdout).toContain(file);
      expect(result.stdout).toContain("outside the loop lane");
    });

    it("and leaves a lane file and an unrelated file alone", () => {
      const control = write("permission.ts", "export const matrix = { add_sme_note: true };\n");
      for (const target of [control, "src/loop/rows.ts", "src/db/schema.ts"]) {
        const result = run("draft-isolation.sh", [target]);
        expect(result.stdout + result.stderr, target).toContain("draft-isolation: clean");
        expect(result.status, target).toBe(0);
      }
      rmSync(dir, { recursive: true, force: true });
    });
  });
});

describe("scripts/audits/rulepack-equality.sh (ADR-002, AC-ANS-10)", () => {
  it.runIf(harnessReady)(
    "the reference and the port classify every fixture text byte-identically",
    () => {
      const out = mkdtempSync(path.join(os.tmpdir(), "thehub-rulepack-equality-"));
      try {
        const result = run("rulepack-equality.sh", [out]);
        expect(result.stdout + result.stderr).toContain("byte-identical");
        expect(result.status).toBe(0);
        const reference = readFileSync(path.join(out, "reference.json"), "utf8");
        const port = readFileSync(path.join(out, "port.json"), "utf8");
        expect(port).toBe(reference);
        expect((JSON.parse(port) as unknown[]).length).toBe(30 + 21 + 4);
      } finally {
        rmSync(out, { recursive: true, force: true });
      }
    },
    120_000,
  );

  it.skipIf(harnessReady)("is deferred to CI where the harness is checked out beside the repository", () => {
    expect(readFileSync(path.join(root, ".github", "workflows", "ci.yml"), "utf8")).toContain("pnpm run audit");
  });
});
