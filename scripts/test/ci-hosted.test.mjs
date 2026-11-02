/**
 * Tracy CI on GitHub-hosted runners: opt-in with the label `ci:hosted` the morning of 30/10/2026, the
 * default for a pull request from this repository since that afternoon, with the label
 * `ci:self-hosted` to go back to our runners. There the full workers suite is three rows, not two.
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
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { load } from 'js-yaml'

import { planMatrix } from '../ci/plan-ci.mjs'
import { DATABASE_MARK } from '../ci/related-tests.mjs'
import { labelSets, runnerPaths } from '../test-support/runs-on.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { jobs } = load(readFileSync(join(ROOT, '.github/workflows/tracy-ci.yml'), 'utf8'))
const pnpmAction = load(readFileSync(join(ROOT, '.github/actions/dsh-lib/hosted-pnpm/action.yml'), 'utf8'))
const dshAction = load(readFileSync(join(ROOT, '.github/actions/dsh-lib/action.yml'), 'utf8'))
const HOSTED_ONLY = "runner.environment == 'github-hosted'"
const NODE_STEP = 'Set up Node on a GitHub-hosted runner'
const PHP_STEP = 'Set up PHP on a GitHub-hosted runner'
const DB_STEP = "Point the tests at the job's PostgreSQL on a GitHub-hosted runner"
const ASSERT_NODE = "Assert the runner's Node matches .node-version"
/** The one condition that picks `ubuntu-latest`: a pull request without the label `ci:self-hosted`. */
const HOSTED_WHEN =
  "github.event_name == 'pull_request' && !contains(github.event.pull_request.labels.*.name, 'ci:self-hosted')"

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
    // The opt-in of #221: a condition this reader no longer takes for the hosted path.
    "${{ contains(github.event.pull_request.labels.*.name, 'ci:hosted') && 'ubuntu-latest' || fromJSON(format('[\"self-hosted\",\"{0}\"]', a)) }}",
    `\${{ ${HOSTED_WHEN} && 'ubuntu-latest' || fromJSON(format('["self-hosted","{0}"]', a, b)) }}`,
    `\${{ ${HOSTED_WHEN} && 'ubuntu-latest' || fromJSON(format('["linux","{0}"]', a)) }}`
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

test('every hosted-capable job asks for ubuntu-latest by the same condition, and plan sizes the rows by it', () => {
  for (const [name, job] of hostedJobs) assert.equal(runnerPaths(job['runs-on']).condition, HOSTED_WHEN, name)
  // `plan` tells the planner where the rows will run by where it runs itself: the same condition
  // picked both runners (the loop above), and the plan job reads no payload label (ci-test-scope).
  const step = jobs.plan.steps.find((s) => s.name === 'Plan the rows')
  assert.equal(step.env.ROWS_HOSTED, `\${{ ${HOSTED_ONLY} }}`)
  assert.equal(step.run, 'node scripts/ci/plan-ci.mjs')
})

test('the gate learns from the runner whether the small suites cost their hosted time', () => {
  const step = jobs['build-check'].steps.find((s) => s.name === 'Build check')
  assert.equal(step.env.TRACY_TESTS_HOSTED, `\${{ ${HOSTED_ONLY} && '1' || '0' }}`)
})

