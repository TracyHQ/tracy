#!/usr/bin/env bash
# Configure once, then run. The runner's identity lives on a named volume, so a restart reuses it
# instead of needing a fresh registration token (they expire in an hour).
set -euo pipefail
cd /home/runner/actions-runner

if [ ! -f .runner ]; then
  : "${RUNNER_TOKEN:?RUNNER_TOKEN required for first registration}"
  ./config.sh \
    --url "https://github.com/${RUNNER_REPO:?}" \
    --token "$RUNNER_TOKEN" \
    --name "${RUNNER_NAME:-tracy-build-01}" \
    --labels "${RUNNER_LABELS:-self-hosted,linux,x64,tracy-build}" \
    --work _work \
    --unattended --replace
fi

exec ./run.sh
