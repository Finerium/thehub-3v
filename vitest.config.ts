// Vitest (`pnpm test:unit`, part of gate:quick) in two projects. `unit` is hermetic by construction: `@/db/client`
// and `next/headers` resolve to the fakes under tests/helpers for every test file, so no unit test can reach a
// database or need a request scope, and the cookie signing key is minted per run. `db` holds the integration cases
// under tests/db that need a real database through the real client: they run only when TEST_DATABASE_URL names a
// disposable database on purpose for that lane (tests/db/setup.ts) and skip themselves otherwise, so gate:quick
// stays hermetic. Coverage is measured over the whole run: 100 percent lines on src/gates/** and src/rulepack/**
// (AC-EVAL-08), enforced by `vitest run --coverage` (the Tier A step in ci.yml) through @vitest/coverage-v8 at the
// vitest version; the test files themselves are excluded and the report is text only, so no file is written.
import { randomBytes } from "node:crypto";
import path from "node:path";
import { defineConfig } from "vitest/config";

const here = import.meta.dirname;

// The fakes must precede the generic `@/` alias: the first matching entry wins.
const nextHeadersFake = { find: /^next\/headers$/, replacement: path.join(here, "tests/helpers/next-headers.ts") };
const dbClientFake = { find: /^@\/db\/client$/, replacement: path.join(here, "tests/helpers/fake-db-client.ts") };
const source = { find: /^@\//, replacement: `${here}/src/` };

export default defineConfig({
  test: {
    environment: "node",
    clearMocks: true,
    restoreMocks: true,
    env: {
      AUTH_SECRET: randomBytes(32).toString("base64url"),
      LOG_LEVEL: "silent",
    },
    coverage: {
      provider: "v8",
      include: ["src/gates/**", "src/rulepack/**"],
      exclude: ["**/*.test.ts"],
      reporter: ["text"],
      thresholds: {
        "src/gates/**": { lines: 100 },
        "src/rulepack/**": { lines: 100 },
      },
    },
    projects: [
      {
        extends: true,
        resolve: { alias: [dbClientFake, nextHeadersFake, source] },
        test: {
          name: "unit",
          include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
        },
      },
      {
        extends: true,
        resolve: { alias: [nextHeadersFake, source] },
        test: {
          name: "db",
          include: ["tests/db/**/*.test.ts"],
          setupFiles: ["tests/db/setup.ts"],
          testTimeout: 60_000,
          hookTimeout: 120_000,
        },
      },
    ],
  },
});
