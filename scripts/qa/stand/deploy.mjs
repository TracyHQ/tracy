/**
 * Bring the QA stand up at the images already built and tagged `:qa` (§4.5).
 *
 *   deploy({ srcDir, envFile, runId, docker?, netfilter?, healthTimeoutMs?, sleep?, runCore? })
 *     -> { ok, step, unhealthy: string[], netfilter: {ok, missing, extra}, core? }
 *   health({ srcDir, envFile, docker }) -> { service: 'healthy'|'running'|'missing'|<state> }
 *
 * Steps, each stops the deploy on failure and names itself in `step`:
 *   1. `docker compose … up -d` — the whole project, never `--no-deps`;
 *   2. netfilter apply + verify (lost on every Docker restart, so applied on every deploy);
 *   3. health by service NAME for every service in QA.services, waiting up to healthTimeoutMs;
 *   4. the core suite, through the `runCore` callback the orchestrator passes (`rerun` of
 *      tests/core); skipped when no callback is given.
 */
import * as nf from './netfilter.mjs'
import { QA, composeArgs, dockerRunner } from './qa-stand.mjs'

export function health({ srcDir, envFile, docker = dockerRunner() }) {
  const r = docker([...composeArgs({ srcDir, envFile }), 'ps', '-a', '--format', 'json'])
  const out = Object.fromEntries(QA.services.map((s) => [s, 'missing']))
  if (r.code !== 0) return out
  // Compose prints one JSON object per line (or one array on older versions).
  const text = r.stdout.trim()
  const rows = text.startsWith('[')
    ? JSON.parse(text)
    : text
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
  for (const row of rows) {
    if (!(row.Service in out)) continue
    out[row.Service] = row.Health ? row.Health : row.State
  }
  return out
}

const isHealthy = (state) => state === 'healthy'

export async function deploy({
  srcDir,
  envFile,
  runId,
  docker = dockerRunner(),
  netfilter = nf,
  healthTimeoutMs = 10 * 60 * 1000,
  pollMs = 5000,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  runCore = null
}) {
  const up = docker([...composeArgs({ srcDir, envFile }), 'up', '-d', '--remove-orphans'])
  if (up.code !== 0)
    return { ok: false, step: 'up', stderr: up.stderr.split('\n').slice(-50).join('\n'), unhealthy: [] }
  // A retag under the same `:qa` name does not always make compose recreate (measured 03/10: the
  // web container stayed on an image that no longer existed). The app services are recreated
  // every deploy; their data lives in volumes and bind mounts.
  const again = docker([
    ...composeArgs({ srcDir, envFile }),
    'up',
    '-d',
    '--no-deps',
    '--force-recreate',
    'tracy-web',
    'tracy-host',
    'tracy-dsh'
  ])
  if (again.code !== 0)
    return {
      ok: false,
      step: 'recreate',
      stderr: again.stderr.split('\n').slice(-50).join('\n'),
      unhealthy: []
    }

  const applied = netfilter.apply({ docker, runId })
  const checked = applied.ok
    ? netfilter.verify({ docker, runId })
    : { ok: false, missing: [applied.stderr], extra: [] }
  if (!checked.ok) return { ok: false, step: 'netfilter', netfilter: checked, unhealthy: [] }

  const deadline = Date.now() + healthTimeoutMs
  let states = health({ srcDir, envFile, docker })
  // qa-egress, postgres, … all carry a healthcheck; anything without one would never turn
  // "healthy", so every service in the list must have one (compose.yml + compose.qa.yml do).
  while (QA.services.some((s) => !isHealthy(states[s])) && Date.now() < deadline) {
    await sleep(pollMs)
    states = health({ srcDir, envFile, docker })
  }
  const unhealthy = QA.services.filter((s) => !isHealthy(states[s])).map((s) => `${s}=${states[s]}`)
  if (unhealthy.length) return { ok: false, step: 'health', unhealthy, netfilter: checked }

  if (runCore) {
    const core = await runCore()
    if (!core?.ok) return { ok: false, step: 'core', unhealthy: [], netfilter: checked, core }
    return { ok: true, step: 'done', unhealthy: [], netfilter: checked, core }
  }
  return { ok: true, step: 'done', unhealthy: [], netfilter: checked }
}
