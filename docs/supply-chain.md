# Supply chain and reproducible build

Three acceptance criteria of blueprint section 11 land on the dependency tree and on the build that comes out of
it. This is the record of what each one is checked by, what the check measured on 8 September 2026, and, where a
clause of a criterion cannot be true as written, what is true instead and how that was established.

| Criterion | Check | Result on 8 September 2026 |
| --- | --- | --- |
| AC-NFR-12, the CVE clause | `pnpm audit:deps` (also `scripts/audits/dependencies.sh`, one of the audits the Tier A `checks` job globs) | 0 critical, 0 high, 0 moderate, 0 low |
| AC-NFR-23, the application | `pnpm verify:reproducible` | 908 comparable files, identical digests across two cold builds |
| AC-NFR-23, the export | measured by hand, see [The export is a capture, not a build](#the-export-is-a-capture-not-a-build) | not byte-identical, and it cannot be; identical once the capture's own trace id and clock are masked |
| AC-NFR-18 | `pnpm verify:two-instances` | 121 requests across two instances answered 120 x 400 and exactly one 429 |

## Dependency advisories (AC-NFR-12)

`pnpm audit` on the lockfile of 8 September 2026 reported three open advisories against an expected zero high or
critical. None of the three had an upgrade available at the top of the tree, because every one of them sits under
a dependency that pins its own version exactly, so each is closed by a scoped `pnpm.overrides` entry in
`package.json`. A scoped override (`parent>child`) moves the version on that one edge of the graph and leaves
every other consumer of the same package where it was.

An override is a real fix only when the version it forces is a version the dependant can actually run. Each of the
three was exercised against the exact API its dependant calls before the override was kept, and `pnpm gate:quick`
(lint, typecheck, 1439 unit tests) is green on the result.

### sharp 0.34.5 to 0.35.4 (GHSA-f88m-g3jw-g9cj, high)

`sharp` inherits four libvips vulnerabilities (CVE-2026-33327, CVE-2026-33328, CVE-2026-35590, CVE-2026-35591),
fixed from 0.35.0 on. `@huggingface/transformers@4.2.0` is the latest release and depends on `sharp: ^0.34.5`,
so no upgrade of the parent moves it.

- Override: `"@huggingface/transformers>sharp": "0.35.4"`.
- Why it is safe: `next@16.3.4` already resolved `sharp@0.35.4` in this same tree, so the override collapses two
  copies onto the one that was already being downloaded rather than introducing anything new. Verified by loading
  it from the transformers dependant: sharp 0.35.4, libvips 8.18.6.
- The reachable path: `src/gateway/embedding.ts` is the only file in the repository that imports
  `@huggingface/transformers`, and it imports `AutoModel`, `AutoTokenizer`, `PretrainedConfig`, `Tensor`, `env` and
  `mean_pooling`. `sharp` is reached only by the library's image utilities (`RawImage` and the image pipelines),
  which the repository never names, so no image decoder in libvips is fed anything by this application. The
  override is still the right answer rather than a suppression, because it removes the vulnerable code from the
  deployment instead of arguing about it.
- Exercised after the override: `pnpm exec tsx` over `embed(["safety interlock reset procedure"], "query")`
  returned a 384-wide vector starting 0.040166, -0.044223, -0.035169.

### adm-zip 0.5.18 to 0.6.0 (GHSA-xcpc-8h2w-3j85, high)

A crafted ZIP triggers a 4 GB allocation; fixed in 0.6.0. `onnxruntime-node@1.24.3` depends on `adm-zip: ^0.5.16`,
and `@huggingface/transformers@4.2.0` pins `onnxruntime-node` to exactly 1.24.3, so neither parent can be moved.

- Override: `"onnxruntime-node>adm-zip": "0.6.0"`.
- Why it is safe: `adm-zip` is used by exactly one file of `onnxruntime-node`, `script/install-utils.js`, which
  calls `new AdmZip(path)`, `zip.getEntry(name)` and `zip.extractEntryTo(entry, dir, false, true)` to unpack the
  NuGet package that carries the CUDA execution provider. All three were exercised against 0.6.0 resolved from
  `onnxruntime-node`'s own `node_modules`, on a ZIP written and read back, and behave as before.
- The reachable path: none at run time. The library is loaded by the install script only, this project's install
  never asks for the CUDA provider, and `onnxruntime-node`'s build script is in any case not run
  (`pnpm install` reports it among the ignored build scripts). No ZIP from any source reaches this code.

### esbuild 0.18.20 to 0.25.12 (GHSA-67mh-4wv8-2f99, moderate)

esbuild's development server answers any website's cross-origin request; fixed in 0.25.0. The vulnerable copy is
four levels down a development-only path: `drizzle-kit > @esbuild-kit/esm-loader > @esbuild-kit/core-utils >
esbuild@0.18.20`. `drizzle-kit@0.31.10` is the current release (1.0.0 is at release candidate) and still carries
the deprecated `@esbuild-kit` packages, so no upgrade removes the edge.

- Override: `"@esbuild-kit/core-utils>esbuild": "0.25.12"`, which is the version `drizzle-kit` itself already
  resolves for its own use, so the override removes a version from the tree rather than adding one.
- Why it is safe: `@esbuild-kit/core-utils` declares `esbuild: ~0.18.20` and uses it for `transform` and
  `transformSync` only. `transformSync` over a TypeScript source was exercised against 0.25.12 and returns the
  expected CommonJS. End to end, `drizzle-kit check` reads `drizzle.config.ts` (the path that needs the loader)
  and reports its migrations sound.
- The reachable path: a development and CI dependency of a command-line tool. Nothing in the deployment bundle
  contains esbuild, and neither `drizzle-kit` nor anything else in this repository starts an esbuild dev server,
  which is what the advisory is about.

### How a new advisory reddens a run

`scripts/audits/dependencies.sh` runs `pnpm audit --audit-level moderate`. It is one of the `scripts/audits/*.sh`
that the Tier A `checks` job already runs as its `pnpm run audit` step, so no new workflow step was needed, and
the advisory database is consulted at the moment of the run: an advisory published upstream after the last green
build reddens the next one with nothing in the repository having changed.

The gate is set one step below the criterion. AC-NFR-12 asks for zero high or critical; the script fails on
moderate and above, which is where the tree stands today. It fails closed when the registry cannot be reached, on
the principle that a supply chain check which passes because it could not ask is worse than one that says so.

Proof that the gate can fail, not only pass: run against the lockfile as it stood before the overrides, the same
command exits 1 and prints `3 vulnerabilities found. Severity: 1 moderate | 2 high`. Against the lockfile as it
stands now it exits 0 and prints `No known vulnerabilities found`.

## Reproducible build (AC-NFR-23)

`pnpm verify:reproducible` runs `tools/reproducible-build.mjs`: `pnpm install --frozen-lockfile`, then two builds
of the application from an empty `.next/`, each reduced to a sorted list of `<sha256>  <path>` lines, then a
comparison of the two lists. A single changed byte in any chunk, manifest, prerendered page or trace manifest
moves a digest; a file present in one build and not the other moves the list.

**Result on 8 September 2026, Next 16.3.4: 908 comparable files, identical digests across two cold builds.**

### What is compared, and what is not

Each build wrote 932 files. Twenty-two of them are under `.next/cache`, the Turbopack incremental cache: it is
deleted before each build here, is never uploaded with the deployment, and records the order the compiler happened
to visit modules in. `.next/trace` and `.next/trace-build` are the build's own timing spans, which is what
"excluding timestamps" in the criterion names. Those twenty-four are excluded; the remaining 908 are compared.

Four values are masked in place rather than excluded, because each is minted fresh per build and says nothing
about the source that was compiled. Masking is by exact key, so the rest of every file that carries one is still
compared byte for byte:

- `.next/BUILD_ID`, the build's nanoid, and the `static/<BUILD_ID>/` path segment it names.
- `previewModeId`, `previewModeSigningKey` and `previewModeEncryptionKey` in `prerender-manifest.json`.
- `encryptionKey` in `server/server-reference-manifest.js` and `.json`, the Server Actions key.

That list is not a guess about what might vary. Two cold builds were compared with nothing masked at all: 28 of
the 908 files held a different digest and 6 paths existed in only one of the two builds. Every one of those
differences was one of the four values above, and once they were masked the two snapshots were equal. There is no
residue.

### The export is a capture, not a build

The criterion asks for the application **and the export** to build byte-identically twice. The application half
holds. The export half cannot, and the reason is a property of the artefact rather than a defect to fix.

`pnpm export:demo` does not compile anything. It signs in to a running instance as the demo Engineer and captures
the product's own render of every read-only surface (`scripts/export/build.ts`), which means the artefact is a
function of the commit **and** of the database at the moment of the walk, including the rows the walk itself
writes: the export replays an Ask, and that Ask stores a new trace.

Measured: two runs against one local production server on the same commit and the same seeded database each
produced a file of 1,457,869 bytes with a different SHA-256
(`1ca012574e300f181ace407548c643bbcc6609753343a6b125aa4fb7f04c7aa8` and
`250823f1bce9e8e6ce191b09c04b176869061dba7ec9b4ea2192794879c258c9`). The two files differ in 95 byte runs, and
every one of them belongs to one of three families:

1. the uuid of the trace the capture's own replayed Ask created (`3f2be413-…` in the first run,
   `8dce42c5-…` in the second), and the eight-character short form of it the trace chips show;
