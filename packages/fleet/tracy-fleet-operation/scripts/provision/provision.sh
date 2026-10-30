#!/usr/bin/env bash
#
# provision — stand a customer's site up from what Migrate captured.
#
# Codifies the six steps that were done by hand to rebuild wisdeaf.org
# (tracy-docs/migration/pipeline.md §6). Each one of them has a trap behind it, noted where
# it is handled; migration/lessons.md carries the evidence.
#
#   webroot.tar (R2) ─┐
#                     ├─► docker compose stack: php-apache + mariadb
#   db.sql.gz (R2) ───┘
#
# Usage:
#   provision.sh --site example.com --label example-com \
#                --webroot-key example.com/migrate/<ts>/webroot.tar \
#                --db-key     example.com/migrate/<ts>/db.sql.gz
#
# Downloads the archive from signed GET URLs when tracy-host passes them (tracy-web signs them):
#   TRACY_ARCHIVE_WEBROOT_URL  TRACY_ARCHIVE_DB_URL
# Otherwise reads R2 credentials from the environment (same names tracy-desk uses):
#   TRACY_MIGRATE_S3_BUCKET  TRACY_MIGRATE_S3_ENDPOINT
#   TRACY_MIGRATE_S3_ACCESS_KEY  TRACY_MIGRATE_S3_SECRET_KEY
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"

# ── WHERE THE MINUTES GO ─────────────────────────────────────────────────────────────────────────
#
# This script narrates fifteen stages and, until 19/09/2026, not one of them carried a clock. So
# "creating a site is slow" could be measured only from the OUTSIDE: `job.created_at` to
# `job.updated_at`, one number for the whole run. Measured on the local stand that number is
# 1m49.5s for a plain WordPress site (`demowp`, job `6c68149070c9`) — and nothing said whether that
# was the image pull, the database import, the webroot baseline, or the CMS installer. A flow nobody
# can break into stages is a flow nobody can make faster, so every attempt starts by adding this.
#
# 🔒 THE STAMP GOES TO STDERR, AND THE `==>` LINE ON STDOUT IS LEFT EXACTLY AS IT WAS. tracy-host
# PARSES this stream: `apps/tracy-host/src/provision.js` does `if (line.startsWith('==')) jobs.put(
# jobId, {step: stepFromLine(line)})`, and `stepFromLine` strips the `=` and shows the REST OF THE
# LINE to the customer on the Build screen. So a stamp put in front of `==>` stops the progress
# display updating at all, and a stamp appended after it puts "(12.3s)" into the sentence the
# customer reads. stderr reaches the job log — which is where somebody optimising wants it — and
# never reaches that `startsWith('==')` test.
#
# ⚠ AND THE PREFIX DELIBERATELY DOES NOT BEGIN WITH `=`. That one character is the whole contract
# with the parser above; anything starting with `=` becomes a customer-visible step label.
STAGE_T0=$(date +%s)
STAGE_LAST=$STAGE_T0
STAGE_PREV_NAME="start"
STAGE_TIMES=""

# Close the segment that was open and open one called $1. The accounting half of both `stage` and
# `mark`, written once so the two can never disagree about where a boundary is.
stage_boundary() {
  local now delta since
  now=$(date +%s)
  delta=$((now - STAGE_LAST))
  since=$((now - STAGE_T0))
  # What the previous stage COST, now that it has ended. Recorded against the stage that spent it,
  # not the one about to start — a stamp read as "this stage began at 12s" is the commonest way a
  # timing log gets attributed one stage off.
  printf '[stage] %5ds  %-6s %s\n' "$since" "+${delta}s" "$STAGE_PREV_NAME" >&2
  STAGE_TIMES="${STAGE_TIMES}${delta}\t${STAGE_PREV_NAME}\n"
  STAGE_LAST=$now
  STAGE_PREV_NAME="$1"
}

# One stage boundary: say it on stdout the way it has always been said, and time it on stderr.
stage() {
  # The line the customer's Build screen reads. Unchanged, first, and on stdout.
  echo "==> $1"
  stage_boundary "$1"
}

# A boundary ONLY the timing log sees: same accounting, nothing on stdout.
#
# 🔒 THE EXPENSIVE WORK DOES NOT SIT WHERE THE SENTENCES DO, and until 21/09 the timing log had no
# way to say so. The fifteen `==>` lines are a product decision — they are what a customer watches
# on the Build screen — so a boundary cannot be added just because something slow lives there.
# Measured 19/09, and both numbers were read as facts about the wrong thing:
#
#   `importing database` read 89s cold and 9s warm on the same quickstart. The 80s difference is
#   `docker compose up -d` pulling an 800 MB web image — which happens 130 lines further down,
#   inside the same still-open stage, long after the import finished.
#
#   EmDash read 84 of its 90 seconds under a stage named `site network`. Creating a docker network
#   takes milliseconds; the rest was `docker compose up` and waiting for Astro to listen.
#
# A stage that swallows the step after it is worse than no timing at all: it is a number that
# invites somebody to optimise the database import when the cost is a download. So `mark` closes
# and opens a segment without a word to the customer, and its names carry a leading `·` in the log
# so a reader can tell at a glance which boundaries were steps and which were internal.
mark() {
  stage_boundary "· $1"
}

# The summary, on stderr, sorted so the slowest stage is the first thing read. Runs on EXIT so a
# provision that dies half way still says how far it got and what that cost — the failing runs are
# the ones somebody is most likely to be timing.
stage_summary() {
  # 🔒 THE STATUS IS CAPTURED ON THE FIRST LINE AND HANDED BACK ON THE LAST. This runs from an EXIT
  # trap under `set -e`: a non-zero command inside it becomes the script's exit code, and a timing
  # log that turns a successful provision into a failed job is far worse than no timing log. Every
  # command below is either guarded or cannot fail.
  local rc=$?
  local now total
  now=$(date +%s)
  total=$((now - STAGE_T0))
  printf '[stage] %5ds  %-6s %s\n' "$total" "+$((now - STAGE_LAST))s" "$STAGE_PREV_NAME" >&2
  printf '[stage] ── %ds total, slowest stages first ──\n' "$total" >&2
  # 🔒 RANKED INTO A VARIABLE FIRST, NOT PIPED STRAIGHT INTO THE LOOP THAT PRINTS. The printing loop
  # writes to stderr, so a `2>/dev/null` put on the pipeline to swallow `head`'s SIGPIPE swallows the
  # summary itself — measured while writing this: the total line appeared with nothing under it. A
  # command substitution keeps the two concerns apart, and `|| ranked=` means a sort that fails costs
  # the list and never the exit code.
  local ranked
  ranked=$(printf '%b' "${STAGE_TIMES}$((now - STAGE_LAST))\t${STAGE_PREV_NAME}\n" | sort -rn | sed -n 1,8p) ||
    ranked=""
  while IFS="$(printf '\t')" read -r secs name; do
    [ -n "${name:-}" ] || continue
    printf '[stage]   %4ds  %s\n' "$secs" "$name" >&2
  done <<RANKED
$ranked
RANKED
  return "$rc"
}

