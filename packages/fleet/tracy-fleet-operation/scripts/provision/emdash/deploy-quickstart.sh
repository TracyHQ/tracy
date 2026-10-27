#!/usr/bin/env bash
# Put a Tracy EmDash quickstart on this fleet host from a ja-products release — the same bytes
# anyone can download — and expose it through the host's Cloudflare tunnel.
#
#   deploy-quickstart.sh <product> [--version 1.0.0|latest] [--from <dir>] [--host <fqdn>] [--port N]
#                        [--repo owner/name] [--label <dir-name>]
#
#   deploy-quickstart.sh tracy-business                      # latest tracy-business/emdash-* release
#   deploy-quickstart.sh tracy-business --from /root/rel     # assets already on disk (no GitHub token)
#
# One site per template, one hostname each: <label>.tracy.ai, where label defaults to the product
# without its `tracy-` prefix plus `-emdash` (tracy-business → business-emdash.tracy.ai). ONE level
# under tracy.ai on purpose: Universal SSL covers *.tracy.ai only, so business.emdash.tracy.ai
# would fail TLS at the edge (measured 2026-09-14 on the Joomla twin).
#
# The release carries two things: the packed template source (zip) and a state snapshot (tar:
# scrubbed SQLite + uploads). First deploy restores the snapshot so the demo content is there
# before the first request; a redeploy keeps data/ and uploads/ — editors' work survives an
# upgrade — and only swaps the image. The agent token is minted here, per site, never shipped.
#
# Resolves the release with the GitHub API (repo is private): GITHUB_TOKEN from the environment or
# /etc/tracy/quickstart.env (a read-only fine-grained token for the releases of that one repo).
# Tunnel ingress goes through provision/ingress_api.py (the tunnel is remotely managed; editing
# config.yml on this host changes nothing), DNS through `cloudflared tunnel route dns`.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd -P)"
PRODUCT="${1:?product (e.g. tracy-business)}"; shift
VERSION=latest FROM="" HOST="" PORT="" REPO="JoomlArt-Products/ja-products" LABEL=""
while [ $# -gt 0 ]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --from) FROM="$2"; shift 2 ;;
    --host) HOST="$2"; shift 2 ;;
    --port) PORT="$2"; shift 2 ;;
    --repo) REPO="$2"; shift 2 ;;
    --label) LABEL="$2"; shift 2 ;;
    *) echo "!! unknown argument $1" >&2; exit 2 ;;
  esac
done
LABEL="${LABEL:-${PRODUCT#tracy-}-emdash}"
HOST="${HOST:-$LABEL.tracy.ai}"
SITE="/srv/tracy/$LABEL"
STORE="/srv/tracy/_quickstarts/$PRODUCT-emdash"
die() { echo "!! $*" >&2; exit 1; }
[[ "$LABEL" =~ ^[a-z0-9-]+$ ]] || die "label must be [a-z0-9-]: $LABEL"

