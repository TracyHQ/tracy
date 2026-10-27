#!/bin/zsh
# Nightly regression run: every case that carries `run`, judged by its own script on the checkout
# this file sits in (plan tasks/todo-regression-deterministic.md, phase 6). A case is otherwise run
# only once, on its own PR; this rerun is what catches a fixed bug coming back.
#
# It starts a throwaway PostgreSQL for `run.needs: postgres` and chrome-watch for `chrome` cases, and
# never starts Codex. A `stand` case runs only when REG_NIGHTLY_STAND names a stand built from the same
# develop: a shared stand runs whatever image it was last built with, and an old image turns a fixed
# bug into a nightly FAIL (REG-PR-924 on scv2, 05/10/2026). Without it those cases are BLOCKED. Writes:
#   $OUT/<date>/results.jsonl   one line per case (the runner's result file)
#   $OUT/<date>/summary.txt     counts and every case that did not pass, with why
#   $OUT/latest.txt             the same summary, for whoever looks first
# Exit 0 when every case passed or was BLOCKED for a missing need; 1 when any case FAILed.
set -u
ROOT=$(cd "$(dirname "$0")/../.." && pwd)
OUT=${REG_NIGHTLY_DIR:-$HOME/TCH-local/regression-nightly}
STAND=${REG_NIGHTLY_STAND:-}
PG_PORT=${REG_NIGHTLY_PG_PORT:-39731}
PG_NAME=reg-nightly-pg
DAY=$(date +%F)
DIR="$OUT/$DAY"
mkdir -p "$DIR"
cd "$ROOT" || exit 2

docker rm -f "$PG_NAME" >/dev/null 2>&1
docker run -d --rm --name "$PG_NAME" -e POSTGRES_USER=tracy -e POSTGRES_PASSWORD=tracy \
  -p "127.0.0.1:$PG_PORT:5432" postgres:16-alpine >/dev/null
trap 'docker stop "$PG_NAME" >/dev/null 2>&1' EXIT
for _ in {1..60}; do docker exec "$PG_NAME" pg_isready -U tracy >/dev/null 2>&1 && break; sleep 1; done
command -v chrome-watch >/dev/null && chrome-watch >/dev/null 2>&1

ids=$(node -e "import('./tests/regression/run.mjs').then(m=>console.log(m.loadCatalogue(process.cwd()).filter(c=>c.run).map(c=>c.id).join(',')))")
started=$(date +%s)
TEST_DATABASE_URL="postgres://tracy:tracy@127.0.0.1:$PG_PORT/postgres" \
  node tests/regression/run.mjs --no-codex ${STAND:+--stand "$STAND"} --id "$ids" --evidence-dir "$DIR/logs" > "$DIR/run.txt" 2>&1
code=$?
results=$(sed -n 's/^results: //p' "$DIR/run.txt")
[ -n "$results" ] && mv "$ROOT/$results" "$DIR/results.jsonl"

{
  echo "regression nightly $DAY · commit $(git rev-parse --short HEAD) · $(( $(date +%s) - started )) s"
  echo "PASS $(grep -c ' PASS ' "$DIR/run.txt") · FAIL $(grep -c ' FAIL ' "$DIR/run.txt") · BLOCKED $(grep -c ' BLOCKED ' "$DIR/run.txt")"
  grep -E ' (FAIL|BLOCKED) ' "$DIR/run.txt"
  echo "logs: $DIR/logs"
} > "$DIR/summary.txt"
cp "$DIR/summary.txt" "$OUT/latest.txt"
grep -q ' FAIL ' "$DIR/run.txt" && exit 1
[ "$code" -le 1 ] && exit 0
exit "$code"
