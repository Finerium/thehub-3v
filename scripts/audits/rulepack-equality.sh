#!/usr/bin/env bash
# Rule-pack equality (ADR-002, AC-ANS-10): the Python reference (thehub-harness/harness/rulepack.py) and the
# TypeScript port (src/rulepack) classify the same fixture texts of bundle/rulepack/v1.json (positives, negatives,
# moments) and screen the same approved lessons (the `outbound` fixtures, one per lesson), and both result JSONs
# must be byte-identical. Deterministic: no model, no database, no network.
#
#   scripts/audits/rulepack-equality.sh [OUT_DIR]
#
# OUT_DIR (default: a temporary directory) receives reference.json and port.json for the fixture texts, and
# reference-outbound.json and port-outbound.json for the lesson screens. HARNESS_DIR overrides the sibling checkout
# (../thehub-harness), where `uv run` provides the reference's environment. Exit status is non-zero when the bundle
# copy of the pack differs from the harness's, when either lane fails, or when either pair differs.
#
# The outbound lane needs the lesson texts, which are the organiser's corpus and live in no repository: it runs
# where the corpus is reachable through the harness extractor and reports itself NOT AUDITED where it is not. The
# texts pass between the lanes in their own temporary file, removed on exit, and enter no result file: an outbound
# entry names its lesson by opl_id alone. Set RULEPACK_EQUALITY_REQUIRE_OUTBOUND=1 to make a run that cannot reach
# the texts fail instead, which is what a corpus-carrying job should do.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HARNESS_DIR="${HARNESS_DIR:-$REPO_ROOT/../thehub-harness}"
OUT_DIR="${1:-$(mktemp -d)}"
PACK="$REPO_ROOT/bundle/rulepack/v1.json"
mkdir -p "$OUT_DIR"
# The lesson texts never touch OUT_DIR, which a caller may point anywhere; their own directory goes at exit.
TEXTS_DIR="$(mktemp -d)"
trap 'rm -rf "$TEXTS_DIR"' EXIT
LESSONS="$TEXTS_DIR/lessons.json"

if ! cmp -s "$PACK" "$HARNESS_DIR/rulepack/v1.json"; then
  echo "rulepack equality: bundle/rulepack/v1.json differs from $HARNESS_DIR/rulepack/v1.json (pull the bundle first)" >&2
  exit 1
fi

# Lane 1, the reference: harness.rulepack.classify over every fixture text, in fixture order, then
# harness.rulepack.screen_outbound over every approved lesson against the whitelist of all of them.
uv run --directory "$HARNESS_DIR" python - "$PACK" "$OUT_DIR/reference.json" "$OUT_DIR/reference-outbound.json" "$LESSONS" <<'PY'
import json
import sys

from harness import rulepack as R

pack = R.load(sys.argv[1])
out = [
    {"group": group, "index": i, "result": R.classify(pack, item["text"]), "text": item["text"]}
    for group in ("positives", "negatives", "moments")
    for i, item in enumerate(pack["fixtures"][group])
]

try:
    from harness.pdftext import opl_texts

    lessons = opl_texts()
except Exception as exc:  # no corpus on this machine: the lane says so, it never invents a result
    lessons = {}
    print(f"rulepack equality: outbound NOT AUDITED, the lesson texts are unreachable ({type(exc).__name__})")

whitelist = list(lessons.values())
screens = []
for i, (opl_id, text) in enumerate(sorted(lessons.items())):
    s = R.screen_outbound(pack, text, whitelist)
    screens.append(
        {"blocked": s["blocked"], "index": i, "opl_id": opl_id, "result": s["residual"], "whitelisted": s["whitelisted"]}
    )


def write(path, value):
    with open(path, "w", encoding="utf-8") as f:
        f.write(json.dumps(value, ensure_ascii=False, indent=1, sort_keys=True) + "\n")


write(sys.argv[2], out)
if lessons:
    write(sys.argv[3], screens)
with open(sys.argv[4], "w", encoding="utf-8") as f:
    json.dump(lessons, f, ensure_ascii=False)
print(f"rulepack equality: reference classified {len(out)} texts and screened {len(screens)} lesson(s)")
PY

OUTBOUND=1
if [ ! -s "$LESSONS" ] || [ "$(cat "$LESSONS")" = "{}" ]; then
  OUTBOUND=0
  if [ -n "${RULEPACK_EQUALITY_REQUIRE_OUTBOUND:-}" ]; then
    echo "rulepack equality: the outbound lane is required on this run and the lesson texts were unreachable" >&2
    exit 1
  fi
  echo "rulepack equality: outbound lane NOT AUDITED here; set RULEPACK_EQUALITY_REQUIRE_OUTBOUND=1 on a job that holds the corpus"
fi

# Lane 2, the port: the same texts and the same lessons through src/rulepack, compared field by field.
if [ "$OUTBOUND" -eq 1 ]; then
  (cd "$REPO_ROOT" && pnpm exec tsx scripts/audits/rulepack-equality.ts "$OUT_DIR/reference.json" "$OUT_DIR/port.json" "$LESSONS" "$OUT_DIR/reference-outbound.json" "$OUT_DIR/port-outbound.json")
else
  (cd "$REPO_ROOT" && pnpm exec tsx scripts/audits/rulepack-equality.ts "$OUT_DIR/reference.json" "$OUT_DIR/port.json")
fi

# The criterion's wording: byte-identical result JSON, for the fixture texts and for the lesson screens.
if cmp -s "$OUT_DIR/reference.json" "$OUT_DIR/port.json"; then
  echo "rulepack equality: reference.json and port.json are byte-identical ($(shasum -a 256 "$OUT_DIR/port.json" | cut -c1-16))"
else
  echo "rulepack equality: reference.json and port.json differ (see $OUT_DIR)" >&2
  exit 1
fi

if [ "$OUTBOUND" -eq 1 ]; then
  if cmp -s "$OUT_DIR/reference-outbound.json" "$OUT_DIR/port-outbound.json"; then
    echo "rulepack equality: reference-outbound.json and port-outbound.json are byte-identical ($(shasum -a 256 "$OUT_DIR/port-outbound.json" | cut -c1-16))"
  else
    echo "rulepack equality: reference-outbound.json and port-outbound.json differ (see $OUT_DIR)" >&2
    exit 1
  fi
fi
