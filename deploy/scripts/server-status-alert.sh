#!/usr/bin/env bash
#
# server-status-alert.sh — post this host's health (CPU, RAM, swap, disk, containers) to the same
# Telegram topic as model-balance-alert.sh. Run by cron on a host that has `/etc/tracy/host-dsh.env`:
#
#   /etc/cron.d/tracy-server-status:
#   */15 * * * * root /opt/tracy-fleet/server-status-alert.sh >/dev/null 2>&1
#
# Two kinds of message:
#   - an alert when the set of problems CHANGES (ok → RAM high → ok, a container goes down, ...),
#     not one every 15 minutes; the previous set is kept in $STATE_FILE;
#   - a status report every SERVER_STATUS_REPORT_EVERY seconds (default 3600), even when all is well;
#     the last report time is kept in $REPORT_FILE. An alert counts as that hour's report.
#
# Reads the same keys as model-balance-alert.sh from $ENV_FILE (default /etc/tracy/host-dsh.env):
#   TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID, TELEGRAM_THREAD_ID
# Optional thresholds in the same file:
#   SERVER_RAM_MAX=90             RAM used % (MemTotal - MemAvailable) at or above this alerts
#   SERVER_DISK_MAX=85            disk used % on any SERVER_DISK_PATHS at or above this alerts
#   SERVER_DISK_PATHS=/           space-separated mount points to watch
#   SERVER_LOAD_MAX=2             1-minute load per CPU core at or above this alerts
#   SERVER_IGNORE_CONTAINERS=     extended regex of container names never reported as down
#   SERVER_STATUS_REPORT_EVERY=3600   report period in seconds, 0 = alerts only
#   ALERT_LABEL=                  name shown in [..] at the start of every message (DEV, PROD);
#                                 empty = hostname. Shared with model-balance-alert.sh
#
# Neither prod1 nor the dev machine has a restart policy on the `tracy` cluster, so a container
# killed by the OOM killer stays down: a stopped or unhealthy container is an alert, by name.
#
# `--test` sends the current report right away and exits (no state is written).
set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/tracy/host-dsh.env}"
STATE_FILE="${STATE_FILE:-/var/lib/tracy/server-status.state}"
REPORT_FILE="${REPORT_FILE:-/var/lib/tracy/server-status.report}"

env_get() {
  grep -m1 "^$1=" "$ENV_FILE" 2>/dev/null | cut -d= -f2- | sed -E 's/[[:space:]]+#.*$//; s/[[:space:]]+$//' || true
}

BOT="$(env_get TELEGRAM_BOT_TOKEN)"
CHAT="$(env_get TELEGRAM_CHAT_ID)"
THREAD="$(env_get TELEGRAM_THREAD_ID)"
RAM_MAX="$(env_get SERVER_RAM_MAX)"; RAM_MAX="${RAM_MAX:-90}"
DISK_MAX="$(env_get SERVER_DISK_MAX)"; DISK_MAX="${DISK_MAX:-85}"
DISK_PATHS="$(env_get SERVER_DISK_PATHS)"; DISK_PATHS="${DISK_PATHS:-/}"
LOAD_MAX="$(env_get SERVER_LOAD_MAX)"; LOAD_MAX="${LOAD_MAX:-2}"
IGNORE="$(env_get SERVER_IGNORE_CONTAINERS)"
EVERY="$(env_get SERVER_STATUS_REPORT_EVERY)"; EVERY="${EVERY:-3600}"
HOST="$(env_get ALERT_LABEL)"; HOST="${HOST:-$(hostname -s)}"

[ -n "$BOT" ] && [ -n "$CHAT" ] || { echo "TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID empty in $ENV_FILE" >&2; exit 2; }

send() {
  curl -fsS -m 15 "https://api.telegram.org/bot${BOT}/sendMessage" \
    --data-urlencode "chat_id=${CHAT}" \
    ${THREAD:+--data-urlencode "message_thread_id=${THREAD}"} \
    --data-urlencode "text=$1" >/dev/null
}

# ---- measure -------------------------------------------------------------------------------------

cores="$(nproc)"
read -r load1 load5 load15 _ < /proc/loadavg

# CPU busy % over one second, from two /proc/stat samples.
cpu_sample() { awk '/^cpu /{idle=$5+$6; t=0; for(i=2;i<=NF;i++) t+=$i; print t, idle}' /proc/stat; }
read -r t1 i1 < <(cpu_sample); sleep 1; read -r t2 i2 < <(cpu_sample)
cpu_pct="$(awk -v dt=$((t2 - t1)) -v di=$((i2 - i1)) 'BEGIN{ printf "%d", (dt > 0 ? 100 * (dt - di) / dt : 0) }')"

mem() { awk -v k="$1:" '$1 == k { print $2 }' /proc/meminfo; }   # kB
mem_total="$(mem MemTotal)"; mem_avail="$(mem MemAvailable)"
swap_total="$(mem SwapTotal)"; swap_free="$(mem SwapFree)"
mem_used=$((mem_total - mem_avail)); swap_used=$((swap_total - swap_free))
ram_pct=$((100 * mem_used / mem_total))
gb() { awk -v k="$1" 'BEGIN{ printf "%.1f", k / 1048576 }'; }

problems=()
details=()

