// fixtures.json is read from the harness at BUILD time, never copied into the app (a copy drifts): the path comes
// from FIXTURES_PATH or defaults to the sibling harness checkout. `next build` evaluates this module while it
// collects page data, so a missing file fails the build with the path named. At runtime the same read runs on
// cold start; a deployment whose function bundle does not carry the file gets `null` and every consumer renders
// its designed "not available" state instead of a typed number (blueprint 10.3).
//
// Only the slice Home reads is validated here (blueprint 10.5 `inventory`); the full Root of
// src/contracts/generated/fixtures.ts applies once the harness track adds the 10.5 spellings (ARCHITECTURE 13).
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { z } from "zod";

const IN_REPO = path.resolve(process.cwd(), "bundle/fixtures.json"); // the pulled bundle's public part (9.1)
export const FIXTURES_PATH =
  process.env.FIXTURES_PATH ??
  (existsSync(IN_REPO) ? IN_REPO : path.resolve(process.cwd(), "../thehub-harness/packages/fixtures.json"));

const Inventory = z.looseObject({
  files: z.number().int().nonnegative(),
  by_class: z.record(z.string(), z.number().int().nonnegative()),
  corpus_sha256: z.string().regex(/^[0-9a-f]{64}$/),
  extractor: z.string().min(1),
});

const HomeFixtures = z.looseObject({ inventory: Inventory });

export type HomeFixtures = z.infer<typeof HomeFixtures>;

function load(): HomeFixtures | null {
  let raw: string;
  try {
    // The path is decided by the environment, so the bundler must not trace the whole project for it; a runtime
    // without the file gets null below.
    raw = readFileSync(/*turbopackIgnore: true*/ FIXTURES_PATH, "utf8");
  } catch {
    if (process.env.NEXT_PHASE === PHASE_PRODUCTION_BUILD) {
      throw new Error(
        `fixtures.json is absent at ${FIXTURES_PATH}; set FIXTURES_PATH to the harness fixture (the build fails without it)`,
      );
    }
    return null;
  }
  return HomeFixtures.parse(JSON.parse(raw));
}

/** The fixture slice, or null when this runtime cannot read the file (never a placeholder). */
export const fixtures: HomeFixtures | null = load();