SITE=""; LABEL=""; WEBROOT_KEY=""; DB_KEY=""; ROOT="$TRACY_PRIVATE_ROOT"; ALLOW_MAIL=""; LIVE_SITE=""; NO_PUBLISH=""; COPY_ADDRESS=""
# Which CMS wrote this webroot. It decides three things and nothing else: the image that
# supplies PHP, the database name, and how the site is told where it now lives. Everything
# around them — the lock, the port, the tunnel, the door — is the same work whatever wrote it.
PLATFORM="joomla"
QUICKSTART=""
# The design the customer picked, and the registry revision it was picked against. Empty for a
# platform that has no design registry, and for the import path, which restores a customer's own
# site rather than building one from a base.
DESIGN=""; DESIGN_REVISION=""
# The clone auto-login door (ADR: 0034-adjacent spec). Both empty means no auto-login is
# installed — the stack still builds and answers, it just falls back to the normal CMS login.
# No longer settable from this script's own flags (--access-* removed): identity now reaches
# the plugin from the fleet-bar Worker's x-tracy-email, and platform/wordpress.sh still reads
# these two as part of that door — see its platform_install_access.
ACCESS_AUD=""; ACCESS_TEAM_DOMAIN=""; SITE_KEY=""
# Who may frame this site (EmDash only, and DEMO-ONLY). Empty means nobody: a customer provision
# never passes --frame-ancestors, so the platform file writes nothing to .env, the template
# middleware emits no frame-ancestors CSP, and the site cannot be framed. Only the demo road
# (tracy-web's provisionDemo) sets it, which is what lets a demo show in the preview iframe.
FRAME_ANCESTORS=""
# The lowest Claude Cowork plugin this site may be given, named by the contract profile that seals it
# (`coworkContractVersion` in the profile's manifest, carried here by tracy-web because only the web
# process reads the profiles). Empty means "nobody said", which is only safe for a site that binds
# nothing.
#
# 🔒 IT EXISTS BECAUSE THE DEFAULT FLOOR IS TOO LOW TO BIND, AND THAT FAILS LATE. `cowork_latest`
# installs whatever `claude-cowork`'s `update.json` advertises as long as it is above the floor, and
# on 19/09 that was 0.12.0 — a build with 24 actions and no `content.contract`. Every Joomla contract
# profile needs 0.14.0 or newer. So a sealed card stood the site up, installed a Claude Cowork plugin that could
# not bind, and died at the last step with `Quickstart contract binding failed` — after two minutes
# of work, with the site itself healthy. Measured on `site-lp4yub` (job k8a22b9474dcf593a4b10).
#
# The release's own Claude Cowork plugin part would also answer this, and the code asks for it first. It is not
# an answer in practice: 0 of the 88 releases in the catalogue carry one.
COWORK_MIN_VERSION=""
while [ $# -gt 0 ]; do
  case "$1" in
    --site) SITE="$2"; shift 2 ;;
    --platform) PLATFORM="$2"; shift 2 ;;
    --quickstart) QUICKSTART="$2"; shift 2 ;;
    # emdash only: the site creator's Tracy email, seeded as an owner-admin (platform_post_up).
    --owner-email) export TRACY_OWNER_EMAIL="$2"; shift 2 ;;
    # emdash only: the site's own relay address (<label>@SITE_MAIL_DOMAIN), the mail sender when no
    # owner is named (a demo, a stock instance). A sender, never an account: --owner-email makes one.
    --mail-sender) export TRACY_MAIL_SENDER="$2"; shift 2 ;;
    # The image bound to the design system the customer picked, decided in the harness and passed
    # down — not guessed here. Without it EmDash falls back to "the newest tracy/emdash on this
    # host", which is whatever someone happened to build last and says nothing about which
    # template or which look the site was ordered with.
    --image) export TRACY_EMDASH_IMAGE="$2"; shift 2 ;;
    # Install the platform FRESH instead of restoring a captured site (ADR 0086: a fleet-born
    # site). The platform file reads $FRESH and redefines its hooks; emdash is implicitly always
    # fresh and ignores it.
    --fresh) export FRESH=1; shift 1 ;;
    --label) LABEL="$2"; shift 2 ;;
    --webroot-key) WEBROOT_KEY="$2"; shift 2 ;;
    --db-key) DB_KEY="$2"; shift 2 ;;
    --root) ROOT="$2"; shift 2 ;;
    --allow-mail) ALLOW_MAIL="--allow-mail"; shift ;;
    # Build the stack and stop there. The caller publishes, once it has put a login in front of
    # the site — see the note on stage 7.
    --no-publish) NO_PUBLISH=1; shift ;;
    # Override for verifying a stack over plain http before cloudflared is in front of it.
    --live-site) LIVE_SITE="$2"; shift 2 ;;
    # The name the seat book knows this site by, which is what the site folder tells the agent it
    # is standing in. Defaults to the fleet address below; a caller that has the seat book's own
    # key passes it, so AGENTS.md never names a host the team does not use.
    --site-key) SITE_KEY="$2"; shift 2 ;;
    # Where people open Tracy's copy of an imported site (tracy-web's `site.address`) — written into
    # AGENTS.md so the agent can name its staging site. Never used to reach the site from here.
    --copy-address) COPY_ADDRESS="$2"; shift 2 ;;
    # Which design inspiration the customer picked, and the revision of the design registry the
    # web process resolved it against. The effective design is worked out HERE, from this host's
    # own copy — see `design-plan.py` for why neither half is allowed to tell the other the answer.
    --design) DESIGN="$2"; shift 2 ;;
    --design-revision) DESIGN_REVISION="$2"; shift 2 ;;
    # DEMO-ONLY: who may frame this site. Threaded down to the EmDash site's .env by the platform
    # file, never defaulted here — a customer provision omits it and its site stays unframeable.
    --frame-ancestors) FRAME_ANCESTORS="$2"; shift 2 ;;
    # The floor above, from the contract profile sealing this card. Exported rather than passed
    # around because `cowork_latest` reads `COWORK_FLOOR` from the environment wherever it is called.
    --cowork-min-version) COWORK_MIN_VERSION="$2"; shift 2 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$SITE" ] && [ -n "$LABEL" ] || { echo "need --site and --label" >&2; exit 2; }
# A floor the caller named wins over the constant the platform files carry. Refused rather than
# silently ignored when it is not a version: a typo that reads as "no floor" is exactly the failure
# this flag exists to stop.
if [ -n "$COWORK_MIN_VERSION" ]; then
  case "$COWORK_MIN_VERSION" in
    [0-9]*.[0-9]*.[0-9]*) export COWORK_FLOOR="$COWORK_MIN_VERSION" ;;
    *) echo "--cowork-min-version is not a version: $COWORK_MIN_VERSION" >&2; exit 2 ;;
  esac
fi

if [ -n "$QUICKSTART" ]; then
  # The catalog says which CMS a quickstart restores; this shell does not list ids. A quickstart is
  # accepted when its platform is the one being provisioned and the caller asked for a fleet-born
  # site (--fresh) — the id list used to live here and had to be edited for every new archive.
  QUICKSTART_PLATFORM="$(python3 "$HERE/quickstart.py" --id "$QUICKSTART" --platform 2>/dev/null)" || QUICKSTART_PLATFORM=""
  [ -n "$QUICKSTART_PLATFORM" ] && [ "$QUICKSTART_PLATFORM" = "$PLATFORM" ] && [ "${FRESH:-0}" = 1 ] || { echo 'unsupported quickstart request' >&2; exit 2; }
fi

# 🔒 A QUICKSTART IS NOT ONE SHAPE, AND THE SECOND SHAPE RESTORES NOTHING THROUGH THIS PIPELINE.
# A PHP quickstart is a captured site: webroot tar + database dump, restored by the same steps an
# import uses, so the two keys below put it on that road. An EmDash quickstart is a packed template
# plus a state snapshot — there is no webroot to extract and no MariaDB to load, and the platform
# file fetches both parts itself (platform/emdash.sh, emdash/quickstart-restore.sh). Setting the
# keys for it would send the provision looking for an archive nobody published.
if [ -n "$QUICKSTART" ] && [ "$PLATFORM" != emdash ]; then
  # Use the same restore, domain, database and site-registration pipeline as captured sites.
  FRESH=0
  WEBROOT_KEY=quickstart:webroot
  DB_KEY=quickstart:database
fi

# 🔒 A TEMPLATE QUICKSTART IS INSTALLED AS IT IS — no design plan, no contract (since 15/09).
# The entry NAMES A TEMPLATE: it is a finished site the customer saw on Design inspiration and
# pressed, so there is no design to resolve and nothing to lock. `BUILD_WORKFLOW=template` tells the
# platform file to restore, pair Cowork and stop. `--design`, if the caller sent one, is the
# template's own id and is not read.
#
# ⚠ THE FIELD ASKED FOR CHANGED 16/09, THE SET OF ENTRIES DID NOT. This asked for `card.provider`
# until the `card` block left the catalogue that day — the Design inspiration card lives on the
# release now, so publishing it is one press rather than a commit plus an image build. What is left
# in the catalogue, for exactly the same entries, is `template.id`: a finished site names its
# template, a build base carries a `contract` instead.
#
# A caller may SAY `template` up front (tracy-host passes `workflow: template` through as this
# variable): a public demo is the release installed as it is, whether or not the entry names a
# template — and the design plan below would otherwise pick a base of its own and refuse the
# quickstart as "disagreeing" with it (measured 16/09 on the local stand).
BUILD_WORKFLOW="${BUILD_WORKFLOW:-}"
[ "$BUILD_WORKFLOW" = template ] || BUILD_WORKFLOW=""
if [ -n "$QUICKSTART" ] && { [ "$BUILD_WORKFLOW" = template ] || python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field template.id >/dev/null 2>&1; }; then
  BUILD_WORKFLOW=template
  export BUILD_WORKFLOW
  # A card a profile seals carries `contract` (tracy-web sets it): the platform file binds it after the
  # install, with the showcase phase, so "no content contract" is said only for a card with none.
  # Read here only for this line; the platform file reads it again and decides.
  TEMPLATE_SEAL="$(python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field contract 2>/dev/null)" || TEMPLATE_SEAL=''
  if [ -n "$TEMPLATE_SEAL" ]; then
    stage "template quickstart $QUICKSTART: installed as released, then sealed by $TEMPLATE_SEAL"
  else
    stage "template quickstart $QUICKSTART: installed as released, no content contract"
  fi
  unset TEMPLATE_SEAL
fi

if [ -n "$QUICKSTART" ] && [ "$PLATFORM" = joomla ] && [ "$BUILD_WORKFLOW" != template ]; then
  # ── Which design this quickstart is actually built with ──────────────────────────────────────
  # Resolved BEFORE anything is downloaded or written, because every later step depends on the
  # answer: the policy marker names the profile, the Claude Cowork plugin binds to it, and the template is
  # installed on top of the same base. An unresolvable design has to stop the provision here,
  # where nothing exists yet, rather than after a site is standing with nobody able to say what
  # design it carries.
  #
  # The design registry (design-templates.json) is Joomla's: it declares `platform: joomla`, and
  # every design in it is a Joomla template on a Joomla base. A WordPress quickstart carries its
  # design in the archive itself (Tracy Base IS the theme), so for it the contract comes straight
  # from the catalog entry, together with the floor the Cowork plugin must not be installed below.
  if [ "$PLATFORM" = joomla ]; then
  DESIGN_PLAN="$(mktemp)"
  # Captured first and split second: a `$( )` inside a heredoc swallows its own exit status, and a
  # design that failed to resolve would then read as four empty variables and carry on.
  DESIGN_LINE="$(python3 "$HERE/design-plan.py" --design "${DESIGN:-apple}" --revision "$DESIGN_REVISION" --base "$QUICKSTART" --out "$DESIGN_PLAN")" \
    || { echo 'could not resolve the design for this quickstart' >&2; exit 2; }
  read -r EFFECTIVE_DESIGN CONTRACT_ID TEMPLATE_ELEMENT TEMPLATE_SOURCE RESOLVED_BASE BUILD_WORKFLOW <<EOF
