#!/usr/bin/env bash
# `bash scripts/audits/secret-scan.sh [path...]`: the closing clause of AC-NFR-20, "no secret value appears in
# `.crown/`, the Report, any evidence file or any tracked file (a grep for the key prefixes and the
# connection-string pattern returns 0)". gitleaks already runs on every push, but it only ever sees the git
# repositories; `.crown/`, the evidence directory and the Report sit outside them, so the end-of-run check is this
# script, pointed at whatever paths are handed to it:
#
#   bash scripts/audits/secret-scan.sh                        # self-test, then every tracked file of this repository
#   bash scripts/audits/secret-scan.sh ../.crown ../Report.md  # the end-of-run sweep over what git never sees
#   bash scripts/audits/secret-scan.sh --self-test            # the planted-fake control on its own
#
# It greps for the SHAPE of a value, never for a value read from an environment file: this script reads no
# configuration, takes no key name from the environment and prints no matched text. A finding is reported as
# `path:line` plus the shape that fired, so the audit output can never itself become the leak (ADR-012).
#
# Its own planted fakes are assembled from split string literals, so this file is scanned like any other and still
# matches nothing. Ceiling, deliberately: a credential of pure letters inside a connection string reads as a
# placeholder here and is not reported. The alternative is flagging every `://user:password@host` in the
# documentation, which trains the reader to ignore the audit.
set -uo pipefail
cd "$(dirname "$0")/../.."

# --- the shapes ------------------------------------------------------------------------------------------------
# A connection string carrying a credential with at least one digit in it (a Neon role password is `npg_` plus
# base62, the pattern the criterion names).
CONN='(postgres|postgresql|mysql|mongodb\+srv|redis|rediss|amqp)://[A-Za-z0-9_.%-]+:[A-Za-z0-9_.%~+/=-]*[0-9][A-Za-z0-9_.%~+/=-]*@'
# A private key of any flavour, by its header.
PEM='-----BEGIN( [A-Z0-9]+)* PRIVATE KEY-----'
# Key prefixes and a long bearer credential.
PREFIX='(sk-[A-Za-z0-9]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|npg_[A-Za-z0-9]{12,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|[Aa]uthorization: *[Bb]earer +[A-Za-z0-9._~+/-]{20,})'
# One of the blueprint 9.15 names assigned a long literal value. CONFIRM_NAMED holds the second half of the same
# shape, applied as a conjunction: the value must also carry a digit. This is the same ceiling the connection
# string draws, and it is drawn on purpose. A generated secret (32 bytes base64url, `npg_` plus base62, a hex
# token) always carries digits; a hyphenated English literal is a name, not a credential, and the one in this
# repository names the throwaway Postgres service container of a CI job.
NAMES='(ZAI_API_KEY|AUTH_SECRET|REVIEWER_LINK_SECRET|CI_INGEST_TOKEN|ADMIN_JOB_TOKEN|CORPUS_DEPLOY_KEY|APP_ROLE_PASSWORD|ADMIN_PASSWORD|DEMO_(ENGINEER|SUPERVISOR|MANAGER)_PASSWORD|DATABASE_URL(_APP|_UNPOOLED)?)'
ASSIGNED='[[:space:]]*[=:][[:space:]]*"?'"'"'?'
NAMED="$NAMES$ASSIGNED"'[A-Za-z0-9_./+~=-]{12,}'
CONFIRM_NAMED="$NAMES$ASSIGNED"'[A-Za-z0-9_./+~=-]*[0-9]'
# What a placeholder, a reference and a redaction look like, so the example file, the workflows and the prose that
# name a variable are not reported. A reference is a value the file does not hold: `${{ secrets.X }}`, `process.env.X`.
PLACEHOLDER='(<[^>]*>|\$\{|\$\(|process\.env|secrets\.|matrix\.|env\.|inputs\.|vars\.|\.\.\.|xxx|XXX|REDACTED|redacted|CHANGE_?ME|change_?me|PLACEHOLDER|placeholder|EXAMPLE|example|your-|YOUR_|:password@|:PASSWORD@|:pass@)'

SHAPES="CONN PEM PREFIX NAMED"
FOUND=0

