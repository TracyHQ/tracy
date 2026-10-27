#!/usr/bin/env bash
#
# migrate-web-dns-alias — give ONE already-running web container the bounded tracy-network alias a
# long label needs, WITHOUT re-rendering its compose file (issue #165).
#
#   migrate-web-dns-alias.sh <label> [--apply] [--root DIR] [--project NAME] [--web-service NAME]
#
# ## What #165 is, and what this fixes that render-compose.sh does not
#
# Docker's embedded DNS registers a container by its NAME, and `<label>-web-1` runs up to 69 octets
# while a DNS label caps at 63 — an over-long name simply does not resolve, and tracy-web's dial
# fails ENOTFOUND (measured Node 22.17). `render-compose.sh` already writes a bounded
# `tracy-web-<hash>` alias for such a label when it renders a NEW compose file, and `webDnsName`
# dials that alias. A site DEPLOYED BEFORE that fix still carries the plain `networks: [default,
# tracy]` shorthand, so its container has no alias and stays unreachable. This script closes that
# gap for one such site, on disk and at runtime.
#
# ## Why it does NOT just run render-compose.sh
#
# A full re-render would fold this site's OTHER unrelated changes forward — the site-folder mounts
# and the agent-tooled web image (Plan 3, #162) — onto a site that predates them, mixing two
# migrations into one and recreating more than the web container. So this patches ONE thing: the web
# service's tracy-network attachment. Every other byte of the compose file is preserved, variable
# references (`${DB_PASSWORD}`, `${HOST_PORT:?…}`) included.
#
# ## Bounded by construction
#
#   * ONE explicit, validated label. Never a scan, never an all-host apply.
#   * Dry-run is the default; mutation needs --apply. A dry run does the WHOLE read-only preflight.
#   * A short label (its `<label>-web-1` fits 63 octets) is a no-op — no deployed normal site changes.
#   * The alias is the one `render-compose.sh`'s `tracy_web_dns_alias` derives — sourced, not
#     recomputed, so there is no new copy of the #165 hash to drift.
#   * The candidate is validated with `docker compose config --format json` and proven semantically
#     equal to the original except for the added alias, before it is allowed to replace it.
#   * The target container's IDENTITY is pinned: exact compose project/service, its working_dir and
#     config_files must be THIS site's, and its image id must not move (a mutable tag that resolves
#     to a different image is refused — --pull never alone does not pin an already-running image).
#   * The tracy network and the web port are DERIVED from the validated config, never guessed; an
#     explicit network override must NAME that same derived network or it is refused.
#   * The running container must have been created from THIS file+env — its compose config-hash must
#     equal `docker compose config --hash web` of the file on disk. A file carrying unrelated pending
#     changes the container predates (the #162 overlap) is refused, not silently folded in.
#   * Apply locks the site, re-checks that neither the file, its RESOLVED config (env included), the
#     container nor its image drifted since preflight, backs the original up (0600), swaps atomically
#     PRESERVING THE ORIGINAL FILE MODE (a numeric chmod, portable — GNU `chmod --reference` is a
#     silent no-op on macOS), and recreates ONLY web with --no-deps --no-build --pull never. The
#     recreated container's image id is re-confirmed. The database, its volume, sessions, tokens and
#     the dsh are untouched.
#   * Readiness is proven from EXACTLY ONE existing tracy-web stack container (zero or several is a
#     refusal), which must itself sit on the derived network: the alias must resolve over Docker DNS
#     to THIS web container's own endpoint and answer HTTP on the derived port, with a bounded retry
#     for startup. A missing observer, a DNS miss, a wrong endpoint or an unreachable port fails the
#     migration. ANY HTTP status counts as connectivity (what #165 fixes); application readiness is
#     the container healthcheck's job. Logs carry only fixed probe categories and a validated numeric
#     status — never raw docker/compose output.
#   * A failed verification restores the original bytes AND original mode, recreates the old web, and
#     re-proves it (pinned image, original config-hash, HTTP on its OWN endpoint IP — the old long
#     name deliberately does not resolve). A rollback that would overwrite a concurrent post-swap
#     edit, that cannot recreate the old web, or that cannot re-prove it, is loud and never claims
#     the site is serving.
#
# ## Environment (all overridable so this runs off a fleet host, e.g. in a test)
#
#   TRACY_ROOT            /srv/tracy         where the sites live (also --root)
#   TRACY_SITE_NETWORK    (derived)          override the tracy network name; normally derived
#   TRACY_DOCKER          docker             the docker CLI (a test hands it a stub)
#   TRACY_WEB_STACK       (discovered)       the tracy-web stack container the DNS probe runs from
#   TRACY_WEB_WAIT_SECONDS 60                readiness budget for the recreated web container
#   TRACY_WEB_POLL_SECONDS 2                 pause between readiness/probe attempts (a test sets 0; the budget still counts 2 per attempt)
#
# Logs carry technical status, counts and a HASHED site identifier only — never a full site path,
# an unbounded label, a resolved config/env, a docker inspect payload or a customer-chosen alias.

say()  { echo "dns-alias: $*"; }
warn() { echo "dns-alias: !! $*" >&2; }
die()  { echo "dns-alias: $*" >&2; exit 1; }

# A short, stable hash of the label so shared logs identify the site without carrying its full name.
target_id() { printf '%s' "$1" | { sha256sum 2>/dev/null || shasum -a 256; } | cut -c1-12; }

# Same character rule as attach-site.sh / migrate-site-to-host-dsh.sh: the names that pass every
# character test while meaning something else in a path are rejected here, before a path is built.
tracy_label_ok() {
  case "$1" in
    .|..|.*|*/*|*[!A-Za-z0-9._-]*|'') return 1 ;;
  esac
  return 0
}

# A project/service name is stricter still: it is spliced into a compose regex in dns-alias.mjs, so a
# `.` (a regex metachar) or anything non-slug is refused rather than allowed to match too much.
tracy_name_ok() {
  case "$1" in
    ''|*[!A-Za-z0-9_-]*) return 1 ;;
  esac
  return 0
}

# Resolve the OPAQUE #165 selector (a `tracy-web-<32hex>` alias) to the ONE local site whose derived
# alias equals it. The selector is non-reversible, so no raw label ever entered the caller/log; the
# raw label is recovered read-only HERE, on the host that owns the sites. Zero or more than one match
# refuses. Reuses render-compose.sh's derivation — never a second copy of the hash.
tracy_resolve_from_alias() {
  local want="$1" d base match="" count=0
  case "$want" in
    tracy-web-*) ;;
    *) return 1 ;;
  esac
  for d in "$ROOT"/*/; do
    [ -d "$d" ] || continue
    base="$(basename "$d")"
    tracy_label_ok "$base" || continue
    [ -f "$d/docker-compose.yml" ] || continue
    if [ "$(tracy_web_dns_name "$base")" = "$want" ]; then
      match="$base"
      count=$((count + 1))
    fi
  done
  [ "$count" = 1 ] || return 1
  printf '%s' "$match"
}