$DESIGN_LINE
EOF
  [ -n "$CONTRACT_ID" ] || { echo 'the design plan named no contract profile' >&2; exit 2; }
  [ "$RESOLVED_BASE" = "$QUICKSTART" ] || { echo 'quickstart disagrees with resolved design' >&2; exit 2; }
  export DESIGN_PLAN EFFECTIVE_DESIGN CONTRACT_ID TEMPLATE_ELEMENT TEMPLATE_SOURCE BUILD_WORKFLOW
  stage "design ${DESIGN:-apple} builds as $EFFECTIVE_DESIGN ($CONTRACT_ID, template $TEMPLATE_ELEMENT/$TEMPLATE_SOURCE)"
  else
  CONTRACT_ID="$(python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field contract)" \
    || { echo 'the quickstart names no content contract' >&2; exit 2; }
  COWORK_MIN_VERSION="$(python3 "$HERE/quickstart.py" --id "$QUICKSTART" --field coworkMinVersion)" \
    || { echo 'the quickstart names no minimum Claude Cowork plugin version' >&2; exit 2; }
  export CONTRACT_ID COWORK_MIN_VERSION
  stage "quickstart $QUICKSTART restores with contract $CONTRACT_ID (cowork >= $COWORK_MIN_VERSION)"
  fi
fi
SITE_DIR="$ROOT/$LABEL"
DB_USER="root"
# ⚠ `tracy.ai` HERE IS A DEFAULT, NOT A FACT — and it used to be written into one of these two
# lines as a literal. There is more than one deployment now (`tracy.site` is the dev one), and a
# caller that names neither `--live-site` nor `--site-key` gets a site built under a hostname it
# does not live on: WordPress writes `siteurl`/`home` from `SITE_URL`, and `ensure-site-folder.mjs`
# prints `SITE_KEY` into the AGENTS.md the site's own agent reads. Both are silent — the site comes
# up, reports ready, and every asset 503s from the wrong domain.
#
# The ordinary caller (tracy-web) passes both flags, because it is the only party that knows this
# deployment's domain. `FLEET_ZONE` is read HERE rather than in step 7 (where it used to be
# defined, several hundred lines after the first use of the value it is meant to control), and it
# falls through to `SITE_DOMAIN` — the name the whole deployment already uses for the same fact,
# and one `tracy-host` carries in its own environment because it reads the same env file the app
# does. So a host configured once is right here too, with `FLEET_ZONE` left as the explicit
# override for a person running this by hand.
FLEET_ZONE="${FLEET_ZONE:-${SITE_DOMAIN:-tracy.ai}}"
# No trailing slash, whatever the caller sent. tracy-web sends its addresses WITH one
# (`https://label.zone/`), while a quickstart's placeholder is packed without
# (`https://quickstart.invalid`) — so the WordPress search-replace turned
# `https://quickstart.invalid/careers/` into `https://label.zone//careers/`, doubling the slash in
# every in-content link.
SITE_URL="${LIVE_SITE:-https://$LABEL.$FLEET_ZONE}"
SITE_URL="${SITE_URL%/}"
SITE_KEY="${SITE_KEY:-$LABEL.$FLEET_ZONE}"

# The big transient files go the moment this script leaves, whichever way it leaves.
#
# webroot.tar and db.sql.gz are downloaded, unpacked, imported, and then never read again — but
# nothing removed them, so every provision left its whole archive behind. On a 24 GB host that is
# a slow leak with a sharp end: seven sites' leftovers reached 5.4 GB, `aws s3 cp` ran out of room
# mid-download, and a 1.4 GB site could no longer be built at all (juneflower.vn, 2026-08-14).
#
# An EXIT trap and not a line at the end, because the end is not always reached: a failed import
# or a refused port leaves through `exit 1`, which is exactly the run whose 1.4 GB most needs
# clearing. The running site keeps everything it serves — webroot/, the db VOLUME, apache/ — none
# of which live under work/.
#
# 🔒 AND IT CARRIES THE STAGE SUMMARY, BECAUSE BASH KEEPS EXACTLY ONE `EXIT` TRAP. A second
# `trap … EXIT` anywhere in this file does not add a handler, it REPLACES this one — so the timing
# summary registered near the top of the script would have silently disabled the 1.4 GB cleanup
# above, or been silently disabled by it, depending only on which line ran last. Neither failure
# says anything at runtime. One trap, both jobs, in the order they must happen: the archives go
# first because the summary's last line is the one somebody reads.
cleanup_work() {
  local rc=$?
  rm -f "$SITE_DIR/work/webroot.tar" "$SITE_DIR/work/db.sql.gz" 2>/dev/null || true
  stage_summary
  return "$rc"
}
trap cleanup_work EXIT

# What a platform may opt out of. The PHP platforms restore a captured site — an archive from
# R2 and a MariaDB beside it. A platform that installs a FRESH site (emdash) has neither: its
# image carries the whole application and its database is a file inside the site dir. Defaults
# set before sourcing so joomla.sh and wordpress.sh stay exactly as they are.
PLATFORM_NEEDS_WEBROOT=1
PLATFORM_NEEDS_DB=1
# 🔒 TWO DIFFERENT QUESTIONS, and folding them into one flag silently broke something.
#
#   PLATFORM_NEEDS_WEBROOT  "must an archive be downloaded and unpacked?"
#   PLATFORM_HAS_WEBROOT    "is there a webroot on disk worth recording?"
#
# A FLEET-BORN joomla site answers NO to the first (the installer builds it, there is no archive)
# and YES to the second (24 Joomla folders sit there). Before the split it shared one flag, so the
# baseline was never built, and `webroot-git --op changes` returned "webroot repo not built yet" —
# meaning the owner and developer could NOT edit the very site Cowork had just built for them.
# Measured 29/08, on the first new-born site of a new host.
#
# Left empty here: a platform that does not declare it follows the first question, so emdash (no
# real webroot) and every clone (has one) keep their old behaviour.
PLATFORM_HAS_WEBROOT=""

# Which image carries the agent's tools (web/IMAGE_TAGS), and the one place a compose file is
# written. Both are sourced BEFORE the platform file: a platform resolves its own image the moment
# it is sourced, and its platform_compose calls the renderer.
# shellcheck source=../lib/web-image.sh
. "$HERE/../lib/web-image.sh"
# shellcheck source=../lib/site-exec.sh
. "$HERE/../lib/site-exec.sh"
# shellcheck source=../lib/site-network.sh
. "$HERE/../lib/site-network.sh"
# shellcheck source=render-compose.sh
. "$HERE/render-compose.sh"
# shellcheck source=../lib/showcase-nav.sh
. "$HERE/../lib/showcase-nav.sh"

[ -f "$HERE/platform/$PLATFORM.sh" ] || { echo "unknown platform: $PLATFORM" >&2; exit 2; }
# 🔒 THIS IS THE ONE CALLER THAT BUILDS A MISSING WEB IMAGE. The platform file resolves its image
# the moment it is sourced, and a NEW site whose IMAGE_TAGS line is not built on this host gets that
# one line built now (lib/web-image.sh, the 🔒 at its top) instead of the bare upstream image, which
# has no browser for the visual check. Set as a plain variable, not exported, and dropped right
# after: go-live/restore/snapshot source the same platform files and must never wait on a build,
# and nothing this script starts later inherits it. The `mark` gives the build its own line in the
# timing log (a first provision on a host can spend ~5 minutes here) without a step on the Build
# screen.
mark "the site's web image (built here when its line is missing)"
TRACY_WEB_IMAGE_BUILD=1
# shellcheck source=/dev/null
. "$HERE/platform/$PLATFORM.sh"
unset TRACY_WEB_IMAGE_BUILD
PLATFORM_HAS_WEBROOT="${PLATFORM_HAS_WEBROOT:-$PLATFORM_NEEDS_WEBROOT}"

# The archive and the credentials to fetch it are only required by platforms that restore one.
if [ "$PLATFORM_NEEDS_WEBROOT" = 1 ]; then
  [ -n "$WEBROOT_KEY" ] || { echo "need --webroot-key for platform $PLATFORM" >&2; exit 2; }
  # A signed GET URL (tracy-host passes TRACY_ARCHIVE_WEBROOT_URL from tracy-web) needs no store
  # credentials at all; only the key-based path does.
  if [ -z "$QUICKSTART" ] && [ -z "${TRACY_ARCHIVE_WEBROOT_URL:-}" ]; then
    : "${TRACY_MIGRATE_S3_BUCKET:?}"; : "${TRACY_MIGRATE_S3_ENDPOINT:?}"
    : "${TRACY_MIGRATE_S3_ACCESS_KEY:?}"; : "${TRACY_MIGRATE_S3_SECRET_KEY:?}"
  fi
