#!/usr/bin/env bash
#
# mint-agent-token — give a site that has no `tracy-agent.token` one, without re-provisioning it.
#
# A site provisioned before the token collection existed has no file at
# `<privateRoot>/<label>/tracy-agent.token`, and `POST /_host/agent-token` has nothing to read back.
# Pairing (`pairComponent`, apps/tracy-web/src/sites/route.js) then answers `custody: unavailable`
# forever: nothing in the fleet ever writes that file again, because only a provision ever wrote it.
# This script is the missing second writer, and it is the SAME read-or-mint the fresh-install path
# already does (`provision/platform/joomla.sh`, `platform_post_up`) — lifted out so it can be run
# on a site that is already standing.
#
# 🔒 JOOMLA AND EMDASH, NOT WORDPRESS — AND THAT IS A LIMIT OF WHAT CAN BE CHECKED, NOT AN
# OVERSIGHT. Minting a token from outside the CMS is only safe where the value that lands in the
# site's own storage IS the credential it compares against. Joomla: `joomla.sh` writes it into
# `com_claudecowork`'s `params`, measured. EmDash: the mint runs INSIDE the site container
# (`emdash/mint-agent-admin.cjs`, the same one `platform/emdash.sh` uses at provision), so the
# site itself stores the hash and hands back the one raw PAT that matches it — nothing out here
# guesses. That script is idempotent by construction: revoke-then-insert, so a re-mint never
# leaves a site holding live tokens it cannot see.
# WordPress's token lives in the `claude_cowork_token` option, minted by the plugin itself on
# activation (`claude_cowork_seed_token`), and the plugin's source is in another repo
# (TracyHQ/claude-cowork) — nothing here can say whether it compares that option verbatim or
# derives from it. Writing a guess would produce a token file naming a token nothing holds, which
# only moves the failure from pairing to the first `content.*` call, where it is far more
# expensive to read. A WordPress site has neither `configuration.php` nor EmDash's `data/data.db`,
# so it is refused below by shape rather than by a platform flag nobody would have to pass
# correctly.
#
# 🔒 EMDASH NEEDS THE TOKEN IN TWO PLACES, AND THE SECOND ONE IS THE WHOLE POINT OF THIS SCRIPT
# LEARNING EMDASH AT ALL. `POST /_host/agent-token` reads the host copy
# (`<privateRoot>/<label>/tracy-agent.token`) for pairing; the AGENT's content door reads a
# different file — `tracy-site-tools` fetches it with `docker exec <container> cat
# /app/data/tracy-agent.token` (packages/tools/tracy-site-tools/src/host/index.ts:362), because the
# data directory is bound into the SITE, not into dsh. Until 19/09/2026 the generic EmDash
# provision road wrote the host copy alone, so pairing was green while every `tracy_emdash` call
# answered NO_TOKEN and the site's agent was blind to its own content — measured on `demoemdasbh`
# and again on `demoemdash1`. `platform/emdash.sh` now writes both for sites born after it, and a
# standing site is never provisioned again, which is what leaves this script as the only repair.
#
# ⚠ AND THAT IS TRUE ONLY OF A SITE WITHOUT THE PROTECTED MOUNT. Since #155 an EmDash site's
# compose binds `./tracy-agent.token:/run/tracy-agent.token:ro`: the container reads the HOST file
# itself, and the `data/` copy is deleted on purpose because that directory is agent-writable. On
# such a site this script writes ONE file, IN PLACE (see the PROTECTED_MOUNT block below) — a `mv`
# would hand it a new inode the running container cannot see, and a `data/` copy would put a
# readable PAT back where the agent's own shell can take it. The repair for a site whose
# credential is gone or refused is the staged recovery in `emdash/README.md`, not this script.
#
# 🔒 AND IT FAILS CLOSED (Hano, 23/09/2026). The legacy two-copy repair above runs ONLY for a site
# proven pre-#155 from the host: readable compose with a `services.web` block, no token mount
# declared, AND no host token file. A legacy site that already holds a host token — the
# `demoemdash1` state — is now refused with TOKEN_CUSTODY_UNKNOWN, because a protected site whose
# compose lost its mount entry looks exactly the same from here, and the legacy repair would revoke
# the credential its running container reads. Such a site is moved onto the protected mount with
# `emdash/migrate-token-mount.mjs` (emdash/README.md). This script makes no runtime mount check.
#
# Usage:
#   mint-agent-token.sh --label example-com-0871462c [--root /srv/tracy]
#   mint-agent-token.sh example-com-0871462c
#
# On success the last line is `TRACY_RESULT token=<token>`, and the same value is in
# `<privateRoot>/<label>/tracy-agent.token` (0600). Running it again is a no-op that re-prints the
# file — no SQL, nothing touched.
#
# Every failure names itself on stderr as `TRACY_ERROR <CODE>` and exits non-zero, because the
# caller on the other end is a door that has to turn it into an answer a person can act on:
#
#   2  BAD_LABEL                a label that is not a plain fleet label
#   3  SITE_UNKNOWN             this host has no site under that label
#   4  NOT_JOOMLA               no readable Joomla configuration.php in the site's webroot
#   5  SITE_DOWN                the site's own database did not answer
#   6  COMPONENT_NOT_INSTALLED  no `com_claudecowork` row took the token
#   7  EMDASH_MINT_REFUSED      the site container did not hand back a PAT
#   8  TOKEN_CUSTODY_UNKNOWN    custody cannot be proven from the host: the compose file is missing,
#                               unreadable, empty, or not exactly a form the fleet writes (with or
#                               without the read-only token bind), or declares no mount while the
#                               host token file exists; or binds the host token read-only while that
#                               file is gone (a new file would be an inode the container never sees;
#                               staged recovery, emdash/README.md); or the protected host token
#                               is not one root-owned 0600 regular file; or the site directory shows
#                               neither an EmDash mark nor the Joomla/WordPress proof, or its token
#                               path is not a regular file; nothing is minted or written
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"

fail() {
  local status="$1" code="$2"
  shift 2
  # The machine-readable half first and alone on its line: the caller greps for it (see
  # apps/tracy-host/src/webroot.js's `mintAgentToken`), and a sentence wrapped around it would
  # make that grep a guess about wording.
  echo "TRACY_ERROR $code" >&2
  echo "!! $*" >&2
  exit "$status"
}

LABEL=""
ROOT="$TRACY_PRIVATE_ROOT"
while [ $# -gt 0 ]; do
  case "$1" in
    --label) LABEL="$2"; shift 2 ;;
    --root)  ROOT="$2"; shift 2 ;;
    -*) echo "unknown argument: $1" >&2; exit 2 ;;
    # A bare label too, so this is usable by hand — every other fleet script takes --label, and
    # tracy-host passes it that way.
    *) LABEL="$1"; shift ;;
  esac
done

