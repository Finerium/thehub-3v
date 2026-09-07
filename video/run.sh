#!/usr/bin/env bash
# The one way the video pipeline is run. Every command it wraps needs the three demo-account passwords, and they
# only ever exist as process environment: this wrapper hands them to the child through dotenv-cli and nothing here
# reads, prints or copies the file. Usage from the repository root:
#
#   bash video/run.sh pnpm exec tsx video/record.ts      # record the six beats and write the caption layer
#   bash video/run.sh bash video/encode.sh               # two-pass encode, burn-in, mux, verify
#
# The encode half needs no credential, but running both halves the same way keeps one entry point.
set -euo pipefail
cd "$(dirname "$0")/.."
exec pnpm exec dotenv -e .env.local -- "$@"
