// The shape of src/gates/g2 (ARCHITECTURE section 7 step 11; blueprint 8.4): an index that exports runG2 and one
// module per check, C1 to C6. The gate is deterministic code that decides from stored data and the verifier's
// verdicts; it never reaches a provider, the database or the network (INV-4, AC-NFR-10, AC-NFR-06), so this file
// reads the sources and refuses any import toward src/gateway, src/db, an ORM, a provider client or Next. It reads the
// file system only, so it fails on its own assertions while the module is missing and stays green once it lands.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = path.dirname(fileURLToPath(import.meta.url));
const MODULES = ["index.ts", "c1.ts", "c2.ts", "c3.ts", "c4.ts", "c5.ts", "c6.ts"];
const IMPORT = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*)["']([^"']+)["']/g;
// Contract types (src/contracts/generated/gateway.ts carries the verdict shape) are data shapes, not the gateway.
const isContract = (s: string) => s.startsWith("@/contracts/") || s.includes("/contracts/generated/");
const FORBIDDEN: readonly RegExp[] = [
  /(^|\/)gateway(\/|$)/,
  /(^|\/)db(\/|$)/,
  /drizzle-orm/,
  /@neondatabase/,
  /@huggingface/,
  /^next(\/|$)/,
  /^server-only$/,
];

function sources(): string[] {
  return readdirSync(dir).filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"));
}

describe("src/gates/g2 module shape", () => {
  it.each(MODULES)("%s exists: one module per check beside the index", (file) => {
    expect(existsSync(path.join(dir, file)), `${file} is missing under src/gates/g2`).toBe(true);
  });
});

describe("the gate never calls the gateway (INV-4, AC-NFR-10)", () => {
  it("imports nothing from src/gateway, src/db, an ORM, a provider client or Next, and calls no fetch", () => {
    const files = sources();
    expect(files.length, "no gate sources under src/gates/g2").toBeGreaterThan(0);
    for (const file of files) {
      const text = readFileSync(path.join(dir, file), "utf8");
      const specifiers = Array.from(text.matchAll(IMPORT), (m) => m[1]).filter((s) => !isContract(s));
      for (const s of specifiers) for (const re of FORBIDDEN) expect(s, `${file} imports ${s}`).not.toMatch(re);
      expect(text, `${file} calls fetch`).not.toMatch(/\bfetch\s*\(/);
      expect(text, `${file} names a provider`).not.toMatch(/api\.z\.ai|openai|anthropic|deepseek/i);
    }
  });
});
