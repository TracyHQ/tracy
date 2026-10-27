// Guards the workflow that re-runs Tracy CI when a pull request gets ci:e2e or ci:integration:
// which run it picks, that it waits for a cancelled run, that it never touches another commit's run,
// and that a refusal from the API is red. Driven with a fake API; whether the job token may call
// /rerun on the real repository is not something this file can show.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { load } from 'js-yaml'

import { CI_REPOSITORY } from '../ci/ci-repository.mjs'
import { WORKFLOW_FILE, rerunForLabel, restApi, summaryOf } from '../ci/label-rerun.mjs'

const REPO = CI_REPOSITORY
const HEAD = 'a'.repeat(40)
const OTHER_HEAD = 'b'.repeat(40)

const pull = (over = {}) => ({
  state: 'open',
  draft: false,
  base: { ref: 'develop' },
  head: { sha: HEAD, repo: { full_name: REPO } },
  ...over
})
/** A moment `n` seconds after a fixed start, written the way GitHub writes it. */
const at = (n) => new Date(Date.UTC(2026, 9, 16, 10, 0, 0) + n * 1000).toISOString().replace('.000Z', 'Z')
const run = (id, over = {}) => ({
  id,
  run_number: id,
  run_attempt: 1,
  event: 'pull_request',
  head_sha: HEAD,
  status: 'completed',
  conclusion: 'success',
  created_at: at(id),
  run_started_at: at(id),
  pull_requests: [{ number: 7 }],
  html_url: `https://github.com/${REPO}/actions/runs/${id}`,
  ...over
})

/** A fake API: `routes` answer GETs (a function sees how often the path was asked), `posts` answer POSTs. */
function fake({ pulls = [pull()], runs = [], statuses = {}, posts = {} }) {
  const calls = []
  const asked = new Map()
  let pullAt = 0
  return {
    calls,
    get: async (path) => {
      calls.push(['GET', path])
      asked.set(path, (asked.get(path) ?? 0) + 1)
      if (path === `repos/${REPO}/pulls/7`) return pulls[Math.min(pullAt++, pulls.length - 1)]
      if (path.startsWith(`repos/${REPO}/actions/workflows/${WORKFLOW_FILE}/runs?`))
        return { workflow_runs: runs }
      const m = /actions\/runs\/(\d+)$/.exec(path)
      if (m) {
        const seq = statuses[m[1]] ?? ['completed']
        const n = asked.get(path) - 1
        return { ...runs.find((r) => String(r.id) === m[1]), status: seq[Math.min(n, seq.length - 1)] }
      }
      throw new Error(`unexpected GET ${path}`)
    },
    post: async (path) => {
      calls.push(['POST', path])
      return posts[path] ?? { status: path.endsWith('/cancel') ? 202 : 201, body: {} }
    }
  }
}
const go = (api, over = {}) =>
  rerunForLabel({
    api,
    repo: REPO,
    pr: 7,
    label: 'ci:e2e',
    sleep: async () => {},
    now: (() => {
      let t = 0
      return () => (t += 1000)
    })(),
    ...over
  })
const posts = (api) => api.calls.filter(([m]) => m === 'POST').map(([, p]) => p)

test('a finished run of the head commit is re-run in full, once', async () => {
  const api = fake({ runs: [run(100)] })
  const got = await go(api)
  assert.equal(got.action, 'rerun')
  assert.equal(got.cancelled, false)
  assert.equal(got.attempt, 2)
  assert.deepEqual(posts(api), [`repos/${REPO}/actions/runs/100/rerun`])
})

test('the run is asked for by event, head commit and workflow file, and the newest of the pull request wins', async () => {
  const api = fake({ runs: [run(100), run(104), run(106, { pull_requests: [{ number: 9 }] })] })
  const got = await go(api)
  assert.equal(got.run.id, 104)
  const list = api.calls.find(([, p]) => p.includes('/runs?'))[1]
  assert.match(list, new RegExp(`workflows/tracy-ci\\.yml/runs\\?event=pull_request&head_sha=${HEAD}`))
})

