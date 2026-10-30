/**
 * Tracy CI on GitHub-hosted runners, opt-in with the pull-request label `ci:hosted` (30/10/2026).
 *
 * A job that may run on `ubuntu-latest` lands on a fresh VM without what the self-hosted runner image
 * carried: Node at `.node-version`, `php` cli, and (for `build-check`) a PostgreSQL that the
 * database variable points at. Each is installed in a step gated on `runner.environment ==
 * 'github-hosted'`, so our runners skip it. This pins that wiring; which events pick the hosted path
 * is evaluated in `ci-nightly-tree.test.mjs` (it has the expression evaluator), the lane and fork rules
 * in `ci-public-repo.test.mjs` and `ci-runner-arch.test.mjs`, the merge rule in `check-pr-merge.test.mjs`.
 *
 * The variable's name is built from `DATABASE_MARK`, never written out: a `ci-*` test file holding it
 * would count as a database test and be left out of a pull request's run (`ci-test-scope.test.mjs`).
 *
 * WHAT THIS CANNOT SHOW: GitHub's own `runs-on` evaluation of `fromJSON(format(…))`, and that an empty
 * service `image` starts no container on a runner without docker. Only a real run shows those.
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { load } from 'js-yaml'

import { DATABASE_MARK } from '../ci/related-tests.mjs'
import { labelSets, runnerPaths } from '../test-support/runs-on.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { jobs } = load(readFileSync(join(ROOT, '.github/workflows/tracy-ci.yml'), 'utf8'))
const HOSTED_ONLY = "runner.environment == 'github-hosted'"
const NODE_STEP = 'Set up Node on a GitHub-hosted runner'
const PHP_STEP = 'Set up PHP on a GitHub-hosted runner'
const DB_STEP = "Point the tests at the job's PostgreSQL on a GitHub-hosted runner"
const ASSERT_NODE = "Assert the runner's Node matches .node-version"

const hostedJobs = Object.entries(jobs).filter(([, job]) => runnerPaths(job['runs-on']).condition !== null)
const indexOf = (job, name) => job.steps.findIndex((s) => s.name === name)
/** A step that needs Node: a `run` calling node/pnpm/npx/corepack, or one of this repo's actions. */
const needsNode = (step) =>
  /\b(node|pnpm|npx|corepack)\b/.test(String(step.run ?? '')) || String(step.uses ?? '').startsWith('./')

test('the runs-on reader returns both paths, and refuses a shape it does not know', () => {
  assert.deepEqual(runnerPaths(['self-hosted', 'linux']), {
    hosted: null,
    selfHosted: ['self-hosted', 'linux'],
    condition: null
  })
  assert.deepEqual(labelSets('ubuntu-latest'), [['ubuntu-latest']])
  const two = runnerPaths(jobs['build-check']['runs-on'])
  assert.equal(two.hosted, 'ubuntu-latest')
  assert.deepEqual(two.selfHosted.slice(0, 2), ['self-hosted', 'linux'])
  assert.equal(two.selfHosted[3], '${{ matrix.label }}')
  for (const bad of [
    '${{ matrix.runner }}',
    "${{ contains(github.event.pull_request.labels.*.name, 'ci:other') && 'ubuntu-latest' || fromJSON(format('[\"self-hosted\",\"{0}\"]', a)) }}",
    "${{ contains(github.event.pull_request.labels.*.name, 'ci:hosted') && 'ubuntu-latest' || fromJSON(format('[\"self-hosted\",\"{0}\"]', a, b)) }}",
    "${{ contains(github.event.pull_request.labels.*.name, 'ci:hosted') && 'ubuntu-latest' || fromJSON(format('[\"linux\",\"{0}\"]', a)) }}"
  ])
    assert.throws(() => runnerPaths(bad), bad)
})

test('the jobs that may run GitHub-hosted are the pull-request ones; the nightly-only jobs stay self-hosted', () => {
  assert.deepEqual(hostedJobs.map(([name]) => name).sort(), [
    'build-check',
    'dsh-lib',
    'new-test-proof',
    'plan',
    'suite-skipped',
    'test-growth'
  ])
  // The nightly-only jobs keep a plain self-hosted list: no pull request, no label, no hosted path.
  for (const name of ['dsh-lib-nightly', 'nightly-report'])
    assert.equal(runnerPaths(jobs[name]['runs-on']).hosted, null, name)
})

