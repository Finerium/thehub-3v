#!/usr/bin/env bash
# The submission checklist as a script (the PRD's 26.4, blueprint 9.12 and 11.9 AC-DEL-04). Thirteen checks,
# run on the frozen bundle, none of which depends on anyone's memory on the last evening.
#
#   tools/presubmit.sh                        the defaults below
#   tools/presubmit.sh --dir deliverables --base-url https://thehub-3v.vercel.app
#   tools/presubmit.sh --skip-live            everything except check 12 (no network available)
#
# Exit codes
#   0  every check passed
#   2  every check that can pass has passed; only human-gated remainders are outstanding, named in the report
#   1  at least one check failed, or a deliverable that must exist does not
#
# Two of the thirteen read differently in this run, and both deviations are recorded in .crown/notes.md:
#
#   check 6  D-08. The faculty supervisor's name is withheld by owner decision, so the check is a LABELLED
#            supervisor line on the Team Profile page (the fixed string in src/lib/fixed-strings.ts, read
#            from there and never retyped here) plus the six mandated table headings in order on that same
#            page. The PRD's "with a name on it" is recorded as a compliance risk in the Report.
#   check 12 D-07. The deployment is fully behind login and there is no signed reviewer link, so the check is
#            that GET /api/health and GET /login answer 200 from a clean network. The reviewer-link leg is
#            dropped, not silently passed.
#
# ponytail: the checks shell out to pdftotext, ffprobe, curl, sha256sum and one headless browser rather than
# parsing any format here. A missing tool is reported as a missing tool, never as a pass.
set -uo pipefail
cd "$(dirname "$0")/.."
REPO="$PWD"
WORLD="$(cd "$REPO/.." && pwd)"

DIR="deliverables"
BASE_URL="https://thehub-3v.vercel.app"
SKIP_LIVE=0
while [ "$#" -gt 0 ]; do
  case "$1" in
    --dir) DIR="$2"; shift 2 ;;
    --base-url) BASE_URL="$2"; shift 2 ;;
    --skip-live) SKIP_LIVE=1; shift ;;
    *) echo "presubmit: unknown option $1" >&2; exit 2 ;;
  esac
done

EXPORT="$DIR/TheHub_prototype.html"
DECK="$DIR/TheHub_deck.pdf"
VIDEO="$DIR/TheHub_demo.mp4"
POINTER="$DIR/TheHub_README.pdf"
SUMS="$DIR/SHA256SUMS.txt"
NARRATION="video/narration.md"
TEAM_FACTS="$WORLD/supplied/team-facts.json"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
DECK_TEXT="$TMP/deck.txt"

failures=0
remainders=0
n=0
current=""

check() { n=$((n + 1)); current="$1"; printf '\n%2d. %s\n' "$n" "$1"; }
pass()  { printf '    PASS       %s\n' "$1"; }
fail()  { printf '    FAIL       %s\n' "$1"; failures=$((failures + 1)); }
absent(){ printf '    NOT BUILT  %s\n' "$1"; failures=$((failures + 1)); }
human() { printf '    HUMAN      %s\n' "$1"; remainders=$((remainders + 1)); }
note()  { printf '               %s\n' "$1"; }

have() { command -v "$1" >/dev/null 2>&1; }

echo "The Hub, pre-submit checklist (PRD 26.4, thirteen checks)"
echo "repository   $REPO"
echo "deliverables $DIR"
echo "live         $BASE_URL"
echo "commit       $(git -C "$REPO" rev-parse --short HEAD 2>/dev/null || echo 'not a git checkout')"
echo "recorded     $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# The deck text is extracted once with the pinned extractor and reused by checks 3, 4, 5, 6, 7, 8 and 9, so
# every one of them reads the same bytes a reader would see.
if [ -f "$DECK" ] && have pdftotext; then
  pdftotext -layout "$DECK" "$DECK_TEXT" 2>/dev/null || true
fi

# ---------------------------------------------------------------------------------------------------------
check "The three mandatory deliverables are present and each is the artefact its name claims"
# ---------------------------------------------------------------------------------------------------------
if [ ! -d "$DIR" ]; then
  absent "$DIR/ does not exist"
