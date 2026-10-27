#!/usr/bin/env bash
#
# model-balance-alert.sh — ask DeepSeek how much credit is left on `MODEL_API_KEY` and post to a
# Telegram topic when it runs low / runs out. Run from cron on a host that has `/etc/tracy/host-dsh.env`:
#
#   */15 * * * * /opt/tracy-fleet/model-balance-alert.sh >/dev/null 2>&1
#
# An alert is sent only when the STATE CHANGES (ok → low → ok, or to error), not every 15 minutes.
# The previous state lives in $STATE_FILE.
# Additionally, every MODEL_BALANCE_REPORT_EVERY seconds (default 3600) it posts the current balance,
# even when all is well. The last report time lives in $REPORT_FILE; set MODEL_BALANCE_REPORT_EVERY=0 to disable.
#
# Keys are read from $ENV_FILE (default /etc/tracy/host-dsh.env); add to that file:
#   TELEGRAM_BOT_TOKEN=      a bot already added to the group
#   TELEGRAM_CHAT_ID=        of the form -100…
#   TELEGRAM_THREAD_ID=      the topic's message_thread_id
#   MODEL_BALANCE_MIN=2      below this (USD) it reports "running low"
#   MODEL_BALANCE_REPORT_EVERY=3600   balance report interval (seconds), 0 = off
#   ALERT_LABEL=             host name printed in [..] at the start of each message (DEV, PROD); empty = hostname
#
# `--test` sends a test message to the topic and exits.
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/tracy/host-dsh.env}"
STATE_FILE="${STATE_FILE:-/var/lib/tracy/model-balance.state}"
REPORT_FILE="${REPORT_FILE:-/var/lib/tracy/model-balance.report}"

env_get() {
  grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' || true
}

KEY="$(env_get MODEL_API_KEY)"
BOT="$(env_get TELEGRAM_BOT_TOKEN)"
CHAT="$(env_get TELEGRAM_CHAT_ID)"
THREAD="$(env_get TELEGRAM_THREAD_ID)"
MIN="$(env_get MODEL_BALANCE_MIN)"; MIN="${MIN:-2}"
EVERY="$(env_get MODEL_BALANCE_REPORT_EVERY)"; EVERY="${EVERY:-3600}"
HOST="$(env_get ALERT_LABEL)"; HOST="${HOST:-$(hostname -s)}"

[ -n "$BOT" ] && [ -n "$CHAT" ] || { echo "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID empty in $ENV_FILE" >&2; exit 2; }

send() {
  curl -fsS -m 15 "https://api.telegram.org/bot${BOT}/sendMessage" \
    --data-urlencode "chat_id=${CHAT}" \
    ${THREAD:+--data-urlencode "message_thread_id=${THREAD}"} \
    --data-urlencode "text=$1" >/dev/null
}

if [ "${1:-}" = "--test" ]; then
  send "🧪 [$HOST] model-balance-alert: test message, this topic will receive MODEL_API_KEY low-credit alerts."
  exit 0
fi

if [ -z "$KEY" ]; then
  state=error; msg="⚠️ [$HOST] MODEL_API_KEY empty in $ENV_FILE — the agent will not answer chat."
else
  body="$(curl -sS -m 20 -w '\n%{http_code}' -H "Authorization: Bearer ${KEY}" https://api.deepseek.com/user/balance || true)"
  code="${body##*$'\n'}"; json="${body%$'\n'*}"
  available="$(printf '%s' "$json" | sed -nE 's/.*"is_available"[[:space:]]*:[[:space:]]*(true|false).*/\1/p')"
  balance="$(printf '%s' "$json" | sed -nE 's/.*"total_balance"[[:space:]]*:[[:space:]]*"([0-9.]+)".*/\1/p')"
  currency="$(printf '%s' "$json" | sed -nE 's/.*"currency"[[:space:]]*:[[:space:]]*"([A-Z]+)".*/\1/p')"

  if [ "$code" != 200 ] || [ -z "$available" ]; then
    state=error; msg="⚠️ [$HOST] Could not read the DeepSeek balance (HTTP ${code:-?}). Wrong or revoked key?"
  elif [ "$available" = false ] || awk -v b="${balance:-0}" -v m="$MIN" 'BEGIN{exit !(b<m)}'; then
    state=low; msg="🔴 [$HOST] MODEL_API_KEY is running low: ${balance:-0} ${currency} left (threshold ${MIN}). When it runs out the agent stops answering chat. Top up at platform.deepseek.com"
  else
    state=ok; msg="✅ [$HOST] MODEL_API_KEY has credit again: ${balance} ${currency}."
  fi
fi

now="$(date +%s)"
prev="$(cat "$STATE_FILE" 2>/dev/null || echo ok)"
if [ "$state" != "$prev" ]; then
  send "$msg"
  mkdir -p "$(dirname "$STATE_FILE")"
  echo "$state" >"$STATE_FILE"
  # The alert already carries the balance, so it counts as the periodic report.
  [ -n "${balance:-}" ] && echo "$now" >"$REPORT_FILE"
elif [ "$EVERY" -gt 0 ] && [ -n "${balance:-}" ]; then
  last="$(cat "$REPORT_FILE" 2>/dev/null || echo 0)"
  # A 15-minute cron never lands on the exact second: subtract 5 minutes so 1 hour does not slip to 1h15.
  if [ $((now - last)) -ge $((EVERY - 300)) ]; then
    [ "$state" = low ] && icon="🔴" || icon="💰"
    send "$icon [$HOST] DeepSeek balance (MODEL_API_KEY): ${balance} ${currency} (threshold ${MIN})."
    mkdir -p "$(dirname "$REPORT_FILE")"
    echo "$now" >"$REPORT_FILE"
  fi
fi
echo "$state ${balance:-} ${currency:-}"
