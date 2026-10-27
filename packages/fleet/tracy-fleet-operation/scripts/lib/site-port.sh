#!/usr/bin/env bash
#
# Which port a new site is handed, and the four questions that decide it.
#
# Sourced by `provision/provision.sh`, never executed. It lives here rather than inside that script
# because the allocator is the one piece of provisioning a test can exercise without standing a
# site up — and it has now been wrong twice in a way that only showed as a container refusing to
# start, minutes into a build, after the database had already been imported.
#
# 🔒 FOUR SOURCES, AND NONE OF THEM MAY FAIL SILENTLY. This block used to ask `ss` and the `.env`
# files, and on 11/09 it handed a brand-new site port 8081 while another site was serving on it —
# `docker compose up` then died with `Bind for 127.0.0.1:8081 failed: port is already allocated`,
# after the database container had already been created.
#
# Both halves of that old check were blind, each in its own way:
#   * `ss` IS NOT INSTALLED in the tracy-host image (measured: `command -v ss` → nothing). The
#     `2>/dev/null` on that line turned "I cannot see" into "nothing is listening" — a fail-OPEN,
#     the exact shape this repo refuses everywhere else.
#   * the `.env` scan only reads `$ROOT`, and a machine can carry sites under more than one root,
#     and in a container it only sees the roots that were mounted in.
#
# So: read `/proc/net/tcp{,6}` for what is listening (no tool to install), ask DOCKER for every
# published port it has promised (`docker ps -a` includes STOPPED containers, whose bindings are
# still real the moment someone starts them), keep the `.env` scan for a site whose container is
# gone but whose directory still names a port — and PROBE the candidate on the machine that
# publishes it. If none of the first three can be read, this refuses instead of guessing.
#
# Since TracyHQ/tch#361 `ss` is asked AGAIN where it exists and answers — as a second witness to
# `/proc/net/tcp`, counted as a source only when it really ran (`tracy_ss_listening_ports`). And a
# port can still be taken between the pick and `docker compose up`, so the start retries once on a
# new port when that is the failure (`tracy_compose_up_site`, bottom of this file).

# ── The pool sites are handed from, and the ports that are never in it ─────────────────────────
#
# 🔒 THE POOL USED TO BE 8081-8999, AND TRACY'S OWN CONTROL PORT (8090) SAT INSIDE IT. That is not
# a near miss: it means a new site could be handed the door tracy-host answers on. Nothing caught
# it on a laptop, where the pool is empty; on production port 8090 was already held by a customer
# site (`co-ba-bakery-web-1`) the first time anyone looked, so tracy-host — `network_mode: host`,
# binding 0.0.0.0 — would have failed EADDRINUSE at boot, before any health probe could say why.
#
# Two changes, and BOTH are needed. The pool moved clear of Tracy's own block; and the block is
# ALSO named here and refused explicitly. The move alone would be a range that merely happens not
# to overlap today — one edit to either number and it silently does again. The reserved list is
# the part that keeps saying no.
#
# 517xx is Tracy's block, the family dsh's long-standing 51700 already started:
#   51700 tracy-dsh · 51710 tracy-web · 51720 tracy-host · 51730 postgres · 51740 minio
# Ports are also deliberately UNUSUAL. 8080/8090/9000/5433 are the most-squatted ports on a Linux
# box; a host that runs anything besides Tracy will collide with them eventually, and the symptom
# is a container that refuses to start with a message about an address, not about Tracy.
SITE_PORT_MIN="${SITE_PORT_MIN:-52000}"
SITE_PORT_MAX="${SITE_PORT_MAX:-52999}"
TRACY_RESERVED_PORTS="${TRACY_RESERVED_PORTS:-51700 51710 51720 51730 51740}"

tracy_port_reserved() {
  local p="$1" r
  for r in $TRACY_RESERVED_PORTS; do
    [ "$p" = "$r" ] && return 0
  done
  return 1
}

tracy_listening_ports() {
  local any=0 f hex
  for f in "${TRACY_PROC_NET:-/proc/net/tcp}" "${TRACY_PROC_NET6:-/proc/net/tcp6}"; do
    [ -r "$f" ] || continue
    any=1
    # `st == 0A` is TCP_LISTEN; field 2 is `<hex local address>:<hex port>`.
    for hex in $(awk 'NR > 1 && $4 == "0A" { split($2, a, ":"); print a[2] }' "$f"); do
      printf '%d\n' "0x$hex"
    done
  done
  [ "$any" = 1 ]
}