else
  want_type() { # want_type <file> <mime>
    [ -f "$1" ] || { absent "$1 is not built"; return; }
    got="$(file -b --mime-type "$1" 2>/dev/null)"
    case "$1:$got" in
      *.html:text/html|*.html:text/plain) pass "$1 ($got, $(wc -c < "$1") bytes)" ;;
      *.pdf:application/pdf)              pass "$1 ($got, $(wc -c < "$1") bytes)" ;;
      *.mp4:video/mp4)                    pass "$1 ($got, $(wc -c < "$1") bytes)" ;;
      *) fail "$1 reports $got, which is not the artefact its name claims" ;;
    esac
  }
  want_type "$EXPORT" text/html
  want_type "$DECK" application/pdf
  want_type "$VIDEO" video/mp4
  [ -f "$POINTER" ] && pass "$POINTER is present (optional, the only other file that may be uploaded)"
  # SHA256SUMS.txt is a repository record and is never uploaded; anything else in the directory would be.
  stray="$(find "$DIR" -maxdepth 1 -type f \
    ! -name 'TheHub_prototype.html' ! -name 'TheHub_deck.pdf' ! -name 'TheHub_demo.mp4' \
    ! -name 'TheHub_README.pdf' ! -name 'SHA256SUMS.txt' -print 2>/dev/null)"
  if [ -n "$stray" ]; then
    printf '%s\n' "$stray"
    fail "a file that is neither a deliverable nor the checksum record sits in $DIR"
  fi
fi

# ---------------------------------------------------------------------------------------------------------
check "The uploaded bytes are at most 10,000,000, and each file is inside its own budget"
# ---------------------------------------------------------------------------------------------------------
budget() { # budget <file> <limit>
  [ -f "$1" ] || { note "$1 is not built, so it spends nothing yet"; return; }
  b="$(wc -c < "$1" | tr -d ' ')"
  if [ "$b" -le "$2" ]; then pass "$1 $b of $2 bytes"; else fail "$1 $b bytes, over its budget of $2"; fi
}
budget "$EXPORT" 2000000
budget "$DECK" 2000000
budget "$VIDEO" 5000000
[ -f "$POINTER" ] && budget "$POINTER" 150000
total=0
for f in "$EXPORT" "$DECK" "$VIDEO" "$POINTER"; do
  [ -f "$f" ] && total=$((total + $(wc -c < "$f" | tr -d ' ')))
done
if [ "$total" -le 10000000 ]; then
  pass "the upload sums to $total of 10,000,000 bytes (buffer 850,000 never spent)"
else
  fail "the upload sums to $total bytes, over the ceiling of 10,000,000"
fi

# ---------------------------------------------------------------------------------------------------------
check "The deck has at most seven pages before the first page whose footer reads APPENDIX"
# ---------------------------------------------------------------------------------------------------------
if [ ! -f "$DECK" ]; then
  absent "$DECK is not built"
elif ! have pdftotext; then
  fail "pdftotext is not on PATH (the pinned extractor of ADR-005)"
else
  pages="$(pdfinfo "$DECK" 2>/dev/null | awk '/^Pages:/{print $2}')"
  first_appendix=""
  p=1
  while [ -n "$pages" ] && [ "$p" -le "$pages" ]; do
    if pdftotext -layout -f "$p" -l "$p" "$DECK" - 2>/dev/null | grep -qw 'APPENDIX'; then
      first_appendix="$p"; break
    fi
    p=$((p + 1))
  done
  if [ -z "$first_appendix" ]; then
    fail "no page carries an APPENDIX footer, so the seven-page limit cannot be measured (9.12 asks for A1 to A9)"
  elif [ "$((first_appendix - 1))" -le 7 ]; then
    pass "$((first_appendix - 1)) pages before the APPENDIX footer on page $first_appendix (of $pages)"
  else
    fail "$((first_appendix - 1)) pages before the APPENDIX footer on page $first_appendix, the limit is 7"
  fi
fi

# ---------------------------------------------------------------------------------------------------------
check "The six booklet headings appear in the deck text in order, whole word, by first occurrence"
# ---------------------------------------------------------------------------------------------------------
if [ ! -s "$DECK_TEXT" ]; then
  absent "no deck text to read"
else
  out="$(python3 - "$DECK_TEXT" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
wanted = ["Background", "Solution", "Business Impact", "Feasibility", "Conclusion", "Team Profile"]
found, missing = [], []
for w in wanted:
    m = re.search(r"\b" + re.escape(w) + r"\b", text)
    (found.append((w, m.start())) if m else missing.append(w))
if missing:
    print("MISSING " + ", ".join(missing)); raise SystemExit
order = [p for _, p in found]
if order == sorted(order):
    print("OK " + " < ".join(f"{w}@{p}" for w, p in found))