test('the newest run is the one whose latest attempt started last, not the highest run number', async () => {
  // Run 100 was re-run after run 104 had finished: its attempt 2 is the latest word on the commit.
  const api = fake({ runs: [run(104), run(100, { run_attempt: 2, run_started_at: at(500) })] })
  const got = await go(api)
  assert.equal(got.run.id, 100)
  assert.equal(got.attempt, 3)
  assert.deepEqual(posts(api), [`repos/${REPO}/actions/runs/100/rerun`])
})

test('a run list that cannot be put in order is an error, never a guess', async () => {
  const api = fake({ runs: [run(100, { run_started_at: 'yesterday' })] })
  await assert.rejects(go(api), /which run is the newest cannot be told/)
  assert.deepEqual(posts(api), [])
})

test('a run that is still going is cancelled, waited for until completed, and then re-run', async () => {
  const api = fake({
    runs: [run(100, { status: 'in_progress', conclusion: null, run_attempt: 2 })],
    statuses: { 100: ['in_progress', 'in_progress', 'completed'] }
  })
  const got = await go(api)
  assert.equal(got.action, 'rerun')
  assert.equal(got.cancelled, true)
  assert.equal(got.attempt, 3)
  assert.deepEqual(posts(api), [
    `repos/${REPO}/actions/runs/100/cancel`,
    `repos/${REPO}/actions/runs/100/rerun`
  ])
  // The re-run comes after the run was seen completed, never before.
  const lastGet = api.calls
    .map(([, p], i) => [p, i])
    .filter(([p]) => p.endsWith('/runs/100'))
    .pop()[1]
  const rerunAt = api.calls.findIndex(([, p]) => p.endsWith('/rerun'))
  assert.ok(lastGet < rerunAt)
})

test('every busy status is cancelled first', async () => {
  for (const status of ['queued', 'in_progress', 'waiting', 'requested', 'pending']) {
    const api = fake({ runs: [run(100, { status, conclusion: null })] })
    const got = await go(api)
    assert.equal(got.cancelled, true, status)
    assert.equal(posts(api).length, 2, status)
  }
})

test('a run that finished between the list and the cancel (HTTP 409) is simply re-run', async () => {
  const api = fake({
    runs: [run(100, { status: 'in_progress', conclusion: null })],
    posts: { [`repos/${REPO}/actions/runs/100/cancel`]: { status: 409, body: { message: 'completed' } } }
  })
  assert.equal((await go(api)).action, 'rerun')
})

test('nothing to re-run: no run yet, a draft, a closed or retargeted pull request, a fork, another label', async () => {
  const none = async (api, over, why) => {
    const got = await go(api, over)
    assert.equal(got.action, 'none', why)
    assert.deepEqual(posts(api), [], `${why}: nothing was cancelled or re-run`)
    return got
  }
  assert.match((await none(fake({ runs: [] }), {}, 'no run')).why, /no Tracy CI run exists/)
  await none(fake({ pulls: [pull({ draft: true })], runs: [run(1)] }), {}, 'draft')
  await none(fake({ pulls: [pull({ state: 'closed' })], runs: [run(1)] }), {}, 'closed')
  await none(fake({ pulls: [pull({ base: { ref: 'main' } })], runs: [run(1)] }), {}, 'main')
  await none(
    fake({ pulls: [pull({ head: { sha: HEAD, repo: { full_name: 'someone/tch' } } })], runs: [run(1)] }),
    {},
    'fork'
  )
  await none(fake({ runs: [run(1)] }), { label: 'bug' }, 'another label')
})

test('only a run of this event, this head and this pull request is a candidate', async () => {
  const api = fake({
    runs: [
      run(1, { head_sha: OTHER_HEAD }),
      run(2, { event: 'schedule' }),
      run(3, { event: 'workflow_dispatch', pull_requests: [] }),
      run(4, { pull_requests: [{ number: 9 }] }),
      run(5, { pull_requests: [] })
    ]
  })
  const got = await go(api)
  assert.equal(got.action, 'none')
  assert.deepEqual(posts(api), [])
})

test('a head that moved while the job waited ends it without a re-run: the new head’s run reads the labels', async () => {
  const api = fake({
    pulls: [pull(), pull({ head: { sha: OTHER_HEAD, repo: { full_name: REPO } } })],
    runs: [run(100, { status: 'in_progress', conclusion: null })]
  })
  const got = await go(api)
  assert.equal(got.action, 'none')
  assert.match(got.why, /head moved/)
  assert.deepEqual(posts(api), [`repos/${REPO}/actions/runs/100/cancel`])
})

