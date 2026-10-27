#!/usr/bin/env bash
#
# otp.sh — print the sign-in code for an address, the way local Tracy actually delivers it.
#
# 🔒 THERE IS NO FAKE CODE AND NO FIXED CODE. `generateCode` (apps/tracy-web/src/identity/otp.js)
# is six digits from a CSPRNG in every environment; what changes locally is only the TRANSPORT.
# With `MAIL=` empty, `transportFor` picks `consoleTransport`, which writes the whole mail to the
# server log instead of sending it — so nothing arrives in an inbox, by design, and the code is
# read from the log. Anyone waiting for an email will wait forever.
# Since #804 the console transport writes the mail only under `LOCAL_LOGIN_PREVIEW=1` (the macOS
# compose default). With preview off and no `MAIL=resend:<key>`, nothing is logged and `/login`
# answers that the code could not be sent, so this script finds no code.
#
# Usage:  deploy/scripts/otp.sh [email]
#   no argument  — the most recent code in the log, whoever it was for
#   an address   — the most recent code sent to that address
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$(cd "$SCRIPT_DIR/.." && pwd)"

WANT="${1:-}"
# 400 lines is a few dozen sign-ins — enough to find a code from a minute ago, small enough to stay
# instant. The pairing matters: `[mail] to=…` and the code are two SEPARATE log lines, so a naive
# grep for six digits finds the right number for the wrong person.
LOG="$(docker compose --profile local logs tracy-web --tail 400 2>/dev/null || true)"

if [ -z "$LOG" ]; then
  # 🔒 EMPTY LOGS HAVE TWO CAUSES AND THEY NEED DIFFERENT ANSWERS. The obvious one is a stack that
  # is down. The other is a docker CLI pointed at somebody else's daemon: `DOCKER_HOST` OVERRIDES
  # the context, so a shell that still carries `ssh://<somewhere>` asks that machine for
  # `tracy-web`, gets nothing, and this script used to answer "is the stack up?" — a verdict about
  # the wrong computer, which sends the reader to restart a stack that was healthy all along.
  # Measured 11/09: a terminal opened before the DOCKER_HOST cleanup of 09/09 still carried it,
  # while ~/.zshenv, ~/.docker/config.json and a fresh login shell were all already clean.
  if [ -n "${DOCKER_HOST:-}" ]; then
    echo "✗ no tracy-web logs, and DOCKER_HOST=$DOCKER_HOST — this shell is asking a DIFFERENT docker daemon" >&2
    echo " switch to turn on: unset DOCKER_HOST   (it overrides the context; the local stack lives on this machine)" >&2
  else
    echo "✗ no tracy-web logs — is the stack up? run deploy/scripts/check-local.sh" >&2
  fi
  exit 1
fi

# 🔒 THE CODE IS ON THE `to=` LINE, AND READING IT THERE IS WHAT MAKES THIS SAFE. The console
# transport prints `[mail] to=… subject="123456 is your Tracy sign-in code"` and then the body on
# the FOLLOWING lines, so any `-A<n>` window has to guess how far a mail runs: guess short and the
# code is missed (the body puts it on the fourth line), guess long and the window reaches into the
# NEXT mail and answers with somebody else's code. The subject carries the same six digits
# (`signInCodeMail` in apps/tracy-web/src/mail/emails.js), on one line, with no window to size.
#
# The body stays as a fallback, bounded by the next `[mail]` line rather than by a line count —
# `asCode` returns '' for a code that fails its shape check, and then the subject is the codeless
# `Your sign-in OTP` while the body still carries what was generated.
#
# ⚠ This block used to grep `Your code is [0-9]{6}`. The template says `Your code:` — no `is` —
# so it matched nothing and every lookup ended in "found the mail but no six-digit code in it",
# a verdict about the script rather than about the mail. Measured 11/09.
FOUND="$(echo "$LOG" | awk -v want="$WANT" '
  /\[mail\] to=/ {
    keep = 0
    addr = ""
    if (match($0, /to=[^ ]+/)) addr = substr($0, RSTART + 3, RLENGTH - 3)
    if (want == "" || addr == want) {
      keep = 1; to = addr; code = ""
      if (match($0, /subject="[0-9][0-9][0-9][0-9][0-9][0-9] /)) code = substr($0, RSTART + 9, 6)
    }
    next
  }
  keep && code == "" && /Your code/ {
    if (match($0, /[0-9][0-9][0-9][0-9][0-9][0-9]/)) code = substr($0, RSTART, 6)
  }
  END { if (to != "") print code "\t" to }
')"

if [ -z "$FOUND" ]; then
  if [ -n "$WANT" ]; then
    echo "✗ no sign-in code for $WANT in the last 400 log lines" >&2
    echo " switch to turn on: ask for one first — open $(grep -m1 '^TRACY_ORIGIN=' .env | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//')/login and enter the address, then re-run this" >&2
  else
    echo "✗ no sign-in code in the last 400 log lines" >&2
  fi
  exit 1
fi

CODE="${FOUND%%	*}"
TO="${FOUND#*	}"

[ -n "$CODE" ] || { echo "✗ found the mail but no six-digit code in it" >&2; exit 1; }

echo "$CODE${TO:+   (for $TO)}"