else:
    print("ORDER " + " ".join(f"{w}@{p}" for w, p in found))
PY
)"
  case "$out" in
    OK*)      pass "${out#OK }" ;;
    MISSING*) fail "a mandated heading does not appear: ${out#MISSING }" ;;
    ORDER*)   fail "the headings appear out of order: ${out#ORDER }" ;;
    *)        fail "the heading scan returned nothing readable" ;;
  esac
fi

# ---------------------------------------------------------------------------------------------------------
check "KQ1, KQ2 and KQ3 all appear in the deck text"
# ---------------------------------------------------------------------------------------------------------
if [ ! -s "$DECK_TEXT" ]; then
  absent "no deck text to read"
else
  missing=""
  for k in KQ1 KQ2 KQ3; do grep -qF "$k" "$DECK_TEXT" || missing="$missing $k"; done
  if [ -z "$missing" ]; then pass "KQ1, KQ2 and KQ3 are labelled in the deck"; else fail "absent:$missing"; fi
fi

# ---------------------------------------------------------------------------------------------------------
check "The Team Profile page carries a labelled supervisor line and the six table headings in order (D-08)"
# ---------------------------------------------------------------------------------------------------------
SUPERVISOR_LINE="$(sed -n 's/^export const SUPERVISOR_LINE = "\(.*\)";$/\1/p' src/lib/fixed-strings.ts)"
if [ -z "$SUPERVISOR_LINE" ]; then
  fail "src/lib/fixed-strings.ts exports no SUPERVISOR_LINE; the one home of that wording is missing"
elif [ ! -f "$DECK" ] || ! have pdftotext; then
  absent "no deck to read the Team Profile page from"
else
  page="$(python3 - "$DECK" <<'PY'
import subprocess, sys
pdf = sys.argv[1]
info = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True).stdout
pages = next((int(l.split()[1]) for l in info.splitlines() if l.startswith("Pages:")), 0)
for p in range(1, pages + 1):
    t = subprocess.run(["pdftotext", "-layout", "-f", str(p), "-l", str(p), pdf, "-"],
                       capture_output=True, text=True).stdout
    if "Team Profile" in t:
        print(p); break
PY
)"
  if [ -z "$page" ]; then
    fail "no page of the deck carries the heading Team Profile"
  else
    pdftotext -layout -f "$page" -l "$page" "$DECK" "$TMP/team.txt" 2>/dev/null
    if grep -qF "$SUPERVISOR_LINE" "$TMP/team.txt"; then
      pass "page $page carries the labelled supervisor line"
      note "D-08: the name itself is withheld by owner decision and is a compliance risk in the Report"
    else
      fail "page $page carries no labelled supervisor line (expected the SUPERVISOR_LINE of src/lib/fixed-strings.ts)"
    fi
    out="$(python3 - "$TMP/team.txt" <<'PY'
import re, sys
text = open(sys.argv[1], encoding="utf-8", errors="replace").read()
wanted = ["No.", "Name", "Major", "Semester", "Area of expertise", "Contribution"]
found, missing = [], []
for w in wanted:
    m = re.search(re.escape(w), text)
    (found.append((w, m.start())) if m else missing.append(w))
if missing:
    print("MISSING " + ", ".join(missing)); raise SystemExit
order = [p for _, p in found]
print(("OK " if order == sorted(order) else "ORDER ") + " ".join(f"{w}@{p}" for w, p in found))
PY
)"
    case "$out" in
      OK*)      pass "the six mandated table headings are on page $page in order" ;;
      MISSING*) fail "a mandated table heading is absent from page $page: ${out#MISSING }" ;;
      ORDER*)   fail "the table headings on page $page are out of order: ${out#ORDER }" ;;
      *)        fail "the table-heading scan returned nothing readable" ;;
    esac
  fi
fi

