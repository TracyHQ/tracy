#!/usr/bin/env bash
#
# Whether a site's MariaDB is the server that stays up — the one a dump may be poured into.
#
# Sourced by `provision/provision.sh` (before step 4 imports the archive's dump) and
# `provision/restore.sh` (before step 5 replaces the database), never executed. It lives here so a
# test can play a first boot against a fake `docker` (test/db-ready.test.mjs).
#
# 🔒 READY MEANS `@@skip_networking = 0`, NOT "A QUERY ANSWERED". The official image initialises a
# new volume with a TEMPORARY server on the same socket, started `--skip-networking` (`port: 0` in
# its log); it creates MARIADB_DATABASE and the root password in it, stops it, and only then starts
# the real server. A query through the socket is answered by the temporary one too — even one
# against the target database, once that database exists. Measured 05/10/2026 on the local stand:
# `docker logs <site>-db-1` shows "Creating database wordpress" and "Stopping temporary server" in
# the same second, then a few seconds with nothing on the socket (about 5 on 11.8.9). The old wait
# (`SELECT 1` against the database) passed on the temporary server once in ~40 WordPress site
# creations, and the import after it died with `ERROR 2002 (HY000): Can't connect to local server
# through socket '/run/mysqld/mysqld.sock' (2)`. Only the temporary server has networking off
# (render-compose.sh never sets it), so one variable, read through the same client and the same
# socket the import uses, tells the two apart; the image's own `healthcheck.sh --connect` asks the
# same question.
#
# `+ 0`, because the rendering is a trap: MariaDB 11.8 answers `SELECT @@skip_networking` with `0`,
# but `CONCAT('…', @@skip_networking)` with `OFF` (measured 05/10/2026 on the stand's mariadb:11). The
# marker below asks for the number, and the verdict still takes either spelling.
#
# Bounded: 90 attempts 2 s apart, the three minutes the inline loops it replaced allowed. The refusal
# names the last thing the server said — "Access denied" is a password the volume does not know
# (lib/db-volume.sh has the measured case), "Can't connect" a server that never came up — where the
# old loop only said "database never became ready".

# tracy_db_wait_ready <site-dir> <root-password> [database]
# Returns 0 once the stack's `db` service answers as the server that stays up (with `database` open,
# when one is named). Otherwise prints why on stderr and returns 1.
tracy_db_wait_ready() {
  local dir="$1" password="$2" database="${3:-}" tries=90 i answer last="no answer"
  for ((i = 1; i <= tries; i++)); do
    # stderr folded in: the last refusal is the reason given if this never succeeds. The verdict is
    # read from the marker it asked for, so nothing else the client prints can pass for it.
    if answer="$( cd "$dir" && docker compose exec -T db mariadb -uroot -p"$password" -N -B \
        -e "SELECT CONCAT('skip_networking=', @@skip_networking + 0)" ${database:+"$database"} 2>&1 )"; then
      case "$answer" in
        *skip_networking=0*|*skip_networking=OFF*) return 0 ;;
        *skip_networking=1*|*skip_networking=ON*) last="networking is off (the first boot's temporary server, or a server started with --skip-networking)" ;;
        *) last="an answer without skip_networking: $(printf '%s\n' "$answer" | sed '/^$/d' | tail -n 1)" ;;
      esac
    else
      last="$(printf '%s\n' "$answer" | sed '/^$/d' | tail -n 1)"
      [ -n "$last" ] || last="the client exited without saying why"
    fi
    [ "$i" -eq "$tries" ] || sleep 2
  done
  echo "database never became ready after $tries tries 2 s apart: $last" >&2
  return 1
}