fi
# The root .htaccess: no archive reliably carries one, and without it Joomla's SEF URLs never reach
# index.php. Shared with deploy-site.sh, because a file that is in nobody's git has to be re-asserted
# by whichever step touches the webroot last. See lib/webroot-htaccess.sh for the measurements.
# shellcheck source=../lib/webroot-htaccess.sh
. "$HERE/../lib/webroot-htaccess.sh"
# shellcheck source=../lib/publish-excludes.sh
. "$HERE/../lib/publish-excludes.sh"
# shellcheck source=../lib/site-apache-conf.sh
. "$HERE/../lib/site-apache-conf.sh"
# shellcheck source=../lib/webroot-skipped-dirs.sh
. "$HERE/../lib/webroot-skipped-dirs.sh"

# Per site, never shared, never derived from the site name — and generated ONCE, then kept.
#
# MariaDB writes the root password into its data directory the first time it initialises and
# ignores MARIADB_ROOT_PASSWORD on every boot after that. Generating a fresh one per run
# therefore breaks every re-provision of a site that already has a volume: the readiness check
# is refused, the script aborts having already recreated the container, and configuration.php
# is left naming the previous password. The site answers 500 and the log says "Access denied"
# 88 times without ever mentioning that the password is simply younger than the database.
#
# Reused from the stack's own .env, which is written below and is the same place its port
# lives. Losing that file and keeping the volume is the one case this cannot repair; a
# re-provision then needs the volume dropped, which is safe because the database is imported
# from the dump anyway.
DB_PASSWORD=""
if [ "$PLATFORM_NEEDS_DB" = 1 ]; then
  if [ -f "$SITE_DIR/.env" ] && grep -q '^DB_PASSWORD=' "$SITE_DIR/.env"; then
    DB_PASSWORD="$(sed -n 's/^DB_PASSWORD=//p' "$SITE_DIR/.env" | sed -n 1p)"
    stage "reusing this stack's existing database password"
  else
    # A new password is only right for a new volume; say so now rather than after three minutes of
    # "Access denied" (`db-volume.sh` has the measured case).
    # shellcheck source=../lib/db-volume.sh
    . "$HERE/../lib/db-volume.sh"
    if ! conflict="$(tracy_db_volume_conflict "$LABEL" "$SITE_DIR")"; then
      echo "!! $conflict" >&2
      exit 1
    fi
    DB_PASSWORD="$(head -c 24 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | { head -c 24; cat >/dev/null; })"
  fi
fi

# ── 0. the port ─────────────────────────────────────────────────────────────────────────
# Allocated HERE, by the machine that owns the ports, not by whoever called this script. Two
# desks provisioning at once would otherwise both pick "the next free port" from their own
# stale idea of what is in use, and two sites on one port means one of them quietly serving
# the other's content. A caller may still pin a port (HOST_PORT) — re-provisioning an existing
# site must land on the port its tunnel ingress already names.
if [ -z "${HOST_PORT:-}" ] && [ -f "$SITE_DIR/.env" ]; then
  # This site has been provisioned before: keep the port it already answers on.
  HOST_PORT="$(sed -n 's/^HOST_PORT=//p' "$SITE_DIR/.env" | sed -n 1p)"
fi

# How a free port is found — and why four sources rather than the two this used to ask — lives in
# `lib/site-port.sh`, the one piece of provisioning a test can exercise without standing a site up.
. "$HERE/../lib/site-port.sh"

# Whether THIS run handed the port out. Only such a port may be moved if it turns out to be taken
# when the site starts (`tracy_compose_up_site`): a pinned or remembered one may already be named by
# a tunnel ingress rule.
PORT_PICKED_HERE=0
if [ -z "${HOST_PORT:-}" ]; then
  PORT_PICKED_HERE=1
  (
    flock 9
    HOST_PORT="$(tracy_pick_site_port "$ROOT")" || exit 1
    # The allocation is only real once it is written down, and it must be written INSIDE the
    # lock — otherwise a second provision starting a moment later sees the same free port.
    mkdir -p "$SITE_DIR"
    echo "HOST_PORT=$HOST_PORT" > "$SITE_DIR/.env"
    echo "$HOST_PORT" > "$SITE_DIR/.port"
  ) 9>"${TRACY_PORT_LOCK:-/var/lock/tracy-fleet-ports.lock}"
  HOST_PORT="$(cat "$SITE_DIR/.port")"
  rm -f "$SITE_DIR/.port"
fi

# Compose normally invents `<label>_default` and asks Docker for the next subnet from its
# predefined pools. On a long-lived host those pools eventually become fully subnetted, leaving
# a half-created site and making the retry look like a bad quickstart. Allocate a small, explicit
# bridge network first so compose never has to consult the exhausted pool.
ensure_site_network() {
  command -v docker >/dev/null 2>&1 || { echo "docker is required to provision a site network" >&2; return 1; }
  local name="${LABEL}_default" ids subnets candidate octet
  if docker network inspect "$name" >/dev/null 2>&1; then
    return 0
  fi
  (
    flock 9
    if docker network inspect "$name" >/dev/null 2>&1; then exit 0; fi
    ids="$(docker network ls -q)" || exit 1
    subnets=""
    if [ -n "$ids" ]; then
      # shellcheck disable=SC2086
      subnets="$(docker network inspect $ids --format '{{range .IPAM.Config}}{{println .Subnet}}{{end}}')" || exit 1
    fi
    for octet in $(seq 0 255); do
      candidate="${TRACY_SITE_SUBNET_PREFIX:-10.240}.${octet}.0/24"
      if ! grep -Fxq "$candidate" <<<"$subnets"; then
        if docker network create --driver bridge --subnet "$candidate" "$name" >/dev/null 2>&1; then
          printf '%s\n' "$candidate"
          exit 0
        fi
      fi
    done
    echo "no free explicit site subnet under ${TRACY_SITE_SUBNET_PREFIX:-10.240}.0.0/16" >&2
    exit 1
  ) 9>"${TRACY_PRIVATE_ROOT}/.network-allocator.lock"
}
export HOST_PORT

# One provision of one site at a time.
#
# Two runs against the same site interleave destructively and quietly: the second extracts the
# archive over a webroot the first has already rewritten, so a configuration.php that was
# correctly pointed at this stack goes back to naming the customer's old database host, and the
# site answers 500 with "Connection refused". Nothing in the output says a second run happened.
#
# It is not a theoretical race. It happened here (2026-08-10) the moment a caller that appeared
# to have died was still working, and a second run was started on top of it.
#
# Per site, not global: two different sites provisioning at once is fine and expected.
exec 8>"/var/lock/tracy-provision-$LABEL.lock"
if ! flock -n 8; then
  echo "another provision of $LABEL is already running" >&2
  exit 1
fi

# ── 0½. an imported copy's contract record goes before its files do ──────────────────────────────
# `imported`: restored from an archive of the customer's own server (no --fresh, no quickstart, a
# webroot key). Decided HERE, once, and read again at step 6e.
#
# 🔒 THE HOST'S RECORD (`<sites>/.import-contracts/<label>/manifest.json`) IS WHAT OPENS THE DERIVED
# `content.contract` DOOR on the open surface (`derivedContractOf`), and it describes the content this run
# is about to replace. It used to be removed at 6e, just before the capture — after the webroot had been
# unpacked over the old one and the database loaded, with an `exit 1` between every pair of steps. A run
# that died anywhere in between left the last import's record standing over files and a database that
# were no longer that import's. So it goes the moment this run owns the label (the lock above: a refused
# second run clears nothing), and only the collector — at the end of a run that succeeded — writes it again.
# Pinned by test/import-contract-provision.test.mjs, which runs this block.
SITE_ORIGIN=""
if [ "${FRESH:-0}" != 1 ] && [ -z "$QUICKSTART" ] && [ -n "$WEBROOT_KEY" ]; then SITE_ORIGIN=imported; fi
if [ "$SITE_ORIGIN" = imported ] && { [ "$PLATFORM" = joomla ] || [ "$PLATFORM" = wordpress ]; }; then
  rm -f "$TRACY_SITES_ROOT/.import-contracts/$LABEL/manifest.json"
fi

stage "$SITE  →  $SITE_DIR  (port $HOST_PORT)"
# `site/` among them because compose mounts it: Docker creates a missing bind-mount source
# itself, as an empty root-owned directory, and an agent dropped into that describes a site
# with nothing in it very fluently (measured on tchemdash1, 02/09). The contents are written
# at stage 6e, once the installer has had its say about what platform this actually is.
mkdir -p "$SITE_DIR"/{work,apache}
mkdir -p "$(tracy_site_dir "$LABEL")" "$(tracy_webroot_dir "$LABEL")"

# Reserve the compose bridge before downloading or extracting the quickstart. If Docker cannot
# allocate a subnet, the site stays empty and a retry remains safe and idempotent.
allocated_subnet="$(ensure_site_network)"
if [ -n "$allocated_subnet" ]; then
  export TRACY_SITE_SUBNET="$allocated_subnet"
  stage "site network ${LABEL}_default ($allocated_subnet)"
fi

# P0: the site's own access key and its own network, BEFORE the first render, so the compose file is
# born with the key mount and without the shared network (render-compose.sh). A key that exists is
# kept (a retried provision); TRACY_SITE_ISOLATION=0 keeps a new site on the shared network.
TRACY_PRIVATE_ROOT="$ROOT" bash "$HERE/../tools/issue-site-access-key.sh" "$LABEL" >&2
if [ "${TRACY_SITE_ISOLATION:-1}" = 1 ]; then
  : > "$SITE_DIR/network-isolated"
fi