# ---------------------------------------------------------------------------------------------------------
check "No placeholder marker survives in any deliverable"
# ---------------------------------------------------------------------------------------------------------
MARKER='TBD_'
hits=""
for f in "$DECK_TEXT" "$EXPORT" "$NARRATION" video/*.vtt video/*.srt; do
  [ -f "$f" ] || continue
  h="$(grep -nF "$MARKER" "$f" 2>/dev/null)" && hits="$hits
$f: $h"
done
if [ -n "$hits" ]; then
  printf '%s\n' "$hits"
  fail "the placeholder marker $MARKER survives in a deliverable"
else
  pass "no $MARKER marker in any built deliverable"
fi
if [ -f "$TEAM_FACTS" ]; then
  keys="$(grep -o '"[A-Za-z_]*": *"TBD_[A-Z_]*"' "$TEAM_FACTS" 2>/dev/null | sed 's/.*"\(TBD_[A-Z_]*\)"/\1/' | sort -u | tr '\n' ' ')"
  keys="$(printf '%s' "$keys" | sed 's/ *$//')"
  if [ -n "$keys" ]; then
    human "supplied/team-facts.json still carries: $keys"
    note "D-08 resolves TBD_SEMESTER (3 for all three members) and replaces TBD_SUPERVISOR_NAME and"
    note "TBD_SUPERVISOR_TITLE with the labelled line above; TBD_FINAL_WINDOW and TBD_REGISTRATION_DATE"
    note "are off the deliverable path. Any key still listed here is the owner's to fill."
  else
    pass "supplied/team-facts.json carries no placeholder"
  fi
fi

# ---------------------------------------------------------------------------------------------------------
check "Banned strings are clean across the deck text, the narration script, the captions and the export"
# ---------------------------------------------------------------------------------------------------------
targets=()
[ -s "$DECK_TEXT" ] && targets+=("$DECK_TEXT")
[ -f "$NARRATION" ] && targets+=("$NARRATION")
[ -f "$EXPORT" ] && targets+=("$EXPORT")
for c in video/*.vtt video/*.srt; do [ -f "$c" ] && targets+=("$c"); done
if [ "${#targets[@]}" -eq 0 ]; then
  absent "none of the deck text, the narration, the captions or the export exists yet"
elif bash tools/banned-strings.sh --names "${targets[@]}"; then
  pass "no legacy product name, no Case 2 vocabulary as a feature, no saving on the exposure figure"
else
  fail "tools/banned-strings.sh --names reported a hit"
fi

# ---------------------------------------------------------------------------------------------------------
check "English only in the deck text and the captions, outside a marked quotation"
# ---------------------------------------------------------------------------------------------------------
targets=()
[ -s "$DECK_TEXT" ] && targets+=("$DECK_TEXT")
for c in video/*.vtt video/*.srt; do [ -f "$c" ] && targets+=("$c"); done
if [ "${#targets[@]}" -eq 0 ]; then
  absent "neither the deck text nor a caption file exists yet"
elif bash tools/banned-strings.sh --english "${targets[@]}"; then
  pass "no Indonesian outside tools/quoted-strings.txt"
else
  fail "tools/banned-strings.sh --english reported a hit"
fi

# ---------------------------------------------------------------------------------------------------------
check "The video is at most 180 seconds by ffprobe and carries a caption track"
# ---------------------------------------------------------------------------------------------------------
if [ ! -f "$VIDEO" ]; then
  absent "$VIDEO is not built"
elif ! have ffprobe; then
  fail "ffprobe is not on PATH"
else
  dur="$(ffprobe -v error -show_entries format=duration -of default=nk=1:nw=1 "$VIDEO" 2>/dev/null)"
  secs="$(printf '%.0f' "${dur:-0}")"
  if [ "$secs" -le 180 ] && [ "$secs" -gt 0 ]; then
    pass "duration ${secs} s of 180 (planned 175)"
  else
    fail "duration ${secs} s, the limit is 180"
  fi
  subs="$(ffprobe -v error -select_streams s -show_entries stream=codec_name -of default=nk=1:nw=1 "$VIDEO" 2>/dev/null | tr '\n' ' ')"
  if [ -n "$subs" ]; then
    pass "embedded caption stream: $subs (captions are also burned in, D-09)"
  else
    fail "no embedded caption stream (9.12 asks for mov_text beside the burned-in captions)"
  fi
fi
if [ -f "$NARRATION" ] && ! ls video/*.wav video/*.m4a video/*.mp3 >/dev/null 2>&1; then
  human "narration is not recorded: the audio track is silence and the captions are burned in (D-09)"
fi

# ---------------------------------------------------------------------------------------------------------
check "The export opens from file:// with the network disabled and its surfaces render"
# ---------------------------------------------------------------------------------------------------------
if [ ! -f "$EXPORT" ]; then
  absent "$EXPORT is not built"
elif ! pnpm exec playwright --version >/dev/null 2>&1; then
  fail "playwright is not installed (pnpm install, then pnpm exec playwright install chromium)"
else
  pnpm exec node tools/offline-export.mjs "$EXPORT" "$TMP/offline.json" >"$TMP/offline.out" 2>"$TMP/offline.err"
  out="$(cat "$TMP/offline.json" 2>/dev/null)"
  if [ -z "$out" ]; then
    sed -n '1,10p' "$TMP/offline.err"; sed -n '1,10p' "$TMP/offline.out"
    fail "the headless run produced no report"
  else
    ext="$(printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d["external"]))')"
    errs="$(printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d["errors"]))')"
    surf="$(printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(len(d["surfaces"]))')"
    names="$(printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(", ".join(d["surfaces"]))')"
    snap="$(printf '%s' "$out" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["snapshot"])')"
    [ "$ext" = "0" ] && pass "no external request of any kind" || { printf '%s\n' "$out"; fail "$ext external request(s) were attempted"; }
    [ "$errs" = "0" ] && pass "no page error" || { printf '%s\n' "$out"; fail "$errs page error(s)"; }
    [ "$snap" = "True" ] && pass "the JSON snapshot is embedded" || fail "no embedded JSON snapshot found"
    if [ "$surf" -ge 7 ]; then
      pass "$surf surfaces render: $names"
    else
      fail "$surf surface(s) render, the checklist asks for seven"
      note "the export marks each rendered surface with data-x-route=\"<slug>\"; that attribute is what is counted"
    fi
  fi
fi

# ---------------------------------------------------------------------------------------------------------
check "The live deployment answers from a clean network (D-07: health and login, no reviewer link)"
# ---------------------------------------------------------------------------------------------------------
if [ "$SKIP_LIVE" -eq 1 ]; then
  fail "skipped by --skip-live; the live leg is unproved, not passed"
else
  for path in /api/health /login; do
    code="$(curl -s -o "$TMP/live.out" -w '%{http_code}' --max-time 60 --retry 2 -H 'cache-control: no-cache' "$BASE_URL$path")"
    if [ "$code" = "200" ]; then
      pass "GET $path -> 200"
    else
      fail "GET $path -> $code"
    fi
  done
  version="$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1])).get("corpus_version",""))' "$TMP/live.out" 2>/dev/null || true)"
  code="$(curl -s -o "$TMP/health.json" -w '%{http_code}' --max-time 60 "$BASE_URL/api/health")"
  if [ "$code" = "200" ]; then
    note "health reports: $(python3 -c 'import json,sys; d=json.load(open(sys.argv[1])); print(" ".join(f"{k}={v}" for k,v in d.items() if k in ("status","corpus_version","commit")))' "$TMP/health.json" 2>/dev/null)"
  fi
  note "D-07: every other route is behind login; credentials are issued by Team 3V to the Committee out of band"
fi

# ---------------------------------------------------------------------------------------------------------
check "SHA256SUMS.txt carries the commit and the time, and reads back equal to the files"
# ---------------------------------------------------------------------------------------------------------
uploads=()
for f in "$EXPORT" "$DECK" "$VIDEO" "$POINTER"; do [ -f "$f" ] && uploads+=("$f"); done
if [ "${#uploads[@]}" -eq 0 ]; then
  absent "there is nothing to checksum yet"
else
  commit="$(git -C "$REPO" rev-parse HEAD 2>/dev/null || echo unknown)"
  {
    echo "# The Hub, CALIBER 2026 Case 1, Team 3V. The files as they were uploaded."
    echo "# commit    $commit"
    echo "# recorded  $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    for f in "${uploads[@]}"; do
      (cd "$DIR" && sha256sum "$(basename "$f")")
    done
  } > "$SUMS"
  if (cd "$DIR" && sha256sum -c --quiet "$(basename "$SUMS")" 2>/dev/null); then
    pass "$SUMS written and read back equal for ${#uploads[@]} file(s), commit ${commit:0:7}"
    note "the checksum record stays in the repository and is never uploaded"
  else
    fail "$SUMS does not read back equal to the files it names"
  fi
fi

# ---------------------------------------------------------------------------------------------------------
printf '\n%s\n' "-----------------------------------------------------------------------------------------------"
echo "$n checks run, $failures failing, $remainders human-gated remainder(s)"
if [ "$failures" -eq 0 ] && [ "$remainders" -eq 0 ]; then
  echo "presubmit: every check passed"
  exit 0
fi
if [ "$failures" -eq 0 ]; then
  echo "presubmit: every check that can pass has passed; the remainders above are the owner's to close"
  exit 2
fi
echo "presubmit: not ready to submit"
exit 1
