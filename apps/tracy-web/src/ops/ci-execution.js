// GitHub job assignments and runner availability are separate observations.
const stamp = (value) => (typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null)
const clip = (value) => (typeof value === 'string' ? value.slice(0, 250) : null)
const upper = (value) => (typeof value === 'string' ? value.toUpperCase() : null)
export function createExecutionReader({ token, repo, link, fetchImpl = fetch, now = Date.now }) {
  const runs = new Map()
  let runnerRead = null,
    runnerPending = null
  async function pages(path, field, cap) {
    const budget = AbortSignal.timeout(20000)
    const items = []
    for (let page = 1; page <= cap; page++) {
      const response = await fetchImpl(
        `https://api.github.com/repos/${repo}/${path}?per_page=100&page=${page}`,
        {
          method: 'GET',
          redirect: 'error',
          signal: AbortSignal.any([AbortSignal.timeout(10000), budget]),
          headers: {
            authorization: `Bearer ${token}`,
            accept: 'application/vnd.github+json',
            'user-agent': 'tracy-web-ci',
            'x-github-api-version': '2026-03-10'
          }
        }
      )
      if (!response.ok) throw new Error('GitHub execution data unavailable')
      const body = await response.json()
      if (!Array.isArray(body[field]) || !Number.isSafeInteger(body.total_count) || body.total_count < 0)
        throw new Error('Incomplete GitHub execution response')
      items.push(...body[field])
      if (items.length >= body.total_count) return { items, complete: true }
      if (!body[field].length) break
    }
    return { items, complete: false }
  }
  async function runners() {
    if (runnerRead && now() - runnerRead.at < 30000) return runnerRead
    if (!runnerPending)
      runnerPending = (async () => {
        try {
          const data = await pages('actions/runners', 'runners', 10)
          runnerRead = { data, at: now(), error: data.complete ? null : 'Runner availability is incomplete.' }
        } catch {
          runnerRead = {
            data: { items: [], complete: false },
            at: now(),
            error:
              'Runner availability could not be read. The CI token needs repository Administration read permission.'
          }
        }
        return runnerRead
      })().finally(() => {
        runnerPending = null
      })
    return runnerPending
  }
  async function jobs(runId, attempt) {
    const key = `${runId}:${attempt}`
    const previous = runs.get(key)
    if (previous?.pending) return previous.pending
    if (previous && now() - previous.at < previous.ttl) return previous
    const entry = { pending: null }
    entry.pending = (async () => {
      let result
      try {
        const data = await pages(`actions/runs/${runId}/attempts/${attempt}/jobs`, 'jobs', 5)
        result = {
          data,
          at: now(),
          ttl:
            data.complete && data.items.length > 0 && data.items.every((job) => job.status === 'completed')
              ? 3600000
              : 30000,
          error: data.complete ? null : 'Job results are incomplete.'
        }
      } catch {
        result = {
          data: { items: [], complete: false },
          at: now(),
          ttl: 30000,
          error:
            'Job details could not be read from GitHub. Check Actions read permission or try again later.'
        }
      }
      runs.set(key, result)
      if (runs.size > 500) runs.delete(runs.keys().next().value)
      return result
    })()
    runs.set(key, entry)
    return entry.pending
  }
  return {
    async enrich(rows) {
      if (!token)
        return { rows, runnerStatus: { measuredAt: null, error: 'Runner access is not configured.' } }
      const inventoryPromise = runners()
      const requested = new Map()
      // Active work first. Historical jobs are cached for an hour; one refresh reads at most 80 runs.
      for (const row of [...rows].sort(
        (a, b) =>
          Number(['Building', 'Queued'].includes(b.build)) - Number(['Building', 'Queued'].includes(a.build))
      ))
        for (const check of row.checks)
          if (
            Number.isSafeInteger(check.runId) &&
            check.runId > 0 &&
            Number.isSafeInteger(check.runAttempt) &&
            check.runAttempt > 0
          )
            requested.set(`${check.runId}:${check.runAttempt}`, check)
      const result = new Map()
      const keys = []
      let newReads = 0
      for (const key of requested.keys()) {
        const cached = runs.get(key)
        if (cached?.pending || (cached && now() - cached.at < cached.ttl)) keys.push(key)
        else if (newReads < 80) {
          keys.push(key)
          newReads++
        }
      }
      const deadline = Date.now() + 20000
      let cursor = 0
      await Promise.all(
        Array.from({ length: 4 }, async () => {
          while (cursor < keys.length && Date.now() < deadline) {
            const key = keys[cursor++]
            const check = requested.get(key)
            result.set(key, await jobs(check.runId, check.runAttempt))
          }
        })
      )
      const inventory = await inventoryPromise
      const byRunner = new Map(inventory.data.items.map((runner) => [runner.id, runner]))
      const enriched = rows.map((row) => {
        const observedJobs = [],
          errors = new Set()
        let complete = row.checksComplete
        if (!complete) errors.add('Some check results are missing, so the job list may be incomplete.')
        for (const check of row.checks) {
          if (!check.runId) {
            if (!['SKIPPED', 'CANCELLED'].includes(check.conclusion)) {
              complete = false
              errors.add('Some checks do not include GitHub Actions job information.')
            }
            continue
          }
          const run = result.get(`${check.runId}:${check.runAttempt}`)
          if (!run) {
            complete = false
            errors.add('Open this PR to load more job details.')
            continue
          }
          if (run.error) {
            complete = false
            errors.add(run.error)
          }
          const job = run.data.items.find(
            (job) =>
              String(job.id) === check.id &&
              job.run_id === check.runId &&
              job.run_attempt === check.runAttempt &&
              job.head_sha === row.commit
          )
          if (!job) {
            // A cancelled or skipped check may have no Actions job at all.
            if (!['CANCELLED', 'SKIPPED'].includes(check.conclusion)) {
              runs.delete(`${check.runId}:${check.runAttempt}`)
              complete = false
              errors.add('Some check jobs have not been reported by GitHub yet.')
            }
            continue
          }
          const runner = byRunner.get(job.runner_id)
          observedJobs.push({
            id: String(job.id),
            runId: job.run_id,
            runAttempt: job.run_attempt,
            name: clip(job.name) || 'Unnamed job',
            summary: check.summary,
            workflow: check.workflow,
            status: upper(job.status),
            conclusion: upper(job.conclusion),
            url: link(job.html_url),
            startedAt:
              !['in_progress', 'completed'].includes(job.status) || job.conclusion === 'skipped'
                ? null
                : stamp(job.started_at),
            completedAt: stamp(job.completed_at),
            labels: (job.labels ?? []).filter((label) => typeof label === 'string').map(clip),
            runnerAssignment:
              Number.isSafeInteger(job.runner_id) && job.runner_id > 0
                ? 'assigned'
                : job.runner_id === 0
                  ? 'unassigned'
                  : 'unknown',
            runner:
              Number.isSafeInteger(job.runner_id) && job.runner_id > 0
                ? {
                    id: job.runner_id,
                    name: clip(job.runner_name) || 'Unnamed runner',
                    status:
                      runner && ['online', 'offline'].includes(runner.status) ? runner.status : 'unknown',
                    busy: runner && typeof runner.busy === 'boolean' ? runner.busy : null
                  }
                : null,
            steps: (job.steps ?? []).map((step) => ({
              name: clip(step.name) || 'Unnamed step',
              number: step.number,
              status: upper(step.status),
              conclusion: upper(step.conclusion),
              startedAt: stamp(step.started_at),
              completedAt: stamp(step.completed_at)
            })),
            measuredAt: new Date(run.at).toISOString()
          })
        }
        return {
          ...row,
          execution: {
            jobs: observedJobs,
            complete,
            error: [...errors].join(' ') || null,
            runnersMeasuredAt: inventory.error ? null : new Date(inventory.at).toISOString(),
            runnerError: inventory.error
          }
        }
      })
      return {
        rows: enriched,
        runnerStatus: {
          measuredAt: inventory.error ? null : new Date(inventory.at).toISOString(),
          error: inventory.error
        }
      }
    }
  }
}