test('a refusal is an error the job shows in red, never a quiet success', async () => {
  const refused = (path, status) => ({
    [path]: { status, body: { message: 'Resource not accessible by integration' } }
  })
  await assert.rejects(
    go(fake({ runs: [run(100)], posts: refused(`repos/${REPO}/actions/runs/100/rerun`, 403) })),
    /re-running run 100 was refused: HTTP 403 Resource not accessible/
  )
  await assert.rejects(
    go(
      fake({
        runs: [run(100, { status: 'queued', conclusion: null })],
        posts: refused(`repos/${REPO}/actions/runs/100/cancel`, 403)
      })
    ),
    /cancelling run 100 was refused: HTTP 403/
  )
})

test('a cancelled run that never completes is an error, not an endless wait', async () => {
  const api = fake({
    runs: [run(100, { status: 'in_progress', conclusion: null })],
    statuses: { 100: ['in_progress'] }
  })
  await assert.rejects(go(api, { waitMs: 3000 }), /still in_progress 3 s after it was cancelled/)
  assert.deepEqual(posts(api), [`repos/${REPO}/actions/runs/100/cancel`])
})

test('malformed answers are errors', async () => {
  await assert.rejects(
    go(fake({ pulls: [pull({ head: { sha: 'abc', repo: { full_name: REPO } } })] })),
    /no head commit/
  )
  await assert.rejects(
    rerunForLabel({ api: fake({}), repo: REPO, pr: 'x', label: 'ci:e2e', sleep: async () => {} }),
    /not a pull request number/
  )
  const api = fake({ runs: [] })
  api.get = async (path) => (path.includes('/runs?') ? { workflow_runs: 'nope' } : pull())
  await assert.rejects(go(api), /run list is not a list/)
})

test('the summary says which run was re-run and why, or why nothing was', () => {
  const rerun = summaryOf({ action: 'rerun', run: run(100), cancelled: true, attempt: 2 }, 'ci:e2e')
  assert.match(rerun, /ci:e2e/)
  assert.match(rerun, /runs\/100/)
  assert.match(rerun, /cancelled while it was running/)
  assert.match(summaryOf({ action: 'none', why: 'no run' }, 'ci:e2e'), /not re-run[\s\S]*no run/)
})

test('the REST transport only talks to the CI repository, and POST needs no body', async () => {
  const seen = []
  const api = restApi({
    token: 't',
    fetchImpl: async (url, init) => {
      seen.push([url, init.method, init.headers.authorization])
      return { ok: true, status: 201, json: async () => ({ ok: 1 }) }
    }
  })
  assert.deepEqual(await api.post(`repos/${REPO}/actions/runs/1/rerun`), { status: 201, body: { ok: 1 } })
  assert.deepEqual(seen[0], [`https://api.github.com/repos/${REPO}/actions/runs/1/rerun`, 'POST', 'Bearer t'])
  for (const bad of [
    'repos/other/x/actions/runs/1',
    'user',
    `repos/${REPO}/../../x`,
    'https://evil.example/',
    `/repos/${REPO}/x`,
    'repos/TracyHQ/other/x'
  ]) {
    await assert.rejects(api.get(bad), /only talks to /, bad)
  }
})

// ── the workflow ─────────────────────────────────────────────────────────────────────────────────

const yml = readFileSync(new URL('../../.github/workflows/ci-label-rerun.yml', import.meta.url), 'utf8')
const wf = load(yml)

test('the workflow listens for labeled on pull requests into develop, and for nothing else', () => {
  assert.deepEqual(Object.keys(wf.on), ['pull_request_target'])
  assert.deepEqual(wf.on.pull_request_target.types, ['labeled'])
  assert.deepEqual(wf.on.pull_request_target.branches, ['develop'])
})

