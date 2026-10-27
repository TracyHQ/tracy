// Daily QA orchestrator (G8): the --first-run flow on fakes (no Docker, gh, claude or codex), the
// run lock, orphan reconciliation at the start of a run, the watchdog, follow-ups and regression.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, test } from 'node:test'

import { brakeReason, createGh, fileLedger } from '../qa/lib/issues.mjs'
import { LOCK_BUSY, LOCKF, lockArgv, reconcileOrphans, spawnTracked } from '../qa/lib/lock.mjs'
import { readLines } from '../qa/lib/journal.mjs'
import { readJson } from '../qa/lib/state.mjs'
import { removeTree } from '../qa/lib/rerun.mjs'
import { addFollowup, readFollowups, tickFollowup, eligibleAgain } from '../qa/lib/followups.mjs'
import { noteGreen, readRegression, recordResult } from '../qa/lib/regression.mjs'
import { createWatchdog, DENY_HOST } from '../qa/lib/watchdog.mjs'
import { caseErrors, caseStatuses, gitRunner, laneStatus, parseArgs, runNight } from '../qa/nightly.mjs'

const tmp = mkdtempSync(join(tmpdir(), 'qa-nightly-'))
after(() => removeTree(tmp))

const sha = (s) => createHash('sha256').update(s).digest('hex')
const T = 'b'.repeat(40)
const X2 = 'a'.repeat(40)

function gitRepos(root) {
  const git = gitRunner()
  const origin = join(root, 'origin.git')
  const repo = join(root, 'repo')
  mkdirSync(repo, { recursive: true })
  git(['init', '-q', '--bare', origin], { cwd: root })
  git(['init', '-q', '-b', 'develop'], { cwd: repo })
  writeFileSync(join(repo, 'README'), 'x\n')
  git(['add', '.'], { cwd: repo })
  git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'init'], { cwd: repo })
  git(['remote', 'add', 'origin', origin], { cwd: repo })
  return { git, origin, repo }
}