# The same shape tracy-host holds every label to before one reaches a path (`SAFE_LABEL`,
# apps/tracy-host/src/provision.js: /^[A-Za-z0-9][A-Za-z0-9._-]*$/). Repeated here rather than
# trusted, because this script is also runnable by hand and the label below is interpolated into a
# filesystem path — a `..` in it would walk the read and the write outside the private root.
case "$LABEL" in
  '' | [!A-Za-z0-9]* | *[!A-Za-z0-9._-]*) fail 2 BAD_LABEL "refused label: ${LABEL:-<empty>}" ;;
esac

SITE_DIR="$ROOT/$LABEL"
TOKEN_FILE="$SITE_DIR/tracy-agent.token"
# `$SITE_DIR/data` IS `/app/data` in the site's own container — render-compose.sh:362 binds
# `./data:/app/data`, and the compose file it binds relative to is this same directory.
CONTAINER_TOKEN_FILE="$SITE_DIR/data/tracy-agent.token"

# The webroot is under the OTHER root (lib/roots.sh) — the two are not the same directory on a
# migrated host, and this file is the site's own, not the fleet's copy of anything.
CONFIG="$(tracy_webroot_dir "$LABEL")/configuration.php"

# BY SHAPE, NOT BY A FLAG — the same reasoning that refuses WordPress above. A Joomla site has a
# readable `configuration.php`; an EmDash site is known by any mark the fleet leaves in its
# directory (`site_shape` below).
#
# 🔒 NOT BY `data/data.db` ALONE, AND EMDASH IS ASKED FIRST (Astra review, 23/09/2026). An EmDash
# site whose SQLite was missing used to fall through to PLATFORM=unknown, skip the custody block
# and reach the "already minted" read below: a wrong compose printed the host token, and a FIFO
# there hung the script. Any mark now makes the site EmDash, so its custody is proven before any
# token is read; a mark that cannot be read refuses. `webroot.js`'s `siteShape` is the same rule,
# held to one list of answers by test/token-custody-cases.mjs (`SITE_SHAPE_CASES`). A Joomla
# directory the fleet wrote carries no mark, so its road is what it was.
#
# 🔒 AND `other` MUST BE PROVEN TOO, NOT INFERRED FROM MISSING MARKS (Astra review, 23/09/2026). An
# EmDash site that lost every mark, its compose reduced to `services: {}`, took the Joomla road and
# had its host token read with no custody question. `other` now needs positive proof: `.env` naming
# PLATFORM=joomla|wordpress, or a compose that is exactly one of render-compose.sh's three PHP forms
# (`compose_proves_php` below). A grep that fails to READ (status above 1) is not a grep that found
# nothing: it answers `unknown`, as the door's read error does.
#
#   emdash   a `data/` or `uploads/` entry of any type (only EmDash keeps those under the private
#            root), `.env` naming PLATFORM=emdash or an EMDASH_ key, or a compose file naming
#            EMDASH_ or /app/data·/app/uploads;
#   unknown  a `.env` or compose that exists but is not one readable regular file, a read error,
#            or a directory with neither an EmDash mark nor the Joomla/WordPress proof;
#   other    no EmDash mark and the Joomla/WordPress proof — or no site directory at all (nothing
#            to read; SITE_UNKNOWN below names it).
#
# The compose proof is an EXACT FORM, NOT A YAML WALKER (Hano, 23/09/2026): six reviews found a YAML
# shape a structural walker read as a webroot bind (a block scalar, a multi-line quote, a duplicate
# `volumes:\t[]`). The file must be, line for line, one of the three PHP forms render-compose.sh
# writes (clone, Joomla fresh, WordPress fresh), blank lines and whole-line comments dropped.
# `compose_proves_php <file> <label>` is the twin of webroot.js's `composeProvesPhp`; the reasoning
# is written there.
# `web_networks` below: the web service's `networks:` stanza in every form render-compose.sh's
# `tracy_web_networks` has written for this label — the `[default, tracy]` shorthand, and, only for
# a label whose `<label>-web-1` exceeds 63 octets (#165), the four-line map form carrying the bounded
# `tracy-web-<first 32 hex of sha256(label)>` alias (a long label keeps the shorthand too: the
# pre-#165 output that migrate-web-dns-alias.sh patches from). The alias is derived by the shell from
# the label (render-compose.sh's own derivation) and handed to awk; it is never read from the file.
compose_proves_php() {
  local dns_hash
  dns_hash="$( { printf '%s' "${2:-}" | { sha256sum 2>/dev/null || shasum -a 256 2>/dev/null; } | cut -c1-32; } || true)"
  # Through the environment, not `-v`: awk `-v` processes backslash escapes in the value.
  PHP_LABEL="${2:-}" WEB_DNS_ALIAS="tracy-web-$dns_hash" awk '
    function abspath(s) { return s ~ /^(\/[A-Za-z0-9._-]+)+$/ && s !~ /\/\.\.?(\/|$)/ }
    function starts(s, pre) { return substr(s, 1, length(pre)) == pre }
    function ends(s, suf) { return length(s) >= length(suf) && substr(s, length(s) - length(suf) + 1) == suf }
    function lit(s) { if (!bad && p <= n && L[p] == s) p++; else bad = 1 }
    function ok(cond) { if (!bad && p <= n && cond) p++; else bad = 1 }
    function valued(s, pre, re) { return starts(s, pre) && substr(s, length(pre) + 1) ~ re }
    # `<pre>"<value>"` with the value matching `re`; the value is left in VAL.
    function quoted(s, pre, re,   v) {
      VAL = ""
      if (!starts(s, pre "\"") || !ends(s, "\"") || length(s) < length(pre) + 2) return 0
      v = substr(s, length(pre) + 2, length(s) - length(pre) - 2)
      if (v !~ re) return 0
      VAL = v
      return 1
    }
    function webroot(s,   tail, w) {
      tail = ":/var/www/html"; WR = ""
      if (!starts(s, "      - ") || !ends(s, tail) || length(s) <= 8 + length(tail)) return 0
      w = substr(s, 9, length(s) - 8 - length(tail))
      if (!abspath(w) || !ends(w, "/" label "/.webroot")) return 0
      WR = w
      return 1
    }
    function opt_dns(  s, mid, o, ip4) {
      o = "(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])"
      ip4 = o "\\." o "\\." o "\\." o
      if (bad || p > n) return
      s = L[p]
      if (!starts(s, "    dns: [") || !ends(s, "]") || length(s) < 12) return
      mid = substr(s, 11, length(s) - 11)
      if (mid ~ ("^" ip4 "(, ?" ip4 ")*$")) p++
    }
    function web_networks() {
      if (bad || p > n) { bad = 1; return }
      if (L[p] == "    networks: [default, tracy]") { p++; return }
      if (length(label "-web-1") > 63 && ALIAS != "" && p + 3 <= n && L[p] == "    networks:" &&
          L[p + 1] == "      default: {}" && L[p + 2] == "      tracy:" &&
          L[p + 3] == "        aliases: [\"" ALIAS "\"]") { p += 4; return }
      bad = 1
    }
    # The site-mail run render-compose.sh writes since #289 (`tracy_web_mail_env`), all or nothing,
    # as webroot.js `matchMailEnv`: with `hdr`, first the `environment:` line of the clone form; then
    # TRACY_MAIL_URL (the default, or the one a host sets: `MAILURL`), TRACY_MAIL_LABEL naming THIS
    # label, and the token interpolation. Consumes the run and returns 1, or consumes nothing and returns 0.
    function mail_env(hdr,   q) {
      if (bad) return 0
      q = p
      if (hdr) { if (q > n || L[q] != "    environment:") return 0; q++ }
      if (q + 2 > n) return 0
      if (!valued(L[q], "      TRACY_MAIL_URL: ", MAILURL)) return 0
      if (L[q + 1] != "      TRACY_MAIL_LABEL: \"" label "\"") return 0
      if (L[q + 2] != "      TRACY_MAIL_TOKEN: \"${TRACY_MAIL_TOKEN:-}\"") return 0
      p = q + 3
      return 1
    }
    # The resource-cap run render-compose.sh writes since 28/09/2026 (`tracy_limits_run`), all or
    # nothing, as webroot.js `matchLimits`: mem_limit, memswap_limit EQUAL to it, cpus, pids_limit.
    # Consumes the run and returns 1, or consumes nothing and returns 0.
    function limits(   mem) {
      if (bad || p + 3 > n) return 0
      if (!valued(L[p], "    mem_limit: ", MEM)) return 0
      mem = substr(L[p], length("    mem_limit: ") + 1)
      if (L[p + 1] != "    memswap_limit: " mem) return 0
      if (!valued(L[p + 2], "    cpus: ", CPUS)) return 0
      if (!valued(L[p + 3], "    pids_limit: ", PIDS)) return 0
      p += 4
      return 1
    }
    # One PHP form: 1 clone, 2 Joomla fresh, 3 WordPress fresh.
    function form(f,   db, url, ldb, lweb, m) {
      p = 1; bad = 0
      lit("services:")
      lit("  db:")
      lit("    image: mariadb:11")
      lit("    restart: unless-stopped")
      ldb = limits()
      lit("    command:")
      ok(valued(L[p], "      - --sql-mode=", SQLMODE))
      lit("      - --max-allowed-packet=256M")
      lit("    environment:")
      lit("      MARIADB_ROOT_PASSWORD: \"${DB_PASSWORD}\"")
      ok(quoted(L[p], "      MARIADB_DATABASE: ", DBNAME)); db = VAL
      lit("    volumes:")
      lit("      - db:/var/lib/mysql")
      lit("  web:")
      ok(valued(L[p], "    image: ", IMG))
      lit("    restart: unless-stopped")
      lit("    security_opt: [\"no-new-privileges:true\"]")
      lit("    shm_size: 512m")
      lweb = limits()
      lit("    depends_on: [db]")
      if (f == 1) { lit("    entrypoint: [\"apache2-foreground\"]"); m = mail_env(1) }
      if (f == 2) {
        url = "https://[A-Za-z0-9._~/%+=@:?&-]+"
        lit("    environment:")
        lit("      JOOMLA_DB_HOST: db")
        lit("      JOOMLA_DB_USER: root")
        lit("      JOOMLA_DB_PASSWORD: \"${DB_PASSWORD}\"")
        lit("      JOOMLA_DB_NAME: \"" db "\"")
        lit("      JOOMLA_DB_PREFIX: \"tr_\"")
        lit("      JOOMLA_SITE_NAME: \"" label "\"")
        lit("      JOOMLA_ADMIN_USER: \"Tracy Agent\"")
        lit("      JOOMLA_ADMIN_USERNAME: \"tracyagent\"")
        lit("      JOOMLA_ADMIN_PASSWORD: \"${JOOMLA_ADMIN_PASSWORD}\"")
        lit("      JOOMLA_ADMIN_EMAIL: \"tracy-agent@tracy.ai\"")
        ok(quoted(L[p], "      JOOMLA_EXTENSIONS_URLS: ", "^(" url "([,;]" url ")*)?$"))
        m = mail_env(0)
      }
      if (f == 3) {
        lit("    environment:")
        lit("      WORDPRESS_DB_HOST: db")
        lit("      WORDPRESS_DB_USER: root")
        lit("      WORDPRESS_DB_PASSWORD: \"${DB_PASSWORD}\"")
        lit("      WORDPRESS_DB_NAME: \"" db "\"")
        lit("      WORDPRESS_TABLE_PREFIX: \"tr_\"")
        m = mail_env(0)
      }
      lit("    volumes:")
      ok(webroot(L[p]))
      lit("      - ./apache/headers.load:/etc/apache2/mods-enabled/headers.load:ro")
      lit("      - ./apache/tracy-noindex.conf:/etc/apache2/conf-enabled/zz-tracy-noindex.conf:ro")
      lit("      - " substr(WR, 1, length(WR) - 9) ":/site/" label)
      lit("      - " WR ":/site/" label "/.webroot")
      web_networks()
      opt_dns()
      lit("    ports:")
      lit("      - \"127.0.0.1:${HOST_PORT:?this site\047s .env has no HOST_PORT — refusing to publish it on a default port another site may hold}:80\"")
      lit("volumes:")
      lit("  db:")
      lit("networks:")
      lit("  default:")
      lit("    external: true")
      lit("    name: " label "_default")
      lit("  tracy:")
      lit("    external: true")
      ok(valued(L[p], "    name: ", NET))
      # The caps come as one write, on both services and only beside the mail run (webroot.js).
      if (ldb != lweb || (lweb && !m)) return 0
      return !bad && p == n + 1
    }
    /^ *$/ || /^ *#/ { next }
    { L[++n] = $0 }
    END {
      label = ENVIRON["PHP_LABEL"]
      if (label !~ /^[A-Za-z0-9][A-Za-z0-9._-]*$/) exit 1
      ALIAS = ENVIRON["WEB_DNS_ALIAS"]
      # `tracy-web-` and 32 lowercase hex digits, spelled without `{n}` (mawk); anything else, e.g. an
      # empty hash where neither sha256sum nor shasum ran, matches no alias line.
      if (length(ALIAS) != 42 || ALIAS !~ /^tracy-web-[0-9a-f]+$/) ALIAS = ""
      IMG = "^[A-Za-z0-9][A-Za-z0-9._/:@-]*$"; NET = "^[A-Za-z0-9][A-Za-z0-9_.-]*$"
      DBNAME = "^[A-Za-z0-9_]+$"; SQLMODE = "^([A-Z_]+(,[A-Z_]+)*)?$"
      MAILURL = "^\"https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~%/-]*)?\"$"
      MEM = "^[1-9][0-9]*[mg]$"; PIDS = "^[1-9][0-9]*$"
      CPUS = "^([1-9][0-9]*(\\.[0-9]+)?|0\\.[0-9]*[1-9][0-9]*)$"
      for (f = 1; f <= 3; f++) if (form(f)) exit 0
      exit 1
    }
  ' "$1"
}

