// Unit tests (Vitest, `pnpm test:unit`, part of gate:quick). Hermetic by construction: `@/db/client` and
// `next/headers` resolve to the fakes under tests/helpers for every test file, so no unit test can reach a database
// or need a request scope, and the cookie signing key is minted per run. Coverage thresholds: 100 percent lines on
// src/gates/** and src/rulepack/** (AC-EVAL-08); a glob that matches no file yet reports 100 percent, so the
// scaffold holds before those tracks land. Enforced with `vitest run --coverage` once @vitest/coverage-v8 is
// installed.
import { randomBytes } from "node:crypto";
import path from "node:path";
import { defineConfig } from "vitest/config";

const here = import.meta.dirname;

export default defineConfig({
  resolve: {
    alias: [
      { find: /^@\/db\/client$/, replacement: path.join(here, "tests/helpers/fake-db-client.ts") },
      { find: /^next\/headers$/, replacement: path.join(here, "tests/helpers/next-headers.ts") },
      { find: /^@\//, replacement: `${here}/src/` },
    ],
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/unit/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    env: {
      AUTH_SECRET: randomBytes(32).toString("base64url"),
      LOG_LEVEL: "silent",
    },
    coverage: {
      provider: "v8",
      include: ["src/gates/**", "src/rulepack/**"],
      thresholds: {
        "src/gates/**": { lines: 100 },
        "src/rulepack/**": { lines: 100 },
      },
    },
  },
});
