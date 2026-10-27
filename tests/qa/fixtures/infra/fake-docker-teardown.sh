#!/usr/bin/env bash
# Stateful fake `docker` for the infra layer's teardown cases. State lives in $FAKE_DOCKER_STATE:
#   networks   rows "<name> <subnet>"        volumes     rows "<name> <compose project>"
#   containers rows "<id> <name> <project>"  calls       every invocation, one per line
# Switches (empty files): down-fails (compose down exits 1), net-busy (network rm refuses),
# stuck (file listing volume names `volume rm` refuses).
# Filters follow the real CLI: `name=^x` is a prefix match, `name=x` a substring match,
# `name=^x$` an exact match (`network ls`, `volume ls`).
S="$FAKE_DOCKER_STATE"
printf '%s\n' "$*" >> "$S/calls"
on() { [ -e "$S/$1" ]; }
filter=""; prev=""
for a in "$@"; do [ "$prev" = "--filter" ] && filter="$a"; prev="$a"; done
drop() { awk -v p="$2" '$NF != p' "$S/$1" > "$S/$1.tmp"; mv "$S/$1.tmp" "$S/$1"; }
case "$1" in
  network)
    case "$2" in
      inspect) awk -v n="$3" '$1 == n { f = 1; print $2 } END { exit !f }' "$S/networks" ;;
      ls)
        case "$filter" in
          name=^*\$) n="${filter#name=^}"; n="${n%\$}"; awk -v n="$n" '$1 == n { print $1 }' "$S/networks" ;;
          *) echo "unexpected docker network ls filter $filter" >&2; exit 2 ;;
        esac
        exit 0 ;;
      rm)
        on net-busy && { echo "Error response from daemon: network $3 has active endpoints" >&2; exit 1; }
        awk -v n="$3" '$1 != n' "$S/networks" > "$S/networks.tmp"; mv "$S/networks.tmp" "$S/networks"; echo "$3" ;;
      *) echo "unexpected docker network $2" >&2; exit 2 ;;
    esac ;;
  compose)
    on down-fails && { echo "Error response from daemon: simulated down failure" >&2; exit 1; }
    proj="$(basename "$PWD")"; drop containers "$proj"; drop volumes "$proj"; exit 0 ;;
  ps)
    case "$filter" in
      name=^*) awk -v p="${filter#name=^}" 'index($2, p) == 1 { print $2 }' "$S/containers" ;;
      name=*) awk -v p="${filter#name=}" 'index($2, p) > 0 { print $2 }' "$S/containers" ;;
      label=com.docker.compose.project=*)
        awk -v p="${filter#label=com.docker.compose.project=}" '$NF == p { print $1 }' "$S/containers" ;;
      *) echo "unexpected docker ps filter $filter" >&2; exit 2 ;;
    esac
    exit 0 ;;
  rm)
    id=""; for a in "$@"; do case "$a" in -*|rm) ;; *) id="$a" ;; esac; done
    awk -v id="$id" '$1 != id && $2 != id' "$S/containers" > "$S/containers.tmp"; mv "$S/containers.tmp" "$S/containers" ;;
  volume)
    case "$2" in
      ls)
        case "$filter" in
          label=com.docker.compose.project=*) awk -v p="${filter#label=com.docker.compose.project=}" '$NF == p { print $1 }' "$S/volumes" ;;
          name=^*\$) n="${filter#name=^}"; n="${n%\$}"; awk -v n="$n" '$1 == n { print $1 }' "$S/volumes" ;;
          *) echo "unexpected docker volume ls filter $filter" >&2; exit 2 ;;
        esac
        exit 0 ;;
      rm)
        v="$3"
        if [ -e "$S/stuck" ] && grep -qxF "$v" "$S/stuck"; then
          echo "Error response from daemon: remove $v: volume is in use" >&2; exit 1
        fi
        awk -v v="$v" '$1 != v' "$S/volumes" > "$S/volumes.tmp"; mv "$S/volumes.tmp" "$S/volumes"; echo "$v" ;;
      *) echo "unexpected docker volume $2" >&2; exit 2 ;;
    esac ;;
  *) echo "unexpected docker $*" >&2; exit 2 ;;
esac