site_shape() {
  local d="$1" f mark proof rc label
  if [ ! -e "$d" ] && [ ! -L "$d" ]; then echo other; return 0; fi
  for f in "$d/data" "$d/uploads"; do
    if [ -e "$f" ] || [ -L "$f" ]; then echo emdash; return 0; fi
  done
  local marked=0 proven=0
  for f in "$d/.env" "$d/docker-compose.yml"; do
    [ -e "$f" ] || [ -L "$f" ] || continue
    if [ -L "$f" ] || [ ! -f "$f" ] || [ ! -r "$f" ]; then echo unknown; return 0; fi
    case "$f" in
      */.env)
        mark='^(PLATFORM=emdash[[:space:]]*$|EMDASH_)'
        proof='^PLATFORM=(joomla|wordpress)[[:space:]]*$' ;;
      *)
        mark='EMDASH_|/app/(data|uploads)([^A-Za-z0-9_]|$)'
        proof='' ;;
    esac
    rc=0; grep -Eq "$mark" "$f" || rc=$?
    case "$rc" in 0) marked=1 ;; 1) ;; *) echo unknown; return 0 ;; esac
    if [ -n "$proof" ]; then
      rc=0; grep -Eq "$proof" "$f" || rc=$?
    else
      # One of the three PHP forms the fleet writes (`compose_proves_php` above), never a line pattern.
      label="${d%/}"; label="${label##*/}"
      rc=0; compose_proves_php "$f" "$label" || rc=$?
    fi
    case "$rc" in 0) proven=1 ;; 1) ;; *) echo unknown; return 0 ;; esac
  done
  if [ "$marked" = 1 ]; then echo emdash
  elif [ "$proven" = 1 ]; then echo other
  else echo unknown
  fi
}

