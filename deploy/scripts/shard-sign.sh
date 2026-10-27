#!/usr/bin/env bash
#
# shard-sign — the three headers of one signed call on the shard channel (tracy-web <-> tracy-web).
#
#   SHARD_SECRET=... shard-sign.sh --method GET|POST <path> [<body-file>] [--timestamp <ms>] [--nonce <32 hex>] [--prefix x-shard]
#
# Prints three lines, `<prefix>-timestamp: ...`, `<prefix>-nonce: ...`, `<prefix>-signature: ...`,
# ready for `curl -H`. The canonical string is the shard channel's (the shard interface contract,
# section 2; apps/tracy-web/src/lib/shard-channel.js signs and verifies the same bytes):
#
#     <timestamp ms>\n<nonce>\n<METHOD>\n<path without query>\n<sha256hex(body)>
#
# METHOD is the REAL method: GET for /_shard/status, POST for /api/shards/<name>/check. That is the
# one difference from the host channel, whose string always carries the literal POST
# (apps/tracy-host/src/auth.js); for a POST the two strings are the same, byte for byte, which
# scripts/test/shard-sign-interop.test.mjs uses as an anchor. No body file means the empty body (a
# GET has none); the body hash is over the raw bytes of the file. The path is signed without its
# query string, so a path containing `?` is refused (signed doors take no query). The nonce is 32
# lowercase hex.
#
# SHARD_SECRET is 64 lowercase hex (`openssl rand -hex 32`) and the HMAC key is the UTF-8 bytes of
# that STRING (`openssl dgst -hmac "$SHARD_SECRET"`), never the 32 bytes it spells. It comes from the
# environment, never from argv. It still reaches `openssl dgst -hmac` as an argument, visible to
# `ps` for the life of that one process to users of THIS VM only (site and dsh containers have their
# own PID namespace) - the trade host-dsh-init.sh already makes.
set -euo pipefail
# Byte ranges in the patterns below ([0-9a-f]) must not follow a locale's collation.
export LC_ALL=C

PREFIX=x-shard
METHOD=""
TS=""
NONCE=""
SIGN_PATH=""
BODY_FILE=""

usage() { sed -n '3,6p' "$0" | sed 's/^# \{0,1\}//'; }

while [ $# -gt 0 ]; do
  case "$1" in
    --method) METHOD="${2:?--method needs GET or POST}"; shift ;;
    --timestamp) TS="${2:?--timestamp needs a value}"; shift ;;
    --nonce) NONCE="${2:?--nonce needs a value}"; shift ;;
    --prefix) PREFIX="${2:?--prefix needs a value}"; shift ;;
    -h|--help) usage; exit 0 ;;
    -*) echo "shard-sign: unknown option $1" >&2; exit 2 ;;
    *)
      if [ -z "$SIGN_PATH" ]; then SIGN_PATH="$1"
      elif [ -z "$BODY_FILE" ]; then BODY_FILE="$1"
      else echo "shard-sign: too many arguments" >&2; exit 2
      fi ;;
  esac
  shift
done

[ -n "${SHARD_SECRET:-}" ] || { echo "shard-sign: SHARD_SECRET is not set" >&2; exit 2; }
# Never echo the value: it is a secret, and a wrong one is most often a truncated paste of the right one.
case "$SHARD_SECRET" in
  *[!0-9a-f]*) echo "shard-sign: SHARD_SECRET must be 64 lowercase hex characters" >&2; exit 2 ;;
esac
[ "${#SHARD_SECRET}" -eq 64 ] || { echo "shard-sign: SHARD_SECRET must be 64 lowercase hex characters" >&2; exit 2; }
case "$METHOD" in
  GET|POST) ;;
  '') echo "shard-sign: --method GET|POST is required: the signed string carries the real method" >&2; exit 2 ;;
  *) echo "shard-sign: --method is GET or POST (got '$METHOD')" >&2; exit 2 ;;
esac
case "$SIGN_PATH" in /*) ;; *) echo "shard-sign: <path> must start with / (got '$SIGN_PATH')" >&2; exit 2 ;; esac
case "$SIGN_PATH" in *'?'*) echo "shard-sign: sign the path without its query string" >&2; exit 2 ;; esac
[ "$METHOD" = POST ] || [ -z "$BODY_FILE" ] || { echo "shard-sign: a GET carries no body" >&2; exit 2; }
[ -z "$BODY_FILE" ] || [ -f "$BODY_FILE" ] || { echo "shard-sign: no such body file: $BODY_FILE" >&2; exit 2; }

# Milliseconds since the epoch (the verifier compares against Date.now()), at whole-second
# resolution: the freshness window is 60 s and the nonce makes each call unique. Never `%3N`:
# BSD date prints a literal N, and uutils date (newer Ubuntu) ignores the width and prints all
# nine digits of nanoseconds, a 19-digit "timestamp" the master refuses as `signature`.
[ -n "$TS" ] || TS="$(( $(date +%s) * 1000 ))"
case "$TS" in ''|*[!0-9]*) echo "shard-sign: --timestamp takes milliseconds" >&2; exit 2 ;; esac
[ -n "$NONCE" ] || NONCE="$(openssl rand -hex 16)"
case "$NONCE" in *[!0-9a-f]*) echo "shard-sign: --nonce must be 32 lowercase hex characters" >&2; exit 2 ;; esac
[ "${#NONCE}" -eq 32 ] || { echo "shard-sign: --nonce must be 32 lowercase hex characters" >&2; exit 2; }

if [ -n "$BODY_FILE" ]; then
  BODY_HASH="$(openssl dgst -sha256 < "$BODY_FILE" | awk '{print $NF}')"
else
  BODY_HASH="$(printf '' | openssl dgst -sha256 | awk '{print $NF}')"
fi
SIGNATURE="$(printf '%s\n%s\n%s\n%s\n%s' "$TS" "$NONCE" "$METHOD" "$SIGN_PATH" "$BODY_HASH" \
  | openssl dgst -sha256 -hmac "$SHARD_SECRET" | awk '{print $NF}')"

printf '%s-timestamp: %s\n%s-nonce: %s\n%s-signature: %s\n' \
  "$PREFIX" "$TS" "$PREFIX" "$NONCE" "$PREFIX" "$SIGNATURE"
