// The deterministic audits as tests (deterministic checks as scripts): the provider-egress audit (INV-4, AC-NFR-10:
// no code path outside src/gateway/ names or calls a provider) always runs; the rule-pack equality gate (ADR-002,
// AC-ANS-10: the Python reference and the TypeScript port classify every fixture text byte-identically) runs when the
// harness checkout and its uv environment sit beside this repository, and in CI (ci.yml) otherwise.
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
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