# What `ss` says is listening, when this machine has `ss` at all. A fifth look at the same question
# `/proc/net/tcp` answers, added after TracyHQ/tch#361: a site was handed 52060 and `docker compose
# up` died 112 s later with `failed to bind host port 127.0.0.1:52060/tcp: address already in use`.
# `ss` reads the kernel through netlink rather than a text file, so it is a second witness for the
# same namespace — never a replacement for the probe below, which is the only look at the machine
# from inside a bridged container.
#
# ⚠ ABSENT IS NOT "NOTHING IS LISTENING". The tracy-host image does not ship `ss` (the header says
# how that once read as an empty answer). No `ss`, or an `ss` that fails, returns non-zero so the
# caller counts it as a source it could NOT read — it never adds an empty list as if it had.
#
# Every listening port is kept, whatever address it is bound to: a listener on some other interface
# does not stop a bind on 127.0.0.1, but skipping one more port costs nothing, and telling the
# address shapes apart (`0.0.0.0`, `*`, `[::]`, `127.0.0.53%lo`) is a parser that can be wrong.
tracy_ss_listening_ports() {
  command -v ss >/dev/null 2>&1 || return 1
  local listing
  # Not `-H`: older iproute2 has no such flag. The header row is dropped by its first word instead.
  listing="$(ss -ltn 2>/dev/null)" || return 1
  printf '%s\n' "$listing" | awk '$1 != "State" && NF >= 4 { n = split($4, a, ":"); if (a[n] ~ /^[0-9]+$/) print a[n] }'
}

tracy_docker_published_ports() {
  command -v docker >/dev/null 2>&1 || return 1
  local ids
  ids="$(docker ps -aq 2>/dev/null)" || return 1
  [ -n "$ids" ] || return 0
  # shellcheck disable=SC2086
  # `|| true` on the grep, not laziness: a machine whose containers publish NOTHING makes grep
  # exit 1, and under `set -o pipefail` that would read as "docker could not answer" — turning a
  # true answer (no ports published) into a missing source.
  docker inspect $ids --format '{{json .HostConfig.PortBindings}}' 2>/dev/null \
    | { grep -oE '"HostPort":"[0-9]+"' || true; } | cut -d'"' -f4
}

# 🔒 /proc/net/tcp IS THE CONTAINER'S NETWORK NAMESPACE, NOT THE MACHINE'S — and on a laptop those
# are different. On a fleet host tracy-host runs with host networking, so the file already lists
# what the machine listens on. Under `deploy/compose.macos.yml` it sits on the compose bridge: the
# file lists this container's own sockets, `tracy_docker_published_ports` lists Docker's, and a
# plain process on macOS is invisible to both. Measured 15/09 on the local stand: two node servers
# (an EmDash build, another agent's site) held 52013 and 52014, the allocator handed both out, and
# `docker compose up` failed with "address already in use" after the import — leaving a half-built
# site whose creation record still read `provisioning`.
#
# So the candidate is also probed on the machine that publishes the ports. `host.docker.internal`
# is that machine as seen from inside a bridged container; where the name does not resolve (a
# fleet host, host networking) the probe stands down and the answer is exactly what it was before.
tracy_port_answers_on_host() {
  local port="$1" host="${TRACY_PORT_PROBE_HOST:-host.docker.internal}" limit
  # A name that does not resolve fails the connect at once, which IS the stand-down: no separate
  # resolver check, because `getent` is not everywhere this file is read (the tests run it on
  # macOS, the image runs it on Debian). `timeout` bounds a resolver that black-holes instead of
  # refusing; where it is absent — again macOS — the bare connect is what the tests need anyway.
  limit="$(command -v timeout || command -v gtimeout || true)"
  if [ -n "$limit" ]; then
    "$limit" 1 bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null
  else
    bash -c "exec 3<>/dev/tcp/$host/$port" 2>/dev/null
  fi
}

