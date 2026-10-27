#!/usr/bin/env bash
#
# A NEW site is born on the signed access verifier (P0), whatever `rollout.list` says. Run by
# provision.sh after the platform's post-up hook, once the site has its key and readiness record.
#
#   strict-site-access.sh <label> <platform>
#
# 1. Marks the site born strict: `$TRACY_PRIVATE_ROOT/.site-access/<label>/strict.json`. Both resync
#    tools treat it as listed, so a deploy or a hand run keeps the site on the shipped verifier.
# 2. Joomla: the Claude Cowork package (pkg_claudecowork) still carries plg_system_tracyaccess 0.1.4,
#    which signs in whoever sends bare `x-tracy-email/tier/role` headers, and provision has just
#    installed it. Its files are replaced with provision/access/joomla/plg_system_tracyaccess
#    (tools/resync-joomla-access-plugin.sh). A later Cowork update puts 0.1.4 back; the deploy-time
#    resync replaces it again (dsh/deploy-host-dsh.sh).
# 3. Proof: the plugin on disk is byte-identical to the shipped verifier (Joomla's tracyaccess.xml and
#    its PHP, WordPress's mu-plugin from stage 6b). Anything else exits non-zero: a new site must
#    not go live on a header-trusting plugin.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"

[ $# -eq 2 ] || { echo "use: strict-site-access.sh <label> <platform>" >&2; exit 2; }
LABEL="$1"; PLATFORM="$2"
[[ "$LABEL" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || { echo "strict-site-access: not a site label: $LABEL" >&2; exit 2; }
say() { echo "strict-site-access: $LABEL: $*" >&2; }

ACCESS_DIR="$TRACY_PRIVATE_ROOT/.site-access/$LABEL"
[ -d "$ACCESS_DIR" ] || { say "no $ACCESS_DIR — the access key was never issued"; exit 1; }
printf '{"v":1,"at":"%s"}\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$ACCESS_DIR/strict.json"
chmod 0644 "$ACCESS_DIR/strict.json"

WEBROOT="$(tracy_webroot_dir "$LABEL")"
same() { cmp -s "$1" "$2"; }
version_of() { sed -n '1,/<version>/s:.*<version>\(.*\)</version>.*:\1:p' "$1" 2>/dev/null || true; }

case "$PLATFORM" in
  joomla)
    PLUGIN="$WEBROOT/plugins/system/tracyaccess"
    [ -d "$PLUGIN" ] || { say "no plugins/system/tracyaccess — nothing to replace"; exit 0; }
    bash "$HERE/../tools/resync-joomla-access-plugin.sh" --platform joomla "$LABEL"
    SOURCE="$HERE/access/joomla/plg_system_tracyaccess"
    for rel in tracyaccess.xml src/Extension/TracyAccess.php lib/AccessAssertion.php; do
      if ! same "$SOURCE/$rel" "$PLUGIN/$rel"; then
        found="$(version_of "$PLUGIN/tracyaccess.xml")"
        say "plugins/system/tracyaccess (version ${found:-unknown}) is not the signed verifier — refusing to hand over a site that trusts bare headers"
        exit 1
      fi
    done
    say "signed verifier $(version_of "$SOURCE/tracyaccess.xml") in place"
    ;;
  wordpress)
    MU="$WEBROOT/wp-content/mu-plugins/tracy-access.php"
    [ -f "$MU" ] || { say "no mu-plugins/tracy-access.php — nothing to check"; exit 0; }
    same "$HERE/access/wordpress/tracy-access.php" "$MU" \
      || { say "mu-plugins/tracy-access.php is not the signed verifier — refusing to hand over a site that trusts bare headers"; exit 1; }
    say "signed verifier in place"
    ;;
  *) say "no access plugin on $PLATFORM" ;;
esac