# ── 1. the release: on disk, or from GitHub ──────────────────────────────────────────────────
if [ -z "$FROM" ]; then
  [ -f /etc/tracy/quickstart.env ] && { set -a; . /etc/tracy/quickstart.env; set +a; }
  [ -n "${GITHUB_TOKEN:-}" ] || die "no GITHUB_TOKEN (env or /etc/tracy/quickstart.env) — or pass --from <dir> with the assets"
  api() { curl -fsS -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/vnd.github+json" "$@"; }
  echo "==> resolving $PRODUCT/emdash-* on $REPO ($VERSION)"
  releases="$(api "https://api.github.com/repos/$REPO/releases?per_page=100")"
  # Releases whose tag is this product on the EmDash line, newest first; drafts are not releases.
  rel="$(printf '%s' "$releases" | jq -c --arg p "$PRODUCT/emdash-" --arg v "$VERSION" '
    [ .[] | select(.draft|not) | select(.tag_name|startswith($p)) ]
    | sort_by(.published_at) | reverse
    | if $v == "latest" then .[0]
      else map(select(any(.assets[]; .name|endswith("-quickstart-\($v).zip")))) | .[0] end')"
  [ "$rel" != "null" ] && [ -n "$rel" ] || die "no published release for $PRODUCT/emdash-* ($VERSION)"
  tag="$(printf '%s' "$rel" | jq -r .tag_name)"
  FROM="$STORE/$(printf '%s' "$rel" | jq -r .id)"
  mkdir -p "$FROM"
  echo "==> downloading $tag → $FROM"
  printf '%s' "$rel" | jq -r '.assets[] | "\(.id) \(.name)"' | while read -r id name; do
    [ -s "$FROM/$name" ] && continue
    curl -fsSL -H "Authorization: Bearer $GITHUB_TOKEN" -H "Accept: application/octet-stream" \
      -o "$FROM/$name.part" "https://api.github.com/repos/$REPO/releases/assets/$id" && mv "$FROM/$name.part" "$FROM/$name"
  done
fi
[ -f "$FROM/manifest.json" ] || die "$FROM has no manifest.json"
[ -f "$FROM/SHA256SUMS" ] || die "$FROM has no SHA256SUMS"
echo "==> verifying checksums in $FROM"
(cd "$FROM" && sha256sum -c --quiet SHA256SUMS)
m() { jq -r "$1" "$FROM/manifest.json"; }
[ "$(m .product)" = "$PRODUCT" ] || die "manifest is for $(m .product), not $PRODUCT"
[ "$(m .cms.name)" = "emdash" ] || die "manifest cms is $(m .cms.name)"
VER="$(m .version)"; ZIP="$(m .artifact)"; STATE="$(m .state.file)"; AHASH="$(m .template.artifactHash)"
IMAGE="tracy/$PRODUCT-emdash:$VER"
echo "==> $PRODUCT $VER (EmDash $(m .cms.version), artifact $AHASH) → $SITE as $HOST"

# ── 2. port: keep the one this site already has; otherwise the first free one from 8092 ─────
mkdir -p "$SITE"
if [ -z "$PORT" ] && [ -f "$SITE/.env" ]; then PORT="$(sed -n 's/^HOST_PORT=//p' "$SITE/.env")"; fi
if [ -z "$PORT" ]; then
  PORT=8092
  while ss -ltn | grep ":$PORT " >/dev/null; do PORT=$((PORT + 1)); done
fi

# ── 3. source → image, and 4. state ──────────────────────────────────────────────────────────
# Both steps live in quickstart-restore.sh, shared with the provision road (platform/emdash.sh):
# the same unpack, the same tag rule, the same "restore once" — see that file for why.
# shellcheck source=quickstart-restore.sh
. "$(dirname "${BASH_SOURCE[0]}")/quickstart-restore.sh"
emdash_build_image "$FROM/$ZIP" "$IMAGE" "$SITE" "$AHASH" || die "could not build $IMAGE"
emdash_restore_state "$FROM/$STATE" "$SITE" || die "could not restore the state snapshot"

# ── 5. env + compose ─────────────────────────────────────────────────────────────────────────
# Who may frame the demo: Tracy's own surfaces. Override with FRAME_ANCESTORS for a dev surface.
source "$HERE/../lib/frame-policy.sh"
FRAME_ANCESTORS="${FRAME_ANCESTORS:-$(tracy_frame_ancestors)}"
if [ "$FRAME_ANCESTORS" = "${TRACY_ORIGIN:-}" ] || [ "$FRAME_ANCESTORS" = "$(tracy_frame_ancestors)" ]; then
  tracy_record_frame_policy "$SITE" "$FRAME_ANCESTORS"
fi
if [ ! -f "$SITE/.env" ]; then
  # 32 random bytes as unpadded base64url — the shape `emdash secrets generate` produces. Made
  # once; losing it loses plugin secrets at rest (SMTP password), so it never gets regenerated.
  key="emdash_enc_v1_$(head -c 32 /dev/urandom | base64 | tr '+/' '-_' | tr -d '=\n')"
  umask 077
  printf 'HOST_PORT=%s\nEMDASH_SITE_URL=https://%s\nEMDASH_ENCRYPTION_KEY=%s\n' "$PORT" "$HOST" "$key" > "$SITE/.env"
  umask 022
fi
cat > "$SITE/compose.yml" <<EOF
# Written by deploy-quickstart.sh — one EmDash quickstart, bound to loopback; cloudflared brings the world.
services:
  web:
    image: $IMAGE
    restart: unless-stopped
    env_file: .env
    environment:
      HOST: 0.0.0.0
      PORT: "4321"
      SITE_DATA_DIR: ./data
      # A DEMO is framed by Tracy's Design inspiration preview (the live site IS the template
      # card's preview): the template's middleware turns this into `Content-Security-Policy:
      # frame-ancestors`. Customer sites never get it — only this script writes it, and only
      # demos go through this script.
      TRACY_FRAME_ANCESTORS: "$FRAME_ANCESTORS"
    volumes:
      - ./data:/app/data
      - ./uploads:/app/uploads
    ports:
      - "127.0.0.1:\${HOST_PORT}:4321"
EOF
printf '{"product":"%s","version":"%s","release":"%s","artifactHash":"%s","image":"%s","host":"%s","port":%s,"deployedAt":"%s"}\n' \
  "$PRODUCT" "$VER" "$(m .release)" "$AHASH" "$IMAGE" "$HOST" "$PORT" "$(date -u +%FT%TZ)" > "$SITE/RELEASE.json"

echo "==> docker compose up"
(cd "$SITE" && docker compose up -d --remove-orphans)
for _ in $(seq 1 60); do
  curl -fsS -o /dev/null "http://127.0.0.1:$PORT/_emdash/api/setup/status" && break
  sleep 2
done
curl -fsS -o /dev/null "http://127.0.0.1:$PORT/_emdash/api/setup/status" || die "site did not come up on :$PORT (docker compose -f $SITE/compose.yml logs)"

# ── 6. bootstrap inside the container: mints the agent token, adopts the restored content ────
# (or seeds it, when no snapshot was restored). Idempotent — safe on every redeploy.
echo "==> bootstrap (mint token, reconcile content)"
(cd "$SITE" && docker compose exec -T -u www-data web bash tools/bootstrap-site.sh http://127.0.0.1:4321 ./data) || \
  echo "?? bootstrap exited $? — entries may need a human decision; site is serving regardless"
# Said once, in plain words, because nothing else on this road would: the compose above runs the
# image as built — no tools layer, so no tracy-sendmail shim — and carries no TRACY_MAIL_* (this
# script never derives a site-mail token), and no step here selects a mail provider. A demo is for
# looking at; the mail step of a provision (platform/emdash.sh, #803) is not on this road, so it
# neither configures this site nor stops it. A demo that must mail goes through provision.sh.
echo "==> no mail path: this demo runs $IMAGE as built (no tracy-sendmail shim, no TRACY_MAIL_* in its compose) — its forms store submissions and mail nobody"

# ── 7. tunnel ingress + DNS ──────────────────────────────────────────────────────────────────
if [ -f /etc/tracy/hooks.env ]; then
  set -a; . /etc/tracy/hooks.env; set +a
  if [ -n "${TRACY_CF_API_TOKEN:-}" ] && [ -n "${TRACY_TUNNEL_ID:-}" ]; then
    echo "==> ingress $HOST → 127.0.0.1:$PORT"
    # `--replace`: the demo's hostname is its own by name, and a redeploy may land on another port.
    python3 "$HERE/ingress_api.py" --hostname "$HOST" --replace --port "$PORT"
    TUNNEL_ORIGIN_CERT=/root/.cloudflared/cert.pem cloudflared tunnel route dns "$TRACY_TUNNEL_ID" "$HOST" \
      || echo "    (DNS record already present or not ours — check the zone)"
  fi
fi

# ── 8. what a visitor gets ───────────────────────────────────────────────────────────────────
sleep 3
for p in / /ru/ /_emdash/admin; do
  code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$HOST$p" || echo 000)"
  echo "    https://$HOST$p → $code"
done
echo "==> done: $PRODUCT $VER at https://$HOST (loopback :$PORT, $SITE)"
