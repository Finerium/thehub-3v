#!/bin/sh
# tools/app-role-url.sh <env-file>
# Builds DATABASE_URL_APP, the pooled URL of the application role thehub_app (D-20, ARCHITECTURE 3.3 and 10), from
# the owner's pooled DATABASE_URL and APP_ROLE_PASSWORD in the env file given as the first argument, and appends or
# replaces the DATABASE_URL_APP line in that same file. Shell parameter expansion only: no value is printed, logged
# or handed to another process. Prints "written" and nothing else.
set -eu

file=${1:?usage: tools/app-role-url.sh <env-file>}
[ -r "$file" ] || { echo "not readable: $file" >&2; exit 1; }

url=
password=
while IFS= read -r line || [ -n "$line" ]; do
  case $line in
    DATABASE_URL=*) url=${line#DATABASE_URL=} ;;
    APP_ROLE_PASSWORD=*) password=${line#APP_ROLE_PASSWORD=} ;;
  esac
done < "$file"

# one pair of surrounding quotes, if the values carry them
url=${url#\"}; url=${url%\"}; url=${url#\'}; url=${url%\'}
password=${password#\"}; password=${password%\"}; password=${password#\'}; password=${password%\'}

[ -n "$url" ] || { echo "DATABASE_URL is missing in $file" >&2; exit 1; }
[ -n "$password" ] || { echo "APP_ROLE_PASSWORD is missing in $file" >&2; exit 1; }
case $password in
  *[!A-Za-z0-9._~-]*) echo "APP_ROLE_PASSWORD must use URL-unreserved characters only (A-Z a-z 0-9 . _ ~ -)" >&2; exit 1 ;;
esac

# scheme://<user>:<password>@<host>/<db>?<params>: keep the scheme and everything after the last @
scheme=${url%%://*}
rest=${url#*://}
hostpart=${rest##*@}
app_url="$scheme://thehub_app:$password@$hostpart"

umask 077
tmp="$file.tmp.$$"
found=0
{
  while IFS= read -r line || [ -n "$line" ]; do
    case $line in
      DATABASE_URL_APP=*) printf 'DATABASE_URL_APP=%s\n' "$app_url"; found=1 ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < "$file"
  [ "$found" -eq 1 ] || printf 'DATABASE_URL_APP=%s\n' "$app_url"
} > "$tmp"
mv "$tmp" "$file"
echo written