test('a full run plans three workers shards on GitHub-hosted and two on our runners', () => {
  const groups = (hosted) =>
    planMatrix({ event: 'workflow_dispatch', changed: null, allFiles: [], hosted }).matrix.include
  const shards = (rows) => rows.filter((r) => /^tests \d\/\d$/.test(r.group))
  assert.deepEqual(
    shards(groups(true)).map((r) => [r.group, r.args, Boolean(r.clock)]),
    [
      ['tests 1/3', '--only tests --tests-part workers:1/3', false],
      ['tests 2/3', '--only tests --tests-part workers:2/3', false],
      ['tests 3/3', '--only tests --tests-part workers:3/3,rest', true]
    ]
  )
  assert.deepEqual(
    shards(groups(false)).map((r) => [r.group, r.args, Boolean(r.clock)]),
    [
      ['tests 1/2', '--only tests --tests-part workers:1/2', false],
      ['tests 2/2', '--only tests --tests-part workers:2/2,rest', true]
    ]
  )
  // Every other row is the same on both runners.
  const others = (rows) => rows.filter((r) => !/^tests \d\/\d$/.test(r.group))
  assert.deepEqual(others(groups(true)), others(groups(false)))
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
    assert.equal(step.with.coverage, 'none', name)
    assert.equal(step.with.tools, 'none', name)
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

test('only hosted test jobs select mawk and pin pnpm before installing or running tests', () => {
  for (const name of ['build-check', 'new-test-proof']) {
    const job = jobs[name]
    const awk = job.steps[indexOf(job, 'Select mawk on a GitHub-hosted runner')]
    const pnpm = job.steps[indexOf(job, 'Prepare pnpm on a GitHub-hosted runner')]
    assert.equal(awk.if, HOSTED_ONLY, name)
    assert.match(awk.run, /if ! command -v mawk/)
    assert.match(awk.run, /sudo apt-get install --yes --no-install-recommends mawk/)
    assert.match(awk.run, /sudo update-alternatives --set awk "\$\(command -v mawk\)"/)
    assert.equal(pnpm.if, HOSTED_ONLY, name)
    assert.equal(pnpm.uses, './.github/actions/dsh-lib/hosted-pnpm', name)
    assert.deepEqual(pnpm.with, { scope: 'workspace' }, name)
    assert.ok(
      indexOf(job, 'Select mawk on a GitHub-hosted runner') < indexOf(job, 'Install dependencies'),
      name
    )
    assert.ok(indexOf(job, ASSERT_NODE) < indexOf(job, pnpm.name), name)
    assert.ok(indexOf(job, pnpm.name) < indexOf(job, 'Install dependencies'), name)
    // Preserve the existing bootstrap: the root install must relink the submodule's members LAST.
    assert.ok(indexOf(job, 'Build the vendored dsh') < indexOf(job, 'Install dependencies'), name)
    assert.equal(job.steps[indexOf(job, 'Install dependencies')].run, 'pnpm install --frozen-lockfile')
  }
})

test('a hosted dsh cache hit does not download the pnpm store; cold builds use a separate store key', () => {
  const steps = dshAction.runs.steps
  const at = steps.findIndex((s) => s.uses === './.github/actions/dsh-lib/hosted-pnpm')
  assert.ok(at > steps.findIndex((s) => s.id === 'probe'))
  assert.ok(at < steps.findIndex((s) => s.name === 'Build dsh once for this key (not cached yet)'))
  assert.equal(
    steps[at].if,
    `${HOSTED_ONLY} && inputs.mode == 'ensure' && steps.probe.outputs.cache-hit != 'true'`
  )
  assert.deepEqual(steps[at].with, { scope: 'dsh' })
  // Keep the existing native-build key and archive contract, including architecture and Node.
  assert.match(steps.find((s) => s.id === 'key').run, /node scripts\/build-dsh\.mjs --print-key/)
  for (const step of steps.filter((s) => String(s.uses).startsWith('actions/cache/'))) {
    assert.equal(step.with.path, '.dsh-lib/dsh-lib.tar')
    assert.equal(step.with.key, '${{ steps.key.outputs.key }}')
    assert.equal(step.with['restore-keys'], undefined)
  }
})

test('the hosted download cache binds both installs, Node, architecture and dsh, and caches no checkout', () => {
  const steps = pnpmAction.runs.steps
  const key = steps.find((s) => s.id === 'key')
  const restore = steps.find((s) => s.name === 'Restore the pnpm content store')
  const probe = steps.find((s) => s.id === 'probe')
  // Nothing in the action saves: no `actions/cache@` (whose post step saves) and no `/save`.
  assert.deepEqual(
    steps.filter((s) => String(s.uses ?? '').startsWith('actions/cache')).map((s) => s.uses.split('@')[0]),
    ['actions/cache/restore', 'actions/cache/restore']
  )
  for (const step of [restore, probe]) {
    assert.match(step.uses, /^actions\/cache\/restore@[0-9a-f]{40}$/)
    assert.equal(step.with.path, '${{ steps.store.outputs.path }}')
    assert.equal(step.with.key, '${{ steps.key.outputs.key }}')
  }
  // Off the default branch: restore, with the prefix fallback. On it: a lookup, nothing downloaded.
  const onDefault = "github.ref == format('refs/heads/{0}', github.event.repository.default_branch)"
  assert.equal(probe.if, onDefault)
  assert.equal(restore.if, onDefault.replace('==', '!='))
  assert.equal(restore.with['restore-keys'], '${{ steps.key.outputs.prefix }}')
  assert.equal(probe.with['lookup-only'], true)
  assert.equal(probe.with['restore-keys'], undefined)
  assert.equal(pnpmAction.outputs.key.value, '${{ steps.key.outputs.key }}')
  assert.equal(pnpmAction.outputs['cache-hit'].value, '${{ steps.probe.outputs.cache-hit }}')
  // The prefix stops before the hashed inputs, so a lockfile change still finds the nearest store
  // of the same OS, architecture and scope; the key carries every input.
  assert.equal(key.env.PREFIX, 'hosted-pnpm-v1-${{ runner.os }}-${{ runner.arch }}-${{ inputs.scope }}-')
  assert.match(key.run, /echo "key=\$PREFIX\$INPUTS-\$DSH"/)
  assert.match(key.run, /echo "prefix=\$PREFIX"/)
  const keyText = JSON.stringify(key.env)
  for (const input of [
    'runner.os',
    'runner.arch',
    'inputs.scope',
    '.node-version',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
    'vendor/tracy/deepseek-harness/pnpm-lock.yaml',
    'steps.store.outputs.dsh'
  ])
    assert.ok(keyText.includes(input), input)
  assert.doesNotMatch(JSON.stringify(pnpmAction), /secrets\.|node_modules|\.npmrc\s*\n/)
  // Existing public-repo boundary still gates every job that restores this cache.
  for (const name of ['dsh-lib', 'build-check', 'new-test-proof'])
    assert.match(jobs[name].if, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/)
})

test('only the seed job saves the hosted pnpm store: default branch, nightly or manual, report-only', () => {
  const seed = jobs['pnpm-store-seed']
  assert.equal(seed['runs-on'], 'ubuntu-latest')
  assert.equal(seed['continue-on-error'], true)
  assert.deepEqual(seed.needs, ['plan'])
  assert.equal(
    seed.if,
    "(github.event_name == 'schedule' || github.event_name == 'workflow_dispatch') && github.ref_name == github.event.repository.default_branch"
  )
  // It gates nothing: not in the nightly verdict, and no job waits for it.
  for (const [name, job] of Object.entries(jobs))
    assert.ok(![job.needs ?? []].flat().includes('pnpm-store-seed'), `${name} waits for the seed`)
  const pnpm = seed.steps[indexOf(seed, 'Prepare pnpm and look up the store key')]
  assert.equal(pnpm.uses, './.github/actions/dsh-lib/hosted-pnpm')
  assert.deepEqual(pnpm.with, { scope: 'workspace' })
  const fill = seed.steps[indexOf(seed, 'Fill the store from the lockfile')]
  const save = seed.steps[indexOf(seed, 'Save the store under the default branch')]
  assert.equal(fill.run, 'pnpm fetch')
  assert.match(save.uses, /^actions\/cache\/save@[0-9a-f]{40}$/)
  assert.deepEqual(save.with, {
    path: '${{ steps.pnpm.outputs.path }}',
    key: '${{ steps.pnpm.outputs.key }}'
  })
  // An entry already saved for the key is immutable: a hit skips the fetch and the save.
  for (const step of [fill, save]) assert.equal(step.if, "steps.pnpm.outputs.cache-hit != 'true'")
  // The key hashes the submodule's lockfile, so the submodule is fetched before the key is computed.
  assert.ok(indexOf(seed, 'Fetch the vendored dsh submodule') < indexOf(seed, pnpm.name))
  assert.ok(indexOf(seed, 'Set up Node from .node-version') < indexOf(seed, pnpm.name))
  assert.ok(indexOf(seed, pnpm.name) < indexOf(seed, fill.name))
  assert.ok(indexOf(seed, fill.name) < indexOf(seed, save.name))
  // Nothing else in the workflow saves this store.
  const savers = Object.entries(jobs).flatMap(([name, job]) =>
    (job.steps ?? [])
      .filter(
        (s) => /^actions\/cache(\/save)?@/.test(String(s.uses ?? '')) && /pnpm/.test(JSON.stringify(s.with))
      )
      .map(() => name)
  )
  assert.deepEqual(savers, ['pnpm-store-seed'])
})

test('the hosted pnpm bootstrap activates the checkout pin globally before asking pnpm for its store', (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'ci-hosted-pnpm-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, 'bin'))
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ packageManager: 'pnpm@11.17.0' }))
  const put = (name, script) =>
    writeFileSync(join(dir, 'bin', name), `#!/usr/bin/env node\n${script}`, { mode: 0o755 })
  put(
    'corepack',
    `
    const fs = require('node:fs');
    require('node:assert/strict').deepEqual(process.argv.slice(2), ['install', '--global', 'pnpm@11.17.0']);
    fs.writeFileSync('activated', 'pnpm@11.17.0');
  `
  )
  put(
    'pnpm',
    `
    const assert = require('node:assert/strict');
    assert.equal(require('node:fs').readFileSync('activated', 'utf8'), 'pnpm@11.17.0');
    assert.deepEqual(process.argv.slice(2), ['store', 'path', '--silent']);
    console.log(process.cwd() + '/content store');
  `
  )
  put(
    'git',
    `
    require('node:assert/strict').deepEqual(process.argv.slice(2), ['rev-parse', 'HEAD:vendor/tracy/deepseek-harness']);
    console.log('d'.repeat(40));
  `
  )
  const output = join(dir, 'output')
  const step = pnpmAction.runs.steps.find((s) => s.id === 'store')
  const result = spawnSync('bash', ['-c', step.run], {
    cwd: dir,
    env: { ...process.env, PATH: `${join(dir, 'bin')}:${process.env.PATH}`, GITHUB_OUTPUT: output },
    encoding: 'utf8'
  })
  assert.equal(result.status, 0, result.stderr)
  assert.equal(readFileSync(output, 'utf8'), `path=${dir}/content store\ndsh=${'d'.repeat(40)}\n`)
})