function fakeDeps({ ledgerFile, printed, calls }) {
  const prs = [
    {
      number: 101,
      title: 'Sites list loads fast',
      author: { login: 'alice' },
      mergeCommit: 'c'.repeat(40),
      kind: 'apps',
      priority: 2,
      files: ['apps/x.js']
    },
    {
      number: 102,
      title: 'Save returns 200',
      author: { login: 'bob' },
      mergeCommit: 'd'.repeat(40),
      kind: 'apps',
      priority: 2,
      files: ['apps/y.js']
    },
    {
      number: 103,
      title: 'Docs only',
      author: { login: 'carol' },
      mergeCommit: 'e'.repeat(40),
      kind: 'docs',
      priority: 9,
      files: ['docs/a.md']
    }
  ]
  const quote = { 101: 'The sites list loads.', 102: 'Saving returns 200.' }
  let matchesCalls = 0
  return {
    git: gitRunner(),
    fetchT: () => T,
    discoverPrs: (o) => {
      calls.push(['discoverPrs', o.from, o.to])
      return { from: o.from, to: o.to, prs, directCommits: [], reverted: [] }
    },
    prBody: (n) => `Description.\n\n${quote[n] ?? ''}\n`,
    prDiff: () => 'diff --git a/x b/x\n',
    planPr: async ({ pr }) => ({
      plan: {
        pr: pr.key,
        cases: [
          {
            id: `${pr.key}-k1`,
            quote: quote[pr.key.slice(2)],
            statement: 's',
            seam: 1,
            expected: 'e',
            needsChat: false,
            needsSite: 'none',
            checkable: true,
            reason: 'r',
            quoteVerbatim: true
          }
        ]
      },
      errors: []
    }),
    runAgent: async (o) => {
      calls.push(['runAgent', o.role, o.lane, o.key])
      assert.ok(o.sandboxProfile, 'a write or verify lane always runs fenced')
      if (o.role === 'write') {
        const id = `${o.key}-k1`
        const text = `// e\nimport { test } from 'node:test'\ntest('${id}', () => {})\n`
        writeFileSync(join(o.cwd, `${id}.test.mjs`), text)
        writeFileSync(
          join(o.cwd, 'result.json'),
          JSON.stringify({
            pr: o.key,
            lane: o.lane,
            cases: [
              {
                caseId: id,
                file: `${id}.test.mjs`,
                expectedFrom: 'e',
                level: 'stand',
                before: {
                  outcome: 'fail',
                  message: 'red before',
                  testSha256: sha(text),
                  libSha256: sha('lib'),
                  preconditions: []
                }
              }
            ]
          })
        )
      } else {
        writeFileSync(
          join(o.cwd, 'verdict.json'),
          JSON.stringify({
            pr: o.key,
            cases: [
              {
                caseId: `${o.key}-k1`,
                verdict: 'differs',
                observeFile: null,
                observation: 'POST /api/save returned 500',
                reason: 'the claim says 200'
              }
            ]
          })
        )
      }
      return { status: 'ok', usd: 0.1, durationMs: 1000 }
    },
    rerun: async ({ lane, pr, target }) => {
      calls.push(['rerun', lane, pr, target ?? null])
      const id = `pr${pr}-k1`
      const ok = Number(pr) === 101
      return {
        ok,
        tests: [{ file: `/x/${id}.test.mjs`, ok }],
        files: [{ path: `tests/${id}.test.mjs` }],
        summary: { pass: ok ? 1 : 0, fail: ok ? 0 : 1 },
        outputTail: ok ? '' : 'AssertionError: 500 !== 200'
      }
    },
    stand: {
      prepareSrc: async () => [],
      checkConfig: async () => ({ ok: true }),
      build: async () => {
        calls.push(['build'])
        return { ok: true }
      },
      deploy: async () => {
        calls.push(['deploy'])
        return { ok: true, step: 'done' }
      },
      matches: async () =>
        ++matchesCalls === 1
          ? { ok: false, reasons: ['sourceSha'], sha: X2 }
          : { ok: true, reasons: [], sha: T }
    },
    reconcileOrphans,
    startLaneServices: async ({ lane }) => {
      calls.push(['services', lane])
      return { stop() {} }
    },
    preflight: () => [],
    gh: createGh({ dryRun: true, print: (l) => printed.push(l) }),
    issuesLedger: fileLedger(ledgerFile),
    watchdogProbes: {},
    sleep: async () => {},
    bins: {},
    cliBins: []
  }
}

test('parseArgs: the CLI the orchestrator session calls', () => {
  const c = parseArgs(
    [
      '--first-run',
      '--baseline',
      X2,
      '--dry-run-issues',
      '--max-prs',
      '2',
      '--only-pr',
      '5,6',
      '--skip-build',
      '--lanes',
      'sonnet'
    ],
    { QA_HOME: '/q' }
  )
  assert.equal(c.mode, 'first-run')
  assert.equal(c.baseline, X2)
  assert.equal(c.dryRunIssues, true)
  assert.equal(c.maxPrs, 2)
  assert.deepEqual(c.onlyPr, [5, 6])
  assert.equal(c.skipBuild, true)
  assert.deepEqual(c.lanes, ['sonnet'])
  assert.equal(c.qaHome, '/q')
  assert.throws(() => parseArgs(['--first-run']), /baseline/)
  assert.throws(() => parseArgs(['--run', '--lanes', 'opus']), /unknown lane/)
})

test('case and lane statuses', () => {
  const s = caseStatuses({
    tests: [
      { file: '/a/pr1-k1.test.mjs', ok: true },
      { file: '/a/pr1-k2.test.mjs', ok: false }
    ],
    files: [{ path: 'tests/pr1-k3.test.mjs' }]
  })
  assert.deepEqual(
    [...s],
    [
      ['pr1-k1', 'pass'],
      ['pr1-k2', 'fail'],
      ['pr1-k3', 'fail']
    ]
  )
  assert.equal(laneStatus({ written: false }), 'no-test')
  assert.equal(laneStatus({ written: true, first: 'pass' }), 'green')
  assert.equal(laneStatus({ written: true, first: 'fail', second: 'pass' }), 'flaky')
  assert.equal(laneStatus({ written: true, first: 'fail', second: 'fail' }), 'red')
  assert.equal(laneStatus({ written: true, standOk: false, first: 'fail' }), 'stand-error')
})