# Reports `path:line` plus the shape; the matched text is dropped before anything is printed. The confirmation and
# the placeholder filter are applied to the matching line alone, never to grep's `path:line:` prefix, or a path
# carrying a digit or the word `example` would answer for the line's content.
scan_list() { # $1 = file holding a NUL-delimited file list, $2 = label
  local list="$1" label="$2" shape pattern confirm hit loc rest line text out
  for shape in $SHAPES; do
    eval "pattern=\$$shape"
    eval "confirm=\${CONFIRM_$shape:-.}"
    out=""
    while IFS= read -r hit; do
      [ -n "$hit" ] || continue
      loc="${hit%%:*}"
      rest="${hit#*:}"
      line="${rest%%:*}"
      text="${rest#*:}"
      [[ "$text" =~ $confirm ]] || continue
      [[ "$text" =~ $PLACEHOLDER ]] && continue
      out="$out  $loc:$line"$'\n'
    done <<<"$(xargs -0 grep -IHnE -- "$pattern" <"$list" 2>/dev/null)"
    if [ -n "$out" ]; then
      FOUND=$((FOUND + 1))
      echo "secret-scan: $label: the $shape shape matched (the value is not printed):"
      printf '%s' "$out"
    fi
  done
}

# Every regular file under the given paths, minus the directories no audit needs to read and minus the environment
# files themselves, which hold values by design and are never tracked. The example file is scanned like any other.
list_paths() { # $@ = paths, writes a NUL-delimited list on stdout
  find "$@" \
    \( -name .git -o -name node_modules -o -name .next -o -name .venv -o -name test-results -o -name playwright-report \) -prune -o \
    -type f \
    ! \( -name '.env*' ! -name '.env.example' \) \
    ! -name '*.pem' ! -name '*.key' ! -name 'CREDENTIALS_FOR_COMMITTEE*' \
    -print0
}

# The negative control: without it a green scan proves only that the grep found nothing, not that it looks.
self_test() {
  local dir planted control status=0 before hits
  dir=$(mktemp -d)
  planted="$dir/planted.txt"
  control="$dir/control.txt"
  # Four invented values, none of them real, each assembled from split literals so this script's own source does
  # not carry the shape it is looking for.
  {
    echo "postgres""ql://hub_app:npg""_planted0000fake0000@ep-planted-fake-000000.eu-central-1.aws.neon.tech/hub?sslmode=require"
    echo "Authoriz""ation: Bear""er planted0000fake0000planted0000fake0000"
    echo "-----BE""GIN OPENSSH PRIVATE KE""Y-----"
    echo "AUTH_SEC""RET=planted0000fake0000value"
  } >"$planted"
  # The same four shapes as a placeholder, a workflow reference, the example file and a read from the environment.
  {
    echo 'DATABASE_URL=postgresql://<user>:<password>@<host>/<database>?sslmode=require'
    echo 'ZAI_API_KEY: ${{ secrets.ZAI_API_KEY }}'
    echo 'AUTH_SECRET=<32 random bytes, base64url>'
    echo 'const key = process.env.ZAI_API_KEY;'
  } >"$control"

  before="$FOUND"
  printf '%s\0' "$planted" >"$dir/list"
  scan_list "$dir/list" "self-test" >"$dir/out" 2>&1
  hits=$((FOUND - before))
  FOUND="$before"
  if [ "$hits" -ne 4 ]; then
    echo "secret-scan: SELF-TEST FAILED: the four planted fakes fired $hits of 4 shapes"
    status=1
  fi

  before="$FOUND"
  printf '%s\0' "$control" >"$dir/list"
  scan_list "$dir/list" "self-test control" >"$dir/out" 2>&1
  hits=$((FOUND - before))
  FOUND="$before"
  if [ "$hits" -ne 0 ]; then
    echo "secret-scan: SELF-TEST FAILED: $hits placeholder line(s) were reported as a secret"
    status=1
  fi

  rm -rf "$dir"
  [ "$status" -eq 0 ] && echo "secret-scan: self-test ok (4 planted shapes caught, 4 placeholder lines left alone)"
  return "$status"
}

# --- entry point -----------------------------------------------------------------------------------------------
if [ "${1:-}" = "--self-test" ]; then
  self_test
  exit "$?"
fi

self_test || exit 1

TMP=$(mktemp)
trap 'rm -f "$TMP"' EXIT
if [ "$#" -gt 0 ]; then
  LABEL="$*"
  list_paths "$@" >"$TMP"
elif git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  LABEL="the tracked files of $(basename "$PWD")"
  git ls-files -z >"$TMP"
else
  LABEL="."
  list_paths . >"$TMP"
fi

COUNT=$(tr -cd '\0' <"$TMP" | wc -c | tr -d ' ')
if [ "$COUNT" -eq 0 ]; then
  echo "secret-scan: nothing to scan under $LABEL (a scan of no files proves nothing)"
  exit 1
fi

scan_list "$TMP" "$LABEL"
if [ "$FOUND" -ne 0 ]; then
  echo "secret-scan: FAIL: $FOUND shape(s) matched under $LABEL"
  exit 1
fi
echo "secret-scan: clean ($COUNT files under $LABEL, 0 of 4 shapes matched)"