test('it runs only for the two labels, never on a draft or a fork, with the minimum permissions', () => {
  const job = wf.jobs.rerun
  assert.match(job.if, /label\.name == 'ci:e2e'/)
  assert.match(job.if, /label\.name == 'ci:integration'/)
  assert.match(job.if, /draft == false/)
  assert.match(job.if, /head\.repo\.full_name == github\.repository/)
  assert.deepEqual(wf.permissions, { contents: 'read', actions: 'write', 'pull-requests': 'read' })
  assert.equal(job.permissions, undefined, 'one permission set, written once, at the top')
})

test('it runs the base commit’s code and never the pull request’s: no head checkout, no credential kept', () => {
  const steps = wf.jobs.rerun.steps
  const checkouts = steps.filter((s) => String(s.uses ?? '').startsWith('actions/checkout'))
  assert.equal(checkouts.length, 1)
  assert.equal(checkouts[0].with.ref, '${{ github.event.pull_request.base.sha }}')
  assert.equal(checkouts[0].with['persist-credentials'], false)
  // Nothing in the file names the head to check out or to run: the head is read from the API, as data.
  assert.ok(
    !/pull_request\.head\.(?:sha|ref)/.test(yml),
    'the workflow never refers to the head commit or branch'
  )
  assert.ok(!/\.head\.sha/.test(JSON.stringify(steps)))
  // The only things taken from the event go in through env, never into the command line.
  const last = steps.at(-1)
  assert.equal(last.run, 'node scripts/ci/label-rerun.mjs')
  assert.ok(!last.run.includes('${{'))
})

test('it runs on the light pool of the dev lane, like the other light jobs, and takes its input as data', () => {
  const labels = wf.jobs.rerun['runs-on']
  assert.deepEqual(labels.slice(0, 3), ['self-hosted', 'linux', 'tracy-light'])
  assert.ok(!labels.includes('x64'))
  // Pull-request work only, so always the dev lane (docs/references/public-repo-ci.md).
  assert.equal(labels[3], 'tracy-lane-dev')
  const step = wf.jobs.rerun.steps.at(-1)
  assert.equal(step.env.LABEL, '${{ github.event.label.name }}')
  assert.equal(step.env.PR_NUMBER, '${{ github.event.pull_request.number }}')
  assert.equal(step.env.GH_TOKEN, '${{ github.token }}')
})

/** Evaluate the `${{ … }}` parts of a concurrency group the way Actions does (the syntax used is JS's). */
function groupOf(label, runId, pr = 7) {
  const github = { event: { label: { name: label }, pull_request: { number: pr } }, run_id: runId }
  return wf.concurrency.group.replace(/\$\{\{([\s\S]*?)\}\}/g, (_, expr) =>
    String(new Function('github', `return (${expr})`)(github))
  )
}

test('the concurrency group gathers the two watched labels and gives every other label a group of its own', () => {
  assert.equal(wf.concurrency['cancel-in-progress'], true)
  // The watched labels of one pull request share a group: the second cancels the first and does it all.
  assert.equal(groupOf('ci:e2e', 1), groupOf('ci:integration', 2))
  assert.notEqual(groupOf('ci:e2e', 1, 7), groupOf('ci:e2e', 1, 8), 'one group per pull request')
  // An unrelated label, added a second later, must NOT join it: it would cancel the job that is
  // cancelling and re-running Tracy CI, and nobody would re-run it.
  assert.notEqual(groupOf('bug', 3), groupOf('ci:e2e', 1))
  assert.notEqual(groupOf('bug', 3), groupOf('ci:integration', 1))
  // And two unrelated labels do not cancel each other either.
  assert.notEqual(groupOf('bug', 3), groupOf('area:ci', 4))
  // The group still names the pull request, and the expression holds both sides.
  assert.match(wf.concurrency.group, /pull_request\.number/)
  assert.match(wf.concurrency.group, /github\.run_id/)
  assert.match(wf.concurrency.group, /'tracked'/)
})

test('Tracy CI itself is untouched by labels: its triggers and concurrency are as they were', () => {
  const ci = load(readFileSync(new URL('../../.github/workflows/tracy-ci.yml', import.meta.url), 'utf8'))
  assert.deepEqual(ci.on.pull_request.types, ['opened', 'synchronize', 'ready_for_review'])
  assert.equal(ci.concurrency['cancel-in-progress'], "${{ github.event_name == 'pull_request' }}")
})