test('a case red twice only because the fence refused a repo command is not-checkable, not red', () => {
  const xcrun =
    't: Command failed: git ls-files\nxcrun: error: unable to load libxcrun (... (file system sandbox blocked open()))'
  const corepack = 'Corepack is about to download https://registry.npmjs.org/pnpm/-/pnpm-10.tgz'
  const eperm = "EPERM: operation not permitted, open '/w/qa-src/scripts/test/x.json'"
  const result = (msg) => ({
    tests: [
      { file: '/r/pr/1/tests/pr1-k1.test.mjs', ok: false, error: { message: msg } },
      { file: '/r/pr/1/tests/pr1-k1.test.mjs', ok: true },
      { file: '/r/pr/1/tests/pr1-k2.test.mjs', ok: false, error: { message: '1 !== 0' } }
    ]
  })
  const e1 = caseErrors(result(xcrun))
  assert.deepEqual(e1.get('pr1-k1'), [xcrun])
  assert.deepEqual(e1.get('pr1-k2'), ['1 !== 0'])
  const both = (a, b) =>
    laneStatus({ written: true, first: 'fail', second: 'fail', firstErrors: a, secondErrors: b })
  assert.equal(both([xcrun], [corepack]), 'not-checkable')
  assert.equal(both([eperm], ['Network access disabled by the environment']), 'not-checkable')
  assert.equal(both([xcrun, '1 !== 0'], [xcrun]), 'red', 'one product failure keeps it red')
  assert.equal(both([xcrun], []), 'red', 'no message on the second run: not proven fence-only')
  assert.equal(both(undefined, undefined), 'red')
  assert.equal(
    laneStatus({ written: true, first: 'fail', second: 'pass', firstErrors: [xcrun], secondErrors: [] }),
    'flaky'
  )
})

test('not-checkable lanes do not count toward the issue brake', () => {
  const prs = [1, 2, 3].map((number) => ({ number }))
  const lanesOf = (s) => ({ sonnet: { status: s }, sol: { status: s } })
  const cases = [
    { id: 'pr1-k1', pr: 1, lanes: lanesOf('not-checkable') },
    { id: 'pr2-k1', pr: 2, lanes: lanesOf('not-checkable') },
    { id: 'pr3-k1', pr: 3, lanes: lanesOf('green') }
  ]
  assert.equal(brakeReason({ prs, cases }), null)
})