# A portable content hash for the drift check — sha256sum on the fleet host, shasum on macOS (so the
# test runs there too). Only the digest, never the file's bytes, is kept.
file_hash() {
  { sha256sum "$1" 2>/dev/null || shasum -a 256 "$1"; } | cut -d' ' -f1
}

# The file's permission bits as an octal string, PORTABLY: `stat -c` is GNU/Linux, `stat -f` is
# BSD/macOS. `chmod --reference` is GNU-only and silently unsupported on macOS — which is exactly the
# measured mode-preservation failure this replaces (a 0640 source became 0600). Capture the mode
# ourselves and re-apply it with a plain numeric `chmod`, which both platforms accept.
file_mode() {
  stat -c '%a' "$1" 2>/dev/null || stat -f '%Lp' "$1"
}

# The compose config-hash of the web service, from `docker compose config --hash` — the same value
# compose stamps on the container as `com.docker.compose.config-hash`. Used to prove the running
# container was created from THIS file+env (not an older one carrying unrelated pending changes, the
# #162 overlap). Resolves secrets in memory; only the digest is printed.
web_config_hash_of_file() {
  local file="$1"
  ( cd "$SITE_DIR" && "${DOCKER}" compose -f "$file" --project-name "$PROJECT" config --hash "$WEB_SERVICE" 2>/dev/null ) \
    | awk -v s="$WEB_SERVICE" '$1==s && !f {print $2; f=1}'
}

# The config-hash label the running container carries (what config it was actually created from).
web_container_config_hash() {
  "${DOCKER}" inspect "$WEB" \
    --format '{{index .Config.Labels "com.docker.compose.config-hash"}}' 2>/dev/null || true
}

container_state() {
  "${DOCKER}" inspect -f '{{.State.Running}}' "$1" 2>/dev/null || true
}

# State AND health AND a reachable exec, never an exit code — `docker start`/`compose up` return when
# the container EXISTS, and a container that dies a second later answers both successfully. Same
# shape migrate-site-to-host-dsh.sh's container_ready uses, and for the same reason.
container_ready() {
  local name="$1" budget="${2:-${TRACY_WEB_WAIT_SECONDS:-60}}" waited=0 state health
  while :; do
    state="$(container_state "$name")"
    # `index`, not `.State.Health`: with no healthcheck there is no Health key, and the Docker CLI 27.x
    # in tracy-host fails a field access to it even inside `if` (measured 24/09/2026). Swallowed below,
    # that failure reads as "no healthcheck" for every container, so an unhealthy one would pass.
    health="$("${DOCKER}" inspect -f '{{with (index .State "Health")}}{{.Status}}{{end}}' "$name" 2>/dev/null || true)"
    if [ "$state" = true ] && { [ -z "$health" ] || [ "$health" = healthy ]; } \
      && "${DOCKER}" exec "$name" true >/dev/null 2>&1; then
      return 0
    fi
    [ "$waited" -ge "$budget" ] && return 1
    sleep "${TRACY_WEB_POLL_SECONDS:-2}"
    waited=$((waited + 2))
  done
}

# `docker compose config --format json` for the site's stack, resolving its .env in memory only. The
# output carries resolved secrets, so it is NEVER written to a file — the caller pipes it straight
# into the comparison via process substitution.
compose_config_json() {
  local file="$1"
  # stderr suppressed: a compose config error can print the site path and resolved values, which must
  # not reach shared logs — the non-zero exit is what the caller acts on, with a fixed diagnostic.
  ( cd "$SITE_DIR" && "${DOCKER}" compose -f "$file" --project-name "$PROJECT" config --format json 2>/dev/null )
}

# The web container's identity fingerprint: container id, IMAGE id, and associated compose file.
# Prints "<id>|<image>|<config_files>"; empty when there is no such container. The image is part of
# it so a mutable tag that now resolves to a different image is caught as drift.
web_container_fingerprint() {
  "${DOCKER}" inspect "$WEB" \
    --format '{{.Id}}|{{.Image}}|{{index .Config.Labels "com.docker.compose.project.config_files"}}' 2>/dev/null || true
}

# ── preflight: everything that can refuse, before anything is touched ─────────────────────────────