fetch() { # key -> local path [-> signed GET URL]
  if [ -n "$QUICKSTART" ]; then
    python3 "$HERE/quickstart.py" --id "$QUICKSTART" --part "${1#quickstart:}" --out "$2"
    return
  fi
  # A signed URL from tracy-web wins: the tracy-host image ships curl, not the aws CLI, and holds
  # none of the store's keys. The URL is never echoed — it is a credential until it expires.
  if [ -n "${3:-}" ]; then
    curl -fsS --retry 5 --retry-delay 3 --retry-all-errors --connect-timeout 20 -o "$2" "$3" \
      || { echo "!! could not download $1 from the artifact store (signed URL refused or expired)" >&2; return 1; }
    return
  fi
  AWS_ACCESS_KEY_ID="$TRACY_MIGRATE_S3_ACCESS_KEY" \
  AWS_SECRET_ACCESS_KEY="$TRACY_MIGRATE_S3_SECRET_KEY" \
  aws s3 cp --endpoint-url "$TRACY_MIGRATE_S3_ENDPOINT" \
    "s3://$TRACY_MIGRATE_S3_BUCKET/$1" "$2" --only-show-errors
}

# ── 1. files ────────────────────────────────────────────────────────────────────────────
if [ "$PLATFORM_NEEDS_WEBROOT" = 1 ]; then
# `PLATFORM_CONFIG_FILE` is the file whose presence means "a site already lives here" — Joomla's
# configuration.php, WordPress's wp-config.php. The platform file names it; Joomla is the default.
if [ -n "$QUICKSTART" ] && [ -f "$(tracy_webroot_dir "$LABEL")/${PLATFORM_CONFIG_FILE:-configuration.php}" ]; then
  { [ -f "$SITE_DIR/.quickstart-extracted" ] && [ "$(cat "$SITE_DIR/.quickstart-extracted")" = "$QUICKSTART" ]; } ||
  { [ -f "$SITE_DIR/.quickstart-restoring" ] && [ "$(cat "$SITE_DIR/.quickstart-restoring")" = "$QUICKSTART" ]; } || {
    echo 'quickstart restore refuses a nonempty site not owned by this provision' >&2; exit 1;
  }
fi
if [ -z "$QUICKSTART" ] || [ ! -f "$SITE_DIR/.quickstart-extracted" ]; then
stage "fetching webroot"
fetch "$WEBROOT_KEY" "$SITE_DIR/work/webroot.tar" "${TRACY_ARCHIVE_WEBROOT_URL:-}"
if [ -n "$QUICKSTART" ]; then
  printf '%s\n' "$QUICKSTART" > "$SITE_DIR/.quickstart-restoring"
  # This run lays the site down, so it owes the site its showcase-navigation phase (lib/showcase-nav.sh).
  tracy_showcase_begin
fi
# 🔒 -m: FILES GET THE EXTRACTION TIME, NOT THE ARCHIVE'S. The Joomla quickstart tarballs are packed
# reproducibly, every file at mtime 0 — and PHP's OPcache (validate_timestamps=On) never caches a
# script whose timestamp is 0. Measured 27/09/2026 on a clone of a Business j6 site: 13,824 files at
# 0, 57 scripts cached, every request compiling Joomla again — boot 1.2–1.7 s, home page 0.8–1.2 s;
# the same files touched: boot 0.3–0.4 s, home page 0.43 s, a content-contract apply 3.8 s → 1.6–2.1 s.
tar -xmf "$SITE_DIR/work/webroot.tar" -C "$(tracy_webroot_dir "$LABEL")"
# The tar has done its job; R2 still holds it, so a re-provision refetches. Keeping it here
# costs a second copy of the whole webroot on a 24G disk — that is what filled the box once.
rm -f "$SITE_DIR/work/webroot.tar"
if [ -n "$QUICKSTART" ]; then
  printf '%s\n' "$QUICKSTART" > "$SITE_DIR/.quickstart-extracted"
  rm -f "$SITE_DIR/.quickstart-restoring"
fi
fi

# Joomla redirects to its installer while this exists, and the installer is gone, so the site
# answers 500 instead of serving. Same last step every real Joomla install ends with.
rm -rf "$(tracy_webroot_dir "$LABEL")/installation"
fi

# ── 1b. publish the code to the team repo (ADR 0050) ─────────────────────────────────────
# The fleet holds the running webroot; git is where a person edits it by PR (ADR 0031 §2), and
# where the desk pulls its clone. So the fleet pushes the code up. Only code: media (images/,
# media/), the secret-bearing configuration.php, and regenerable runtime (cache/tmp/logs, Akeeba
# output) stay out (ADR 0031 §5) — media travels via R2. The code lands under webroot/ in the
# repo, beside _Settings_/ the desk owns. A read-only key or a missing repo warns and moves on;
# a site that came up must not be reported failed because its code copy did not publish.
# Since ADR 0073, the webroot NO LONGER goes through the team repo.
#
# This used to clone the site's repo, rsync the webroot in and push — the ADR 0050 B path. Its cost
# was that every customer pulled hundreds of MB of code nobody read, and every change took four hops
# to reach where it runs. Now the webroot's source of truth is git RIGHT ON THIS MACHINE
# (`webroot-baseline.git`, see tools/webroot-git.sh): the agent edits in place, one commit per run,
# and the desk reads the diff through the job door. The team repo keeps exactly what people really
# edit together — AgentSetting/, SiteContent/, TracyProposal/, TracyWork/.
#
# Build the baseline as soon as provision finishes, because that is when it is cheapest: the machine
# has just written the whole webroot to disk, and the user is spared pressing a button they do not
# yet know they need.
build_webroot_baseline() {
  stage "building the webroot baseline (ADR 0073)"
  bash "$TRACY_FLEET_DIR/webroot/webroot-git.sh" --label "$LABEL" --op ensure \
    || echo "!! baseline not built — the Changes panel will offer to build it later" >&2
}
# Called ONCE, at step 6d — for every platform with a webroot, a site unpacked from an archive too.
# Why there and not here: see 6d.

# ── 2. keep it out of the index ─────────────────────────────────────────────────────────
# A provisioned site is a full copy of the customer's own site, right down to their real
# user table, standing at a guessable address. Access controls who may open it (ADR 0031 §5);
# this is the other half — what a crawler that never authenticates is told about it.
#
# The header rather than a robots.txt: the archive carries the customer's own robots.txt, and
# rewriting it would edit the Local copy to change what the copy says about itself. The header
# is added beside the site instead, and it is also the stronger signal — robots.txt asks a
# crawler not to fetch, `noindex` tells it not to list what it already fetched.
#
# `mod_headers` is not among the modules the joomla image enables, so it is loaded the same
# way: mounted in, never by rewriting the image or wrapping its entrypoint.
#
# Apache-shaped, so it travels with the Apache compose below: a Node platform mounts neither.
if [ "$PLATFORM_NEEDS_WEBROOT" = 1 ]; then
cat > "$SITE_DIR/apache/headers.load" <<'LOAD'
LoadModule headers_module /usr/lib/apache2/modules/mod_headers.so
LOAD
tracy_write_apache_conf "$SITE_DIR" on
# A demo install (tracy-host sets TRACY_DEMO_SITE=1 for `demo: true`) runs lean; any other install
# drops the marker a demo may have left on this label (render-compose.sh, "a demo site is lean").
tracy_write_demo_limits "$SITE_DIR" "$([ "${TRACY_DEMO_SITE:-}" = 1 ] && echo on || echo off)"
fi

# ── 3. compose stack ────────────────────────────────────────────────────────────────────
# The default stack is the PHP pair this script always wrote: Apache serving the restored
# webroot, MariaDB beside it. A platform that runs differently (emdash: one Node container,
# SQLite inside the site dir) overrides platform_compose in its platform file. Runs AFTER the
# .env write below so an override may append its own secrets to a file that already exists.
#
# The file itself is written by provision/render-compose.sh — one shape, one place, for the four
# ways a site can be stood up. Read the header there for why it moved out of here: the site-folder
# mounts every web container now carries (Plan 3) had to be added to every shape, and four copies
# of a shape is four chances to add it to three of them.
platform_compose_default() {
  COMPOSE_FLAVOR=clone tracy_render_compose
}

# The port arrives as an environment variable, which means it belongs to the shell that ran
# this script and to nothing else: a later `docker compose up` in this directory would fall
# back to a default and move the site off the port its tunnel ingress names — or fail outright
# against whichever site already holds that default. compose reads `.env` beside the compose
# file on its own, so writing it there makes the port a property of the stack.
#
# `:?` and not a default: by here the allocator above has either set HOST_PORT or exited, so an
# unset value means something upstream broke. Writing a default would write the WRONG port into
# the file the stack is read from ever after — a guess that outlives the run that made it.
#
# TRACY_MAIL_TOKEN is what the web container's mail shim presents to tracy-web (lib/site-mail-token.sh
# says how it is derived). Recomputed on every provision rather than carried: it is a function of the
# label and this host's HOST_SECRET, so a site provisioned again after the secret rotated gets the
# token tracy-web now expects. No secret, no token — and no failed provision HERE: mail is off
# until go-live anyway, and enable-site-mail.sh writes it later. (An EmDash provision does stop
# further down, in platform_post_up: its mail settings are written at provision, and a site with no
# token would be marked ready with a form that mails nobody — platform/emdash.sh, #803.)
# shellcheck source=../lib/site-mail-token.sh
. "$HERE/../lib/site-mail-token.sh"
SITE_MAIL_TOKEN="$(tracy_site_mail_token "$LABEL")" || {
  echo "!! no site-mail token for $LABEL — it cannot send mail after go-live until provision/enable-site-mail.sh --label $LABEL runs" >&2
  SITE_MAIL_TOKEN=""
}
{
  echo "HOST_PORT=${HOST_PORT:?provision.sh: HOST_PORT unset at the point it is written to .env — the allocator did not run}"
  # Which CMS this stack is, written down rather than re-derived. render-compose.sh reads it when
  # a migration re-renders the compose of a site nobody is provisioning — and a guess there writes
  # the other platform's shape over a running site.
  echo "PLATFORM=$PLATFORM"
  if [ -n "$DB_PASSWORD" ]; then echo "DB_PASSWORD=$DB_PASSWORD"; fi
  if [ -n "$SITE_MAIL_TOKEN" ]; then echo "TRACY_MAIL_TOKEN=$SITE_MAIL_TOKEN"; fi
} > "$SITE_DIR/.env"
# It holds a password now (or will, once the platform appends its own secrets).
chmod 600 "$SITE_DIR/.env"

