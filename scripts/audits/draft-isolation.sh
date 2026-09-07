#!/usr/bin/env bash
# Draft isolation audit (blueprint 9.6, ARCHITECTURE 3.2, AC-LOOP-07 static leg): the `draft` schema belongs to the
# loop lane alone. A retrieval query, a composer, an answer gate or any other module outside that lane must not be
# able to read a draft, so this audit fails when a file outside the lane names one of the draft schema's tables,
# imports the Drizzle binding of one, or uses the `draft.` schema prefix in SQL.
#
#   scripts/audits/draft-isolation.sh [PATH...]      # default roots: src scripts tests
#
# The table names and their Drizzle bindings are read from src/db/schema.ts itself (every `draft.table("...")` and
# the `export const` it is bound to), never copied here, so a table added to the schema is audited the moment it
# exists, under both the name a query writes and the name an import would use. The loop lane, which may name them:
#
#   src/loop/**, src/gates/g3.ts, src/gates/g3/**, src/db/queries/loop.ts, src/app/api/drafts/**,
#   src/app/api/sme-notes/**, src/db/schema.ts (the definitions), drizzle/** (the migrations) and the tests.
#
# The answer lane (src/answer/**, src/db/queries/retrieval.ts, src/gates/g2/**) is deliberately absent from that
# list: a hit there is the failure this audit exists for. Two more paths are excluded and neither reaches a
# database: scripts/audits/** (this check names the tables to look for them) and src/contracts/generated/** (the
# frozen section 9 vocabulary, which holds "sme_note" as a provenance type and "draft.created" as an audit action;
# those files import nothing but zod, which provider-egress.sh asserts).
#
# A hit inside a comment line is prose, not a query, and is dropped: a component may say what it renders.
# A name is a hit only as a whole word, so the permission key `add_sme_note` of src/auth/matrix.ts is not one, and
# only in the case the schema declares it in, so the contract type `DraftState` of 9.6, which every lane may name,
# is not one either. The `draft.` prefix is matched case-insensitively, because SQL keywords are written both ways.
set -uo pipefail
cd "$(dirname "$0")/../.."
status=0

# The draft schema's tables, in the spelling the schema declares them with, and the Drizzle bindings a module would
# import to reach one: both read from src/db/schema.ts, never copied here.
tables=$(tr '\n' ' ' < src/db/schema.ts | grep -oE 'draft\.table\( *"[a-z_]+"' | grep -oE '"[a-z_]+"' | tr -d '"' | sort -u)
bindings=$(tr '\n' ' ' < src/db/schema.ts | grep -oE 'export const [a-zA-Z]+ = draft\.(table|enum)\(' | awk '{print $3}' | sort -u)
count=$(printf '%s\n' "$tables" | grep -c .)
if [ "$count" -lt 5 ] || [ "$(printf '%s\n' "$bindings" | grep -c .)" -lt "$count" ]; then
  echo "draft-isolation: only $count draft tables read from src/db/schema.ts (the schema or this reader is broken)"
  exit 1
fi

# 1. a draft table, by the SQL name a query writes or by the binding an importer of src/db/schema.ts names it with.
names=$(printf '%s\n' "$tables" "$bindings" | paste -sd '|' -)
named="(^|[^a-zA-Z0-9_])($names)([^a-zA-Z0-9_]|\$)"
# 2. the `draft.` schema prefix in SQL: a qualified relation, the quoted schema, or the pgSchema declaration itself,
# which catches a table this reader does not know about yet. It is anchored on the keyword before it, so that
# `draft.title` on a typed object, which any surface may write, is not a hit.
prefixed="\"draft\"\.|(from|join|into|update|table|schema|search_path)[[:space:]]+draft\.|pgschema\(\"draft\"\)"

roots=()
for r in "$@"; do roots+=("$r"); done
if [ "${#roots[@]}" -eq 0 ]; then
  for r in src scripts tests; do [ -e "$r" ] && roots+=("$r"); done
fi

common=(-rnH --include='*.ts' --include='*.tsx' --include='*.js' --include='*.mjs' --include='*.sql'
  --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=generated)

hits=0
while IFS= read -r hit; do
  [ -z "$hit" ] && continue
  case "${hit%%:*}" in
    # the loop lane
    src/loop/* | src/gates/g3.ts | src/gates/g3/* | src/db/queries/loop.ts | src/db/schema.ts) continue ;;
    src/app/api/drafts/* | src/app/api/sme-notes/* | drizzle/*) continue ;;
    # the loop's own surfaces and the components that render a draft: 6.2 surfaces 8 and 11 read the draft through
    # the lane's query module, which is the lane reaching its own tables, not the answer lane reaching them.
    src/app/\(hub\)/drafts/* | src/app/\(hub\)/demo/* | src/db/queries/drafts-view.ts | src/db/queries/loop-view.ts) continue ;;
    src/components/Draft*.tsx | src/components/SlotField.tsx | src/components/StateRail.tsx | src/components/DecisionButtons.tsx | src/components/RedlineVerdictPanel.tsx | src/components/RecountMoment.tsx) continue ;;
    # the tests, and the one other path that names the tables without reaching a database
    tests/* | *.test.ts | *.test.tsx | scripts/audits/*) continue ;;
  esac
  echo "$hit"
  hits=$((hits + 1))
  status=1
done < <(
  {
    grep "${common[@]}" -E "$named" "${roots[@]}" 2>/dev/null
    grep "${common[@]}" -iE "$prefixed" "${roots[@]}" 2>/dev/null
  } | sort -u || true
)

if [ "$status" -ne 0 ]; then
  echo "draft-isolation: $hits reference(s) to the draft schema outside the loop lane (ARCHITECTURE 3.2, AC-LOOP-07)"
  exit 1
fi

echo "draft-isolation: clean ($count draft tables, none named or imported outside the loop lane)"