tracy_dns_alias_preflight() {
  [ -d "$SITE_DIR" ] || die "no site directory for the target — refusing"
  # 🔒 NO SYMLINK, NO ESCAPE. A site dir that is a symlink, or whose realpath leaves ROOT, is not a
  # site this may act on — following it would let a crafted label reach a compose file outside the
  # sites root. Resolve both and insist the site is a real directory at exactly ROOT/<label>.
  local real_root real_site
  real_root="$(cd "$ROOT" 2>/dev/null && pwd -P)" || die "the sites root is not a directory — refusing"
  real_site="$(cd "$SITE_DIR" 2>/dev/null && pwd -P)" || die "the site directory is not a directory — refusing"
  case "$real_site/" in
    "$real_root"/*) ;;
    *) die "the site directory resolves outside the sites root — refusing" ;;
  esac
  [ "$real_site" = "$real_root/$LABEL" ] || die "the site directory resolves elsewhere — refusing a symlinked site"
  REAL_SITE="$real_site"
  COMPOSE="$SITE_DIR/docker-compose.yml"
  [ -f "$COMPOSE" ] || die "the site has no docker-compose.yml — not a site this can act on"
  [ ! -L "$COMPOSE" ] || die "the compose file is a symlink — refusing"

  # 🔒 SNAPSHOT THE BASELINE FIRST, before a single read that a concurrent editor could race. The
  # apply revalidate compares against this, so a candidate built from stale bytes cannot be written
  # over a file that changed underneath us. The mode is captured too, so the swap can restore the
  # ORIGINAL permission bits portably (the backup is deliberately 0600, so it is not the reference).
  ORIG_HASH="$(file_hash "$COMPOSE")"
  ORIG_MODE="$(file_mode "$COMPOSE")"
  [ -n "$ORIG_MODE" ] || die "cannot read the compose file's mode — refusing rather than swapping in an unknown permission"

  # The alias #165 derives, from the one place it is derived. A short label whose `<label>-web-1`
  # fits a DNS label needs no alias at all.
  local dns_name
  dns_name="$(tracy_web_dns_name "$LABEL")"
  if [ "$dns_name" = "$LABEL-web-1" ]; then
    say "target is short: its <label>-web-1 name (${#LABEL} + 6 octets) resolves as-is — nothing to do"
    exit 0
  fi
  ALIAS="$dns_name"
  say "long label ($TARGET): the dial name is the bounded #165 alias (the container name is unchanged)"

  # Build the candidate in memory. `patch` refuses any network stanza that is not one of the finite
  # shapes render-compose.sh writes; exit 3 means the file already carries exactly this alias.
  # `set +e` around the capture: `patch` uses exit codes 0/3/4 as its answer, and errexit would
  # abort on the 3/4 assignment before patch_rc could read it.
  local patch_rc
  set +e
  CANDIDATE="$(node "$HERE/dns-alias.mjs" patch --service "$WEB_SERVICE" --alias "$ALIAS" --in "$COMPOSE")"
  patch_rc=$?
  set -e
  case "$patch_rc" in
    0) FILE_ALREADY_CORRECT=0; say "the compose file needs the alias added to its web service" ;;
    3) FILE_ALREADY_CORRECT=1; say "the compose file already carries the alias" ;;
    *) die "cannot add the alias — refusing rather than rewriting a network stanza it does not recognise (see the reason above)" ;;
  esac

  # The running web container, selected by EXACT compose labels — not by name-guessing. Ambiguity is
  # a refusal, not a pick.
  local matches count
  matches="$("${DOCKER}" ps --format '{{.Names}}' \
    --filter "label=com.docker.compose.project=$PROJECT" \
    --filter "label=com.docker.compose.service=$WEB_SERVICE" 2>/dev/null || true)"
  count="$(printf '%s' "$matches" | grep -c . || true)"
  if [ "$count" = 0 ]; then
    die "no running container for the target's compose project/service — is the site up? (pass --project/--web-service if it is named otherwise)"
  fi
  [ "$count" = 1 ] || die "$count containers match the target's project/service — refusing an ambiguous selection"
  local selected
  selected="$(printf '%s' "$matches" | sed -n 1p)"
  [ "$selected" = "$WEB" ] || die "the matched container is not the expected web container — refusing"

  # 🔒 COMPLETE, TRUSTWORTHY ASSOCIATION. Read id, image and association in one fingerprint. Its
  # working_dir MUST be this site's directory and its config_files MUST be exactly this one compose
  # file — a missing association, a container adopted from another project, or an extra override
  # file silently folded in is a refusal, not a shrug.
  WEB_FINGERPRINT="$(web_container_fingerprint)"
  WEB_ID="${WEB_FINGERPRINT%%|*}"
  WEB_IMAGE="$(printf '%s' "$WEB_FINGERPRINT" | cut -d'|' -f2)"
  local fp_config assoc
  fp_config="$(printf '%s' "$WEB_FINGERPRINT" | cut -d'|' -f3-)"
  assoc="$("${DOCKER}" inspect "$WEB" --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}' 2>/dev/null || true)"
  [ -n "$assoc" ] || die "the container declares no compose working_dir — refusing an incomplete association"
  local real_assoc
  real_assoc="$(cd "$assoc" 2>/dev/null && pwd -P || echo "$assoc")"
  [ "$real_assoc" = "$REAL_SITE" ] || die "the container is associated with another project directory — refusing"
  [ -n "$fp_config" ] || die "the container declares no compose config_files — refusing an incomplete association"
  case "$fp_config" in
    *,*) die "the container was composed from more than one file — refusing to patch one of several overrides" ;;
  esac
  local real_fp_config
  real_fp_config="$(cd "$(dirname "$fp_config")" 2>/dev/null && printf '%s/%s' "$(pwd -P)" "$(basename "$fp_config")" || echo "$fp_config")"
  [ "$real_fp_config" = "$COMPOSE" ] || [ "$real_fp_config" = "$REAL_SITE/docker-compose.yml" ] \
    || die "the container's compose file is not this site's docker-compose.yml — refusing"
  say "selected the target's web container (compose project/service matched, association verified)"

  # 🔒 VALIDATE THE ORIGINAL THROUGH COMPOSE, and DERIVE the network and port from it. Both hold
  # resolved secrets and stay in memory (process substitution), never on disk.
  local orig_json
  orig_json="$(compose_config_json "$COMPOSE")" || die "the original compose file does not validate with docker compose config — refusing to touch it"
  local derived_net
  derived_net="$(node "$HERE/dns-alias.mjs" web-network --service "$WEB_SERVICE" --config <(printf '%s' "$orig_json"))" \
    || die "cannot determine the tracy network from the validated config — refusing"
  # The network is DERIVED from the validated config. An explicit override is allowed only to NAME the
  # same network the config already points at (a test harness needs to set it); a value that disagrees
  # is refused rather than silently probing/attaching a different network than the one we validated.
  if [ -n "${TRACY_SITE_NETWORK:-}" ] && [ "$TRACY_SITE_NETWORK" != "$derived_net" ]; then
    die "TRACY_SITE_NETWORK override does not equal the network derived from the validated config — refusing"
  fi
  NETWORK="$derived_net"
  WEB_PORT="$(node "$HERE/dns-alias.mjs" web-port --service "$WEB_SERVICE" --config <(printf '%s' "$orig_json"))" \
    || die "cannot determine the web port from the validated config — refusing to guess"
  say "derived from the validated config: tracy network and web port $WEB_PORT"

  # 🔒 PIN THE EXACT IMAGE. `--pull never` uses the LOCAL image the compose tag resolves to — which
  # is not necessarily the one the running container was created from (a mutable tag can have been
  # reassigned since). Recreating web would then silently swap the image. So resolve the config's web
  # image reference locally and refuse unless it is exactly the running container's image id.
  local resolved_image
  # Stored (not just local): the tag is re-inspected under the lock immediately before recreate, since
  # `--pull never` recreates from whatever the tag resolves to THEN — a mutable tag can move even while
  # the running container's own .Image (the fingerprint) has not.
  WEB_IMAGE_REF="$(node "$HERE/dns-alias.mjs" web-image --service "$WEB_SERVICE" --config <(printf '%s' "$orig_json"))" \
    || die "cannot determine the web image from the validated config — refusing"
  resolved_image="$("${DOCKER}" image inspect "$WEB_IMAGE_REF" --format '{{.Id}}' 2>/dev/null || true)"
  [ -n "$resolved_image" ] || die "the web image is not present locally — a --pull never recreate would fail; refusing rather than pulling"
  [ "$resolved_image" = "$WEB_IMAGE" ] || die "the web image tag now resolves to a different image than the running container — refusing (recreate would change the image; --pull never does not pin the running id)"

  # 🔒 CONFIG-HASH: THE RUNNING CONTAINER WAS CREATED FROM THIS FILE+ENV, NOTHING ELSE PENDING.
  # Equality of the candidate with the ORIGINAL FILE is not enough (issue #162 overlap): the file may
  # already carry unrelated env/mount changes never applied to the running container, and recreating
  # would silently fold them in. So require the container's `com.docker.compose.config-hash` to equal
  # `docker compose config --hash web` of the file on disk. A mismatch is an unprovable older config —
  # refuse with an explicit diagnostic rather than migrate onto pending changes. (This also catches an
  # env-only change that moves no file byte.) The alias itself changes this hash, which is why the
  # FILE_ALREADY_CORRECT repair below is only safe when the container was already created from the
  # aliased file — i.e. exactly when this same equality holds (runtime network drift, not a stale
  # config).
  ORIG_CONFIG_HASH="$(web_config_hash_of_file "$COMPOSE")"
  [ -n "$ORIG_CONFIG_HASH" ] || die "cannot compute the web service config-hash — refusing rather than acting without the #162 proof"
  RUN_CONFIG_HASH="$(web_container_config_hash)"
  [ -n "$RUN_CONFIG_HASH" ] || die "the running container carries no compose config-hash — refusing an incomplete association"
  [ "$RUN_CONFIG_HASH" = "$ORIG_CONFIG_HASH" ] \
    || die "the running container's compose config-hash does not match this compose file — it was created from a different (older/pending) config; refusing to fold unrelated changes in with the alias (#162)"
  say "config-hash matches: the running container was created from this exact compose file and env"
  # The config-hash the RECREATED container must carry. For a file that already carries the alias this
  # equals the original; for a swap it is the candidate's (the alias changes the hash) and is computed
  # from the validated candidate below. Revalidated under the lock and re-confirmed after recreate, so
  # an env-only drift after preflight (which moves no file byte) cannot slip a different config in.
  CAND_CONFIG_HASH="$ORIG_CONFIG_HASH"

  # Runtime idempotency: is the alias already on the container's tracy attachment?
  local inspect_json
  inspect_json="$("${DOCKER}" inspect "$WEB" 2>/dev/null || echo '[]')"
  if node "$HERE/dns-alias.mjs" verify-alias --alias "$ALIAS" --network "$NETWORK" --inspect <(printf '%s' "$inspect_json"); then
    RUNTIME_ALREADY_CORRECT=1
  else
    RUNTIME_ALREADY_CORRECT=0
  fi

  # 🔒 A TRUTHFUL NO-OP. "Already done" is claimed only when the VALIDATED config gives the web
  # service exactly this alias AND the running container carries it — not merely that a matching
  # text line exists.
  if [ "$FILE_ALREADY_CORRECT" = 1 ] && [ "$RUNTIME_ALREADY_CORRECT" = 1 ]; then
    if node "$HERE/dns-alias.mjs" config-alias --service "$WEB_SERVICE" --alias "$ALIAS" --config <(printf '%s' "$orig_json"); then
      # 🔒 A no-op still has to PROVE it. "Already done" means the alias actually resolves over Docker
      # DNS to this container's own endpoint and the port answers — not merely that the file text and
      # an inspect attachment agree. A stanza can be present while the container does not answer.
      tracy_dns_probe || die "the file and runtime carry the alias but the DNS/HTTP probe did not confirm it is serving — refusing to claim 'already done'"
      say "already done: the validated config carries the alias and the container answers to it — no-op"
      exit 0
    fi
    # File text and runtime agree but the composed config does not resolve to this alias: fall
    # through and let the semantic gate below decide rather than claiming a false no-op.
  fi

  # When the file needs the alias, prove the candidate differs from the original ONLY by it.
  if [ "$FILE_ALREADY_CORRECT" = 0 ]; then
    local cand_tmp
    cand_tmp="$(mktemp "$SITE_DIR/.docker-compose.candidate.XXXXXX")"
    chmod 600 "$cand_tmp"
    printf '%s\n' "$CANDIDATE" > "$cand_tmp"
    CANDIDATE_FILE="$cand_tmp"
    local cand_json
    cand_json="$(compose_config_json "$cand_tmp")" || { rm -f "$cand_tmp"; die "the candidate does not validate with docker compose config — refusing"; }
    if ! node "$HERE/dns-alias.mjs" diff --service "$WEB_SERVICE" --alias "$ALIAS" \
      --original <(printf '%s' "$orig_json") --candidate <(printf '%s' "$cand_json"); then
      rm -f "$cand_tmp"
      die "the candidate differs from the original by more than the alias — refusing (see the named section above)"
    fi
    say "candidate validates and is semantically equal to the original except the added alias"
    # The candidate's resolved config-hash (the alias changes it) — the value the recreated container
    # must carry. Computed from the validated candidate here so a later recreate can be proven to have
    # landed on exactly this config, not an env-drifted one.
    CAND_CONFIG_HASH="$(web_config_hash_of_file "$cand_tmp")"
    [ -n "$CAND_CONFIG_HASH" ] || { rm -f "$cand_tmp"; die "cannot compute the candidate's web config-hash — refusing"; }
  fi

  # 🔒 PROVE THE OBSERVER AND CONNECTIVITY BEFORE ANY MUTATION. The readiness proof runs from EXACTLY
  # ONE attached tracy-web observer; discovering a missing/ambiguous/off-network observer only AFTER
  # the recreate would force a predictable failed rollback. So the observer is validated here, in the
  # read-only preflight both dry-run and apply share — and the web container is proven to already
  # answer HTTP on its OWN endpoint (the #165 alias may not exist yet, so a DIRECT probe to the
  # original endpoint, never the alias). A gap here refuses before a single byte is touched.
  tracy_probe_observer >/dev/null \
    || die "cannot prove readiness: no single attached tracy-web observer to probe from — refusing before any mutation"
  tracy_endpoint_probe \
    || die "the web container does not answer HTTP on its own endpoint before migration — refusing before any mutation (fix the site first)"
}

# ── the DNS probe, run from an existing tracy-web stack container (Node is present there) ──────────
#
# 🔒 FIXED CODE, ARGV FOR DATA. The mode, host, port and (for the alias case) expected endpoint IP
# are passed as process.argv, never spliced into the program text. Two modes, one program:
#   dns    — prove the whole of #165: the host RESOLVES over Docker DNS to THIS web container's own IP
#            on the tracy network, and answers HTTP on the derived port.
#   direct — connect straight to an IP (rollback: the OLD long-label name deliberately does not
#            resolve, so serving is proven against the container's own endpoint IP, not the alias).
# HEAD, no redirect following, a bounded per-attempt timeout.
#
# WHICH HTTP STATUSES COUNT AS WHAT: ANY HTTP status — 2xx, 3xx, even 4xx/5xx — proves CONNECTIVITY,
# which is the whole of what #165 fixes (DNS resolves, the port answers). It is NOT an application-
# readiness check: whether the app returns 200 is the container's own healthcheck's job (container_ready
# already gates on that). So a DNS miss, a wrong endpoint or an unreachable port fails; an application
# 500 from a server that answered does not.
PROBE_CODE='
const [mode, host, port, expected] = process.argv.slice(1)
const dns = require("node:dns")
const http = require("node:http")
function head(connectHost) {
  const req = http.request({ host: connectHost, port: Number(port), method: "HEAD", timeout: 5000 }, (res) => {
    console.log("http:" + res.statusCode); process.exit(0)
  })
  req.on("timeout", () => { req.destroy(); console.error("http:timeout"); process.exit(3) })
  req.on("error", (err) => { console.error("http:" + (err.code || "error")); process.exit(4) })
  req.end()
}
if (mode === "dns") {
  dns.lookup(host, (e, addr) => {
    if (e) { console.error("dns:" + e.code); process.exit(2) }
    // Do NOT print the resolved or expected IP — a fixed category only.
    if (expected && addr !== expected) { console.error("endpoint:mismatch"); process.exit(5) }
    head(host)
  })
} else {
  head(host)
}'

# Discover the observer container the probe runs from (an existing tracy-web stack container has Node).
# EXACTLY ONE match: zero means we cannot prove anything, and more than one is an ambiguous fleet the
# probe must not pick from. An explicit TRACY_WEB_STACK override must itself be attached to the derived
# tracy network, or it cannot resolve the alias and would give a false negative/positive.
tracy_probe_observer() {
  local from count
  if [ -n "${TRACY_WEB_STACK:-}" ]; then
    from="$TRACY_WEB_STACK"
    local net_json
    net_json="$("${DOCKER}" inspect "$from" 2>/dev/null || echo '[]')"
    node "$HERE/dns-alias.mjs" on-network --network "$NETWORK" --inspect <(printf '%s' "$net_json") \
      || { warn "the TRACY_WEB_STACK observer is not attached to the derived tracy network — cannot prove the alias resolves"; return 1; }
    printf '%s' "$from"
    return 0
  fi
  local matches
  matches="$("${DOCKER}" ps --format '{{.Names}}' \
    --filter 'label=com.docker.compose.project=tracy' \
    --filter 'label=com.docker.compose.service=tracy-web' 2>/dev/null || true)"
  count="$(printf '%s' "$matches" | grep -c . || true)"
  if [ "$count" = 0 ]; then
    warn "no tracy-web stack container to probe DNS from — cannot prove the alias resolves; refusing to claim success"
    return 1
  fi
  [ "$count" = 1 ] || { warn "$count tracy-web stack containers match — refusing an ambiguous observer to probe from"; return 1; }
  from="$(printf '%s' "$matches" | grep . | sed -n 1p)"
  # The observer must sit on the network whose DNS we are testing, or the probe proves nothing.
  local net_json
  net_json="$("${DOCKER}" inspect "$from" 2>/dev/null || echo '[]')"
  node "$HERE/dns-alias.mjs" on-network --network "$NETWORK" --inspect <(printf '%s' "$net_json") \
    || { warn "the tracy-web observer is not attached to the derived tracy network — cannot prove the alias resolves"; return 1; }
  printf '%s' "$from"
}

# Run one bounded probe attempt from the observer, mapping the probe's exit code to a FIXED category
# and a validated numeric HTTP status only — never the raw docker/exec output, which can carry a
# private container label or path. Returns the probe's exit code.
tracy_probe_once() {
  local from="$1" mode="$2" host="$3" expected="${4:-}" out rc status
  set +e
  out="$("${DOCKER}" exec "$from" node -e "$PROBE_CODE" "$mode" "$host" "$WEB_PORT" "$expected" 2>&1)"
  rc=$?
  set -e
  case "$rc" in
    0)
      # The status is our own program's output; keep only the digits, so no arbitrary text can ride out.
      status="$(printf '%s' "$out" | sed -n 's/.*http:\([0-9][0-9]*\).*/\1/p')"
      say "probe ($mode): connectivity confirmed, HTTP status ${status:-unknown}"
      ;;
    2) warn "probe ($mode) failed: DNS did not resolve the alias (code 2)" ;;
    5) warn "probe ($mode) failed: the alias resolved to the wrong endpoint (code 5)" ;;
    3) warn "probe ($mode) failed: HTTP timed out (code 3)" ;;
    4) warn "probe ($mode) failed: the port did not answer (code 4)" ;;
    *) warn "probe ($mode) failed with code $rc" ;;
  esac
  return "$rc"
}