PLATFORM=unknown
case "$(site_shape "$SITE_DIR")" in
  emdash) PLATFORM=emdash ;;
  unknown) fail 8 TOKEN_CUSTODY_UNKNOWN "$SITE_DIR has a .env or docker-compose.yml that is not one readable regular file, or neither an EmDash mark nor the Joomla/WordPress proof (.env PLATFORM=joomla|wordpress, or a compose in one of the three PHP forms render-compose.sh writes), so which platform it is cannot be proven — nothing was read, minted or written" ;;
  *) if [ -f "$CONFIG" ]; then PLATFORM=joomla; fi ;;
esac

# The Joomla/WordPress token is read by `held_token` below, which skips anything but a regular file;
# something else in its place (a FIFO, a directory) is refused rather than minted over, as the door's
# non-blocking read refuses it.
if [ "$PLATFORM" != emdash ] && { [ -e "$TOKEN_FILE" ] && [ ! -f "$TOKEN_FILE" ]; }; then
  fail 8 TOKEN_CUSTODY_UNKNOWN "$TOKEN_FILE is not a regular file — nothing was read, minted or written"
fi

# 🔒 PROTECTED CUSTODY (#155) CHANGES WHAT "FINISHED" MEANS, AND WHAT THIS SCRIPT MAY WRITE.
# Where the site's own compose binds the host token read-only at `/run/tracy-agent.token`, the
# container reads the HOST FILE ITSELF through a single-file bind and provision deletes the `data/`
# copy on purpose — it sits in an agent-writable volume, which is the whole reason the mount exists.
# On such a site the two legacy writes below are both wrong:
#   * the `data/` copy would hand the site's own www-data shell a readable PAT again, and
#   * `mv` over the token file would give it a NEW INODE, which the running container never sees
#     (Docker resolved the bind at create time) — so this script would report success while every
#     `tracy_emdash` call keeps presenting the old value.
# So under this custody: one file, written IN PLACE, and "already minted" is decided by that file
# alone. Detected from the compose file rather than a flag, the same way the platform above is.
#
# THREE ANSWERS, FROM ONE TABLE SHARED WITH THE DOOR: `apps/tracy-host/src/webroot.js`'s
# `classifyTokenMount` is the JavaScript twin of the awk below, entry for entry —
#   protected  the file is, line for line, what render-compose.sh's `tracy_compose_emdash` writes
#              WITH `      - ./tracy-agent.token:/run/tracy-agent.token:ro` exactly once: where the
#              generator puts it (after ./uploads:/app/uploads), or where
#              emdash/migrate-token-mount.mjs inserts it into a pre-#155 file (first in
#              services.web.volumes when a comment follows `volumes:`, last when none does); the
#              site-mail run (#289, `tracy_web_mail_env`) may follow TRACY_FRAME_ANCESTORS, and only
#              beside the bind in the generator's place — no other writer ever put the two together;
#              the resource-cap run (28/09/2026, `tracy_limits_run`) may follow shm_size, and only
#              beside both;
#   none       the file is, line for line, the pre-#155 output: the same form with no token bind,
#              no site-mail run and no cap run;
#   unknown    anything else — another shape, extra or missing structure, malformed YAML, a
#              hand-edited but valid compose, a missing, unreadable or empty file.
# 🔒 AN EXACT-FORM MATCHER, NOT A YAML PARSER (Hano, 23/09/2026). Three reviews in a row found a
# malformed shape a line parser read as `none` (`image: {]`, two scalars on one value,
# `services: invalid` above an indented `web:`), and `none` beside an absent host token authorises
# the legacy repair below. The fleet writes these files itself, so its own output is the whole
# vocabulary. Blank lines and whole-line comments are dropped (the generator's comments change
# between versions; with every other line fixed, no line can open a block scalar or a multi-line
# quote, so a `#` line is always a comment); every other line is compared literally or against a
# tight value class (image, sites root, dns list, network name). The expected answers live in
# test/token-custody-cases.mjs, shared with the door's tests.
# `unknown` REFUSES before any write: a regex that knew only the short form once read a valid
# long-form bind as legacy, and the legacy repair then revoked the credential, replaced the inode
# the container holds and wrote the readable copy back (Astra review, 22/09/2026). A hand-edited
# compose is refused on purpose: re-render it (`render-compose.sh <label>`) and, if it is pre-#155,
# migrate it (emdash/README.md).
token_mount_custody() {
  # A symlink is `unknown` even when its target matches (Astra review, 23/09/2026): the fleet
  # writes a plain file, and a link lets someone else choose what this reads. `-f` follows links,
  # so `-L` is tested first.
  [ ! -L "$1" ] && [ -f "$1" ] && [ -r "$1" ] || { echo unknown; return 0; }
  # The #165 alias for this label (`web_networks`, documented above `compose_proves_php`).
  local dns_hash
  dns_hash="$( { printf '%s' "${2##*/}" | { sha256sum 2>/dev/null || shasum -a 256 2>/dev/null; } | cut -c1-32; } || true)"
  # Through the environment, not `-v`: awk `-v` processes backslash escapes in the value.
  CUSTODY_SITE="${2:-}" WEB_DNS_ALIAS="tracy-web-$dns_hash" awk '
    function abspath(s) { return s ~ /^(\/[A-Za-z0-9._-]+)+$/ && s !~ /\/\.\.?(\/|$)/ }
    function starts(s, pre) { return substr(s, 1, length(pre)) == pre }
    function ends(s, suf) { return length(s) >= length(suf) && substr(s, length(s) - length(suf) + 1) == suf }
    # Every line is read through `at`, never as `L[i]` directly: past the end it answers "" without
    # creating the element. GNU awk 5.2.1 (Debian 12) aborts with `fatal: internal error ...
    # Node_array_ref` (exit 2, no answer) when an element that does not exist is passed to a
    # function, compared, then passed again (a short compose read past its last line); mawk and
    # busybox awk do not, so the three awks gave different answers for the same file.
    function at(i) { return (i >= 1 && i <= n) ? L[i] : "" }
    function lit(s) { if (p <= n && at(p) == s) p++; else bad = 1 }
    function ok(cond) { if (p <= n && cond) p++; else bad = 1 }
    # `slot` names the place: first or last where the migration inserts it, or where the generator puts it.
    function opt_token(slot) { if (p <= n && at(p) == TOKEN) { p++; tokens++; if (slot == "generator") gen++ } }
    function opt_dns(  s, mid, o, ip4) {
      o = "(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9]?[0-9])"
      ip4 = o "\\." o "\\." o "\\." o
      if (p > n) return
      s = at(p)
      if (!starts(s, "    dns: [") || !ends(s, "]") || length(s) < 12) return
      mid = substr(s, 11, length(s) - 11)
      # IPv4 addresses, comma-separated, one optional space after each comma — as webroot.js.
      # Spelled without `{n}` intervals: mawk, the Debian default, does not honour them everywhere.
      if (mid ~ ("^" ip4 "(, ?" ip4 ")*$")) p++
    }
    function valued(s, pre, re) { return starts(s, pre) && substr(s, length(pre) + 1) ~ re }
    function web_networks() {
      if (bad || p > n) { bad = 1; return }
      if (length(label "-web-1") <= 63 && at(p) == "    networks: [default]") { isolated = 1; p++; return }
      if (length(label "-web-1") > 63 && ALIAS != "" && p + 2 <= n && at(p) == "    networks:" &&
          at(p + 1) == "      default:" && at(p + 2) == "        aliases: [\"" ALIAS "\"]") { isolated = 1; p += 3; return }
      if (at(p) == "    networks: [default, tracy]") { p++; return }
      if (length(label "-web-1") > 63 && ALIAS != "" && p + 3 <= n && at(p) == "    networks:" &&
          at(p + 1) == "      default: {}" && at(p + 2) == "      tracy:" &&
          at(p + 3) == "        aliases: [\"" ALIAS "\"]") { p += 4; return }
      bad = 1
    }
    # The site-mail run render-compose.sh writes since #289 (`tracy_web_mail_env`), all or nothing,
    # as webroot.js `matchMailEnv`: with `hdr`, first the `environment:` line of the clone form; then
    # TRACY_MAIL_URL (the default, or the one a host sets: `MAILURL`), TRACY_MAIL_LABEL naming THIS
    # label, and the token interpolation. Consumes the run and returns 1, or consumes nothing and returns 0.
    function mail_env(hdr,   q) {
      q = p
      if (hdr) { if (q > n || at(q) != "    environment:") return 0; q++ }
      if (q + 2 > n) return 0
      if (!valued(at(q), "      TRACY_MAIL_URL: ", MAILURL)) return 0
      if (at(q + 1) != "      TRACY_MAIL_LABEL: \"" label "\"") return 0
      if (at(q + 2) != "      TRACY_MAIL_TOKEN: \"${TRACY_MAIL_TOKEN:-}\"") return 0
      p = q + 3
      return 1
    }
    # The resource-cap run render-compose.sh writes since 28/09/2026 (`tracy_limits_run`), all or
    # nothing, as webroot.js `matchLimits`: mem_limit, memswap_limit EQUAL to it, cpus, pids_limit.
    # Consumes the run and returns 1, or consumes nothing and returns 0.
    function limits(   mem) {
      if (p + 3 > n) return 0
      if (!valued(at(p), "    mem_limit: ", MEM)) return 0
      mem = substr(at(p), length("    mem_limit: ") + 1)
      if (at(p + 1) != "    memswap_limit: " mem) return 0
      if (!valued(at(p + 2), "    cpus: ", CPUS)) return 0
      if (!valued(at(p + 3), "    pids_limit: ", PIDS)) return 0
      p += 4
      return 1
    }
    function sites_mount(s,  pre, tail, mid) {
      pre = "      - "; tail = "/" label ":/site/" label
      if (!starts(s, pre) || !ends(s, tail) || length(s) <= length(pre) + length(tail)) return 0
      mid = substr(s, length(pre) + 1, length(s) - length(pre) - length(tail))
      return abspath(mid)
    }
    /^ *$/ || /^ *#/ { next }
    { L[++n] = $0 }
    END {
      site = ENVIRON["CUSTODY_SITE"]
      label = site; sub(/.*\//, "", label)
      if (!abspath(site) || label !~ /^[A-Za-z0-9][A-Za-z0-9._-]*$/) { print "unknown"; exit }
      ALIAS = ENVIRON["WEB_DNS_ALIAS"]
      # `tracy-web-` and 32 lowercase hex digits, spelled without `{n}` (mawk); anything else, e.g. an
      # empty hash where neither sha256sum nor shasum ran, matches no alias line.
      if (length(ALIAS) != 42 || ALIAS !~ /^tracy-web-[0-9a-f]+$/) ALIAS = ""
      TOKEN = "      - ./tracy-agent.token:/run/tracy-agent.token:ro"
      IMG = "^[A-Za-z0-9][A-Za-z0-9._/:@-]*$"; NET = "^[A-Za-z0-9][A-Za-z0-9_.-]*$"
      MAILURL = "^\"https?://[A-Za-z0-9.-]+(:[0-9]+)?(/[A-Za-z0-9._~%/-]*)?\"$"
      MEM = "^[1-9][0-9]*[mg]$"; PIDS = "^[1-9][0-9]*$"
      CPUS = "^([1-9][0-9]*(\\.[0-9]+)?|0\\.[0-9]*[1-9][0-9]*)$"
      p = 1; tokens = 0; gen = 0; bad = 0; isolated = 0; access = 0
      lit("services:")
      lit("  web:")
      ok(valued(at(p), "    image: ", IMG))
      lit("    restart: unless-stopped")
      # `init: true` (#205): written since 31/10/2026 by render-compose.sh, absent from older files.
      if (at(p) == "    init: true") p++
      lit("    security_opt: [\"no-new-privileges:true\"]")
      lit("    shm_size: 512m")
      lim = limits()
      lit("    environment:")
      lit("      EMDASH_ENCRYPTION_KEY: \"${EMDASH_ENCRYPTION_KEY}\"")
      lit("      EMDASH_SITE_URL: \"${EMDASH_SITE_URL}\"")
      lit("      TRACY_FRAME_ANCESTORS: \"${TRACY_FRAME_ANCESTORS:-}\"")
      mail = mail_env(0)
      lit("    volumes:")
      opt_token("first")
      lit("      - app:/app")
      lit("      - ./data:/app/data")
      lit("      - ./uploads:/app/uploads")
      opt_token("generator")
      ok(sites_mount(at(p)))
      lit("      - " site "/data:/site/" label "/.webroot/data")
      lit("      - " site "/uploads:/site/" label "/.webroot/uploads")
      opt_token("last")
      parent = site; sub("/[^/]+$", "", parent)
      if (at(p) == "      - " parent "/.site-access/" label ":/run/tracy-access:ro") { access = 1; p++ }
      web_networks()
      if (!isolated) opt_dns()
      lit("    ports:")
      lit("      - \"127.0.0.1:${HOST_PORT:?this site\047s .env has no HOST_PORT — refusing to publish it on a default port another site may hold}:4321\"")
      lit("volumes:")
      lit("  app:")
      lit("networks:")
      lit("  default:")
      lit("    external: true")
      lit("    name: " label "_default")
      if (!isolated) {
        lit("  tracy:")
        lit("    external: true")
        ok(valued(at(p), "    name: ", NET))
      }
      if (bad || p != n + 1) print "unknown"
      # The mail run dates the file (#289): only a generator that writes the bind in its own place
      # wrote it, so mail with no bind, or with the bind where only the migration puts it, is no
      # fleet form (webroot.js `classifyTokenMount`).
      else if (mail && !(tokens == 1 && gen == 1)) print "unknown"
      # So does the cap run (28/09/2026), later still: its generator writes the mail run and the bind
      # in its own place too, and caps beside no bind would otherwise read `none`.
      else if (lim && !(mail && tokens == 1 && gen == 1)) print "unknown"
      # Isolation/access are current generator forms, never proof of a pre-protected legacy site.
      else if ((isolated || access) && !(lim && mail && tokens == 1 && gen == 1)) print "unknown"
      else if (tokens == 0) print "none"
      else if (tokens == 1) print "protected"
      else print "unknown"
    }
  ' "$1"
}

PROTECTED_MOUNT=0
if [ "$PLATFORM" = emdash ]; then
  # Compose resolves a relative source against the directory holding the compose file; this script
  # may be run by hand with a relative root, so the directory is made absolute the same way.
  case "$SITE_DIR" in /*) SITE_ABS="$SITE_DIR" ;; *) SITE_ABS="$PWD/$SITE_DIR" ;; esac
  # `//` squeezed the way the door's `path.resolve` does; a `.`/`..` segment is left for the
  # matcher to refuse (fail closed) rather than resolved here.
  SITE_ABS="$(printf '%s' "$SITE_ABS" | tr -s /)"
  case "$(token_mount_custody "$SITE_DIR/docker-compose.yml" "$SITE_ABS")" in
    protected) PROTECTED_MOUNT=1 ;;
    none)
      # 🔒 `none` BESIDE A HOST TOKEN FILE IS A DISAGREEMENT, NOT A LEGACY SITE (Hano, 23/09/2026).
      # The host file is the protected token; a compose declaring no mount next to it is most likely
      # a protected site whose compose lost the entry while its container kept the bind — where the
      # legacy repair below revokes the credential the container reads, `mv`s a new inode over the
      # one it holds and writes the readable data/ copy back. The legacy mint runs only for a site
      # PROVEN pre-#155: readable compose, no mount, and no host token file (a dangling link counts).
      if [ -e "$TOKEN_FILE" ] || [ -L "$TOKEN_FILE" ]; then
        fail 8 TOKEN_CUSTODY_UNKNOWN "the site compose file declares no read-only token mount but $TOKEN_FILE exists — a protected site whose compose lost its mount looks exactly like this; nothing was minted or written (verify with emdash/migrate-token-mount.mjs, see emdash/README.md)"
      fi
      ;;
    *) fail 8 TOKEN_CUSTODY_UNKNOWN "the token custody of $SITE_ABS cannot be proven from its compose file (missing, unreadable, empty, or not exactly the EmDash compose render-compose.sh writes, with or without its read-only token bind — hand edits included; re-render with render-compose.sh, see emdash/README.md) — nothing was written" ;;
  esac
fi

# 🔒 A PROTECTED BIND WHOSE HOST FILE IS GONE IS NOT A SITE WAITING FOR ITS FIRST TOKEN. Provision
# fails when the token cannot be prepared, so a compose file carrying the bind always had a file
# here; a running container created then still reads THAT inode, deleted or not. Minting now would
# create a new inode the container never sees AND revoke the credential it is still presenting:
# success on this side, NO_TOKEN on the agent's. Only a recreate rebinds the path, so the repair is
# the staged recovery (in-place write, then `migrate-token-mount.mjs --apply`, then finalize), not
# this script. An EMPTY file is still ours to mint over: it keeps its inode, and the write below
# goes through it. A symlink, dangling or not, is refused just below.
if [ "$PROTECTED_MOUNT" = 1 ] && [ ! -e "$TOKEN_FILE" ] && [ ! -L "$TOKEN_FILE" ]; then
  fail 8 TOKEN_CUSTODY_UNKNOWN "the site compose file binds $TOKEN_FILE read-only and that file is gone — a new file is an inode the running container never sees; nothing was minted (staged recovery: emdash/README.md)"
fi

# 🔒 THE PROTECTED FILE MUST BE ONE REGULAR FILE, NOT A NAME FOR ANOTHER (Astra review, 23/09/2026).
# `held_token` below follows links, so a tracy-agent.token symlinked (or hard-linked) to
# data/tracy-agent.token passed as "already minted" — with the PAT in the directory the site's own
# www-data shell reads. The door's `readAgentTokenCustody` makes the same refusal. A dangling link
# is refused here too, before the in-place write would have to.
#
# 🔒 AND IT MUST BE ROOT'S, MODE 0600 (Astra review, 23/09/2026). The bind hands the container the
# file's own owner and mode, so a token left 0644 — or owned by anyone but root — is readable by the
# site's www-data shell through /run/tracy-agent.token, which is what the mount exists to prevent.
# `find -user/-perm` is the check both GNU and BSD find make the same way. TRACY_TOKEN_OWNER_UID
# exists only so the suites can run unprivileged: tracy-host passes its own value (always 0 in
# production, see `mintAgentToken`), and an unset or non-numeric value means root.
OWNER_UID="${TRACY_TOKEN_OWNER_UID:-0}"
case "$OWNER_UID" in '' | *[!0-9]*) OWNER_UID=0 ;; esac
if [ "$PROTECTED_MOUNT" = 1 ] && { [ -e "$TOKEN_FILE" ] || [ -L "$TOKEN_FILE" ]; }; then
  if [ -L "$TOKEN_FILE" ] || [ ! -f "$TOKEN_FILE" ] ||
    [ -z "$(find "$TOKEN_FILE" -maxdepth 0 -links 1 -user "$OWNER_UID" -perm 0600 2>/dev/null)" ]; then
    fail 8 TOKEN_CUSTODY_UNKNOWN "$TOKEN_FILE is bound read-only but is not one root-owned 0600 regular file (a symlink, another file type, a second hard link, another owner or a wider mode) — nothing was read, minted or written (emdash/README.md)"
  fi
fi

# The value a token file names, or '' for absent/empty/whitespace.
held_token() {
  [ -f "$1" ] || return 0
  tr -d '[:space:]' < "$1"
}

# Written through a temp file so a door reading it never opens a half-written one, and created
# 0600 from the start rather than chmod'd after — a world-readable window, however short, is a
# window on the site's write key.
write_token_file() {
  local dest="$1" tmp="$1.$$.tmp"
  umask 077
  printf '%s\n' "$TOKEN" > "$tmp"
  chmod 600 "$tmp"
  mv "$tmp" "$dest"
}

# The same write for a file a container is holding by inode: the bytes go THROUGH the existing
# file, so the read-only bind stays valid and the site sees the new value live (proven on Linux by
# `test/emdash-agent-token-ro-mount.fixture.mjs`). There is no temp file and no rename, so the
# 0600-from-the-start guarantee is made by `umask 077` on the create and re-asserted with chmod
# before the secret lands. A symlink at the destination is REFUSED, never written through: under
# this custody the destination is root-owned and a link there is the shape of a redirected write.
write_token_file_in_place() {
  local dest="$1"
  if [ -L "$dest" ]; then
    fail 3 SITE_UNKNOWN "$dest is a symlink — refusing to write the agent token through it"
  fi
  umask 077
  if [ ! -e "$dest" ]; then : > "$dest"; fi
  [ -f "$dest" ] || fail 3 SITE_UNKNOWN "$dest is not a regular file — refusing to write the agent token"
  chmod 600 "$dest"
  printf '%s\n' "$TOKEN" > "$dest"
}

# 🔒 EMDASH FINISHES IN TWO PLACES. Writing only the host copy is the exact bug this script now
# exists to repair; see the second 🔒 block at the top.
finish() {
  if [ "$PROTECTED_MOUNT" = 1 ]; then
    # One file, through its existing inode, and no `data/` copy — see the PROTECTED_MOUNT block.
    write_token_file_in_place "$TOKEN_FILE"
    echo "==> agent token ready (protected read-only mount; written in place, no data/ copy)"
    echo "TRACY_RESULT token=$TOKEN"
    return
  fi
  write_token_file "$TOKEN_FILE"
  if [ "$PLATFORM" = emdash ]; then write_token_file "$CONTAINER_TOKEN_FILE"; fi
  echo "==> agent token ready"
  echo "TRACY_RESULT token=$TOKEN"
}

# ALREADY MINTED: print it and touch nothing. This is what lets the door call this
# unconditionally instead of asking first — reading the file is the whole of the ordinary path,
# and the database is never opened for a site that already has its key.
#
# ⚠ ON EMDASH ONLY THE PROTECTED MOUNT REACHES THIS WITH A HOST TOKEN. Before 23/09/2026 a legacy
# EmDash site holding the host copy but no matching `data/` copy was re-minted here (`demoemdash1`,
# 20/09/2026). That state is now refused as TOKEN_CUSTODY_UNKNOWN above, because it cannot be told
# apart from a protected site whose compose lost its mount. Under the protected mount the file just
# read IS the one the container reads, so re-minting would revoke a live PAT for a whole site.
HELD="$(held_token "$TOKEN_FILE")"
if [ -n "$HELD" ]; then
  echo "==> token already on disk"
  echo "TRACY_RESULT token=$HELD"
  exit 0
elif [ -f "$TOKEN_FILE" ]; then
  # An EMPTY file is not a token, it is a write that did not finish — and left alone it is
  # permanent, because the file existing is exactly what makes every later run a no-op. Fall
  # through and mint over it.
  echo "==> the token file is empty — minting over it"
fi

[ -d "$SITE_DIR" ] || fail 3 SITE_UNKNOWN "no site directory at $SITE_DIR"
[ -f "$SITE_DIR/docker-compose.yml" ] || fail 3 SITE_UNKNOWN "no docker-compose.yml in $SITE_DIR"

# ── EmDash: ask the site to mint, inside its own container ──────────────────────────────────
# The same script and the same one-line contract `platform/emdash.sh` uses at provision time, so
# there is one minter for this site's PAT and not a second implementation to drift from it.
if [ "$PLATFORM" = emdash ]; then
  CONTAINER="${LABEL}-web-1"
  RUNNING="$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || true)"
  [ "$RUNNING" = true ] || fail 5 SITE_DOWN "the web container $CONTAINER is not running — start the site first"

  # Beside this script in a checkout, under TRACY_FLEET_DIR in the image — the same two candidates
  # `platform/emdash.sh` tries, in the same order.
  MINTER=""
  for candidate in "$HERE/emdash/mint-agent-admin.cjs" "$TRACY_FLEET_DIR/provision/emdash/mint-agent-admin.cjs"; do
    if [ -f "$candidate" ]; then MINTER="$candidate"; break; fi
  done
  [ -n "$MINTER" ] || fail 7 EMDASH_MINT_REFUSED "no mint-agent-admin.cjs beside this script or under $TRACY_FLEET_DIR/provision/emdash"

  docker cp "$MINTER" "$CONTAINER:/app/tracy-mint.cjs" >/dev/null 2>&1 ||
    fail 7 EMDASH_MINT_REFUSED "could not copy the minter into $CONTAINER"

  # 🔒 STDERR TO ITS OWN FILE, NEVER FOLDED INTO STDOUT. The Joomla path folds them because its
  # answers are markers in a noisy client's output; here stdout carries the raw PAT and stderr is
  # what becomes `detail` in the door's answer. Folded, a failure message could carry the site's
  # write key out to a caller that logs it.
  MINT_ERR="$(mktemp "${TMPDIR:-/tmp}/mint-agent-token.XXXXXX")"
  MINTED="$(docker exec -w /app "$CONTAINER" node tracy-mint.cjs 2>"$MINT_ERR" || true)"
  # Not left in the site's tree, whatever the mint did (same rule as platform/emdash.sh).
  docker exec -u 0 "$CONTAINER" rm -f /app/tracy-mint.cjs >/dev/null 2>&1 || true
  MINT_TAIL="$(tail -1 "$MINT_ERR" 2>/dev/null || true)"
  rm -f "$MINT_ERR"
  TOKEN="$(printf '%s\n' "$MINTED" | sed -n 's/^TRACY_EMDASH_PAT=//p' | tail -1 | tr -d '[:space:]' || true)"
  case "$TOKEN" in
    ec_pat_*) ;;
    *) fail 7 EMDASH_MINT_REFUSED "the site did not mint a PAT: ${MINT_TAIL:-no output}" ;;
  esac
  echo "==> minted the agent PAT inside $CONTAINER"
  finish
  exit 0
fi

[ -f "$CONFIG" ] || fail 4 NOT_JOOMLA "no configuration.php at $CONFIG and no EmDash mark (data/, uploads/, .env, compose) in $SITE_DIR — only Joomla and EmDash can be minted from outside"

# ⚠ READ THE PREFIX, NEVER ASSUME `tr_`. A fleet-born Joomla gets `tr_` because render-compose.sh
# pins JOOMLA_DB_PREFIX; a site that arrived as a clone carries whatever prefix its owner chose,
# and the sites this script exists for are exactly the old ones. A wrong prefix does not fail
# loudly — `<prefix>extensions` simply does not exist, which reads as "the component is not
# installed" on a site where it is.
php_string() {
  sed -nE "s/^[[:space:]]*(public[[:space:]]+)?\\\$$1[[:space:]]*=[[:space:]]*'([^']*)'.*/\\2/p" "$CONFIG" | sed -n 1p
}
# `|| true`: `sed | head -1` can end non-zero on a closed pipe, and under `set -e` that would end
# the script with no message at all. The emptiness checks below are what actually decides.
PREFIX="$(php_string dbprefix || true)"
DB_NAME="$(php_string db || true)"
# Both land inside a SQL identifier below, so the charset is checked here and not hoped for.
case "$PREFIX" in
  '' | *[!A-Za-z0-9_]*) fail 4 NOT_JOOMLA "could not read \$dbprefix from $CONFIG" ;;
