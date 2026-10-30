#!/usr/bin/env node
/**
 * How `scripts/ci/new-test-proof.mjs` is wired into Tracy CI (`.github/workflows/tracy-ci.yml`):
 * which pull requests get the proof job, that every non-draft pull request gets the growth line,
 * that both are report-only without hiding a tool error, and that the `build-check` rows are what
 * they were.
 *
 * The workflow is parsed (js-yaml); the two jobs' `if` are pure `&&` conjunctions and are compared
 * clause by clause; their shell steps are executed with bash, the proof step against a stand-in
 * `node` so that no scratch copy of this repository is made by a unit test.
 *
 *   node --test scripts/test/ci-new-test-proof.test.mjs
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { load } from 'js-yaml'

import { DEFAULT_BUDGET_SECONDS } from '../ci/new-test-proof.mjs'
import { planMatrix, planProof } from '../ci/plan-ci.mjs'
import { runnerPaths } from '../test-support/runs-on.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const TEXT = readFileSync(join(ROOT, '.github/workflows/tracy-ci.yml'), 'utf8')
const workflow = load(TEXT)
const jobs = workflow.jobs
const proof = jobs['new-test-proof']
const growth = jobs['test-growth']

const WORK = mkdtempSync(join(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir(), 'ci-new-test-proof-'))
after(() => rmSync(WORK, { recursive: true, force: true }))

/** The clauses of an `if` that is one conjunction; anything else (`||`, parentheses) is refused. */
function conjunction(expression) {
  const body = String(expression)
    .replace(/^\s*\$\{\{/, '')
    .replace(/\}\}\s*$/, '')
  assert.ok(!/\|\||\(\s*[^)]/.test(body.replaceAll('!cancelled()', '')), `not a plain conjunction: ${body}`)
  return body
    .split('&&')
    .map((clause) => clause.trim().replace(/\s+/g, ' '))
    .sort()
}

const step = (job, name) => job.steps.find((s) => s.name === name)
const PROVE = 'Prove the tests this fix adds or edits'
const CLEAN = 'Remove a scratch copy a cancelled run left behind'
const GROW = 'Report what this pull request adds to and removes from the suite'

test('only a fix pull request is planned a proof: by title or by branch, never another event', () => {
  const pr = (title, branch) => planProof({ event: 'pull_request', title, branch })
  assert.equal(pr('fix(web): a', 'chore/x'), true)
  assert.equal(pr('docs: a', 'fix/x'), true)
  assert.equal(pr('fix!: a', 'feat/x'), true)
  assert.equal(pr('feat(web): a', 'feat/x'), false)
  assert.equal(pr('chore: fix the thing', 'chore/fix-thing'), false)
  assert.equal(pr('Release develop → main', 'release/develop-to-main-2026-10-12'), false)
  assert.equal(pr('', ''), false)
  assert.equal(pr(undefined, undefined), false)
  for (const event of ['schedule', 'workflow_dispatch', 'push'])
    assert.equal(planProof({ event, title: 'fix: a', branch: 'fix/a' }), false, event)
})

test('the planner publishes the decision, reads title and branch as data, and plans the same rows', () => {
  const plan = (env) => {
    const output = join(WORK, `output-${String(Math.random()).slice(2)}`)
    writeFileSync(output, '')
    const run = spawnSync(process.execPath, ['scripts/ci/plan-ci.mjs'], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: '', BASE_REF: 'develop', ...env }
    })
    assert.equal(run.status, 0, run.stderr)
    const lines = readFileSync(output, 'utf8').trim().split('\n')
    return {
      matrix: lines.find((l) => l.startsWith('matrix=')),
      proof: lines.find((l) => l.startsWith('new_test_proof='))
    }
  }
  const marker = join(WORK, 'injected')
  const fix = plan({
    EVENT: 'pull_request',
    PR_TITLE: `fix: $(touch ${marker}) \`touch ${marker}\``,
    HEAD_REF: 'x'
  })
  const feat = plan({ EVENT: 'pull_request', PR_TITLE: 'feat: a', HEAD_REF: 'feat/a' })
  assert.equal(fix.proof, 'new_test_proof=true')
  assert.equal(feat.proof, 'new_test_proof=false')
  assert.ok(!existsSync(marker), 'a title is never run')
  // The proof is not a build-check row: the matrix does not know the kind of a pull request.
  assert.equal(fix.matrix, feat.matrix)
  assert.equal(
    plan({ EVENT: 'schedule', PR_TITLE: 'fix: a', HEAD_REF: 'fix/a' }).proof,
    'new_test_proof=false'
  )
  assert.equal(plan({ EVENT: 'workflow_dispatch' }).proof, 'new_test_proof=false')
  for (const row of planMatrix({ event: 'workflow_dispatch', changed: null, allFiles: [] }).matrix.include)
    assert.ok(!/proof|growth/.test(`${row.group} ${row.args}`), 'no build-check row carries the proof')

  const planStep = step(jobs.plan, 'Plan the rows')
  assert.equal(planStep.env.PR_TITLE, '${{ github.event.pull_request.title }}')
  assert.equal(planStep.env.HEAD_REF, '${{ github.head_ref }}')
  assert.equal(planStep.run, 'node scripts/ci/plan-ci.mjs')
  assert.equal(jobs.plan.outputs.new_test_proof, '${{ steps.plan.outputs.new_test_proof }}')
})