test('a hosted-capable job sets up Node from .node-version before the first step that uses it', () => {
  for (const [name, job] of hostedJobs) {
    const first = job.steps.findIndex(needsNode)
    if (first === -1) {
      assert.equal(indexOf(job, NODE_STEP), -1, `${name}: uses no Node, so it installs none`)
      continue
    }
    const at = indexOf(job, NODE_STEP)
    assert.ok(at !== -1 && at < first, `${name}: "${NODE_STEP}" before "${job.steps[first].name}"`)
    const step = job.steps[at]
    assert.equal(step.if, HOSTED_ONLY, name)
    assert.match(step.uses, /^actions\/setup-node@[0-9a-f]{40}$/, name)
    assert.deepEqual(step.with, { 'node-version-file': '.node-version' }, name)
    // Where the job asserts Node, it still does, after the setup: on both paths it compares.
    const check = indexOf(job, ASSERT_NODE)
    if (check !== -1) {
      assert.ok(at < check, `${name}: the assert checks what setup-node installed`)
      assert.equal(job.steps[check].if, undefined, `${name}: the assert runs on both paths`)
    }
  }
})

test('the rows that ran on the php-carrying image get php 8.3 cli on GitHub-hosted', () => {
  for (const name of ['build-check', 'new-test-proof']) {
    const step = jobs[name].steps[indexOf(jobs[name], PHP_STEP)]
    assert.ok(step, `${name}: ${PHP_STEP}`)
    assert.equal(step.if, HOSTED_ONLY, name)
    assert.match(step.uses, /^shivammathur\/setup-php@[0-9a-f]{40}$/, name)
    assert.equal(step.with['php-version'], '8.3', name)
    assert.ok(indexOf(jobs[name], PHP_STEP) < indexOf(jobs[name], 'Install dependencies'), name)
  }
})

test('build-check gets a PostgreSQL 16 service on GitHub-hosted, and the database variable points at it', () => {
  const job = jobs['build-check']
  const { postgres } = job.services
  // Same label condition as `runs-on`, so the service exists exactly when the row is hosted.
  const { condition } = runnerPaths(job['runs-on'])
  assert.equal(postgres.image, `\${{ ${condition} && 'postgres:16-alpine' || '' }}`)
  assert.match(readFileSync(join(ROOT, 'deploy/compose.yml'), 'utf8'), /image: postgres:16-alpine/)
  assert.deepEqual(postgres.ports, ['5432:5432'])
  assert.match(postgres.options, /--health-cmd "pg_isready/)
  const { POSTGRES_USER: user, POSTGRES_PASSWORD: password, POSTGRES_DB: db } = postgres.env
  const step = job.steps[indexOf(job, DB_STEP)]
  assert.ok(step, DB_STEP)
  assert.equal(step.if, HOSTED_ONLY)
  assert.equal(
    step.run,
    `echo "${DATABASE_MARK}=postgres://${user}:${password}@127.0.0.1:5432/${db}" >> "$GITHUB_ENV"`
  )
  // Never through a job or step `env`: an empty value there would hide what our runners export.
  for (const node of [job, ...job.steps])
    assert.ok(!(DATABASE_MARK in (node.env ?? {})), `${node.name ?? 'build-check'}: env ${DATABASE_MARK}`)
  // Set before anything runs a test.
  for (const later of ['Install dependencies', 'Turbo tests', 'Build check'])
    assert.ok(indexOf(job, DB_STEP) < indexOf(job, later), later)
})

test('the deploy key is still removed on every path', () => {
  for (const [name, job] of hostedJobs) {
    if (!JSON.stringify(job.steps ?? []).includes('TRACY_VENDOR_DEPLOY_KEY')) continue
    const remove = job.steps.find((s) => s.name === 'Remove the deploy key')
    assert.ok(remove, name)
    assert.equal(remove.if, 'always()', name)
    assert.equal(remove.run, 'rm -f "$RUNNER_TEMP/vendor_deploy"', name)
  }
})