esac
case "$DB_NAME" in
  '' | *[!A-Za-z0-9_-]*) fail 4 NOT_JOOMLA "could not read \$db from $CONFIG" ;;
esac

# root, from the stack's own .env — the same credential provision.sh reused for every later step
# on this site. Without it there is nothing to authenticate with, and the site's record on this
# host is incomplete rather than its database being down.
# `|| true` for the same reason as php_string above: no `.env` at all must reach the named refusal
# below, not end the script with a bare exit 1 that says nothing.
DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' "$SITE_DIR/.env" 2>/dev/null | head -1 || true)"
[ -n "$DB_PASSWORD" ] || fail 3 SITE_UNKNOWN "no DB_PASSWORD in $SITE_DIR/.env"

DB_CID="$( ( cd "$SITE_DIR" && docker compose ps -q db ) 2>/dev/null | sed -n 1p )" || DB_CID=""
[ -n "$DB_CID" ] || fail 5 SITE_DOWN "the db service of $LABEL is not running — start the site first"

# One statement per call, arriving on STDIN: nothing quoted here ever reaches a command line.
# stderr is folded into stdout so the client's own "Using a password on the command line interface
# can be insecure" warning cannot be mistaken for a result — every caller below picks its answer
# out by the marker it asked for, and reads the last line only when reporting a failure.
site_sql() {
  ( cd "$SITE_DIR" && docker compose exec -T db \
      mariadb --skip-ssl -N -B -uroot -p"$DB_PASSWORD" "$DB_NAME" ) 2>&1
}