if declare -F platform_compose >/dev/null 2>&1; then
  platform_compose
else
  platform_compose_default
fi

if [ "$PLATFORM_NEEDS_DB" = 1 ]; then
stage "starting database"
( cd "$SITE_DIR" && docker compose up -d db )

# Wait for the server that STAYS UP, not for one that answers. MariaDB's first-boot initialisation
# runs a TEMPORARY server that listens on the socket only and then restarts: `ping` answers during
# that window, and so does a query against the target database once the temporary server has
# created it — the wait this replaced passed there once in ~40 WordPress creations (05/10/2026), and
# the import below died with "Can't connect to local server through socket". `lib/db-ready.sh` reads
# `@@skip_networking`, which only the temporary server has on. Against the target database, so the
# import cannot meet "Unknown database" either.
# shellcheck source=../lib/db-ready.sh
. "$HERE/../lib/db-ready.sh"
tracy_db_wait_ready "$SITE_DIR" "$DB_PASSWORD" "$DB_NAME" || exit 1

# ── 4. database ─────────────────────────────────────────────────────────────────────────
if [ -n "$DB_KEY" ] && { [ -z "$QUICKSTART" ] || [ ! -f "$SITE_DIR/.quickstart-imported" ]; }; then
  stage "importing database"
  fetch "$DB_KEY" "$SITE_DIR/work/db.sql.gz" "${TRACY_ARCHIVE_DB_URL:-}"
  gunzip -c "$SITE_DIR/work/db.sql.gz" \
    | ( cd "$SITE_DIR" && docker compose exec -T db mariadb -uroot -p"$DB_PASSWORD" \
        --max-allowed-packet=256M --init-command="SET FOREIGN_KEY_CHECKS=0" "$DB_NAME" )
  if [ -n "$QUICKSTART" ]; then printf '%s\n' "$QUICKSTART" > "$SITE_DIR/.quickstart-imported"; fi
  # Read by a platform's post-up hook: a database loaded on THIS pass is a new site's, whatever an
  # earlier pass remembered about the one it replaced (platform/joomla.sh, the import road).
  DB_IMPORTED=1
fi
fi # PLATFORM_NEEDS_DB

# ── 4b. the copy's own Claude Cowork token (an import) ──────────────────────────────────────
# 🔒 THE COPY MUST NOT HOLD THE LIVE SITE'S TOKEN. The token lives in the database, so a copy of the
# database is a copy of the key to the customer's LIVE site — and the agent on the copy can read its
# own database. tracy-web mints a token for the copy and sends it here (TRACY_COPY_COWORK_TOKEN);
# it goes in before the web container ever starts, so nothing on the copy ever sees the live one.
# tracy-web keeps the live token apart, for "Sync from live" alone (plan ke-hoach-dong-bo-tu-live §5).
if [ "${DB_IMPORTED:-0}" = 1 ] && [ -n "${TRACY_COPY_COWORK_TOKEN:-}" ]; then
  case "$PLATFORM" in
    joomla)
      COPY_PREFIX="$(grep -oE "dbprefix['\"]? *= *['\"][a-zA-Z0-9_]+" "$(tracy_webroot_dir "$LABEL")/configuration.php" \
                     | grep -oE "[a-zA-Z0-9_]+$" | sed -n 1p)"
      COPY_TOKEN_SQL="UPDATE \`${COPY_PREFIX}extensions\` SET params = JSON_SET(IF(JSON_VALID(params), params, '{}'), '\$.token', '$TRACY_COPY_COWORK_TOKEN') WHERE element='com_claudecowork'; SELECT ROW_COUNT();" ;;
    wordpress)
      COPY_PREFIX="$(tracy_wp_table_prefix "$(tracy_webroot_dir "$LABEL")/wp-config.php")"
      COPY_TOKEN_SQL="UPDATE \`${COPY_PREFIX}options\` SET option_value='$TRACY_COPY_COWORK_TOKEN' WHERE option_name='claude_cowork_token'; SELECT ROW_COUNT();" ;;
    *) COPY_PREFIX="" COPY_TOKEN_SQL="" ;;
  esac
  if [[ "$COPY_PREFIX" =~ ^[A-Za-z0-9_]+$ && "$TRACY_COPY_COWORK_TOKEN" =~ ^[A-Za-z0-9_.-]{20,512}$ ]]; then
    COPY_TOKEN_ROWS="$( ( cd "$SITE_DIR" && docker compose exec -T db mariadb -uroot -p"$DB_PASSWORD" -N -B "$DB_NAME" -e "$COPY_TOKEN_SQL" ) 2>/dev/null | tail -1 )" || COPY_TOKEN_ROWS=""
    if [ "${COPY_TOKEN_ROWS:-0}" -ge 1 ] 2>/dev/null; then
      echo "==> the copy holds a Claude Cowork token of its own (the live site's stays with tracy-web)"
    else
      echo "!! the copy's Claude Cowork token could not be set: it still holds the live site's" >&2
    fi
  else
    echo "!! the copy's Claude Cowork token was not set (no table prefix read)" >&2
  fi
fi

# Everything above this line belonged to the database; everything below it is configuration.
mark "configuring the site for its new address"

# ── 5. tell the site where it now lives ─────────────────────────────────────────────────
# The one stage that differs by CMS, and the reason platform/ exists. Joomla keeps its address
# and its database credentials in one file; WordPress keeps the credentials in a file and the
# address in the database, in several places, some of them serialized.
platform_configure

# ── 5b. the file Apache needs and the archive did not bring ─────────────────────────────
# After platform_configure, because it reads $sef_rewrite out of the configuration.php that step
# has just settled; before the web container starts, so the site is never once served without it.
# Deliberately after publish_webroot too: this file is generated on every host that runs the site,
# so it belongs in nobody's repository, least of all the customer's, which gitignores it on purpose.
[ "$PLATFORM_NEEDS_WEBROOT" = 1 ] && tracy_ensure_webroot_htaccess "$(tracy_webroot_dir "$LABEL")"

# ── 6. permissions and start ────────────────────────────────────────────────────────────
# The single most expensive line in a cold provision, and for most of this script's life it was
# charged to whatever stage happened to be open — `importing database` on WordPress and Joomla,
# `site network` on EmDash. It pulls every image the site's compose file names.
mark "pulling and starting the site containers"
# One more try on a new port when the one picked above was taken while the site was being built
# (TracyHQ/tch#361) — `lib/site-port.sh` says why only then. Before the front-page check, the
# ingress rule and TRACY_RESULT, so all three read the port the site really started on.
tracy_compose_up_site "$SITE_DIR" "$ROOT" "$PORT_PICKED_HERE"
# 🔒 A BOUNDARY THE MOMENT THE SITE IS UP, not only for the timing log. tracy-host leads a failed
# job's output with the failing step's lines (`failedProvisionOutput`, apps/tracy-host), and a step
# is what lies after the last `[stage]` line. Without this one, a bind error the retry above already
# fixed shares a step with whatever fails next — `platform_post_up`'s `quickstart configuration is
# missing`, say — and the customer is shown a port conflict that no longer exists.
mark "site started, finishing it on its running stack"
# An isolated site is reachable only once tracy-web is on its network (lib/site-network.sh).
if [ -f "$SITE_DIR/network-isolated" ]; then
  tracy_join_site_network "$LABEL" || { echo "!! tracy-web could not join ${LABEL}_default — the site would answer 'unknown site'" >&2; exit 1; }
fi
printf '{"v":1,"kid":"%s","isolated":%s,"at":"%s"}\n' \
  "$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["kid"])' "$ROOT/.site-access/$LABEL/key.json")" \
  "$([ -f "$SITE_DIR/network-isolated" ] && echo true || echo false)" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$ROOT/.site-access/$LABEL/ready.json"

# Safety net #1 (ADR 0031 §5, network layer): this copy must not send mail out. A customer template
# carrying injected code must not turn the server into a mail sender, and a site being migrated must
# not fire "welcome" mail at a real customer list.
#
# 🔒 Attached HERE rather than blocking the whole host in bootstrap: a fleet host may run things that
# are not the fleet's, and a global rule is this script reaching outside its scope. Each site enrols
# itself in the net as soon as its network is created, so nobody has to remember later.
# Not fatal: a site already standing is not unwound over one iptables line — but it must SHOUT.
# Read the subnet from docker, do NOT guess: compose names the network after the project
# (`<label>_default`), but it allocates the IP range itself and that changes between rebuilds.
SITE_NET="$(docker network inspect "${LABEL}_default" \
  --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}' 2>/dev/null || true)"