# The #165 proof, run from the observer: the ALIAS resolves to this web container's own endpoint and
# answers. Bounded RETRY so a container that is running-and-healthy but still finishing its HTTP
# startup is not rolled back for a single early miss (the readiness budget covers it).
tracy_dns_probe() {
  local from expected_ip inspect_json
  from="$(tracy_probe_observer)" || return 1
  inspect_json="$("${DOCKER}" inspect "$WEB" 2>/dev/null || echo '[]')"
  expected_ip="$(node "$HERE/dns-alias.mjs" web-endpoint --network "$NETWORK" --inspect <(printf '%s' "$inspect_json"))" \
    || { warn "cannot read the web container's own IP on the tracy network — refusing to claim success"; return 1; }

  local budget="${TRACY_WEB_WAIT_SECONDS:-60}" waited=0
  while :; do
    if tracy_probe_once "$from" dns "$ALIAS" "$expected_ip"; then return 0; fi
    [ "$waited" -ge "$budget" ] && break
    sleep "${TRACY_WEB_POLL_SECONDS:-2}"
    waited=$((waited + 2))
  done
  return 1
}

# The rollback proof: the OLD web answers on its OWN endpoint IP (its long name deliberately does not
# resolve, so the alias probe cannot be used here). Bounded retry, same reasoning.
tracy_endpoint_probe() {
  local from ip inspect_json
  from="$(tracy_probe_observer)" || return 1
  inspect_json="$("${DOCKER}" inspect "$WEB" 2>/dev/null || echo '[]')"
  ip="$(node "$HERE/dns-alias.mjs" web-endpoint --network "$NETWORK" --inspect <(printf '%s' "$inspect_json"))" \
    || { warn "cannot read the restored web container's own IP — cannot confirm it is serving"; return 1; }

  local budget="${TRACY_WEB_WAIT_SECONDS:-60}" waited=0
  while :; do
    if tracy_probe_once "$from" direct "$ip"; then return 0; fi
    [ "$waited" -ge "$budget" ] && break
    sleep "${TRACY_WEB_POLL_SECONDS:-2}"
    waited=$((waited + 2))
  done
  return 1
}