test('the proof job starts only for a non-draft fix pull request whose plan and dsh build are green', () => {
  assert.deepEqual(proof.needs, ['dsh-lib', 'plan'])
  assert.deepEqual(
    conjunction(proof.if),
    [
      '!cancelled()',
      "github.event_name == 'pull_request'",
      'github.event.pull_request.draft == false',
      // Team runners take only branches of this repository (docs/references/public-repo-ci.md).
      'github.event.pull_request.head.repo.full_name == github.repository',
      "needs.plan.result == 'success'",
      "needs.plan.outputs.new_test_proof == 'true'",
      "needs.dsh-lib.result == 'success'"
    ].sort()
  )
  // It is one job, outside the matrix, and no existing job waits for it or for the growth line.
  assert.equal(proof.strategy, undefined)
  for (const [name, job] of Object.entries(jobs))
    for (const needed of [job.needs ?? []].flat())
      assert.ok(!['new-test-proof', 'test-growth'].includes(needed), `${name} must not wait for ${needed}`)
  assert.ok(runnerPaths(proof['runs-on']).selfHosted.includes('tracy-check'))
})

test('every non-draft pull request gets the growth line, with or without a planned suite', () => {
  assert.deepEqual(
    conjunction(growth.if),
    [
      "github.event_name == 'pull_request'",
      'github.event.pull_request.draft == false',
      'github.event.pull_request.head.repo.full_name == github.repository'
    ].sort()
  )
  // No `needs`: it reports when green-tree skipped every row, and a failure of plan cannot hide it.
  assert.equal(growth.needs, undefined)
  assert.ok(runnerPaths(growth['runs-on']).selfHosted.includes('tracy-light'))
  // The Node step runs only on GitHub-hosted (`ci:hosted`); our runners carry Node in their image.
  assert.deepEqual(
    growth.steps.map((s) => s.name),
    ['Check out Git repository', 'Set up Node on a GitHub-hosted runner', GROW],
    'checkout and the report: no install, no test run'
  )
  assert.equal(growth.steps[1].if, "runner.environment == 'github-hosted'")
  assert.match(step(growth, GROW).run, /--growth-only --base HEAD\^1 --head HEAD/)
})

