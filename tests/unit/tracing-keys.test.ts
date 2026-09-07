// The file-tracing keys of next.config.ts (ARCHITECTURE 6 and 13 decision 9; AC-LOOP-09, AC-ANS-01).
//
// outputFileTracingIncludes is keyed by a GLOB, not by a route path, so a dynamic segment written the way the
// directory spells it ("[id]") reads as a character class matching one of "i" or "d". The include then lands on no
// function at all and the route ships without the embedding model. That is not a build error and not a test
// failure: it is a 500 on the deployment, past every designed refusal, with "libonnxruntime.so.1: cannot open
// shared object file" in the platform's own log and nothing in this repository's output. It cost the run twice.
//
// This file reads the config as text, because importing it would run Next's own loader, and asserts that no key
// carries a bracket and that every route the embedder is needed on has a key that matches its built path.
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const CONFIG = readFileSync(path.join(process.cwd(), "next.config.ts"), "utf8");

/** The keys of the outputFileTracingIncludes object literal, in source order. */
function includeKeys(): string[] {
  const block = /outputFileTracingIncludes:\s*\{([\s\S]*?)\n {2}\}/.exec(CONFIG)?.[1];
  expect(block, "next.config.ts declares outputFileTracingIncludes").toBeDefined();
  return [...(block ?? "").matchAll(/^\s*"([^"]+)":/gm)].map((m) => m[1] as string);
}

/** Does a tracing glob match this built route path? Only "*" and "**" are used here, so this is enough. */
function matches(glob: string, route: string): boolean {
  const pattern = glob
    .split("**")
    .map((part) => part.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join("[^/]*"))
    .join(".*");
  return new RegExp(`^${pattern}$`).test(route);
}

describe("outputFileTracingIncludes keys are globs that reach their routes", () => {
  it("carries no bracket, which a glob reads as a character class rather than a dynamic segment", () => {
    for (const key of includeKeys()) {
      expect(key, `${key} spells a dynamic segment the directory's way; a glob reads [id] as one of "i" or "d"`).not.toMatch(
        /[[\]]/,
      );
    }
  });

  it("matches every route that embeds: ask, search and the publication of a draft", () => {
    const keys = includeKeys();
    // The three routes that call embed(): retrieval on ask and search, and G3, which embeds the published
    // lesson's chunks inside the publication transaction (ARCHITECTURE 8.6 step 3).
    for (const route of ["/api/ask", "/api/search", "/api/drafts/[id]/publish"]) {
      expect(
        keys.some((k) => matches(k, route)),
        `no tracing key matches ${route}, so its function ships without the embedding model`,
      ).toBe(true);
    }
  });
});
