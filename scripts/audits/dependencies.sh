#!/usr/bin/env bash
# Dependency advisories (AC-NFR-12, the CVE clause; blueprint section 11): zero open advisories against this
# checkout's frozen lockfile. Run on its own with `pnpm audit:deps`, and in CI as one of the scripts/audits/*.sh
# the `pnpm run audit` step globs, so a new advisory published upstream reddens the next run with nothing in the
# repository having changed.
#
# The gate is set one step below the criterion. AC-NFR-12 asks for zero high or critical; this fails on moderate
# and above, which is where the tree stands after the three advisories of 2026-09-08 were closed by the pnpm
# overrides in package.json. docs/supply-chain.md records, for each override, why it is safe for the code path
# that reaches the package.
#
# The check reaches the advisory database, so it fails closed without a network. That is deliberate: a supply
# chain check that passes because it could not ask is worse than one that says it could not ask.
set -uo pipefail
cd "$(dirname "$0")/../.."

pnpm audit --audit-level moderate