2. the `Captured … UTC` stamp on the integrity surface (`18:14` and `18:17`);
3. that trace's own clock: `Server timestamp`, `Decided at`, and the range in the trace header.

With those three masked the two exports are byte-identical, SHA-256
`d2f73dbcc0d732a77ba633fce061ebe2efeb7e76d9412455651070105ea18c39`. So the export builder is deterministic given
the same input; what varies is only its record of when it ran and of the row it created while running.

The honest statement of the criterion for the export is therefore: **the export reproduces byte for byte except
for the identifiers and timestamps of the capture itself.** Making the raw bytes reproduce would need the capture
to replay a stored trace instead of writing a new one, which is a change to `scripts/export/`, not to the build.

## Two concurrent instances (AC-NFR-18)

`pnpm verify:two-instances` runs `tools/two-instances.sh`: two `next start` processes on two ports against one
database, then the address rate limit of `src/lib/ratelimit.ts` walked across both of them. The limit is a fixed
sixty-second window on the database clock, so `limit + 1` requests split evenly between the two instances must
produce exactly one 429 if, and only if, the counter is the shared row in `rate_limit_counter` rather than
anything either process holds in memory. The probe address is a fresh one out of 203.0.113.0/24 (TEST-NET-3), and
the body is an empty JSON object, which the login route answers 400 after the rate-limit upsert and before any
credential lookup, so no real account or address is touched.

**Result on 8 September 2026: 121 requests over 8 seconds, 61 to the first instance and 60 to the second, answered
120 x 400 and exactly one 429. The 429 came from the instance that had itself served 61 of the 121**, well under
the limit of 120, so it could not have refused on a count of its own.

The check is a local and staging one, not a CI audit: it needs a build and a database, and the Tier A `checks`
job has neither. The two other pieces of state the criterion names are proved elsewhere: the publication lease by
`tests/db/loop.test.ts`, where ten concurrent publishes of one accepted draft serialise on the advisory lock into
one revision, one child version and nine 409s, and the session by `src/db/schema.ts`, where it is a table. Every
module-scope binding in `src/` is either a frozen lookup table or a memoised loader of immutable data
(`stopWords`, the database handle, the tokeniser cache); none of them carries request state.
