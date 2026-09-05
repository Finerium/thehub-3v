#!/usr/bin/env bash
# Rule-pack equality (ADR-002, AC-ANS-10): the Python reference (thehub-harness/harness/rulepack.py) and the
# TypeScript port (src/rulepack) classify the same fixture texts of bundle/rulepack/v1.json (positives, negatives,
# moments) and their result JSON must be byte-identical. Deterministic: no model, no database, no network.
#
#   scripts/audits/rulepack-equality.sh [OUT_DIR]
#
# OUT_DIR (default: a temporary directory) receives reference.json and port.json. HARNESS_DIR overrides the sibling
# checkout (../thehub-harness), where `uv run` provides the reference's environment. Exit status is non-zero when the
# bundle copy of the pack differs from the harness's, when either lane fails, or when the two results differ.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HARNESS_DIR="${HARNESS_DIR:-$REPO_ROOT/../thehub-harness}"
OUT_DIR="${1:-$(mktemp -d)}"
PACK="$REPO_ROOT/bundle/rulepack/v1.json"
mkdir -p "$OUT_DIR"

if ! cmp -s "$PACK" "$HARNESS_DIR/rulepack/v1.json"; then
  echo "rulepack equality: bundle/rulepack/v1.json differs from $HARNESS_DIR/rulepack/v1.json (pull the bundle first)" >&2
  exit 1
fi

# Lane 1, the reference: harness.rulepack.classify over every fixture text, in fixture order.
uv run --directory "$HARNESS_DIR" python - "$PACK" "$OUT_DIR/reference.json" <<'PY'
import json
import sys

from harness import rulepack as R

pack = R.load(sys.argv[1])
out = [
    {"group": group, "index": i, "result": R.classify(pack, item["text"]), "text": item["text"]}
    for group in ("positives", "negatives", "moments")
    for i, item in enumerate(pack["fixtures"][group])
]
with open(sys.argv[2], "w", encoding="utf-8") as f:
    f.write(json.dumps(out, ensure_ascii=False, indent=1, sort_keys=True) + "\n")
print(f"rulepack equality: reference classified {len(out)} texts")
PY

# Lane 2, the port: the same texts through src/rulepack, compared field by field.
(cd "$REPO_ROOT" && pnpm exec tsx scripts/audits/rulepack-equality.ts "$OUT_DIR/reference.json" "$OUT_DIR/port.json")

# The criterion's wording: byte-identical result JSON.
if cmp -s "$OUT_DIR/reference.json" "$OUT_DIR/port.json"; then
  echo "rulepack equality: reference.json and port.json are byte-identical ($(shasum -a 256 "$OUT_DIR/port.json" | cut -c1-16))"
else
  echo "rulepack equality: reference.json and port.json differ (see $OUT_DIR)" >&2
  exit 1
fi
