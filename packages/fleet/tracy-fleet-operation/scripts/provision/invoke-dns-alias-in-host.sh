#!/usr/bin/env bash
#
# invoke-dns-alias-in-host — run the #165 bounded-alias migration WHERE THE SITES ACTUALLY LIVE:
# inside the ONE running `tracy-host` container, not on the CI runner that shells this out.
#
#   invoke-dns-alias-in-host.sh --selector tracy-web-<32hex> [--apply]
#
# ## Why this wrapper exists at all
#
# `migrate-web-dns-alias.sh` reads and patches a site's `docker-compose.yml` under the configured
# site PRIVATE root (roots.sh's `TRACY_PRIVATE_ROOT`: .env, compose.yml, the baseline repo). The dev
# deploy job runs ON the host and holds the Docker socket, so the FIRST cut invoked that script right
# on the runner. That was only correct while the private root was the legacy single `/srv/tracy` the
# runner container happens to mount. Plan 5 splits a host into TRACY_SITES_ROOT and a separately
# configured TRACY_PRIVATE_ROOT, and THE RUNNER DOES NOT NECESSARILY MOUNT THAT PRIVATE ROOT — so the
# migration would read an empty or wrong directory and "find no site" on a host that has the site.
#
# The one process that ALWAYS has the private root — at its real absolute name, same source and
# destination bind (deploy/compose.yml) — is `tracy-host` itself: it binds the socket AND
# `${TRACY_PRIVATE_ROOT}:${TRACY_PRIVATE_ROOT}`, and its image carries the SAME fleet scripts at
# `/opt/tracy-fleet/provision`. So this helper selects that container and runs the INSTALLED migration
# inside it, with the container's own private root — no SSH, no `docker cp`, no temp file written into
# the container, no host install, no new dependency, and no production path (deploy-prod never calls
# this).
#
# ## Bounded by construction
#
#   * ONE running FULL 64-hex container id for the EXACT Compose project `tracy` / service
#     `tracy-host`. Zero (stopped/absent), several (ambiguous) or a non-full-hex id is a refusal.
#   * That container is re-validated by INSPECT, not trusted from the `ps` filter: the payload must be
#     EXACTLY ONE object whose `.Id` is the id we selected, its compose labels must be
#     project=tracy/service=tracy-host, it must be Running, it must declare `TRACY_PRIVATE_ROOT` EXACTLY
#     ONCE (a duplicate is refused, not last-wins) as an absolute, control-char-free, NORMALIZED,
#     NON-root path (no `.`/`..`/empty/trailing-slash segment, never `/`), and it must carry a bind
#     whose SOURCE AND DESTINATION are EXACTLY that root — a translated or one-sided mount is refused.
#   * String shape does not prove the root is usable, so a FIXED Node preflight runs INSIDE that exact
#     container: its runtime `TRACY_PRIVATE_ROOT` must equal the inspected root and an `lstat` must show
#     a plain, NON-SYMLINK, readable and traversable directory. A missing/file/symlink/mismatched root
#     is refused there, before the migration reads it — with output discarded so no path can leak.
#   * Before invoking anything, the three scripts the migration is (migrate-web-dns-alias.sh,
#     dns-alias.mjs, render-compose.sh) are digest-checked: the copy INSTALLED in the container must
#     equal this checkout byte for byte, or the source is stale and the run refuses. The deploy step
#     already shipped this commit's images before this step, so a match is the normal case; a mismatch
#     means the container is running an older build than the checkout drives, which must not be acted
#     on with this checkout's contract.
#   * The opaque #165 selector is passed as DATA — one `--from-alias` argv into `docker exec`, never
#     spliced into shell text — and dry-run is the default; only an explicit `--apply` mutates. Every
#     guard the migration itself keeps (core ownership, image pin, config-hash drift, lock, rollback)
#     is untouched: this wrapper only chooses the container and the root, then hands off.
#   * The migration is BOUNDED FROM THE INSIDE with GNU `timeout` (preflighted for availability, never
#     installed): TERM at a fixed generous deadline well under the 20-minute job timeout, then SIGKILL
#     after a bounded grace so the migration's own cleanup/rollback can run first. `docker exec` does
#     not reliably kill the remote process when this client is TERM'd, so the migration's own SIGTERM
#     cleanup is not enough at the workflow boundary; the remote deadline is. HONEST LIMIT: this bounds
#     the runtime, it does NOT cancel immediately — a client disconnect may leave the bounded command
#     running remotely until its deadline. `timeout` passes the migration's own exit status through.
#   * Errors are SANITIZED: no selector, no resolved path, no raw `docker`/`compose` payload reaches
#     this log — only a fixed technical reason. The selector is opaque and the private root is a host
#     layout detail; neither belongs in a shared run log.
#
# ## Environment (all overridable so this runs off a fleet host, e.g. in a test)
#
#   TRACY_DOCKER      docker             the docker CLI (a test hands it a stub)
#   TRACY_FLEET_DIR   /opt/tracy-fleet   where the scripts are INSTALLED inside the container
#                                        (the migration lives at $TRACY_FLEET_DIR/provision)

