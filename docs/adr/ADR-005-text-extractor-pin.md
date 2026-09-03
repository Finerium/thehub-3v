# ADR-005 The text-extractor pin

## Context

LD-11 requires the exact `pdftotext` build string to be identical wherever the harness runs, because every coverage figure is a function of the extractor's tokenisation. The fixture was frozen under poppler 26.02.0. GitHub's ubuntu-24.04 runner ships poppler 24.02.0 and Homebrew's current formula is 26.08.

## Decision

One exact build, `pdftotext` 26.02.0, is pinned and installed identically everywhere (deviation D-11): Homebrew poppler at 26.02.0 on the build machine, and conda-forge `poppler=26.02.0` installed through micromamba in CI (the build exists for linux-64 and osx-arm64). The harness runs `pdftotext -raw`, never `-layout`. The fixture records `inventory.extractor` as the exact string `pdftotext -raw (pdftotext version 26.02.0)`; `tests/test_fixtures.py` asserts that string (`FROZEN_EXTRACTOR`), so a run under any other build fails before it produces a number; the bundle manifest carries the same string in `extractor`.

## Alternatives

- A pinned container image, the other mechanism the blueprint allowed: not chosen; micromamba installs the same conda-forge build on both platforms without a registry.
- Re-freezing every figure under the runner's 24.02.0 or Homebrew's 26.08: rejected, it would re-run every table and every deliverable for nothing.

## Consequences

- The local harness run and the CI run must print the same extractor string before any coverage figure is trusted.
- `make check` in the harness greps that no `-layout` invocation exists outside `legacy/`.

## Status

Accepted 2026-09-03