# The first port in the pool nothing can be found holding. `$1` is the sites root whose `.env`
# files name ports already spoken for. Echoes the port; exits non-zero when none is free, and when
# the machine cannot be read at all.
tracy_pick_site_port() {
  local root="$1" taken sources=0 candidate
  taken="$(mktemp)"
  # shellcheck disable=SC2064
  trap "rm -f '$taken'" RETURN
  tracy_listening_ports >> "$taken" && sources=$((sources + 1))
  tracy_docker_published_ports >> "$taken" && sources=$((sources + 1))
  tracy_ss_listening_ports >> "$taken" && sources=$((sources + 1))
  if [ "$sources" -eq 0 ]; then
    echo "!! cannot see which ports are in use on this machine: /proc/net/tcp is unreadable, ss is absent or failed, AND docker did not answer." >&2
    echo "!! refusing to allocate a port blind — a wrong answer here puts two sites on one port." >&2
    return 1
  fi
  for candidate in $(seq "$SITE_PORT_MIN" "$SITE_PORT_MAX"); do
    # The .env files see a site that is merely stopped AND whose container is gone — its port is
    # still spoken for, because its ingress rule still names it and it comes back on `up`.
    if ! tracy_port_reserved "$candidate" &&
       ! grep -qx "$candidate" "$taken" &&
       ! grep -rqs "^HOST_PORT=$candidate$" "$root"/*/.env &&
       ! tracy_port_answers_on_host "$candidate"; then
      echo "$candidate"
      return 0
    fi
  done
  echo "no free port in $SITE_PORT_MIN-$SITE_PORT_MAX" >&2
  return 1
}

# ── When the port is taken anyway ────────────────────────────────────────────────────────────
#
# 🔒 CHECKING AT PICK TIME DOES NOT CLOSE THE RACE, IT NARROWS IT. Between the pick and `docker
# compose up` a cold provision spends minutes (TracyHQ/tch#361: 112 s — fetch, import, configure),
# and anything on the machine may take the port in that window. So the start itself is allowed ONE
# more try on a freshly picked port — and only for the one failure a new port can fix.

# Did this `docker compose up` output refuse THIS host port? `$1` is the port, `$2` the file the
# output was saved to. Both shapes Docker has used are matched, on one line with the port:
#   failed to bind host port 127.0.0.1:52060/tcp: address already in use
#   Bind for 127.0.0.1:8081 failed: port is already allocated
# A bind error naming a DIFFERENT port is not ours to fix by moving this one.
tracy_port_bind_conflict() {
  local port="$1" file="$2"
  grep -E ":${port}([^0-9]|$)" "$file" 2>/dev/null |
    grep -Eq 'address already in use|port is already allocated'
}

# Pick a new port for the site in `$1` and write it where the stack reads it. `$2` is the sites root
# the picker scans. Under the same lock as the first pick, for the same reason: the allocation is
# only real once it is written down, and a second provision must not see the port as free between
# the pick and the write. Only the `HOST_PORT=` line of `.env` changes — by then the file also
# holds the database password, the platform and the mail token, and losing any of them is a worse
# failure than the one being recovered from. Sets and exports HOST_PORT: compose prefers the
# shell's value over `.env`, so a stale exported value would publish the OLD port again.
tracy_repick_site_port() {
  local dir="$1" root="$2" picked
  picked="$(
    (
      flock 9
      port="$(tracy_pick_site_port "$root")" || exit 1
      next="$(mktemp "$dir/.env.XXXXXX")" || exit 1
      sed "s/^HOST_PORT=.*/HOST_PORT=$port/" "$dir/.env" > "$next" || { rm -f "$next"; exit 1; }
      chmod 600 "$next"
      mv "$next" "$dir/.env"
      echo "$port"
    ) 9>"${TRACY_PORT_LOCK:-/var/lock/tracy-fleet-ports.lock}"
  )" || return 1
  [ -n "$picked" ] || return 1
  HOST_PORT="$picked"
  export HOST_PORT
}

# `docker compose up -d` in the site directory `$1`, retried ONCE on a new port when the daemon
# refused to bind HOST_PORT — and only when `$3` is 1, meaning this run handed that port out.
#
# 🔒 A PORT THIS RUN DID NOT PICK IS NEVER MOVED. A caller that pins HOST_PORT, or a site whose
# `.env` already named one, may already have a tunnel ingress rule (or a caller's record) naming
# that port; moving it here would leave the site answering on a port nothing routes to. That case
# fails exactly as before, with the daemon's error. A freshly picked port has no ingress yet —
# provision.sh publishes it only after this returns — so the new port is the one every later line
# (front-page check, ingress, TRACY_RESULT) reads from HOST_PORT.
#
# Everything else fails once, with compose's own exit code: a pull that timed out or an image that
# does not exist is not made better by a second try on another port.
tracy_compose_up_site() {
  local dir="$1" root="$2" picked_here="$3" out rc=0 old
  out="$(mktemp)"
  { ( cd "$dir" && docker compose up -d ) 2>&1 | tee "$out"; } || rc=$?
  if [ "$rc" -eq 0 ]; then
    rm -f "$out"
    return 0
  fi
  if [ "$picked_here" != 1 ] || ! tracy_port_bind_conflict "$HOST_PORT" "$out"; then
    rm -f "$out"
    return "$rc"
  fi
  rm -f "$out"
  old="$HOST_PORT"
  tracy_repick_site_port "$dir" "$root" || {
    echo "!! port $old was taken before the site could start, and no other port could be picked" >&2
    return "$rc"
  }
  echo "!! port $old was taken before the site could start — retrying once on port $HOST_PORT" >&2
  ( cd "$dir" && docker compose up -d )
}