say()  { echo "dns-alias-host: $*"; }
warn() { echo "dns-alias-host: !! $*" >&2; }
die()  { echo "dns-alias-host: $*" >&2; exit 1; }

# A portable sha256 of a checkout file — sha256sum on the fleet host, shasum on macOS (so the test
# runs there too). Only the digest, never the file's bytes. Matched against the container's own
# `sha256sum` over the installed copy, which prints the same hex.
file_hash() {
  { sha256sum "$1" 2>/dev/null || shasum -a 256 "$1"; } | cut -d' ' -f1
}

# 🔒 FIXED CODE, STDIN FOR DATA, THE CID AS ARGV. The whole `docker inspect` payload is fed on STDIN
# and the selected full CID as argv[1] — never spliced into shell. It proves, in one read:
#   * the payload is EXACTLY ONE inspect object whose `.Id` equals the CID we selected from `ps`
#     (so a raced/renamed/foreign container cannot be validated in place of the one we picked);
#   * the compose labels are EXACTLY project=tracy / service=tracy-host, and it is Running;
#   * there is EXACTLY ONE `TRACY_PRIVATE_ROOT` env entry (a duplicate is refused, not last-wins), it
#     is absolute, carries NO control characters, and is NORMALIZED and NON-root (no empty/`.`/`..`/
#     trailing segment, never `/`);
#   * a bind mount exists whose Source AND Destination are EXACTLY that root.
# On success it prints ONLY the validated root; otherwise it exits with a category code the caller maps
# to a sanitized message (it prints no path, no label value, no docker payload).
PARSE_CODE='
const data = require("node:fs").readFileSync(0, "utf8")
let arr
try { arr = JSON.parse(data) } catch { process.exit(20) }
if (!Array.isArray(arr) || arr.length !== 1) process.exit(21)
const c = arr[0]
if (!c || typeof c !== "object") process.exit(20)
const wantId = process.argv[1]
if (!wantId || c.Id !== wantId) process.exit(22)
const labels = (c.Config && c.Config.Labels) || {}
if (labels["com.docker.compose.project"] !== "tracy" || labels["com.docker.compose.service"] !== "tracy-host") process.exit(10)
if (!(c.State && c.State.Running === true)) process.exit(13)
const env = (c.Config && c.Config.Env) || []
const roots = []
for (const e of env) {
  const s = String(e)
  const i = s.indexOf("=")
  if (i > 0 && s.slice(0, i) === "TRACY_PRIVATE_ROOT") roots.push(s.slice(i + 1))
}
if (roots.length > 1) process.exit(14)
const root = roots[0]
if (!root || root[0] !== "/") process.exit(11)
if (/[\x00-\x1f\x7f]/.test(root)) process.exit(11)
// Normalized, non-root: every segment after the leading slash is non-empty and not `.`/`..`. An empty
// segment catches `//` and a trailing slash; `/` itself yields a single empty segment and is refused.
const segs = root.split("/").slice(1)
if (segs.length === 0 || segs.some((s) => s === "" || s === "." || s === "..")) process.exit(11)
const mounts = Array.isArray(c.Mounts) ? c.Mounts : []
const bound = mounts.some((m) => m && m.Type === "bind" && m.Source === root && m.Destination === root)
if (!bound) process.exit(12)
process.stdout.write(root)
'

# 🔒 A FIXED PREFLIGHT RUN INSIDE THE EXACT CONTAINER. String-shape and mount labels do not prove the
# root is a real, usable directory THERE at run time — a mount can name a path that is missing, a file,
# or a symlink, and the container env can disagree with what inspect reported. So, in the very container
# the migration will run in, confirm: its runtime `TRACY_PRIVATE_ROOT` equals the inspected root, and an
# `lstat` shows a PLAIN, NON-SYMLINK, readable and traversable directory. The root is passed as argv[1];
# the program prints nothing and only signals a category through its exit code, so no path can leak.
PREFLIGHT_CODE='
const fs = require("node:fs")
const root = process.argv[1]
if (!root || process.env.TRACY_PRIVATE_ROOT !== root) process.exit(31)
let st
try { st = fs.lstatSync(root) } catch { process.exit(32) }
if (st.isSymbolicLink()) process.exit(33)
if (!st.isDirectory()) process.exit(34)
try { fs.accessSync(root, fs.constants.R_OK | fs.constants.X_OK) } catch { process.exit(35) }
process.exit(0)
'

