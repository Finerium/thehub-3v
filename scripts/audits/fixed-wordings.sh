#!/usr/bin/env bash
# Fixed-wording audit (blueprint 6.3, 6.4 StatusBadge and CaveatLine, AC-UI-03: string-matched in CI). Every fixed
# wording lives once, in src/lib/fixed-strings.ts, and a component or a surface imports the constant; this audit
# fails when a wording is retyped anywhere else in the built source (src/ and scripts/, TypeScript and JavaScript).
# The list of wordings is read from the module itself (scripts/audits/fixed-wordings.ts), never copied here.
#
#   scripts/audits/fixed-wordings.sh
#
# A sentence (25 characters or more) is a hit wherever it appears; a short wording (SIMULATED, entailed, ...) is a
# hit only as a whole string literal or as whole JSX text ("w", 'w', `w`, >w<), so a comment or a longer sentence
# that uses the word is not. Excluded: src/lib/fixed-strings.ts itself, src/contracts/generated/ (the contract
# literals the constants are read from), scripts/audits/ (this check), test files, and generated or ignored trees.
# ponytail: a short wording retyped inside a longer literal is not caught; widen the short-form patterns if a
# surface ever ships one that way.
set -uo pipefail
cd "$(dirname "$0")/../.."
status=0
count=0
MIN_SENTENCE=25

roots=()
for r in src scripts; do [ -d "$r" ] && roots+=("$r"); done

common=(-rnF --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.jsx'
  --exclude-dir=generated --exclude-dir=graphify-out --exclude-dir=audits --exclude-dir=node_modules --exclude-dir=.next
  --exclude=fixed-strings.ts --exclude='*.test.ts' --exclude='*.test.tsx' --exclude='*.spec.ts')

while IFS= read -r w; do
  [ -z "$w" ] && continue
  count=$((count + 1))
  if [ "${#w}" -ge "$MIN_SENTENCE" ]; then
    hits=$(grep "${common[@]}" -e "$w" "${roots[@]}" 2>/dev/null || true)
  else
    hits=$(grep "${common[@]}" -e "\"$w\"" -e "'$w'" -e "\`$w\`" -e ">$w<" "${roots[@]}" 2>/dev/null || true)
  fi
  # A comment line renders nothing: drop hits whose line starts with //, /* or a block-comment continuation.
  hits=$(printf '%s\n' "$hits" | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(//|/\*|\*)' || true)
  if [ -n "$hits" ]; then
    echo "$hits"
    echo "fixed-wordings: retyped outside src/lib/fixed-strings.ts: $w"
    status=1
  fi
done < <(pnpm --silent exec tsx scripts/audits/fixed-wordings.ts)

if [ "$count" -lt 10 ]; then
  echo "fixed-wordings: only $count wordings read from src/lib/fixed-strings.ts (the emitter or the module is broken)"
  exit 1
fi

[ "$status" -eq 0 ] && echo "fixed-wordings: clean ($count wordings, none retyped)"
exit "$status"
