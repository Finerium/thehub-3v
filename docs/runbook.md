# Runbook

Everything that has to be done to a running instance of The Hub, written so that someone who did not build it can
do it. Every procedure below names the command that performs it and the file that implements the command, so a
step can be read before it is run.

Scope: the deployed demo at `https://thehub-3v.vercel.app` (Vercel, region `sin1`) with Neon Postgres behind it,
and a local instance of the same application.

**Never in this file, and never anywhere else:** a credential value, a token, a connection string or a password.
Configuration is referred to by variable **name** only. Values move between the environment files and the
platforms through shell redirection (`thehub/tools/secret-pipe.sh`, `thehub/tools/env-share.sh`); nothing reads,
prints, copies or echoes them, and gitleaks runs on every push.

---

## 0. The principals, and what each may do

| Principal | Where it is | What it may do |
| --- | --- | --- |
| Engineer, Reviewing Supervisor, Manager | The three demo accounts, issued to the Committee | Read every surface; the Supervisor decides on a draft in review; the Manager publishes through G3. The matrix is `src/auth/matrix.ts`. |
| Admin | One account, never distributed | Corpus versions, activation, accounts and roles, provider pins and budget constants as read from configuration. **Admin holds no drafting, review or publication right.** |
| The nightly job | GitHub Actions, `ADMIN_JOB_TOKEN` | One route only: `POST /api/admin/corpus/activate`. Audited as `job:nightly-activation` with role `job`. |
| The application itself | Postgres role `thehub_app` | Every table, but no UPDATE and no DELETE on `audit_log`. It cannot erase its own audit trail. |
| The owner | Postgres owner role, unpooled URL | Migrations, the seed, activation from the command line, retention. |