# ── verification of the recreated container ──────────────────────────────────────────────────────

tracy_verify_runtime() {
  container_ready "$WEB" || { warn "the web container did not come back healthy after recreate"; return 1; }
  # 🔒 THE ACTUAL RECREATED CONTAINER, not just the pre-swap check. `up --pull never` could still have
  # landed on a different local image than the one we pinned (a moved tag, a race), so confirm the NEW
  # container runs exactly the pinned image id before believing anything else about it.
  local new_image
  new_image="$(printf '%s' "$(web_container_fingerprint)" | cut -d'|' -f2)"
  [ "$new_image" = "$WEB_IMAGE" ] || { warn "the recreated web container is not running the pinned image — refusing to claim success"; return 1; }
  # 🔒 THE RECREATED CONTAINER'S CONFIG-HASH IS THE CANDIDATE'S. Image and alias alone do not prove the
  # container was created from the config we validated: an env-only drift would recreate a different one
  # under the same image and alias. Require the running config-hash to equal the expected candidate hash.
  local new_hash
  new_hash="$(web_container_config_hash)"
  [ "$new_hash" = "$CAND_CONFIG_HASH" ] || { warn "the recreated web container's config-hash is not the expected candidate config-hash — refusing to claim success"; return 1; }
  local inspect_json
  inspect_json="$("${DOCKER}" inspect "$WEB" 2>/dev/null || echo '[]')"
  node "$HERE/dns-alias.mjs" verify-alias --alias "$ALIAS" --network "$NETWORK" --inspect <(printf '%s' "$inspect_json") \
    || { warn "the web container is up but does not carry the #165 alias on the tracy network"; return 1; }
  say "the web container is running the pinned image and carries the alias on the tracy network"
  tracy_dns_probe || return 1
  return 0
}