# What the component holds today. `CONCAT('TOKEN=', …)` rather than the bare column, because with
# `-N` a row holding an empty token and no row at all both print nothing a shell can tell apart —
# and those two are exactly the cases that have to diverge here (mint, versus say the component is
# not installed).
TOKEN_EXPR="COALESCE(JSON_UNQUOTE(JSON_EXTRACT(IF(JSON_VALID(params), params, '{}'), '\$.token')), '')"
READ_SQL="SELECT CONCAT('TOKEN=', $TOKEN_EXPR) FROM \`${PREFIX}extensions\` WHERE element='com_claudecowork' LIMIT 1;"
read_params() { printf '%s\n' "$READ_SQL" | site_sql; }
token_of() { printf '%s\n' "$1" | sed -n 's/^TOKEN=//p' | head -1 | tr -d '[:space:]' || true; }

echo "==> reading the component token"
RC=0
OUT="$(read_params)" || RC=$?
if [ "$RC" -ne 0 ]; then
  # Down, or just no such table? One probe is what keeps SITE_DOWN and COMPONENT_NOT_INSTALLED
  # from reading the same — the whole reason this script reports codes rather than one failure.
  if printf 'SELECT 1;\n' | site_sql >/dev/null 2>&1; then
    fail 6 COMPONENT_NOT_INSTALLED "no \`${PREFIX}extensions\` table answered: $(printf '%s' "$OUT" | tail -1)"
  fi
  fail 5 SITE_DOWN "the database of $LABEL did not answer: $(printf '%s' "$OUT" | tail -1)"
