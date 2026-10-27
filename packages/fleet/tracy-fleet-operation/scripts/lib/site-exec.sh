#!/usr/bin/env bash
#
# What a failed `docker exec` into a site container says about itself.
#
# Sourced, never executed. A platform file calls this after an exec into `<label>-web-1` returned
# non-zero, then fails as it did before — it adds the explanation, it does not change the verdict.
#
# WHY. An exec whose container stops under it is cut mid-stream and prints nothing of its own: the
# only witnesses of why — the server's crash, an OOM kill, a restart — are the container's state
# and its log, and neither reaches the provision log unless somebody copies them there. Measured
# 22/09/2026 (B-10): two stock EmDash installs stopped in the middle of `==> content`, each at a
# different entry, with not one error line, and the containers were torn down before anybody read
# them. The next time, the job output carries the answer.
#
# Everything goes to stderr, and nothing in here may fail the caller a second time: an inspect of
# a container that is already gone is itself the finding.

# tracy_explain_exec_failure <container> <exit code of the exec>
tracy_explain_exec_failure() {
  local container="$1" rc="$2" state
  echo "!! docker exec in $container ended with exit code $rc and no error of its own" >&2
  if [ "$rc" = 137 ]; then
    echo "   137 = killed (SIGKILL): an OOM kill, or the container was stopped under the exec" >&2
  fi
  if ! state="$(docker inspect "$container" --format 'status={{.State.Status}} restarts={{.RestartCount}} oom={{.State.OOMKilled}} exit={{.State.ExitCode}} started={{.State.StartedAt}} finished={{.State.FinishedAt}}' 2>/dev/null)"; then
    echo "   $container no longer exists — it was removed while the exec ran" >&2
    return 0
  fi
  echo "   container: $state" >&2
  echo "   last lines of its log:" >&2
  docker logs --tail 30 "$container" 2>&1 | sed 's/^/   | /' >&2 || true
  return 0
}
