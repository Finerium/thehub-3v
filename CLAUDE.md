# thehub-3v

The Hub application: a Manufacturing Knowledge Hub for CALIBER 2026 Case 1 that answers plant questions with evidence
packets, abstains when the corpus cannot answer, refuses to help defeat a protective function before any model call,
measures which failure knowledge was never written down, and drafts the missing One Point Lesson into the plant's
Prepared, Reviewed, Approved chain. Only a human publishes.

## Commands
- `pnpm install --frozen-lockfile`
- `pnpm dev` (local, reads `.env.local`), `pnpm build`, `pnpm start`
- `pnpm gate:quick` = lint + typecheck + unit tests (Vitest); `pnpm test:e2e` (Playwright); `pnpm export:demo`
- `pnpm db:migrate`, `pnpm db:seed` (from a verified bundle), `pnpm db:reset` (CI and recovery only, never the deployment)

## Layout
- `src/app` routes and surfaces; `src/components` design system (blueprint section 7 tokens); `src/contracts` Zod schemas
  derived from `thehub-harness/contracts`; `src/db` Drizzle schema and migrations; `src/gateway` the only provider egress;
  `src/rulepack` the TypeScript matcher over the rule-pack data file; `src/gates` G1, G2 (C1 to C6), G3; `src/coverage`
  the TypeScript port of the frozen recipe; `prompts/<role>/vN.md` versioned prompts; `docs/adr` decisions;
  `deliverables/`, `deck/`, `video/`, `tools/presubmit.sh`.

## Conventions
- Strict TypeScript, no `any` in gates, rulepack or gateway. Zod at every boundary. Drizzle for every query.
- No number on any surface is typed by hand: it comes from `fixtures.json`, the bundle or the seeded database.
- Fixed wordings are constants: machine-drafted, incomplete closeout, SIMULATED, specified, not connected, the as-built
  caveat, the unverified-value line.
- Every mutating route goes through `authorize(role)` and writes an audit event; the audit log is append-only.
- Retrieved text and user text are data in typed envelopes, never instructions. AG-4 never sees the question.
- English everywhere; quoted corpus text keeps its source spelling.
- Commits: `Ghaisan Khoirul Badruzaman <ghaisan.khoirul.b@gmail.com>`, English message, no trailers.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