test('--first-run on fakes: red before, green on T for one PR, red + astra differs for the other -> one dry-run issue, report has both', async () => {
  const root = join(tmp, 'first')
  const qaHome = join(root, 'qa')
  const worktrees = join(root, 'wt')
  mkdirSync(join(qaHome, 'state'), { recursive: true })
  mkdirSync(worktrees, { recursive: true })
  const { repo, origin, git } = gitRepos(root)

  // An orphan of an earlier run: a tracked `sleep` whose orchestrator died.
  const oldRun = '20261001a'
  const oldProcs = join(qaHome, 'r', oldRun, 'procs.jsonl')
  const orphan = spawnTracked(oldProcs, { runId: oldRun, label: 'old-lane' }, '/bin/sleep', ['30'], {
    stdio: 'ignore'
  })
  orphan.unref()
  await new Promise((r) => setTimeout(r, 200))

  const printed = []
  const calls = []
  const deps = fakeDeps({ repoDir: repo, ledgerFile: join(qaHome, 'state', 'issues.jsonl'), printed, calls })
  const cfg = {
    ...parseArgs(['--first-run', '--baseline', X2, '--dry-run-issues', '--lanes', 'sonnet,sol'], {
      QA_HOME: qaHome
    }),
    worktrees,
    repoDir: repo,
    runId: '20261003a',
    echo: false
  }
  const r = await runNight(cfg, deps)
  assert.equal(r.exitCode, 0, readFileSync(join(r.runDir, 'nightly.log'), 'utf8'))

  // orphan reconciled with the G1 function: the old sleep is gone
  await new Promise((res) => setTimeout(res, 300))
  assert.equal(spawnSync('kill', ['-0', String(orphan.pid)]).status !== 0, true, 'orphan killed')

  // range X2..T, docs PR left out of the work
  assert.deepEqual(
    calls.find((c) => c[0] === 'discoverPrs'),
    ['discoverPrs', X2, T]
  )
  assert.deepEqual(r.night.docsOnly, [103])
  // tests written before the rebuild, rebuild before the rerun
  const order = calls.map((c) => c[0])
  assert.ok(
    order.lastIndexOf('runAgent') > order.indexOf('build') ||
      order.indexOf('runAgent') < order.indexOf('build')
  )
  assert.ok(order.indexOf('runAgent') < order.indexOf('build'), 'P3 before P4')
  assert.ok(order.indexOf('deploy') < order.indexOf('rerun'), 'P4 before P5')
  // one verify run, for 102 only
  const verifies = calls.filter((c) => c[0] === 'runAgent' && c[1] === 'verify')
  assert.deepEqual(
    verifies.map((c) => c[3]),
    ['pr102']
  )
  // red twice -> a second rerun of the case only
  assert.ok(calls.some((c) => c[0] === 'rerun' && c[2] === '102' && c[3] === 'pr102-k1'))

  // issues: dry run, one create command for #102 only, nothing in the ledger
  const creates = printed.filter((l) => l.startsWith('$ gh issue create'))
  assert.equal(creates.length, 1, printed.join('\n'))
  assert.match(printed.join('\n'), /pr102-k1/)
  assert.doesNotMatch(creates[0], /101/)
  assert.equal(existsSync(join(qaHome, 'state', 'issues.jsonl')), false)

  // report: both PRs
  const report = readFileSync(r.reportFile, 'utf8')
  assert.match(report, /#101/)
  assert.match(report, /#102/)
  assert.equal(r.night.observedOk[0].pr, 101)
  assert.equal(r.night.needsReview[0].pr, 102)
  assert.equal(r.night.needsReview[0].differsFromB, 'yes')

  // qa/daily-tests: orphan branch with lib + tests per lane + the report, pushed to origin
  const log = git(['log', '--format=%s', 'qa/daily-tests'], { cwd: origin }).stdout
  assert.match(log, /nightly report 20261003a/)
  assert.match(log, /nightly run 20261003a/)
  const tree = git(['ls-tree', '-r', '--name-only', 'qa/daily-tests'], { cwd: origin }).stdout
  for (const f of [
    'sonnet/lib/stand.mjs',
    'sonnet/pr-101/pr101-k1.test.mjs',
    'sol/pr-102/pr102-k1.test.mjs',
    'reports/20261003a.md'
  ])
    assert.ok(tree.includes(f), `${f} in\n${tree}`)
  assert.doesNotMatch(tree, /README/, 'the branch is an orphan')

  // state: discovery moved to T, run.json gone, follow-up recorded, progress log readable
  assert.equal(readJson(join(qaHome, 'state', 'discovery.json')).discoveredThrough, T)
  assert.equal(existsSync(join(qaHome, 'state', 'run.json')), false)
  assert.ok(readFollowups(qaHome).cases['pr102-k1'])
  const lines = readLines(join(r.runDir, 'nightly.log')).lines
  assert.ok(lines.some((l) => l.phase === 'P5' && l.pr === 102 && l.lane === 'sonnet'))
  assert.deepEqual(readJson(join(qaHome, 'state', 'fixed-sites.json')), ['qa-fixedwp'])
})

test('the run lock argv uses the macOS nonblocking kernel lock', () => {
  assert.equal(LOCKF, '/usr/bin/lockf')
  assert.deepEqual(lockArgv('/tmp/run.lock', ['/usr/bin/true']), [
    LOCKF,
    '-k',
    '-t',
    '0',
    '/tmp/run.lock',
    '/usr/bin/true'
  ])
})

test('the run lock: a second run under lockf exits 75', {
  skip: !existsSync(LOCKF) && 'no macOS lockf; argv contract is tested on every platform'
}, async () => {
  const lock = join(tmp, 'run.lock')
  const [cmd, ...args] = lockArgv(lock, ['/bin/sleep', '5'])
  const holder = spawn(cmd, args, { stdio: 'ignore' })
  await new Promise((r) => setTimeout(r, 300))
  const [c2, ...a2] = lockArgv(lock, ['/usr/bin/true'])
  assert.equal(spawnSync(c2, a2).status, LOCK_BUSY)
  holder.kill('SIGKILL')
  await new Promise((r) => holder.once('exit', r))
  assert.equal(spawnSync(c2, a2).status, 0, 'released when the holder dies')
  assert.equal(LOCKF, '/usr/bin/lockf')
})

test('watchdog: chat over the cap -> deny file + chat-off; unknown QA site -> orphan + lanes stopped; capacity flag', async () => {
  const qaHome = join(tmp, 'wd')
  const state = join(qaHome, 'state')
  mkdirSync(state, { recursive: true })
  const chat = join(state, 'chat.jsonl')
  for (let i = 0; i < 3; i++)
    writeFileSync(
      chat,
      `${JSON.stringify({ t: 'intent', id: `i${i}`, runId: 'R', lane: 'sonnet', site: 'qa-s1', at: new Date().toISOString() })}\n`,
      { flag: 'a' }
    )
  const stopped = []
  const wd = createWatchdog({
    qaHome,
    runId: 'R',
    caps: { chatPerLane: 2 },
    fixedSites: ['qa-fixedwp'],
    probes: { standSites: () => ['qa-fixedwp', 'qa-stray', 'customer'], memory: () => ({ usedRatio: 0.95 }) },
    onStopLane: (l) => stopped.push(l)
  })
  const t = await wd.tick()
  assert.equal(t.chatOff, true)
  assert.match(readFileSync(join(state, 'egress', 'deny'), 'utf8'), new RegExp(DENY_HOST))
  assert.deepEqual(t.orphans, ['qa-stray'])
  assert.deepEqual(stopped.sort(), ['sol', 'sonnet', 'verify'])
  assert.ok(
    readLines(join(state, 'sites.jsonl')).lines.some((l) => l.t === 'orphan' && l.siteKey === 'qa-stray')
  )
  assert.equal(readJson(join(state, 'capacity.json')).ok, false)
  const again = await wd.tick()
  assert.deepEqual(again.orphans, [], 'an orphan is journaled once')
})

test('follow-ups: red without issue stays eligible; green two nights -> one passes comment; 14 nights -> ended', () => {
  const doc = { cases: {}, ended: [] }
  addFollowup(doc, { caseId: 'pr1-k1', pr: 1, lane: 'sonnet', reason: 'differs', runId: 'a' })
  tickFollowup(doc, 'pr1-k1', { ok: false, runId: 'b' })
  assert.equal(eligibleAgain(doc).length, 1)
  doc.cases['pr1-k1'].issue = 9
  assert.equal(tickFollowup(doc, 'pr1-k1', { ok: true, runId: 'c' }).action, null)
  const r = tickFollowup(doc, 'pr1-k1', { ok: true, runId: 'd', sha: T })
  assert.equal(r.action, 'passes-comment')
  assert.equal(doc.ended.length, 1)
  addFollowup(doc, { caseId: 'pr2-k1', pr: 2, lane: 'sol', reason: 'differs', runId: 'a' })
  let last
  for (let i = 0; i < 14; i++) last = tickFollowup(doc, 'pr2-k1', { ok: false, runId: `n${i}` })
  assert.equal(last.ended, '14 nights')
})

test('regression: green twice on T enters; flaky twice in 7 nights -> quarantined', () => {
  const doc = readRegression(join(tmp, 'none.json'))
  assert.equal(noteGreen(doc, { caseId: 'pr1-k1', level: 'stand', runId: 'a' }).added, false)
  assert.equal(
    noteGreen(doc, { caseId: 'pr1-k1', level: 'stand', runId: 'a' }).added,
    false,
    'same night counts once'
  )
  assert.equal(noteGreen(doc, { caseId: 'pr1-k1', level: 'stand', runId: 'b' }).added, true)
  assert.equal(noteGreen(doc, { caseId: 'pr9-k1', level: 'code', runId: 'b' }).added, false)
  assert.equal(recordResult(doc, 'pr1-k1', { runId: 'c', ok: true, flaky: true }).quarantined, false)
  assert.equal(recordResult(doc, 'pr1-k1', { runId: 'd', ok: true, flaky: true }).quarantined, true)
})