tracy_invoke_main() {
  set -euo pipefail

  local SELECTOR="" MODE="dry-run"
  while [ $# -gt 0 ]; do
    case "$1" in
      --selector) [ $# -ge 2 ] || die "--selector needs a tracy-web-<hash> value"; SELECTOR="$2"; shift 2 ;;
      --apply) MODE="apply"; shift ;;
      --dry-run) MODE="dry-run"; shift ;;
      # Do NOT echo the option — an unsupported `--flag=value` could carry a private value into a log.
      -*) die "unsupported option — refusing (no private values echoed)" ;;
      *) die "unexpected argument — refusing (no private values echoed)" ;;
    esac
  done
  [ -n "$SELECTOR" ] || die "use: invoke-dns-alias-in-host.sh --selector tracy-web-<hash> [--apply]"

  local HERE DOCKER FLEET INSTALLED
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  DOCKER="${TRACY_DOCKER:-docker}"
  FLEET="${TRACY_FLEET_DIR:-/opt/tracy-fleet}"
  INSTALLED="$FLEET/provision"
  command -v node >/dev/null 2>&1 || die "node is required to validate the tracy-host container (structural, not a sed job)"

  # 🔒 ONE RUNNING tracy-host, BY EXACT COMPOSE LABELS — the full id, never a name guess. `docker ps`
  # lists only running containers, so a stopped one is zero matches (a refusal), and two is ambiguous.
  local ids count cid
  ids="$("$DOCKER" ps --no-trunc -q \
    --filter 'label=com.docker.compose.project=tracy' \
    --filter 'label=com.docker.compose.service=tracy-host' 2>/dev/null || true)"
  count="$(printf '%s' "$ids" | grep -c . || true)"
  if [ "$count" = 0 ]; then
    die "no running tracy-host container (project=tracy/service=tracy-host) — refusing (is the stack up?)"
  fi
  [ "$count" = 1 ] || die "$count tracy-host containers match the compose project/service — refusing an ambiguous selection"
  cid="$(printf '%s' "$ids" | sed -n 1p)"
  # 🔒 A FULL 64-hex CONTAINER ID, or nothing. `--no-trunc` yields the full id; anything shorter or
  # non-hex means the `ps` result was not the single id we expect, and every check below keys off it.
  [ "${#cid}" -eq 64 ] || die "the container selection is not a full container id — refusing"
  case "$cid" in *[!0-9a-f]*) die "the container selection is not a valid container id — refusing" ;; esac

  # 🔒 VALIDATE BY INSPECT, don't trust the ps filter: EXACTLY ONE object whose `.Id` is this id, its
  # labels/running state, a safe normalized non-root TRACY_PRIVATE_ROOT (single entry, no control
  # chars), and an exact same-source/destination bind. The payload stays in memory; only the validated
  # root is returned and a refusal names a category — no path, label value or docker payload is logged.
  local inspect_json root parse_rc
  inspect_json="$("$DOCKER" inspect "$cid" 2>/dev/null || echo '[]')"
  set +e
  root="$(printf '%s' "$inspect_json" | node -e "$PARSE_CODE" "$cid")"
  parse_rc=$?
  set -e
  case "$parse_rc" in
    0) : ;;
    10) die "the selected container's compose labels are not project=tracy/service=tracy-host — refusing" ;;
    11) die "the tracy-host container exposes no safe, normalized non-root private root — refusing an unsafe root" ;;
    12) die "the tracy-host container has no exact same-source/destination bind for its private root — refusing an unsafe mount" ;;
    13) die "the selected tracy-host container is not running — refusing" ;;
    14) die "the tracy-host container declares TRACY_PRIVATE_ROOT more than once — refusing an ambiguous root" ;;
    21) die "docker inspect did not return exactly one object for the selected id — refusing" ;;
    22) die "the inspected object's id does not match the selected container — refusing" ;;
    *) die "cannot read the tracy-host container's configuration — refusing" ;;
  esac
  [ -n "$root" ] || die "the tracy-host container exposes no private root — refusing"
  say "selected the running tracy-host container; its private root is validated (single normalized non-root entry, same-source/destination bind, id matched)"

  # 🔒 THE INSTALLED MIGRATION MUST BE THIS CHECKOUT. The deploy step already shipped this commit's
  # images before this step, so the container carries this commit's scripts; prove it by digest before
  # running anything. A mismatch is a stale image driven by a newer checkout — refuse rather than run a
  # contract the installed bytes do not implement. Digests only; no bytes, no path, no payload logged.
  local name want have
  for name in migrate-web-dns-alias.sh dns-alias.mjs render-compose.sh; do
    [ -f "$HERE/$name" ] || die "the checkout is missing a migration script — refusing"
    want="$(file_hash "$HERE/$name")"
    [ -n "$want" ] || die "cannot hash the checkout's migration scripts — refusing"
    have="$("$DOCKER" exec "$cid" sha256sum "$INSTALLED/$name" 2>/dev/null | awk '{print $1; exit}' || true)"
    [ -n "$have" ] || die "cannot read the installed migration scripts inside the tracy-host container — refusing"
    [ "$want" = "$have" ] || die "the installed migration scripts do not match this checkout — refusing stale source"
  done
  say "the installed migration scripts match this checkout (migrate/dns-alias/render-compose digests)"

  # 🔒 PROVE THE ROOT IS USABLE IN THE EXACT CONTAINER, before the migration reads it. Runtime env must
  # equal the inspected root, and an lstat must show a plain, non-symlink, readable/traversable directory.
  # The root is argv, output is discarded and stderr is suppressed — so a Docker startup error cannot
  # print a raw path; only the exit code (a fixed category) reaches the log.
  local pf_rc
  set +e
  "$DOCKER" exec "$cid" node -e "$PREFLIGHT_CODE" "$root" >/dev/null 2>&1
  pf_rc=$?
  set -e
  case "$pf_rc" in
    0) : ;;
    31) die "the container's runtime private root disagrees with its inspected root — refusing" ;;
    32) die "the private root is not present inside the container — refusing" ;;
    33) die "the private root is a symlink inside the container — refusing an unsafe root" ;;
    34) die "the private root is not a directory inside the container — refusing an unsafe root" ;;
    35) die "the private root is not a readable, traversable directory inside the container — refusing" ;;
    *) die "the in-container preflight for the private root failed — refusing" ;;
  esac
  say "the private root is a readable, traversable, non-symlink directory inside the container"

  # 🔒 A DEADLINE THE REMOTE PROCESS OWNS ITSELF. `docker exec` runs a process INSIDE the container; if
  # this client is TERM'd (a cancelled/expired job), the daemon does not reliably tear that process
  # down — so the migration's own phase-aware SIGTERM cleanup, which fires on THIS client, is not
  # enough at the workflow boundary. Bound it from the inside with GNU `timeout`: it sends SIGTERM at
  # the deadline (so the migration's cleanup/rollback runs), then SIGKILL after a fixed grace if it has
  # not exited. The bound is generous but well under the 20-minute job timeout, leaving the job room to
  # report. `timeout` passes the command's own exit status through when it finishes in time, so the
  # migration's exit codes and every guard are preserved; a deadline surfaces as 124 (TERM) or 137
  # (KILL), which fails the wrapper.
  #
  # ⚠ HONEST LIMIT: this bounds the REMOTE runtime, it does not make cancellation immediate. If this
  # client disconnects, the daemon keeps running the bounded command until ITS OWN deadline — up to the
  # bound below plus the kill grace. There is no immediate-cancellation guarantee here; the deadline is
  # the guarantee.
  local TIMEOUT_BOUND=17m TIMEOUT_KILL_GRACE=30s
  # Preflight the tool itself — GNU `timeout` ships in the tracy-host image's coreutils; if it is
  # absent we refuse rather than run unbounded or install anything.
  "$DOCKER" exec "$cid" timeout --version >/dev/null 2>&1 \
    || die "GNU timeout is not available inside the tracy-host container — refusing rather than running unbounded (no install)"

  # Hand off to the INSTALLED migration, inside the container, with the container's OWN private root.
  # The selector is DATA — one quoted --from-alias argv into `docker exec`, never spliced into shell.
  # Dry-run by default; --apply only when explicitly asked. The migration sanitizes its own output and
  # keeps every ownership/image/drift/lock/rollback guard; this wrapper adds none and removes none.
  # Branch on the mode rather than expand a maybe-empty array: `"${arr[@]}"` on an empty array is an
  # "unbound variable" under `set -u` on bash 3.2 (macOS), and this script runs there in tests.
  say "running the #165 migration inside tracy-host against its mounted private root (mode: $MODE, bounded ${TIMEOUT_BOUND}+${TIMEOUT_KILL_GRACE})"
  if [ "$MODE" = apply ]; then
    "$DOCKER" exec "$cid" timeout --signal=TERM --kill-after="$TIMEOUT_KILL_GRACE" "$TIMEOUT_BOUND" \
      bash "$INSTALLED/migrate-web-dns-alias.sh" --from-alias "$SELECTOR" --root "$root" --apply
  else
    "$DOCKER" exec "$cid" timeout --signal=TERM --kill-after="$TIMEOUT_KILL_GRACE" "$TIMEOUT_BOUND" \
      bash "$INSTALLED/migrate-web-dns-alias.sh" --from-alias "$SELECTOR" --root "$root"
  fi
}

if [ "${BASH_SOURCE[0]}" = "$0" ]; then
  tracy_invoke_main "$@"
fi