#
# 🔒 NOT "best-effort". Net #1 now hangs ENTIRELY on this line: since `edge/` was dropped, no
# network is attached in advance at bootstrap, so a site that could not be attached is a site with
# NO net. The draft wrote it as `|| echo "!!"`, i.e. a full copy of a customer site could come up
# and send mail to the internet, leaving exactly one line on stderr that nobody reads. Better to stop
# and let on-call handle a half-built site than to hand over a site with no net that looks exactly
# like one that has it.
if [ -z "$SITE_NET" ]; then
  echo "!! could not read the subnet of ${LABEL}_default — net #1 is not in place for this site" >&2
  exit 1
fi
# 🔒 TURNING THE NET OFF MUST BE DECLARED, NEVER INFERRED FROM ABSENCE. On a laptop (Docker
# Desktop) there is no iptables to put the net up, so this step always fails and a local `add site`
# never finishes — measured 10/09: the site's two containers were already up before dying at exactly
# the line below. But "no chain, so skip it" is precisely the fail-open the block above refuses: a
# site without the net looks exactly like a site with it. So someone has to TYPE this switch —
# `TRACY_EGRESS_FENCE=off` in `deploy/.env` — and the error message names it outright.
if [ "${TRACY_EGRESS_FENCE:-on}" = "off" ]; then
  echo "== egress net OFF by TRACY_EGRESS_FENCE=off — for a dev machine only, NEVER on the fleet" >&2
else
  # ⚠ "NO CHAIN" AND "NOT ALLOWED TO LOOK" ARE TWO DIFFERENT THINGS, and the previous version
  # folded them into one. Measured 11/09: this script now runs INSIDE the `tracy-host` container
  # (it used to be `tracy-hooks.py` running straight on the host under systemd, i.e. real root). The
  # container has `network_mode: host` and the iptables binary, but NOT the NET_ADMIN capability —
  # so `iptables -L` dies on permissions, and `2>/dev/null` turned that into "no chain". The error
  # then told people to run `bootstrap.sh` on a machine where the chain ALREADY EXISTED: a
  # grammatically correct instruction for the wrong task.
  #
  # So keep stderr and read it. Both branches still `exit 1` — neither is fail-open.
  FENCE_ERR="$(iptables -L TRACY-FLEET-EGRESS -n 2>&1 >/dev/null)" || {
    case "$FENCE_ERR" in
      *[Pp]ermission*|*"not permitted"*|*"Operation not permitted"*)
        echo "!! not allowed to read the host's netfilter — a missing capability, NOT a missing chain" >&2
        echo "!! add cap_add: [NET_ADMIN, NET_RAW] to the tracy-host service (deploy/compose.yml) and rebuild" >&2
        ;;
      *)
        echo "!! chain TRACY-FLEET-EGRESS does not exist on the host — run bootstrap.sh first" >&2
        echo "!! (on a dev machine without iptables: set TRACY_EGRESS_FENCE=off in deploy/.env)" >&2
        echo "!! iptables says: $FENCE_ERR" >&2
        ;;
    esac
    exit 1
  }
fi
if [ "${TRACY_EGRESS_FENCE:-on}" != "off" ]; then
  iptables -C DOCKER-USER -s "$SITE_NET" -j TRACY-FLEET-EGRESS 2>/dev/null ||
    iptables -I DOCKER-USER -s "$SITE_NET" -j TRACY-FLEET-EGRESS
  netfilter-persistent save >/dev/null 2>&1 || true
fi
# Ownership matters on the real host: every CMS writes cache, logs and uploads as the web user.
# It cannot be set through a Docker Desktop bind mount on macOS, which is only ever a test
# rig — so warn there rather than abort, and let a genuine failure on Linux be visible.
own_webroot() {
  [ "$PLATFORM_NEEDS_WEBROOT" = 1 ] || return 0
  # WHICH directories is the platform's business (platform/$PLATFORM.sh): Joomla writes under
  # administrator/, WordPress under wp-content/. Unquoted on purpose — the hook prints a
  # space-separated list and `mkdir -p` wants them as separate words.
  # The directories the live side's walker skipped but an extension needs to exist (Akeeba's
  # output folder, #1650) — made here so the chown below gives them to the web user.
  tracy_webroot_restore_skipped_dirs "$(tracy_webroot_dir "$LABEL")" >/dev/null
  RUNTIME_DIRS="$(platform_runtime_dirs)"
  ( cd "$SITE_DIR" && docker compose exec -T web sh -c \
      "cd /var/www/html && mkdir -p $RUNTIME_DIRS && chown -R www-data:www-data /var/www/html" ) \
    || echo "!! could not set ownership — expected on a macOS bind mount, a real problem on Linux" >&2
}
own_webroot

# ── 6b. the clone's own door ──────────────────────────────────────────────────────────────
# The auto-login plugin that turns a seat into a login inside the clone. Runs whenever the platform
# provides it (Joomla and WordPress do; EmDash does not, so it is naturally skipped) — no longer
# gated on an Access aud, because identity now reaches the plugin from the fleet-bar Worker's
# `x-tracy-email` rather than a Cloudflare Access JWT (ADR clone-auth). A clone with no aud installs
# the plugin all the same; its Access-JWT fallback simply stays dormant. Clone-only: provision is
# never run against a customer's own site.
if declare -F platform_install_access >/dev/null 2>&1; then
  platform_install_access
fi

# ── 6c. platform post-up hook ─────────────────────────────────────────────────────────────
# Unconditional, unlike 6b: work a platform must do against its RUNNING stack regardless of any
# Access wiring (emdash finishes its first-run setup here, so the public pages serve guests).
if declare -F platform_post_up >/dev/null 2>&1; then
  platform_post_up
fi

# ── 6c½. the signed access verifier, on every new site ─────────────────────────────────────
# After 6c: the Claude Cowork package that hook installs on Joomla still carries the old
# plg_system_tracyaccess, which trusts bare x-tracy-* headers. Replaced here and marked born strict,
# so the site never waits for a rollout.list line; fails the provision if the verifier is not in place.
mark "installing the signed access verifier"
TRACY_PRIVATE_ROOT="$ROOT" bash "$HERE/strict-site-access.sh" "$LABEL" "$PLATFORM"
# 🔒 AND THE WEBROOT IS THE WEB USER'S AGAIN AFTER IT (16/10/2026). 6b and 6c run PHP in the site's
# container as root — Joomla's contract install boots the site and its installer
# (`joomla-contract-install.php`), the template activation another (`joomla-template-activate.php`) —
# and each leaves root-owned folders such as administrator/cache/<group>. The web user then cannot
# rebuild a cache group the Cowork plugin's purge removed, and the first page view after the build
# answers "Folder::create: Could not create directory … administrator/cache/t4core" (the plugin's own
# note: `ClaudeCoworkUpdate.php`, "administrator/cache, which the web user cannot write").
own_webroot

# ── 6d. the webroot baseline — the site as built ─────────────────────────────────────────
# The commit v1 "Initial backup" is tagged on (6d¼), so it must hold the webroot as provision HANDS
# IT OVER: after every step above that writes into it — the site's configuration for this
# environment (5), the root .htaccess (5b), the sign-in plugin (6b), the Cowork plugin and the
# content contract (6c) — and never before.
#
# Two ways to get this wrong, both measured:
#   - a site that INSTALLS ITSELF (WordPress or Joomla born on the fleet) has an EMPTY webroot until
#     `platform_post_up` has run: a baseline taken earlier is an empty tree, and a "restore to the
#     baseline" wipes the site (qatest1, 10/09: `chore: webroot baseline` 0 files → outside 3785
#     files → `restore: back to <baseline>` 0 files);
#   - a site UNPACKED FROM AN ARCHIVE (a quickstart, an import) used to take it at step 1, right after
#     the unpack: everything provision wrote after that read as "Files changed; source unknown" on a
#     brand-new site (dev e2e 04/10/2026, E1.2: 79 files on WordPress — the Cowork plugin,
#     `mu-plugins/tracy-access.php`, `.htaccess`, `wp-config.php`; 50 + 109 on Joomla), and v1 held
#     the archive's files beside a database dumped after provision had changed it.
# So one place, here, for both. `--op ensure` is idempotent: a re-provision of a site that already
# has its history keeps it.
if [ "$PLATFORM_HAS_WEBROOT" = 1 ]; then
  build_webroot_baseline
fi

# ── 6d¼. the Initial backup (ADR 0024 sub-decision 5) ───────────────────────────────────────
# The site as built, database included, pinned to v1: "Restore everything to Initial backup" is the
# factory reset. Now, because this is the one moment the database is the one that was handed over
# (and the cheapest: measured 0.08 s, 1.6 MB gzip on a fresh WordPress). Never fatal: without it the
# first point reads "File backup (no database)", which is true. EmDash gets its webroot repo here
# too (its road never built one), so its v1 exists to carry the trailer.
mark "taking the Initial backup (ADR 0024)"
bash "$TRACY_FLEET_DIR/webroot/webroot-backup.sh" --label "$LABEL" --op initial-backup 1>&2 \
  || echo "!! no Initial backup — the first point stays a file backup" >&2

