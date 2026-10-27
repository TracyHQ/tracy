#!/usr/bin/env bash
#
# Issue a site's access key (P0): 32 random bytes with a key id, written ONCE to
# `$TRACY_PRIVATE_ROOT/.site-access/<label>/key.json`. tracy-web signs who is viewing the site with
# it (apps/tracy-web/src/bar/site-access.js, which reads the directory read-only); the site's access
# plugin verifies with it (`/run/tracy-access/key.json`, mounted by render-compose.sh once it exists).
#
#   issue-site-access-key.sh <label>            issue if the site has none; an existing key is kept
#   issue-site-access-key.sh --rotate <label>   always a new key (restore, clone, suspected leak)
#
# Prints `<label> <kid> sha256:<first 12 hex of sha256(key)>` — never the key. Re-rendering and
# recreating the web container is the caller's step (provision, restore, secure-site-access.sh).
#
# Trust scope: code running inside the site can read this file. The key vouches for viewers of THAT
# site only and grants nothing on the control plane, so reading it gains nothing the site does not own.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=../lib/roots.sh
. "$HERE/../lib/roots.sh"

ROTATE=0
[ "${1:-}" = --rotate ] && { ROTATE=1; shift; }
[ $# -eq 1 ] || { echo "use: issue-site-access-key.sh [--rotate] <label>" >&2; exit 2; }
LABEL="$1"
[[ "$LABEL" =~ ^[a-z0-9][a-z0-9-]{0,62}$ ]] || { echo "issue-site-access-key: not a site label: $LABEL" >&2; exit 2; }

exec python3 - "$TRACY_PRIVATE_ROOT" "$LABEL" "$ROTATE" <<'PY'
import base64, hashlib, json, os, secrets, sys, time

root, label, rotate = sys.argv[1], sys.argv[2], sys.argv[3] == '1'
top = os.path.join(root, '.site-access')
d = os.path.join(top, label)
os.makedirs(d, exist_ok=True)
# 0711 on the parent: tracy-web opens a known label, nobody lists them; the site mounts only its own.
os.chmod(top, 0o711)
os.chmod(d, 0o755)
path = os.path.join(d, 'key.json')

def b64(raw):
    return base64.urlsafe_b64encode(raw).rstrip(b'=').decode()

def current():
    try:
        with open(path) as f:
            doc = json.load(f)
        key = base64.urlsafe_b64decode(doc['key'] + '=' * (-len(doc['key']) % 4))
        if doc.get('v') == 1 and doc.get('site') == label and doc.get('kid') and len(key) == 32:
            return doc['kid'], key
    except (OSError, ValueError, KeyError, TypeError):
        pass
    return None

held = None if rotate else current()
if held is None:
    key = secrets.token_bytes(32)
    kid = 'k%s-%s' % (time.strftime('%Y%m%d', time.gmtime()), secrets.token_hex(3))
    tmp = os.path.join(d, '.key.json.%s' % secrets.token_hex(4))
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o644)
    with os.fdopen(fd, 'w') as f:
        json.dump({'v': 1, 'kid': kid, 'site': label, 'key': b64(key)}, f)
        f.flush()
        os.fsync(f.fileno())
    os.chmod(tmp, 0o644)
    os.replace(tmp, path)
    state = 'issued'
else:
    kid, key = held
    state = 'kept'
print('%s %s sha256:%s %s' % (label, kid, hashlib.sha256(key).hexdigest()[:12], state))
PY
