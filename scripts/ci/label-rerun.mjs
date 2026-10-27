/**
 * Re-run Tracy CI for a pull request into `develop` when one of its two opt-in labels is added
 * (16/10/2026, anh David / SRE; run by `.github/workflows/ci-label-rerun.yml`).
 *
 * WHY A WORKFLOW OF ITS OWN. `ci:e2e` and `ci:integration` change what Tracy CI runs
 * (`scripts/ci/test-scope.mjs`), so adding one must start the run again. Putting `labeled` among the
 * triggers of `tracy-ci.yml` is wrong twice: its `concurrency` group is keyed by the pull request's ref
 * with `cancel-in-progress`, so ANY label (triage, area, a reviewer's) would cancel the run in flight;
 * and a `labeled` run the plan skips ends `skipped`, which can overwrite a required check of the head
 * commit. This script touches only the two labels and only the run that already exists.
 *
 * WHAT IT DOES, in this order, and nothing else:
 *   1. read the pull request NOW (open, not a draft, into `develop`, from this repository) and its
 *      CURRENT head commit — the event's copy can be stale by the time a runner picks the job up;
 *   2. find the newest `tracy-ci.yml` run of event `pull_request` for exactly that head commit and
 *      this pull request — newest by the START of its latest attempt, as `check-pr-merge.mjs` decides
 *      (`newestRun`, imported, not copied). None: say so and stop — the run that starts for it reads the
 *      labels itself;
 *   3. if that run is still going, cancel it and WAIT until it is completed (a run cannot be re-run
 *      while it is running);
 *   4. look at the head commit once more, then re-run the whole run (`/rerun`, never `/rerun-failed-jobs`:
 *      the plan has to decide again, and it decides from the labels it reads at that moment);
 *   5. write what it did in the job summary.
 * Removing a label does nothing: the next push runs with the labels it carries.
 *
 * 🔒 IT NEVER RE-RUNS ANOTHER COMMIT'S RUN. A run for an older head, a run of another event
 * (`schedule`, `workflow_dispatch`) or of another pull request that happens to share the commit is not
 * a candidate, and a head that moved while the job waited ends the job without a re-run: the run for
 * the new head is the one that reads the labels.
 *
 * 🔒 A REFUSAL IS RED, NOT QUIET. If the API refuses the cancel or the re-run (permission, a run too
 * old, a timeout while waiting) the job fails with the answer in its log, so the person who added the
 * label sees that nothing re-ran instead of waiting for a run that will not come. Whether the job
 * token may call `/rerun` on this repository is NOT something unit tests can show: the first real
 * label does.
 *
 * Reads and writes `repos/<CI repository>/…` only, with the job token. Tested in
 * `scripts/test/ci-label-rerun.test.mjs` with a fake API.
 */
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { newestRun as latestRun } from '../check-pr-merge.mjs'
import { CI_REPOSITORY } from './ci-repository.mjs'
import { E2E_LABEL, INTEGRATION_LABEL } from './related-tests.mjs'

export const WORKFLOW_FILE = 'tracy-ci.yml'
const WATCHED = [E2E_LABEL, INTEGRATION_LABEL]
const REPO = CI_REPOSITORY
/** Statuses of a run that still occupies a runner or a queue: it must be cancelled before a re-run. */
const BUSY = new Set(['queued', 'in_progress', 'waiting', 'requested', 'pending'])

/**
 * @typedef {object} Api
 * @property {(path: string) => Promise<any>} get - parsed JSON of a GET.
 * @property {(path: string) => Promise<{ status: number, body: any }>} post - a POST with no body; never throws on HTTP errors.
 */

/**
 * @typedef {{ action: 'rerun', run: object, cancelled: boolean, attempt: number }
 *   | { action: 'none', why: string }} Outcome
 */

/**
 * Do what the added label asks, or say why there is nothing to do.
 *
 * @param {object} input
 * @param {Api} input.api
 * @param {string} input.repo - `owner/name`.
 * @param {number | string} input.pr
 * @param {string} input.label - the label whose addition started this job.
 * @param {(ms: number) => Promise<void>} [input.sleep]
 * @param {() => number} [input.now]
 * @param {number} [input.waitMs] - how long to wait for a cancelled run to finish.
 * @param {number} [input.pollMs]
 * @returns {Promise<Outcome>} a thrown Error is a refusal the job must show in red.
 */
