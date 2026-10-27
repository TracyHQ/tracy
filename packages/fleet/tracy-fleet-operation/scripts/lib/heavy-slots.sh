# shellcheck shell=bash
# The machine's heavy webroot jobs (database dumps and loads, baselines of large webroots, packs) run
# at most TRACY_HEAVY_SLOTS at once (2): slot 0 is the lock file itself — what one-at-a-time callers
# and older images hold — slot n is `<lock>.<n>`. The slot taken stays held on fd 9 until the job
# ends. One slot made every site's Sync from live wait for any other site's: 20–56 s of a measured
# preview on dev were another site's sync (2026-10-27). TRACY_HEAVY_SLOTS=1 is the old behaviour.

# heavy_try <lock>: a free slot taken on fd 9 (0), or none free (1). Never waits.
heavy_try() {
  local lock="$1" slots="${TRACY_HEAVY_SLOTS:-2}" i path
  [[ "$slots" =~ ^[1-9][0-9]?$ ]] || slots=1
  for (( i = 0; i < slots; i++ )); do
    path="$lock"
    (( i == 0 )) || path="$lock.$i"
    exec 9>"$path"
    if flock -n 9; then return 0; fi
    exec 9>&-
  done
  return 1
}

# heavy_wait <lock> <seconds>: the first slot that comes free within that time, on fd 9 (0), or none (1).
heavy_wait() {
  local lock="$1" until=$(( SECONDS + $2 ))
  while (( SECONDS < until )); do
    heavy_try "$lock" && return 0
    sleep 2
  done
  return 1
}