# ── restore: put the original bytes back, recreate the old web — drift-aware and loud ─────────────

# Only overwrite the compose file if it is still EXACTLY the candidate we swapped in: a concurrent
# editor after the swap must not be clobbered by the restore. Restores atomically, preserving mode,
# then recreates the old web. warn-only; the caller decides whether to die.
tracy_restore_original() {
  warn "restoring the pre-migration compose and recreating the web service"
  if [ -n "${SWAPPED_HASH:-}" ] && [ "$(file_hash "$COMPOSE")" != "$SWAPPED_HASH" ]; then
    warn "ROLLBACK FAILED: the compose file changed since the swap — refusing to overwrite a concurrent edit. The pre-migration compose is preserved in the backup."
    return 1
  fi
  local staged="$SITE_DIR/.docker-compose.yml.rollback.$$"
  cp -a "$BACKUP" "$staged"
  # Restore the ORIGINAL permission bits, portably. The backup is deliberately 0600, so it is NOT the
  # reference — ORIG_MODE, captured from the pre-migration compose in preflight, is. A plain numeric
  # chmod works on both Linux and macOS, unlike the GNU-only `chmod --reference` this replaces.
  chmod "$ORIG_MODE" "$staged"
  mv "$staged" "$COMPOSE"
  # 🔒 The original bytes are now safely back on disk. Before recreating the old web (also --pull never),
  # refuse to boot a KNOWN-WRONG runtime rather than paper over drift:
  #   * the image tag must still resolve to the original image — otherwise the recreate would boot a
  #     moved tag, so leave the file restored and report runtime recovery incomplete;
  #   * the restored file's resolved config-hash must still equal the original baseline — an env drift
  #     under us would recreate the old web on an unprovable config, so stop before the up.
  if [ "$("${DOCKER}" image inspect "$WEB_IMAGE_REF" --format '{{.Id}}' 2>/dev/null || true)" != "$WEB_IMAGE" ]; then
    warn "ROLLBACK INCOMPLETE: the web image tag no longer resolves to the original image — the original compose is restored on disk but the old web was NOT recreated (refusing to boot a known-wrong image). Look now."
    return 1
  fi
  if [ "$(web_config_hash_of_file "$COMPOSE")" != "$ORIG_CONFIG_HASH" ]; then
    warn "ROLLBACK INCOMPLETE: the restored compose's resolved config-hash is not the original (env drift) — the original bytes are on disk but the old web was NOT recreated. Look now."
    return 1
  fi
  if ! ( cd "$SITE_DIR" && "${DOCKER}" compose --project-name "$PROJECT" up -d --no-deps --no-build --pull never "$WEB_SERVICE" >/dev/null 2>&1 ) \
    || ! container_ready "$WEB"; then
    warn "ROLLBACK FAILED TO RECREATE the web service — the original compose is restored on disk but the container is not up. Look now."
    return 1
  fi
  # 🔒 PROVE THE RESTORE, do not assume it. running/health/exec-true is not "serving": confirm the OLD
  # container runs the pinned image, was created from the restored (original) config-hash, and actually
  # answers HTTP on its OWN endpoint IP (its long name deliberately does not resolve, so the alias probe
  # cannot be used). Anything short of that is reported as an incomplete restore, never as "serving".
  local back_image back_hash
  back_image="$(printf '%s' "$(web_container_fingerprint)" | cut -d'|' -f2)"
  if [ "$back_image" != "$WEB_IMAGE" ]; then
    warn "ROLLBACK INCOMPLETE: the restored web container is not running the original image. Look now."
    return 1
  fi
  back_hash="$(web_container_config_hash)"
  if [ "$back_hash" != "$ORIG_CONFIG_HASH" ]; then
    warn "ROLLBACK INCOMPLETE: the restored web container's config-hash is not the original. Look now."
    return 1
  fi
  if ! tracy_endpoint_probe; then
    warn "ROLLBACK INCOMPLETE: the original compose is restored and the container is up, but HTTP on its own endpoint could not be confirmed. Look now."
    return 1
  fi
  warn "rolled back: the original compose is restored and the web service is serving from it again (verified on its own endpoint)"
  return 0
}

