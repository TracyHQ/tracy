#!/usr/bin/env bash
#
# pull-template-shots.sh — copy the Design inspiration card pictures from the dev machine's
# `template_shots` into this machine's local stack, so the cards on `tracy.test:8080` have pictures.
#
# WHY. The card LIST reaches a local stack by itself: tracy-web reads the releases on `ja-products`
# (ADR 0017). The card PICTURES do not: they live in each deployment's own `template_shots` table,
# filled by an operator's upload on /ops, and are not in any release. A fresh local database has
# none, so `/api/templates` answers bare file names and every card is an empty grey box (measured
# 27/09: 0 rows locally, 466 rows / 51 templates on dev). `scripts/template-shots-import.mjs` is not
# the answer — the repo holds pictures for two templates only, named differently from the releases.
#
# Only rows this machine lacks, or holds with a different sha256, travel: the first run moves about
# 1 GB, a re-run moves only what dev uploaded since. Local rows dev does not have (a pack imported
# per §7.5 of running-tracy-locally.md) are left alone — this adds and updates, it never deletes.
#
#   pull-template-shots.sh             # needs ssh to the dev machine: TRACY_SHOTS_SSH=user@host,
#                                      # exported or in ~/.config/tracy/hosts.env (TRACY_HOSTS_FILE)
#
#   COMPOSE_PROJECT_NAME=tracy-askform # a private stand: name its compose project (default `tracy`,
#                                      # the shared stand); the pictures land in THAT stand's postgres
#
#   TRACY_SHOTS_PG=tracy-postgres-1    # the postgres container on that machine
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/.."

# The source machine's address is a setting of this machine (the same hosts file
# scripts/lib/machine-hosts.mjs reads), never source. Its user must be in the docker group there,
# so `docker exec` needs no sudo.
HOSTS_FILE="${TRACY_HOSTS_FILE:-$HOME/.config/tracy/hosts.env}"
host_value() { grep -m1 -E "^$1[[:space:]]*=" "$HOSTS_FILE" 2>/dev/null | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/^[[:space:]]+//; s/[[:space:]]+$//' || true; }
SRC_SSH="${TRACY_SHOTS_SSH:-$(host_value TRACY_SHOTS_SSH)}"
SRC_PG="${TRACY_SHOTS_PG:-tracy-postgres-1}"
[ -n "$SRC_SSH" ] ||
  { echo "✗ TRACY_SHOTS_SSH is not set: export it, or add TRACY_SHOTS_SSH=user@host to $HOSTS_FILE" >&2; exit 1; }

# `-p` makes the target stand explicit: compose would otherwise read `name: tracy` off compose.yml and
# a private stand's pull would land in the shared stand's database.
LOCAL_PROJECT="${COMPOSE_PROJECT_NAME:-tracy}"
local_psql() { docker compose -p "$LOCAL_PROJECT" -f compose.yml exec -T postgres psql -v ON_ERROR_STOP=1 -qAt -U tracy -d tracy "$@"; }

ssh -o BatchMode=yes -o ConnectTimeout=10 "$SRC_SSH" true 2>/dev/null ||
  { echo "✗ cannot ssh to $SRC_SSH (the dev machine holds the pictures)" >&2; exit 1; }
local_psql -c 'select 1' >/dev/null ||
  { echo "✗ local postgres is not answering — bring the stack up first (deploy/scripts/check-local.sh)" >&2; exit 1; }

# What this machine already holds, as one SQL VALUES list quoted by postgres itself.
have="$(local_psql -c "select coalesce(string_agg(format('(%L,%L,%L)', template_id, file, sha256), ','), '') from template_shots")"
[ -n "$have" ] || have="(null,null,null)"

# The source sends only the rows missing here, as binary COPY; `-q` keeps command tags off stdout.
# The script travels on stdin, so no quoting of the list is needed through ssh and docker exec.
before="$(local_psql -c 'select count(*) from template_shots')"
result="$(
  printf 'create temp table have(template_id text, file text, sha256 text);\ninsert into have values %s;\ncopy (select s.* from template_shots s where not exists (select 1 from have h where h.template_id = s.template_id and h.file = s.file and h.sha256 = s.sha256)) to stdout (format binary);\n' "$have" |
    ssh "$SRC_SSH" "docker exec -i $SRC_PG sh -c 'psql -v ON_ERROR_STOP=1 -q -U \"\$POSTGRES_USER\" -d \"\$POSTGRES_DB\"'" |
    local_psql \
      -c 'create temp table incoming (like template_shots)' \
      -c 'copy incoming from stdin (format binary)' \
      -c "with up as (insert into template_shots select * from incoming
            on conflict (template_id, file) do update set content_type = excluded.content_type,
              bytes = excluded.bytes, sha256 = excluded.sha256, updated_at = excluded.updated_at
            returning (xmax = 0) as added)
          select count(*) filter (where added) || ' added, ' || count(*) filter (where not added) || ' updated' from up"
)"
after="$(local_psql -c "select count(*) || ' pictures / ' || count(distinct template_id) || ' templates' from template_shots")"
echo "✓ template pictures from $SRC_SSH into $LOCAL_PROJECT: $result (local store: $before → $after)"