if [ "$ram_pct" -ge "$RAM_MAX" ]; then
  problems+=(ram); details+=("RAM ${ram_pct}% (threshold ${RAM_MAX}%)")
fi
if awk -v l="$load1" -v c="$cores" -v m="$LOAD_MAX" 'BEGIN{ exit !(l / c >= m) }'; then
  problems+=(load); details+=("load ${load1} on ${cores} cores (threshold ${LOAD_MAX}/core)")
fi

disk_lines=()
for p in $DISK_PATHS; do
  # df -P: Filesystem 1024-blocks Used Available Capacity Mounted-on
  read -r size used pct < <(df -Pk "$p" 2>/dev/null | awk 'NR == 2 { gsub("%", "", $5); print $2, $3, $5 }') || continue
  disk_lines+=("Disk ${p}: $(gb "$used")/$(gb "$size") GB (${pct}%)")
  if [ "$pct" -ge "$DISK_MAX" ]; then
    problems+=("disk:$p"); details+=("disk ${p} ${pct}% (threshold ${DISK_MAX}%)")
  fi
done

containers_line="Containers: unreadable (docker?)"
top_line=""
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  running="$(docker ps -q | wc -l | tr -d ' ')"
  down="$(docker ps -a --filter status=exited --filter status=dead --filter status=restarting --format '{{.Names}}' | sort)"
  sick="$(docker ps --filter health=unhealthy --format '{{.Names}}' | sort)"
  if [ -n "$IGNORE" ]; then
    down="$(printf '%s\n' "$down" | grep -Ev "$IGNORE" || true)"
    sick="$(printf '%s\n' "$sick" | grep -Ev "$IGNORE" || true)"
  fi
  n_down="$(printf '%s' "$down" | grep -c . || true)"
  n_sick="$(printf '%s' "$sick" | grep -c . || true)"
  containers_line="Containers: ${running} running, ${n_down} stopped, ${n_sick} unhealthy"
  for c in $down; do problems+=("down:$c"); details+=("container ${c} is stopped"); done
  for c in $sick; do problems+=("sick:$c"); details+=("container ${c} unhealthy"); done
  # Top 5 containers by memory: "name 1.2GiB".
  top="$(docker stats --no-stream --format '{{.MemUsage}}|{{.Name}}' 2>/dev/null \
    | awk -F'|' '{ split($1, a, " "); v = a[1]; n = v + 0;
                   if (v ~ /GiB/) n *= 1024; else if (v ~ /KiB/) n /= 1024; else if (v ~ /B$/ && v !~ /iB/) n /= 1048576;
                   printf "%.0f %s %s\n", n, $2, v }' \
    | sort -rn | sed -n 1,5p | awk '{ printf "%s%s %s", (NR > 1 ? ", " : ""), $2, $3 }')"
  [ -n "$top" ] && top_line="Top RAM: ${top}"
fi

up="$(awk '{ s = int($1); printf "%dd %dh", s / 86400, (s % 86400) / 3600 }' /proc/uptime)"

report="$(
  printf 'CPU: %s%%, load %s / %s / %s (%s core)\n' "$cpu_pct" "$load1" "$load5" "$load15" "$cores"
  printf 'RAM: %s/%s GB (%s%%)' "$(gb "$mem_used")" "$(gb "$mem_total")" "$ram_pct"
  if [ "$swap_total" -gt 0 ]; then printf ', swap %s/%s GB\n' "$(gb "$swap_used")" "$(gb "$swap_total")"; else printf ', no swap\n'; fi
  printf '%s\n' "${disk_lines[@]}"
  printf '%s\n' "$containers_line"
  [ -n "$top_line" ] && printf '%s\n' "$top_line"
  printf 'Uptime: %s' "$up"
)"

# ---- send ----------------------------------------------------------------------------------------

if [ "${1:-}" = "--test" ]; then
  send "🧪 [$HOST] server-status-alert: test message
$report"
  exit 0
fi

state="$(printf '%s\n' "${problems[@]+"${problems[@]}"}" | sort | tr '\n' ' ' | sed 's/ *$//')"
state="${state:-ok}"
now="$(date +%s)"
prev="$(cat "$STATE_FILE" 2>/dev/null || echo ok)"
mkdir -p "$(dirname "$STATE_FILE")" "$(dirname "$REPORT_FILE")"

if [ "$state" != "$prev" ]; then
  if [ "$state" = ok ]; then
    send "✅ [$HOST] Server is healthy again.
$report"
  else
    send "🔴 [$HOST] Server problem: $(IFS=';'; echo "${details[*]}" | sed 's/;/; /g').
$report"
  fi
  echo "$state" >"$STATE_FILE"
  echo "$now" >"$REPORT_FILE"
elif [ "$EVERY" -gt 0 ]; then
  last="$(cat "$REPORT_FILE" 2>/dev/null || echo 0)"
  # Cron at 15 minutes never lands on the exact second: allow 5 minutes early so 1 h does not slip to 1 h 15.
  if [ $((now - last)) -ge $((EVERY - 300)) ]; then
    [ "$state" = ok ] && icon="📊" || icon="🔴"
    send "$icon [$HOST] Server status
$report"
    echo "$now" >"$REPORT_FILE"
  fi
fi
echo "$state"
