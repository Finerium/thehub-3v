#!/usr/bin/env bash
# `pnpm audit`: runs every scripts/audits/*.sh and exits non-zero when any of them fails.
set -uo pipefail
cd "$(dirname "$0")/../.."
status=0
for f in scripts/audits/*.sh; do
  [ "$(basename "$f")" = "run.sh" ] && continue
  echo "== $f"
  if bash "$f"; then
    echo "ok: $f"
  else
    echo "FAIL: $f"
    status=1
  fi
done
exit "$status"
