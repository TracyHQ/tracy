#!/usr/bin/env bash
# Fake `iptables` for the infra layer: one rule per line in $FAKE_DOCKER_STATE/rules, written as
# "<chain> <args...>". Supports -C (check), -D (delete ONE match, like the real tool), -I/-A (add)
# and -S <chain> (list the chain the way the real tool prints it: `-N <chain>`, then `-A <rule>`).
# It models rule bookkeeping only; it proves nothing about Linux packet filtering.
S="$FAKE_DOCKER_STATE"
printf 'iptables %s\n' "$*" >> "$S/calls"
touch "$S/rules"
op="$1"; shift
line="$*"
case "$op" in
  -C) grep -qxF -- "$line" "$S/rules" ;;
  -D)
    grep -qxF -- "$line" "$S/rules" || { echo "iptables: Bad rule (does a matching rule exist in that chain?)." >&2; exit 1; }
    awk -v r="$line" '!d && $0 == r { d = 1; next } { print }' "$S/rules" > "$S/rules.tmp"; mv "$S/rules.tmp" "$S/rules" ;;
  -S)
    printf -- '-N %s\n' "$1"
    awk -v c="$1" '$1 == c { print "-A " $0 }' "$S/rules" ;;
  -I|-A) printf '%s\n' "$line" >> "$S/rules" ;;
  *) echo "unexpected iptables $op" >&2; exit 2 ;;
esac