fi
# A `case`, not `grep -q`: under `pipefail` grep exits the moment it matches, and the `printf`
# feeding it then dies of SIGPIPE — which would make a successful match read as a failed pipeline
# and refuse a site that is perfectly fine. Nothing else the client prints contains `TOKEN=`.
case "$OUT" in
  *TOKEN=*) ;;
  *) fail 6 COMPONENT_NOT_INSTALLED "no com_claudecowork row in \`${PREFIX}extensions\` — the Cowork component is not installed on this site" ;;
esac
TOKEN="$(token_of "$OUT")"

if [ -z "$TOKEN" ]; then
  echo "==> minting a component token"
  # 20 bytes of the kernel's own randomness, hex — the same value joomla.sh mints, and the
  # component compares its params against it verbatim, so a value written into params IS the token.
  MINTED="$(head -c 20 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  # 🔒 `AND <token> = ''` IS THE RACE GUARD, NOT A TIDINESS CHECK. Two calls to this door for one
  # site — a double press on Connect, a retry landing on top of the first — each read an empty
  # token and each mint their own. Unguarded, both UPDATEs succeed, the database keeps whichever
  # landed second and each writes ITS OWN value to the token file: the site is then paired against
  # a token nothing holds, permanently, because the file existing makes every later run a no-op.
  # Guarded, exactly one UPDATE can match, and the loser is told so by ROW_COUNT=0 and asks again.
  RC=0
  HELD="$(printf '%s\n' \
    "UPDATE \`${PREFIX}extensions\` SET params = JSON_SET(IF(JSON_VALID(params), params, '{}'), '\$.token', '$MINTED') WHERE element='com_claudecowork' AND $TOKEN_EXPR = ''; SELECT CONCAT('ROWS=', ROW_COUNT());" \
    | site_sql)" || RC=$?
  [ "$RC" -eq 0 ] || fail 5 SITE_DOWN "the database of $LABEL refused the update: $(printf '%s' "$HELD" | tail -1)"
  ROWS="$(printf '%s\n' "$HELD" | sed -n 's/^ROWS=//p' | head -1 | tr -dc '0-9' || true)"
  if [ "${ROWS:-0}" -gt 0 ]; then
    TOKEN="$MINTED"
  else
    # ROW_COUNT 0: either another mint for this same site won the race a moment ago, or the
    # component row went away between the read and the write. Ask, rather than declare — a token
    # file naming a token nothing holds would only move the failure to pairing (joomla.sh's own
    # reasoning), and that is the one outcome this script must never produce.
    RC=0
    OUT="$(read_params)" || RC=$?
    [ "$RC" -eq 0 ] || fail 5 SITE_DOWN "the database of $LABEL did not answer: $(printf '%s' "$OUT" | tail -1)"
    TOKEN="$(token_of "$OUT")"
    [ -n "$TOKEN" ] ||
      fail 6 COMPONENT_NOT_INSTALLED "the update matched no com_claudecowork row in \`${PREFIX}extensions\`"
  fi
fi

finish