test('both jobs compare HEAD^1 with HEAD of the merge checkout, the pair the planner lists files from', () => {
  for (const job of [proof, growth]) {
    const checkout = job.steps.find((s) => String(s.uses ?? '').startsWith('actions/checkout@'))
    assert.equal(checkout.with['fetch-depth'], 2)
    assert.equal(checkout.with.ref, undefined)
    assert.equal(checkout.with.submodules, false)
  }
  assert.match(step(proof, PROVE).run, /new-test-proof\.mjs --base HEAD\^1 --head HEAD /)
  assert.match(TEXT, /sh\(\['diff'|plan-ci\.mjs/)
  assert.match(readFileSync(join(ROOT, 'scripts/ci/plan-ci.mjs'), 'utf8'), /'HEAD\^1', 'HEAD'/)
})

test('report-only without a mask: no continue-on-error, no --enforce, read-only, nothing spliced into shell', () => {
  assert.deepEqual(workflow.permissions, { contents: 'read' })
  for (const job of [proof, growth]) {
    assert.equal(job.permissions, undefined)
    assert.equal(job['continue-on-error'], undefined)
    for (const s of job.steps) {
      assert.equal(s['continue-on-error'], undefined, `${String(s.name)} must not hide a failure`)
      if (typeof s.run === 'string') {
        assert.ok(!s.run.includes('${{'), `${String(s.name)}: no expression inside a shell body`)
        assert.ok(!s.run.includes('--enforce'), 'the switch stays off in the workflow')
        assert.ok(!/\|\|\s*true|set \+e/.test(s.run), `${String(s.name)} must not swallow an exit code`)
      }
    }
  }
  assert.ok(!TEXT.split('\n').some((line) => !line.trim().startsWith('#') && line.includes('--enforce')))
})

test('scratch copy and evidence live under runner.temp, and a cancelled run is cleaned by an always() step', () => {
  const prove = step(proof, PROVE)
  const clean = step(proof, CLEAN)
  assert.match(
    prove.run,
    /--scratch-root "\$RUNNER_TEMP\/new-test-proof-scratch" --out "\$RUNNER_TEMP\/new-test-proof"/
  )
  assert.equal(clean.if, 'always()')
  assert.equal(
    clean.run,
    'node scripts/ci/new-test-proof.mjs --cleanup --scratch-root "$RUNNER_TEMP/new-test-proof-scratch"'
  )
  assert.ok(proof.steps.indexOf(clean) > proof.steps.indexOf(prove))
  assert.match(step(growth, GROW).run, /--out "\$RUNNER_TEMP\/test-growth"/)
  // The job outlives the tool's own deadline with room for its cleanup and the usual setup.
  assert.ok(proof['timeout-minutes'] * 60 >= DEFAULT_BUDGET_SECONDS + 15 * 60)
  assert.ok(!prove.run.includes('--budget-seconds'), 'the workflow runs the documented default budget')
  const install = proof.steps.findIndex((s) => s.name === 'Install dependencies')
  assert.ok(install >= 0 && install < proof.steps.indexOf(prove), 'the tests run on a real install')
})

/** A stand-in `node` that records its arguments and exits as told. */
function fakeNode(exitCode, { writeResult = true } = {}) {
  const bin = mkdtempSync(join(WORK, 'bin-'))
  const temp = mkdtempSync(join(WORK, 'runner-temp-'))
  const script = [
    '#!/usr/bin/env bash',
    `printf '%s\\n' "$*" >> "${join(bin, 'calls')}"`,
    writeResult
      ? `mkdir -p "${join(temp, 'new-test-proof')}" && printf '{"overall":"unproved"}' > "${join(temp, 'new-test-proof', 'result.json')}"`
      : ':',
    `exit ${String(exitCode)}`,
    ''
  ].join('\n')
  writeFileSync(join(bin, 'node'), script)
  chmodSync(join(bin, 'node'), 0o755)
  return { bin, temp, calls: () => readFileSync(join(bin, 'calls'), 'utf8').trim().split('\n') }
}

const bash = (script, fake) =>
  spawnSync('bash', ['-c', script], {
    cwd: WORK,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${fake.bin}:${process.env.PATH ?? ''}`, RUNNER_TEMP: fake.temp }
  })

test('the proof step passes the tool its verdict-free exit code: 0 stays green, a tool error is red', () => {
  const green = fakeNode(0)
  const ok = bash(step(proof, PROVE).run, green)
  assert.equal(ok.status, 0, ok.stderr)
  assert.deepEqual(green.calls(), [
    `scripts/ci/new-test-proof.mjs --base HEAD^1 --head HEAD --scratch-root ${green.temp}/new-test-proof-scratch --out ${green.temp}/new-test-proof`
  ])
  // An `unproved` result is exit 0 from the tool, so the step is green and the result is in the log.
  assert.match(ok.stdout, /::group::result\.json\n\{"overall":"unproved"\}/)

  for (const code of [1, 2]) {
    const red = fakeNode(code)
    const failed = bash(step(proof, PROVE).run, red)
    assert.equal(failed.status, code, 'the tool error is the step result')
    assert.ok(!failed.stdout.includes('::group::'), 'nothing after the failure runs')
  }
  // A tool that exits 0 without leaving its result is still a red step.
  assert.notEqual(bash(step(proof, PROVE).run, fakeNode(0, { writeResult: false })).status, 0)

  const cleaner = fakeNode(1)
  assert.equal(bash(step(proof, CLEAN).run, cleaner).status, 1, 'a failed cleanup is red')
  const grower = fakeNode(1)
  assert.equal(
    bash(step(growth, GROW).run, grower).status,
    1,
    'a failed growth report is red, in its own job'
  )
  assert.deepEqual(grower.calls(), [
    `scripts/ci/new-test-proof.mjs --growth-only --base HEAD^1 --head HEAD --out ${grower.temp}/test-growth`
  ])
})

test('the growth step, run for real on this checkout, writes its line to the job summary', () => {
  const temp = mkdtempSync(join(WORK, 'growth-temp-'))
  mkdirSync(join(temp, 'summary'))
  const summary = join(temp, 'summary', 'summary.md')
  const run = (env) =>
    spawnSync('bash', ['-c', step(growth, GROW).run], {
      cwd: ROOT,
      encoding: 'utf8',
      env: { ...process.env, RUNNER_TEMP: temp, GITHUB_STEP_SUMMARY: summary, ...env }
    })
  const ok = run({})
  assert.equal(ok.status, 0, ok.stderr)
  assert.match(readFileSync(summary, 'utf8'), /### Test growth\n\nTest growth: files \+\d+ −\d+ /)
  assert.ok(existsSync(join(temp, 'test-growth', 'growth.json')))
  // A summary that cannot be written is a tool error, and the step says so.
  const broken = run({ GITHUB_STEP_SUMMARY: join(temp, 'no-such-dir', 'summary.md') })
  assert.equal(broken.status, 1)
  assert.match(broken.stderr, /TOOL ERROR/)
})