# ── phase-aware cleanup: never leave a swapped file unattended on an unexpected exit ──────────────
#
# The EXIT trap releases the lock and temp, and — for an unexpected failure or signal AFTER the swap
# but before completion — attempts the same drift-aware restore. A SIGKILL cannot be trapped; that
# hard-kill window is the one case a restore may not run, and is called out rather than papered over.
# ORDER MATTERS: the drift-aware restore runs FIRST and the owned lock is released only AFTER it, so
# the lock is held through the whole rollback and its probes — a concurrent run cannot race the site
# while it is being put back. The candidate temp is removed unconditionally (a failed preflight must
# leave none). The pending exit status is captured up front and re-asserted at the end so a restore's
# own commands do not rewrite what the script exits with (a trapped INT/TERM lands here as 130/143).
cleanup() {
  local rc=$?
  [ -n "${CANDIDATE_FILE:-}" ] && rm -f "$CANDIDATE_FILE" 2>/dev/null || true
  if [ "${PHASE:-start}" = swapped ]; then
    PHASE=done
    warn "unexpected exit after the swap (rc=$rc) — attempting a drift-aware restore"
    tracy_restore_original || warn "ROLLBACK FAILED during cleanup — the pre-migration compose is in the backup; look now."
  fi
  [ "${LOCK_OWNED:-0}" = 1 ] && rmdir "$LOCK" 2>/dev/null || true
  exit "$rc"
}

# ── main ─────────────────────────────────────────────────────────────────────────────────────────

