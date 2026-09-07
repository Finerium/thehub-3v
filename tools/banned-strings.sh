#!/usr/bin/env bash
# Banned strings (blueprint 11.9 AC-DEL-06; the PRD's 26.4 checks 8 and 9). Two scans over plain text:
#
#   tools/banned-strings.sh --names   PATH...   check 8: legacy product names, Case 2 vocabulary presented as
#                                               a feature, a saving attached to the exposure figure
#   tools/banned-strings.sh --english PATH...   check 9: English only
#   tools/banned-strings.sh           PATH...   both
#
# Both scans read the same prepared text: every file's lines, prefixed with `path:line:`, with every string listed
# in tools/quoted-strings.txt removed first. That file is the one home of every exemption, for both scans, and its
# header states what may be listed there and why. An exemption is therefore always a reviewable line in a tracked
# file, never a special case buried in this script.
#
# A PATH is a plain-text file or a directory of them. This script never opens a PDF, a video or a database:
# tools/presubmit.sh extracts the deck text with pdftotext and hands the result here, so both scans read the same
# bytes a reader would see. Exit code 0 when every scan is clean, 1 on the first hit of either scan.
#
# ponytail: literal-word greps, no parser. A banned word split across a line break in extracted PDF text is not
# caught, and an exemption that spans one is not applied; if the deck ever wraps one, list the shortest span that
# survives on a single line rather than teaching this script to reassemble words.
set -uo pipefail
cd "$(dirname "$0")/.."

QUOTED="tools/quoted-strings.txt"

names=0
english=0
paths=()
for arg in "$@"; do
  case "$arg" in
    --names) names=1 ;;
    --english) english=1 ;;
    -*) echo "banned-strings: unknown option $arg" >&2; exit 2 ;;
    *) paths+=("$arg") ;;
  esac
done
if [ "$names" -eq 0 ] && [ "$english" -eq 0 ]; then names=1; english=1; fi
if [ "${#paths[@]}" -eq 0 ]; then
  echo "banned-strings: no path given; nothing was scanned, which is not the same as clean" >&2
  exit 2
fi

# Only the paths that exist are scanned, and the ones that do not are named, so an absent deliverable reads
# as absent rather than as a pass.
present=()
for p in "${paths[@]}"; do
  if [ -e "$p" ]; then present+=("$p"); else echo "banned-strings: not present, not scanned: $p"; fi
done
if [ "${#present[@]}" -eq 0 ]; then
  echo "banned-strings: none of the given paths exist; nothing was scanned"
  exit 1
fi

if [ ! -f "$QUOTED" ]; then
  echo "banned-strings: $QUOTED is missing; neither scan runs without its exemption list"
  exit 1
fi

# ---------------------------------------------------------------------------------------------------------
# The prepared text, built once and read by both scans: `path:line:content`, exemptions removed.
# ---------------------------------------------------------------------------------------------------------
scan="$(mktemp)"
strip="$(mktemp)"
trap 'rm -f "$scan" "$strip"' EXIT
grep -vE '^[[:space:]]*(#|$)' "$QUOTED" > "$strip" || true

while IFS= read -r -d '' f; do
  # A binary file is not text a reader reads; skip it rather than scan its bytes.
  grep -qI . "$f" 2>/dev/null || continue
  if [ -s "$strip" ]; then
    python3 - "$f" "$strip" >> "$scan" <<'PY'
import sys
path, strip = sys.argv[1], sys.argv[2]
exempt = [l.rstrip("\n") for l in open(strip, encoding="utf-8") if l.strip()]
for n, line in enumerate(open(path, encoding="utf-8", errors="replace"), 1):
    for e in exempt:
        line = line.replace(e, " ")
    print(f"{path}:{n}:{line}", end="")
PY
  else
    grep -nI '' "$f" | sed "s|^|$f:|" >> "$scan"
  fi
done < <(find "${present[@]}" -type f -print0 2>/dev/null)

status=0
hit() { # hit <label> <grep output>
  printf '%s\n' "$2"
  echo "banned-strings: $1"
  status=1
}

# ---------------------------------------------------------------------------------------------------------
# Check 8, part 1: the legacy product names of the earlier drafts. Whole word, either case.
# ---------------------------------------------------------------------------------------------------------
if [ "$names" -eq 1 ]; then
  # the names come from their one home, so this script does not have to carry them either
  LEGACY="$(grep -vE '^[[:space:]]*(#|$)' tools/legacy-names.txt | paste -sd '|' -)"
  [ -n "$LEGACY" ] || { echo "banned-strings: tools/legacy-names.txt lists no name"; exit 1; }
  out="$(grep -nIiwE -e "$LEGACY" "$scan" 2>/dev/null | cut -d: -f2-)" \
    && hit "a legacy product name survives" "$out"

  # Check 8, part 2: Case 2 vocabulary presented as a feature. The bare adjective "Predictive" is a work type
  # the organiser's workbook uses and is allowed, which is why every verb form below is whole-word; what is banned is the product claiming to predict, to
  # prioritise alerts, or to be a single pane of glass (invariant 12, Case 1 only). A sentence that DENIES the
  # capability is exempted by name in tools/quoted-strings.txt, never by a rule here.
  CASE2='\b(predicts?|predicting|prediction)\b|\bpredictive (analytics|maintenance|alert|model|score|scoring)|forecasts? (a )?failure|failure (prediction|forecast)|(prioriti[sz]|rank)(e|es|ed|ing)? (the )?alerts?|alert (prioriti[sz]ation|ranking|triage)|single pane of glass|early warning|remaining useful life'
  out="$(grep -nIiE -e "$CASE2" "$scan" 2>/dev/null | cut -d: -f2-)" \
    && hit "Case 2 vocabulary presented as a feature (invariant 12: nothing predicts, alerts or prioritises)" "$out"

  # Check 8, part 3: a saving attached to the exposure figure. The coverage exposure is what the uncovered
  # records cost and took, as the workbook recorded it; it is never a saving the product claims.
  out="$(grep -nIiE -e '\bsav(e|es|ed|ing|ings)\b' "$scan" 2>/dev/null | cut -d: -f2- | grep -iE 'IDR|\bRp\b|exposure|downtime')" \
    && hit "a saving is attached to the exposure figure" "$out"
fi

# ---------------------------------------------------------------------------------------------------------
# Check 9: English only. Indonesian function words that are not English words, matched lowercase and whole.
# ---------------------------------------------------------------------------------------------------------
if [ "$english" -eq 1 ]; then
  ID='yang|dan|untuk|dengan|dari|pada|adalah|tidak|akan|atau|ini|itu|dalam|ke|di|sebagai|oleh|karena|juga|bisa|dapat|harus|sudah|telah|kami|kita|mereka|saya|anda|bagaimana|kenapa|mengapa|cara|ada|apa|kalau|jika|agar|saat|setelah|sebelum|semua|lebih|sangat|tersebut|terhadap|melalui|tanpa|hanya|masih|belum|bukan|seperti|antara|hingga|sampai|serta|yaitu|namun|tetapi|sehingga|mematikan|semalam'

  out="$(grep -nE "(^|[^[:alnum:]])(${ID})([^[:alnum:]]|$)" "$scan" 2>/dev/null | cut -d: -f2-)" \
    && hit "an Indonesian word appears outside tools/quoted-strings.txt" "$out"
fi

if [ "$status" -eq 0 ]; then
  echo "banned-strings: clean over ${#present[@]} path(s)"
fi
exit "$status"