Variable names the code reads: `DATABASE_URL_APP` and `DATABASE_URL` (the application's pooled connection),
`DATABASE_URL_UNPOOLED` (the owner's, used by migrations and retention), `AUTH_SECRET`, `ADMIN_JOB_TOKEN`,
`ZAI_API_KEY` (the one provider key, read at call time in `src/gateway/provider.ts` and never logged),
`CI_INGEST_TOKEN`, `CORPUS_DEPLOY_KEY`, `DEMO_ENGINEER_PASSWORD`, `DEMO_SUPERVISOR_PASSWORD`,
`DEMO_MANAGER_PASSWORD`, `HARNESS_DIR`, `FIXTURES_PATH`, `LOG_LEVEL`.

---

## 1. Seed a corpus version

A corpus version is seeded from an **admitted bundle** and from nothing else. The bundle is built in
`thehub-harness` where the corpus exists, released with a `SHA256SUMS` file and a manifest, and pulled here.

```bash
pnpm bundle:pull                       # scripts/bundle/pull.ts: fetch the release, verify SHA256SUMS and the manifest
pnpm db:migrate                        # drizzle-kit migrate over DATABASE_URL_UNPOOLED
pnpm db:seed                           # G1 first, then the seed; scripts/db/seed.ts
```

What `pnpm db:seed` does, in order:

1. **G1 admits or refuses the bundle** (`src/gates/g1.ts`) before any database connection is opened. It checks that
   every file the manifest lists exists with the recorded SHA-256 and byte count, that every file validates against
   its Zod contract, that the fixture counts hold, that every span, document, revision, work-order, lesson,
   bill-of-material and equipment id resolves inside the bundle, and that every enum is a member of its closed set.
   A violation prints its kind and file and exits 1. **A rejected bundle never reaches the database.**
2. The seed writes one transaction per family, upserts only, deleting nothing.
3. A bounded reconciliation runs: inside the revisions the bundle carries, a span or claim id the bundle does not
   carry is removed, because claim ids are positional and a re-seed would otherwise leave an old numbering beside
   the new one for the answer lane to cite. Spans of lessons published through the loop into a sandbox version are
   deliberately spared.
4. The corpus version is created and activated through `src/db/versions.ts`, and the run prints the rows written per
   table, the row counts of every seeded table, the version id and the wall time.

Useful flags: `--bundle <dir>` to seed a bundle other than `bundle/`; `--dry-run` to run G1 alone and write nothing;
`--public-only` when the seed-time files (`chunks.jsonl`, `pages/`, `opls.json`) are absent, which is the normal
state of a public checkout because those files carry the organiser's text (deviation D-17).

The seeded version id is derived, not chosen: `pnpm seeded:version-id` prints it from `bundle/manifest.json`, and
that is the same derivation the nightly job uses.

Verify the seed: `pnpm db:check`, then `GET /api/health`, which reports the active corpus version and the deployed
commit and holds no session and no data.

---

## 2. Activate a corpus version

Activation is what makes a version the one the answer lane reads. Exactly one version is active.

- **From the product:** Admin, on `/admin`, which lists every version with its actor, timestamp, active flag and
  manifest hash.
- **From the job principal:** `POST /api/admin/corpus/activate` with `{ "version_id": "<id>" }` and
  `Authorization: Bearer <ADMIN_JOB_TOKEN>`. The token is compared in constant time
  (`src/app/api/admin/corpus/activate/route.ts`). Any other role is a 403 with an audit event; no session and no
  valid token is a 401.

Activation never deletes anything. The lineage rule marks every sandbox publication not current; the rows stay.

---

## 3. The nightly job

`.github/workflows/nightly.yml`, at 17:00 UTC, which is 00:00 Asia/Jakarta.

1. Resolve the seeded version id from `bundle/manifest.json` (`scripts/seeded-version-id.ts`).
2. Re-assert it through `POST /api/admin/corpus/activate` as the job principal. The token is written to a file the
   runner alone reads and never appears on a command line.
3. Check that `GET /api/health` reports that version.
4. Run retention as the owner: `pnpm db:retention` over `DATABASE_URL_UNPOOLED`. General audit events older than 30
   days go, rate-limit windows older than one hour go, expired sessions go, and the two safety actions
   (`safety.request_refused`, `safety.request_served`) are **never** deleted. The script refuses to run as the
   application role. It prints counts only.

This is what makes the demo idempotent for visitors: one visitor's publication into their own sandbox never changes
the seeded numbers the next visitor sees, and the nightly restore puts the seeded version back without deleting the
sandbox work.

**If the nightly job fails:** run it by hand with `workflow_dispatch`. If it still fails, activate the seeded
version from `/admin` as the Admin, then run `pnpm db:retention` locally over the owner URL. A failed retention is
not urgent; a version left un-restored is, because the demo will show a sandbox version's numbers.

A second scheduled workflow, `.github/workflows/keep-alive.yml`, warms the function every ten minutes through
`GET /login` and wakes the database every thirty minutes through `GET /api/health`. The two cadences are separate on
purpose: the database allowance would be spent by a ten-minute database ping (deviation D-15). Both stop after the
final-round window, `LAST_DAY` in that file. GitHub disables a schedule after sixty days with no push, so if the
demo goes cold, check that first.

---

## 4. Rotation

Rotate on a schedule, on any suspicion, and immediately after the competition closes.

| What | How |
| --- | --- |
| The three demo-account passwords | Change the stored hash through the Admin surface or the seed's account writer, then re-issue to the Committee out of band. The same values live as `DEMO_ENGINEER_PASSWORD`, `DEMO_SUPERVISOR_PASSWORD` and `DEMO_MANAGER_PASSWORD` in the CI secrets used by the golden runner and the video capture; update both, or Tier B and the video pipeline will fail to sign in. |
| `AUTH_SECRET` | Rotate in the Vercel project, then redeploy. **Every session is invalidated**, which is the intended effect: it is also the fastest way to sign everyone out. |
| `ADMIN_JOB_TOKEN` | Rotate in the Vercel project and in the GitHub Actions secret in the same sitting. Between the two updates the nightly job will 401; run it by hand afterwards. |
| `ZAI_API_KEY` | Rotate at the provider, then in the Vercel project and in the Tier B secret. Seeded content is unaffected: nothing on the demo path calls a provider. |
| `CORPUS_DEPLOY_KEY` | Generate a new read-only deploy key on `thehub-corpus`, replace the CI secret, delete the old key at GitHub. |
| `DATABASE_URL_APP`, `DATABASE_URL_UNPOOLED` | Reset the role's password in Neon, re-derive the pooled URL with `tools/app-role-url.sh` (shell only, nothing is printed), publish to the three Vercel environments and to the CI secret. |

Every one of these moves through `thehub/tools/secret-pipe.sh` or `thehub/tools/env-share.sh`. No value is ever
pasted into a chat, a commit message, an issue, a log that anyone reads, or this file.

**After the competition:** rotate everything, revoke the deploy key, and take the demo accounts down.

---

## 5. Recovery

### The demo shows the wrong numbers

Almost always a version that was not restored. Check `GET /api/health` against `pnpm seeded:version-id`. If they
differ, activate the seeded version from `/admin`. Nothing else is needed and nothing is deleted.

### A publication went wrong

A published lesson cannot be unpublished, by design: publication is an append to the corpus, and the audit trail is
the record. The remedy is the same one the plant would use, which is to publish a correcting revision, and in the
meantime to activate the previous corpus version so the answer lane reads it. `POST /api/drafts/:id/publish` is a
single transaction under an advisory lock (`src/gates/g3.ts`), so a racing publish is a 409 and never a half-write.

### The database is unreachable

Neon Free scales to zero after five minutes of idleness and the first request afterwards pays about one second of
wake time. That is normal and is inside the latency target. A longer outage is a Neon incident: the application
returns its designed error states, `GET /api/health` fails, and nothing is lost because every artefact is stored,
not held in memory. When it returns, run `pnpm db:check` and confirm the active version.

### A bundle was seeded and should not have been

Re-seed the intended bundle (`pnpm db:seed --bundle <dir>`) and activate its version. The seed is upsert-only, so
the earlier rows are overwritten rather than orphaned, and the bounded reconciliation clears spans and claims the
new bundle does not carry.

### A procedure fails its hash

The render is blocked with a 409 `hash_mismatch` and an audit event, and the product **never** falls back to a
paraphrase (`src/lib/errors.ts`, `src/gates/g2/c2.ts`). This means the stored text and its recorded hash disagree,
which is a corruption, not a display bug. Re-seed from the admitted bundle; G1 will refuse a bundle whose bytes do
not hash, so a clean re-seed either fixes it or names the file that is wrong.

### A role violation or a 403 that should not have happened

Read the audit trail. Every violation writes an event, and the application role cannot delete one.

---

## 6. When the provider is unreachable

Nothing on the demo path calls a provider. Every seeded question, every stored packet, every trace and the whole
export are replayed from storage, so **the demo keeps working with the provider down.**

What changes is live asking. A live question whose provider call does not return ends as an abstention that states
why, in the fixed wording `PROVIDER_UNREACHABLE_REASON` in `src/lib/fixed-strings.ts`: the retrieved evidence is
listed without a composed answer, and the seeded questions keep working. There is no second provider and no
fallback model: one provider and one model id is an invariant (ADR-001), and a silent switch to another model would
make every trace a lie.

Steps: confirm at the provider's status page; confirm the key has not expired; check `gateway_call` rows for the
outcome recorded. Do not add a provider. Do not disable the verifier to get an answer through.

---

## 7. When the day's budget is spent

Each model role carries a daily token budget and a daily spend cap (`src/gateway/config.ts`), summed over the UTC
day from the `gateway_call` rows of that role (`src/gateway/budget.ts`). At or above either cap the gateway returns
`budget_exhausted` **without calling the provider**.

The user-facing result is the designed 429 in `src/lib/errors.ts`: it names the role, its budget and the reset,
which is the next UTC day. Seeded chips, every read-only surface, the trace replay and the export are untouched,
because none of them calls a provider.

Steps:

1. Confirm it is the budget and not the provider: the error code is `budget_exhausted`, not a timeout.
2. Decide whether the cap should move. It is a constant in `src/gateway/config.ts` and changing it is a code change
   with a review, not a runtime toggle. That is deliberate.
3. Wait for the UTC day to roll, or raise the cap and deploy.

The same shape covers rate limits: 30 asks and 5 draft creations per minute per account, 120 requests per minute per
address (`src/lib/ratelimit.ts`), each answered with a 429 that names the limit and the moment it resets.

---

## 8. Before a submission or a demonstration

```bash
pnpm gate:quick                  # lint, typecheck, unit tests
pnpm run audit                   # the deterministic audits, including the README's numbers
                                 # (`run` is not optional: pnpm has a built-in command of that name)
pnpm contracts:check             # the Zod modules still equal the frozen JSON Schema
pnpm smoke                       # the deployed instance answers on every route a judge will open
bash tools/presubmit.sh          # the thirteen submission checks
```

`tools/presubmit.sh` exits 0 when everything passed, 2 when every check that can pass has passed and only
human-gated remainders are outstanding (it names them), and 1 when something failed. Read the report; it prints
what it measured, not a verdict on its own.

---

## 9. What is never done, under any pressure

- No credential is written into a tracked file, a deliverable, a commit message or this runbook.
- No second provider is added and no model id is switched to get an answer through.
- No gate is disabled, weakened or skipped to make a number look better, and no golden case is edited for the same
  reason. Where a case is wrong, that is recorded as a finding about the case.
- No paraphrase is ever served in place of a procedure whose hash does not match.
- No corpus text longer than a citation is put into a public repository, and no bulk route is added.
- No write path toward a control system is built. There is none in this repository and there will not be one.