tracy_dns_alias_main() {
  set -euo pipefail

  LABEL=""
  FROM_ALIAS=""
  APPLY=0
  PROJECT=""
  WEB_SERVICE="web"
  while [ $# -gt 0 ]; do
    case "$1" in
      --apply) APPLY=1; shift ;;
      --dry-run) APPLY=0; shift ;;
      --root) [ $# -ge 2 ] || die "--root needs a path"; TRACY_ROOT="$2"; shift 2 ;;
      --project) [ $# -ge 2 ] || die "--project needs a value"; PROJECT="$2"; shift 2 ;;
      --web-service) [ $# -ge 2 ] || die "--web-service needs a value"; WEB_SERVICE="$2"; shift 2 ;;
      # An OPAQUE selector for callers that must not carry a raw site label (the Actions workflow: a
      # private label would enter the run log). It is the already-derived bounded #165 alias, resolved
      # to exactly one local site on THIS host — see tracy_resolve_from_alias.
      --from-alias) [ $# -ge 2 ] || die "--from-alias needs a tracy-web-<hash> selector"; FROM_ALIAS="$2"; shift 2 ;;
      -h|--help) sed -n '2,60p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; return 0 ;;
      # Do NOT echo the option — an unsupported `--flag=value` could carry a private value into a log.
      -*) die "unsupported option — refusing (no private values echoed)" ;;
      *) [ -z "$LABEL" ] || die "one label at a time"; LABEL="$1"; shift ;;
    esac
  done

  # A project/service name is spliced into a path (project) and into dns-alias.mjs's service regex —
  # so it must be a plain slug, never something that means anything else in a path or a pattern.
  tracy_name_ok "$WEB_SERVICE" || die "unusable --web-service name — refusing before it reaches a path or a pattern"
  [ -z "$PROJECT" ] || tracy_name_ok "$PROJECT" || die "unusable --project name — refusing"

  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ROOT="${TRACY_ROOT:-/srv/tracy}"
  DOCKER="${TRACY_DOCKER:-docker}"
  command -v node >/dev/null 2>&1 || die "node is required (the structural read/patch is not a sed job)"
  # shellcheck source=./render-compose.sh
  . "$HERE/render-compose.sh"   # sourced only for tracy_web_dns_name / tracy_web_dns_alias (#165)

  # A selector resolves to the one local site whose #165 alias equals it — a raw label was never
  # supplied, so none entered a shared log. Exactly one match, or refuse.
  if [ -n "$FROM_ALIAS" ]; then
    [ -z "$LABEL" ] || die "give a label OR --from-alias, not both"
    LABEL="$(tracy_resolve_from_alias "$FROM_ALIAS")" || die "the selector did not resolve to exactly one local site — refusing (0 or ambiguous matches)"
  fi

  [ -n "$LABEL" ] || die "use: migrate-web-dns-alias.sh <label|--from-alias SELECTOR> [--apply] [--root DIR] [--project NAME] [--web-service NAME]"
  tracy_label_ok "$LABEL" || die "unusable label — refusing before any path is built"

  SITE_DIR="$ROOT/$LABEL"
  TARGET="site-$(target_id "$LABEL")"
  # `|| PROJECT=…` not `&& PROJECT=…`: under `set -e` a `[ … ] && …` that short-circuits returns
  # non-zero and would abort the script.
  [ -n "$PROJECT" ] || PROJECT="$LABEL"
  WEB="$LABEL-web-1"
  STAMP="$(date +%Y%m%d-%H%M%S)"
  CANDIDATE_FILE=""
  PHASE=start
  LOCK=""
  LOCK_OWNED=0

  # 🔒 ARM CLEANUP AS SOON AS THE GLOBALS IT READS EXIST — before preflight, not after. A dry-run that
  # dies mid-preflight (after building the candidate temp) must not leak it, and a catchable signal
  # must exit THROUGH cleanup rather than around it. INT/TERM re-exit into the EXIT trap so an ordinary
  # termination gets the same phase-aware restore; SIGKILL cannot be trapped and stays the one gap.
  trap cleanup EXIT
  trap 'exit 130' INT
  trap 'exit 143' TERM

  [ "$APPLY" = 1 ] || say "DRY RUN — the read-only preflight runs; nothing is mutated (pass --apply to act)"

  tracy_dns_alias_preflight
  # preflight exits 0 on the short-label and already-done no-ops.

  if [ "$APPLY" != 1 ]; then
    say "dry run: would back up the compose (0600), swap in the aliased candidate, and recreate ONLY the web service"
    [ -z "$CANDIDATE_FILE" ] || rm -f "$CANDIDATE_FILE"
    say "preflight passed — re-run with --apply to migrate $TARGET"
    return 0
  fi

  # ── APPLY ──
  # Cleanup was armed before preflight; the lock is taken now. Cleanup only removes a lock this run
  # actually owns (LOCK_OWNED), never another run's.
  # 🔒 ONE ACTOR AT A TIME. `mkdir` is atomic: a second run refuses rather than racing the swap.
  LOCK="$SITE_DIR/.dns-alias.lock"
  mkdir "$LOCK" 2>/dev/null || die "another migration holds the lock — refusing concurrent drift. Remove it only if no run is in progress."
  LOCK_OWNED=1

  # 🔒 REVALIDATE UNDER LOCK: refuse if the file, its RESOLVED config (env included), the container or
  # its image moved since preflight — immediately before the swap, so nothing raced the window between
  # preflight and here.
  [ "$(file_hash "$COMPOSE")" = "$ORIG_HASH" ] || die "the compose file changed since preflight — refusing concurrent drift rather than overwriting it"
  # The file hash does not move when only the .env does, yet the resolved config (and the container's
  # behaviour) does — so recompute the config-hash and require it still equals the preflight baseline.
  [ "$(web_config_hash_of_file "$COMPOSE")" = "$ORIG_CONFIG_HASH" ] || die "the resolved config (compose + env) changed since preflight — refusing rather than swapping against a moved baseline"
  local now_fp
  now_fp="$(web_container_fingerprint)"
  [ "$now_fp" = "$WEB_FINGERPRINT" ] || {
    case "$now_fp" in
      "$WEB_ID"'|'*) die "the web image changed since preflight — refusing rather than recreating onto a different image (a mutable tag moved)" ;;
      *) die "the web container changed since preflight — refusing rather than acting on a container that moved" ;;
    esac
  }
  [ "$(web_container_config_hash)" = "$ORIG_CONFIG_HASH" ] || die "the running container's config-hash moved since preflight — refusing"
  # 🔒 RE-INSPECT THE IMAGE TAG under the lock. The fingerprint above compares the running container's
  # own .Image, which does NOT move when a local mutable tag is reassigned — yet `--pull never` recreates
  # from whatever the tag resolves to NOW. So resolve the stored ref again and refuse, before any
  # mutation, if it no longer pins the running image (distinct from the fingerprint's runtime-image drift).
  [ "$("${DOCKER}" image inspect "$WEB_IMAGE_REF" --format '{{.Id}}' 2>/dev/null || true)" = "$WEB_IMAGE" ] \
    || die "the web image tag now resolves to a different image than preflight — refusing before any mutation (a mutable tag moved; --pull never would recreate onto it)"
  # 🔒 REVALIDATE THE CANDIDATE CONFIG-HASH before any mutation. An env-only drift since preflight moves
  # no file byte but does move the resolved hash; recompute the candidate's and refuse if it changed, so
  # the recreate cannot silently land on a drifted config.
  if [ "$FILE_ALREADY_CORRECT" = 0 ]; then
    [ "$(web_config_hash_of_file "$CANDIDATE_FILE")" = "$CAND_CONFIG_HASH" ] \
      || die "the candidate's resolved config-hash moved since preflight (env drift) — refusing before any mutation"
  fi

  # File already correct but the runtime lacks the alias: no swap, no backup — just recreate the web
  # container so the attachment takes effect. Otherwise: back up, swap, recreate.
  local force_recreate=""
  if [ "$FILE_ALREADY_CORRECT" = 1 ]; then
    say "the compose already carries the alias; recreating the web service to attach it at runtime"
    force_recreate="--force-recreate"
  else
    # Back the original up ONCE, 0600 (it sits beside a 0600 .env). Kept as the rollback target.
    BACKUP="$SITE_DIR/docker-compose.yml.pre-dns-alias.$STAMP"
    cp -a "$COMPOSE" "$BACKUP"
    chmod 600 "$BACKUP"
    say "original compose backed up (0600)"

    # 🔒 STAGE, THEN RENAME. A direct write truncates first; the rename is atomic within the
    # directory, so any failure leaves the original intact. The candidate keeps the mode of the
    # compose it replaces and carries no resolved secret — it is the text patch, not resolved config.
    local staged="$SITE_DIR/.docker-compose.yml.dns-alias.$$"
    cp -a "$CANDIDATE_FILE" "$staged"
    # Portable: re-apply the ORIGINAL mode with a numeric chmod (GNU `chmod --reference` is a no-op on
    # macOS and would leave the swapped file at cp's mode — the measured 0640→0600 regression).
    chmod "$ORIG_MODE" "$staged"
    # 🔒 HASH THE BYTES WE ARE ABOUT TO INSTALL, from the staged temp BEFORE the rename — so a
    # concurrent editor who writes the moment after `mv` cannot have their bytes mistaken for OUR
    # SWAPPED_HASH (rollback compares against this and must refuse to clobber such an edit). PHASE
    # flips to swapped in the same breath as the mutation, with no fallible command between mv and the
    # flip, so a swapped file can never be left behind as phase=start.
    SWAPPED_HASH="$(file_hash "$staged")"
    mv "$staged" "$COMPOSE"
    PHASE=swapped
    say "swapped in the aliased compose"
  fi

  # Recreate ONLY web. --no-deps leaves db/volumes/sessions/tokens/dsh untouched; --no-build and
  # --pull never keep this from fetching or building anything — the image on the host is the image.
  say "recreating only the web service (--no-deps --no-build --pull never) — db and volumes are not touched"
  # Compose's own stdout/stderr names containers (and, on a config error, paths/values) — suppress it
  # from shared logs; the exit code is the verdict, and the fixed status lines above are what we log.
  if ! ( cd "$SITE_DIR" && "${DOCKER}" compose --project-name "$PROJECT" up -d --no-deps --no-build --pull never $force_recreate "$WEB_SERVICE" >/dev/null 2>&1 ); then
    warn "recreate failed"
    if [ "$PHASE" = swapped ]; then
      # Do NOT claim the original was restored unless tracy_restore_original actually returned success —
      # it can itself fail (a concurrent post-swap edit, a moved image tag, an unprovable restore).
      if tracy_restore_original; then
        PHASE=done
        die "recreate of the web service failed — the site was rolled back to its original compose"
      fi
      PHASE=done
      die "recreate of the web service failed AND the rollback did not complete cleanly — look now"
    fi
    PHASE=done
    die "recreate of the web service failed — no swap had occurred, nothing to roll back"
  fi

  if tracy_verify_runtime; then
    PHASE=done
    printf '{"target":"%s","alias":"%s","webPort":%s,"applied":true}\n' "$TARGET" "$ALIAS" "${WEB_PORT:-null}"
    say "done: $TARGET now dials as its #165 alias on the tracy network"
    return 0
  fi

  warn "verification failed after recreate — rolling back"
  if [ "$PHASE" = swapped ]; then
    if tracy_restore_original; then PHASE=done; die "verification failed; the site was rolled back to its original compose"; fi
    PHASE=done
    die "verification failed AND the rollback did not complete cleanly — look now"
  fi
  # No swap happened (file was already correct); the recreate simply did not verify.
  PHASE=done
  die "verification failed after recreating the web service — no compose change was made to roll back"
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  tracy_dns_alias_main "$@"
fi