# ── 6d½. a quickstart that installs to a 5xx is a failed install ───────────────────────────
# The last guard, so it stays before 6e (below: no refusal after the folder is built). Only for a
# Joomla/WordPress quickstart — a site imported from a customer's server may be broken at the source,
# and whether that stops its copy is a different decision (`front-page.sh` has the measured case).
if [ -n "$QUICKSTART" ] && { [ "$PLATFORM" = joomla ] || [ "$PLATFORM" = wordpress ]; }; then
  # shellcheck source=../lib/front-page.sh
  . "$HERE/../lib/front-page.sh"
  if ! refusal="$(tracy_front_page_refusal "$LABEL" "$HOST_PORT")"; then
    echo "!! quickstart $QUICKSTART: $refusal" >&2
    exit 1
  fi
fi

# ── 6e. the site folder, and the door the host's dsh comes in through ────────────────────
# The folder the agent works in: AGENTS.md, AgentSetting/, TracyWork/ — write-if-missing, so a
# re-provision never takes a file back off a team that has touched it (ensure-site-folder.mjs).
#
# HERE, and not beside the mkdir at the top, for two reasons that point the same way. The platform
# is MEASURED from the webroot, and a fleet-born site has no webroot until platform_post_up has
# run — building the folder earlier writes an AGENTS.md that tells that site's agent, at the start
# of every session, that it is working on the wrong CMS. And every guard that can refuse this
# provision (the port, the lock, the database, the egress net) has already had its say: a refusal
# after this line would leave a skeleton behind for a site that never came up.
stage "building the site folder"
command -v node >/dev/null 2>&1 || {
  echo "!! no node on this host — the site folder cannot be built (install node, or run" >&2
  echo "   provision/ensure-site-folder.mjs elsewhere and rsync it into $(tracy_site_dir "$LABEL"))" >&2
  exit 1
}
# The site folder now lives directly under TRACY_SITES_ROOT — the same tree dsh mounts whole at
# /site — so there is no per-site bind to make it reachable any more (attach-site.sh is gone from
# this path). mkdir -p is the one thing that call used to do that still needs doing here: the
# folder was already created at the top of this script, but re-asserting it costs nothing and
# means this step never depends on that earlier one having run.
mkdir -p "$(tracy_site_dir "$LABEL")"
# `imported` (decided at step 0½): restored from an archive of the customer's own server — that server
# keeps serving the real site, and AGENTS.md must say `.webroot/` is Tracy's copy of it. Told "live"
# instead, an agent went to change production (14/09, fijitrips).
# `$SITE_URL` is the address a browser reaches this site at — scheme and port included. It is the
# same value WordPress writes into `siteurl`/`home` a few lines up, and until 19/09/2026 it stopped
# there: the site FOLDER got the hostname alone, so the agent reading it had to invent an address
# and invented `https://<host>/`. On any surface that is not plain https on 443 that is a dead port.
node "$HERE/ensure-site-folder.mjs" "$(tracy_site_dir "$LABEL")" "$SITE_KEY" "$PLATFORM" "$(tracy_webroot_dir "$LABEL")" "$SITE_ORIGIN" "$COPY_ADDRESS" "$SITE_URL" \
  || { echo "!! site folder not built at $(tracy_site_dir "$LABEL")" >&2; exit 1; }

# The handful of ids the agent otherwise spends its first calls hunting: which template style holds
# the brand, which module draws the breadcrumb, which languages exist, which theme kind this is.
# Measured over four real sessions: 53 of 213 tool calls were reads that only located a record.
#
# AFTER the site is up and the folder exists, because the probe runs INSIDE the site's own web
# container — it is the only place the database credentials are. Non-fatal by construction: a site
# that cannot be reached writes an empty fact set, `siteContext` renders no address line, and the
# agent works exactly as it did before. A provision must never fail for want of a shortcut.
node "$HERE/collect-site-facts.mjs" "$TRACY_SITES_ROOT" "$LABEL" "$PLATFORM" \
  || echo "!! could not measure this site's addresses — the agent keeps the platform prose" >&2

# Imported copies have no shipped quickstart documents. Project their own Claude Cowork plugin's bound map
# into a revisioned lookup bundle; this does not change shared tools or write site content.
if [ "$SITE_ORIGIN" = imported ] && { [ "$PLATFORM" = joomla ] || [ "$PLATFORM" = wordpress ]; }; then
  # The host's record was cleared at step 0½, so a re-provision that cannot capture again leaves none. The
  # collector writes it last, only once the documents and the AGENTS.md paragraph exist; when it fails it also
  # takes its paragraph out, so the agent is never told to use a door the surface does not list.
  node "$HERE/collect-import-contract.mjs" "$TRACY_SITES_ROOT" "$LABEL" "$PLATFORM" \
    || echo '!! import contract documents not ready — the agent must inspect the live Claude Cowork plugin' >&2
fi

# The agent reaches this folder as www-data (`docker exec -u www-data`), so www-data has to be able
# to write in it — TracyWork/ and AgentSetting/ are the agent's own notes. Same non-fatal shape as
# the webroot chown above, and for the same reason: on a macOS bind mount it cannot be set at all.
chown -R www-data:www-data "$(tracy_site_dir "$LABEL")" 2>/dev/null \
  || echo "!! could not set ownership of the site folder — expected on a macOS bind mount, a real problem on Linux" >&2

# ── 7. reachable from the internet ──────────────────────────────────────────────────────
# Two steps, both idempotent, both safe to re-run: a DNS record pointing the site's hostname
# at this host's tunnel, and an ingress rule telling the tunnel which loopback port that
# hostname belongs to. Without the second, the record resolves and the site answers 404 —
# which looks like a broken site rather than a missing line in a config file.
#
# Skipped entirely when cloudflared is not set up, so a bare host can still be used to test
# the stack over plain http (`--live-site http://127.0.0.1:PORT`).
CF_CONFIG="${CF_CONFIG:-/etc/cloudflared/config.yml}"
TUNNEL="${TRACY_TUNNEL_NAME:-tracy-fleet-1}"

# Publishing here is the fallback for a host driven by hand. The ordinary caller passes
# --no-publish and does it itself, because it is the only party that can answer the question
# that decides whether an address should exist at all: is there a login in front of this site?
# A provisioned site is a full copy of the customer's own, user table included, so an address
# handed out before that door exists opens a window that lasts until somebody notices.
if [ -n "${NO_PUBLISH:-}" ]; then
  stage "not publishing $LABEL.$FLEET_ZONE — the caller does that once a login is in front of it"
elif command -v cloudflared >/dev/null && [ -f "$CF_CONFIG" ] && [ -f /root/.cloudflared/cert.pem ]; then
  HOSTNAME_FQDN="$LABEL.$FLEET_ZONE"
  stage "publishing $HOSTNAME_FQDN"

  # The ingress list is ONE mutable file shared by every site on this host. Two provisions
  # running at once would each read it, each add a rule, and the second write would drop the
  # first — leaving a site that is running and unreachable. The lock is what makes this safe
  # to run concurrently; the file being shared is why the API-managed alternative is on the
  # list (see tracy-docs).
  # Two ways in, decided by how this tunnel is configured rather than by preference.
  #
  # Through the API there is no file for two provisions to race over and no restart, so every
  # other site on this host keeps its connections while a new one is published. Editing the file
  # needs both: a lock, because the list is shared, and a restart, because that is the only way
  # the running connector sees a change.
  if [ -n "${TRACY_CF_API_TOKEN:-}" ] && [ -n "${TRACY_TUNNEL_ID:-}" ]; then
    # `--replace`: this hostname is made from the site's own label, so a rule already under it is
    # this site's from an earlier provision (on another port, perhaps) — never another site's.
    python3 "$HERE/ingress_api.py" --hostname "$HOSTNAME_FQDN" --replace --port "${HOST_PORT:?provision.sh: HOST_PORT unset while writing a tunnel ingress rule}"
  else
    (
      flock 9
      python3 "$HERE/ingress.py" --config "$CF_CONFIG" --hostname "$HOSTNAME_FQDN" --port "${HOST_PORT:?provision.sh: HOST_PORT unset while writing a tunnel ingress rule}"
      cloudflared tunnel --config "$CF_CONFIG" ingress validate
    ) 9>/var/lock/tracy-cloudflared-ingress.lock

    systemctl restart cloudflared
  fi

  # `route dns` is idempotent for a record already pointing at this tunnel, and errors when one
  # points somewhere else — which is a real conflict a person should see, not something to
  # overwrite: another host may be serving that name right now.
  TUNNEL_ORIGIN_CERT=/root/.cloudflared/cert.pem \
    cloudflared tunnel route dns "$TUNNEL" "$HOSTNAME_FQDN" || \
    echo "!! DNS record for $HOSTNAME_FQDN was not created — it may already point elsewhere" >&2
else
  stage "cloudflared not configured on this host — skipping DNS and ingress"
fi

echo

# One machine-readable line for a caller that has to know where the site landed. Everything
# else this script prints is for a person reading a log.
echo "TRACY_RESULT port=$HOST_PORT label=$LABEL"
stage "$SITE is up at http://127.0.0.1:$HOST_PORT"
echo "    bound to loopback: reaching it from outside is cloudflared's job, not an open port."
echo "    mail is OFF unless --allow-mail was passed (ADR 0031 §5)."