export async function rerunForLabel({
  api,
  repo,
  pr,
  label,
  sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  now = Date.now,
  waitMs = 10 * 60_000,
  pollMs = 10_000
}) {
  if (!WATCHED.includes(label)) {
    return { action: 'none', why: `${label} is not one of ${WATCHED.join(', ')}` }
  }
  if (!/^[1-9][0-9]{0,8}$/.test(String(pr))) {
    throw new Error(`"${String(pr)}" is not a pull request number`)
  }

  const pull = await api.get(`repos/${repo}/pulls/${String(pr)}`)
  if (pull?.state !== 'open') return { action: 'none', why: 'the pull request is not open' }
  if (pull.draft !== false) {
    return {
      action: 'none',
      why: 'the pull request is a draft: the run that starts when it is marked ready reads the labels'
    }
  }
  if (pull.base?.ref !== 'develop') {
    return {
      action: 'none',
      why: `it targets ${String(pull.base?.ref)}: the labels only matter on a pull request into develop`
    }
  }
  if (pull.head?.repo?.full_name !== repo) {
    return { action: 'none', why: 'the head is in a fork: this token may not re-run its runs' }
  }
  const head = String(pull.head?.sha ?? '')
  if (!/^[0-9a-f]{40}$/.test(head)) throw new Error('the pull request answer carries no head commit')

  const run = await newestRun(api, repo, pr, head)
  if (!run) {
    return {
      action: 'none',
      why: `no Tracy CI run exists for ${head.slice(0, 9)} yet: the run that starts for it reads the labels itself`
    }
  }

  let cancelled = false
  let current = run
  if (BUSY.has(current.status)) {
    cancelled = true
    const answer = await api.post(`repos/${repo}/actions/runs/${String(current.id)}/cancel`)
    // 409 = it finished between the list and the cancel: exactly the state we are waiting for.
    if (answer.status !== 202 && answer.status !== 409) {
      throw new Error(
        `cancelling run ${String(current.id)} was refused: HTTP ${String(answer.status)} ${describe(answer.body)}`
      )
    }
    const deadline = now() + waitMs
    for (;;) {
      current = await api.get(`repos/${repo}/actions/runs/${String(current.id)}`)
      if (current.status === 'completed') break
      if (now() >= deadline) {
        throw new Error(
          `run ${String(current.id)} was still ${String(current.status)} ${String(Math.round(waitMs / 1000))} s after it was cancelled`
        )
      }
      await sleep(pollMs)
    }
  }

  // The head may have moved while we waited. The run of the new head is the one that reads the labels.
  const after = await api.get(`repos/${repo}/pulls/${String(pr)}`)
  if (after?.head?.sha !== head) {
    return {
      action: 'none',
      why: `the head moved from ${head.slice(0, 9)} to ${String(after?.head?.sha).slice(0, 9)} while waiting: the run for the new head reads the labels itself`
    }
  }

  const answer = await api.post(`repos/${repo}/actions/runs/${String(current.id)}/rerun`)
  if (answer.status !== 201) {
    throw new Error(
      `re-running run ${String(current.id)} was refused: HTTP ${String(answer.status)} ${describe(answer.body)}`
    )
  }
  return { action: 'rerun', run: current, cancelled, attempt: Number(current.run_attempt) + 1 }
}

/** The newest run of this workflow, event `pull_request`, for this head commit and this pull request. */
async function newestRun(api, repo, pr, head) {
  const body = await api.get(
    `repos/${repo}/actions/workflows/${WORKFLOW_FILE}/runs?event=pull_request&head_sha=${head}&per_page=30`
  )
  const runs = Array.isArray(body?.workflow_runs) ? body.workflow_runs : null
  if (runs === null) throw new Error('the run list is not a list')
  const mine = runs.filter(
    (r) =>
      r?.event === 'pull_request' &&
      r.head_sha === head &&
      Array.isArray(r.pull_requests) &&
      r.pull_requests.some((p) => Number(p?.number) === Number(pr))
  )
  // The run whose latest attempt STARTED last (`run_started_at`, which a re-run resets) is the newest: a
  // run number alone is not, because a re-run of an older run is the latest word on the commit. The same
  // rule, and the same function, as the merge preflight; a list it cannot order is an error, not a guess.
  const { run, problem } = latestRun(mine)
  if (problem) throw new Error(`which run is the newest cannot be told: ${problem}`)
  return run
}

const describe = (body) => {
  const text = typeof body?.message === 'string' ? body.message : ''
  return text.slice(0, 200)
}

/** The job summary for an outcome. */
export function summaryOf(outcome, label) {
  if (outcome.action === 'none') return `### Tracy CI not re-run\n\nLabel \`${label}\`: ${outcome.why}.\n`
  const { run } = outcome
  const how = outcome.cancelled ? 'cancelled while it was running, then ' : ''
  return (
    `### Tracy CI re-run for label \`${label}\`\n\n` +
    `Run ${run.html_url ?? run.id} was ${how}re-run in full (attempt ${String(outcome.attempt)}). ` +
    'The plan job reads the labels again, so the new attempt runs what they ask for.\n'
  )
}

// ── transport ────────────────────────────────────────────────────────────────────────────────────

/** The two calls the logic needs, over the REST API with the job token. Only `repos/<CI repository>/…`. */
export function restApi({ token, fetchImpl = fetch, timeoutMs = 20_000 }) {
  const url = (path) => {
    const plain = path.startsWith(`repos/${REPO}/`) && /^[A-Za-z0-9._/?=&-]+$/.test(path)
    if (!plain || path.split('?')[0].split('/').includes('..')) {
      throw new Error(`label-rerun only talks to ${REPO} REST paths`)
    }
    return `https://api.github.com/${path}`
  }
  const call = (method, path) =>
    fetchImpl(url(path), {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${token}`,
        'x-github-api-version': '2022-11-28'
      }
    })
  return {
    async get(path) {
      const response = await call('GET', path)
      if (!response.ok) throw new Error(`GET ${path}: HTTP ${String(response.status)}`)
      return response.json()
    },
    async post(path) {
      const response = await call('POST', path)
      let body = null
      try {
        body = await response.json()
      } catch {
        body = null
      }
      return { status: response.status, body }
    }
  }
}

async function main() {
  const token = process.env.GH_TOKEN
  if (!token) throw new Error('GH_TOKEN is not set')
  const repo = process.env.GITHUB_REPOSITORY ?? ''
  if (repo !== REPO) throw new Error(`this job is for ${REPO}, not ${repo}`)
  const label = process.env.LABEL ?? ''
  const pr = process.env.PR_NUMBER ?? ''
  const outcome = await rerunForLabel({ api: restApi({ token }), repo, pr, label })
  const text = summaryOf(outcome, label)
  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`)
  if (outcome.action === 'rerun') {
    console.log(
      `::notice title=Tracy CI re-run::run ${String(outcome.run.id)} attempt ${String(outcome.attempt)} started for label ${label}`
    )
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.log(`::error title=Tracy CI was not re-run::${String(error?.message ?? error)}`)
    process.exit(1)
  })
}
