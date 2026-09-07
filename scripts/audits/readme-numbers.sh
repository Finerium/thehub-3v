#!/usr/bin/env bash
# The README's figures are printed from data, never typed (blueprint section 1 invariant 6, 11.9 AC-DEL-08).
# `pnpm audit` runs this in Tier A, so a fixture that moves and a README that does not is a red build.
#
# The check needs the two files the numbers come from. bundle/fixtures.json is pulled with the bundle and
# evaluation/last-run.json is written by the golden runner; when either is absent the audit says so and fails,
# because a check that quietly passes on a missing input is worse than no check.
set -uo pipefail
cd "$(dirname "$0")/../.."

for f in bundle/fixtures.json evaluation/last-run.json README.md docs/architecture.svg; do
  if [ ! -f "$f" ]; then
    echo "readme-numbers: $f is missing; the README's figures cannot be checked against the data"
    exit 1
  fi
done

exec pnpm exec tsx scripts/readme-numbers.ts
