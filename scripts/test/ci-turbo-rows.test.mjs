import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { load } from 'js-yaml'
import { fullRowSets, planMatrix, turboRows } from '../ci/plan-ci.mjs'

const task = (pkg, name, status) => ({ package: pkg, task: name, cache: { status } })
const allTasks = (status) => ({
  tasks: [
    task('@tracy/web', 'test:ci:1', status),
    task('@tracy/web', 'test:ci:2', status),
    task('@tracy/web', 'test:ci:3', status),
    task('@tracy/seeder', 'test:ci', status),
    task('@tracy/dsh-brand', 'test:ci', status),
    task('//', 'test:ci:scripts', status),
    task('//', 'test:ci:interop', status)
  ]
})

test('nothing cached: five rows, each naming exactly its Turbo tasks', () => {
  const { rows, cached } = turboRows(allTasks('MISS'))
  assert.deepEqual(
    rows.map((r) => [r.group, r.turbo]),
    [
      ['tests web 1/3', 'test:ci:1 --filter=@tracy/web'],
      ['tests web 2/3', 'test:ci:2 --filter=@tracy/web'],
      ['tests web 3/3', 'test:ci:3 --filter=@tracy/web'],
      ['tests packages', 'test:ci'],
      ['tests scripts', 'test:ci:interop test:ci:scripts']
    ]
  )
  assert.deepEqual(cached, [])
})

test('a row whose every task is cached is not started; one miss starts the whole row', () => {
  const dry = allTasks('HIT')
  dry.tasks[3].cache.status = 'MISS'
  const { rows, cached } = turboRows(dry)
  assert.deepEqual(
    rows.map((r) => r.group),
    ['tests packages']
  )
  assert.deepEqual(cached, ['tests web 1/3', 'tests web 2/3', 'tests web 3/3', 'tests scripts'])
})

test('the tasks Turbo lists for packages without the script decide nothing', () => {
  const dry = allTasks('HIT')
  dry.tasks.push({
    package: '@deepseek-ai/dsh',
    task: 'test:ci',
    command: '<NONEXISTENT>',
    cache: { status: 'MISS' }
  })
  assert.deepEqual(turboRows(dry).rows, [])
})

test('a task no row runs, a malformed answer or an empty one refuses the whole plan', () => {
  assert.equal(turboRows({ tasks: [...allTasks('MISS').tasks, task('@tracy/web', 'build', 'MISS')] }), null)
  assert.equal(turboRows({ tasks: [{ task: 'test:ci' }] }), null)
  assert.equal(turboRows({ tasks: [] }), null)
  assert.equal(turboRows(null), null)
})

const files = ['packages/cms/tracy-seeder/src/a.mjs', 'apps/tracy-web/src/x.js', 'pnpm-lock.yaml']

test('a develop pull request with a Turbo answer runs Turbo rows, even when the planner would run everything', () => {
  const dry = allTasks('HIT')
  dry.tasks[0].cache.status = 'MISS'
  const plan = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['pnpm-lock.yaml'],
    allFiles: files,
    turboDry: dry
  })
  const groups = plan.matrix.include.map((r) => r.group)
  assert.ok(groups.includes('tests web 1/3'))
  assert.ok(
    !groups.includes('tests 1/2') && !groups.includes('tests 2/2') && !groups.includes('tests related')
  )
  assert.ok(groups.includes('checks'))
  assert.equal(plan.matrix.include.find((r) => r.group === 'checks').taskAudits, true)
  assert.equal(
    plan.matrix.include
      .filter((r) => r.clock)
      .map((r) => r.group)
      .join(),
    'checks'
  )
})

test('every test cached: only checks runs, and it carries the clock-shift tests', () => {
  const plan = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['apps/tracy-web/src/x.js'],
    allFiles: files,
    turboDry: allTasks('HIT')
  })
  const tests = plan.matrix.include.filter((r) => r.group.startsWith('tests '))
  assert.deepEqual(
    tests.map((r) => r.group),
    []
  )
  assert.equal(plan.matrix.include.find((r) => r.group === 'checks')?.clock, true)
  assert.equal(plan.matrix.include.find((r) => r.group === 'checks')?.taskAudits, true)
})

test('release pull requests, the nightly and manual runs force every Turbo row; without an answer they keep the shards', () => {
  for (const [event, baseRef] of [
    ['pull_request', 'main'],
    ['pull_request', 'staging'],
    ['schedule', ''],
    ['workflow_dispatch', '']
  ]) {
    // Every task HIT: a pull request into develop would run no test row; a full run runs them all.
    const plan = planMatrix({
      event,
      baseRef,
      changed: ['apps/tracy-web/src/x.js'],
      allFiles: files,
      turboDry: allTasks('HIT')
    })
    const tests = plan.matrix.include.filter((r) => r.turbo)
    assert.deepEqual(
      tests.map((r) => r.group),
      ['tests web 1/3', 'tests web 2/3', 'tests web 3/3', 'tests packages', 'tests scripts'],
      `${event} ${baseRef}`
    )
    assert.ok(
      tests.every((r) => r.force === true),
      `${event} ${baseRef}: a full run reads nothing from the cache`
    )
    assert.ok(!plan.matrix.include.some((r) => /^tests [12]\/2$/.test(r.group)))
    assert.equal(plan.fullTurbo, true)
    assert.equal(plan.matrix.include.find((r) => r.clock)?.group, 'checks')
    assert.equal(plan.matrix.include.find((r) => r.group === 'checks').taskAudits, true)
    // The conditional rows stay: a full run runs every EmDash suite and e2e.
    for (const group of ['tests e2e', 'tests emdash-base', 'tests emdash-business', 'tests emdash-saas'])
      assert.ok(
        plan.matrix.include.some((r) => r.group === group),
        `${event} ${baseRef}: ${group}`
      )
    // Without a dry run (`plan` could not ask Turbo): the two shards, audited in `checks` as before.
    const shards = planMatrix({ event, baseRef, changed: ['apps/tracy-web/src/x.js'], allFiles: files })
    const groups = shards.matrix.include.map((r) => r.group)
    assert.ok(groups.includes('tests 1/2') && groups.includes('tests 2/2'), `${event} ${baseRef}`)
    assert.equal(shards.fullTurbo, false)
    assert.equal(shards.matrix.include.find((r) => r.clock)?.group, 'tests 2/2')
    assert.equal(shards.matrix.include.find((r) => r.group === 'checks').taskAudits, undefined)
  }
  const fallback = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['pnpm-lock.yaml'],
    allFiles: files
  })
  assert.ok(fallback.matrix.include.some((r) => r.group === 'tests 2/2'))
  assert.equal(fallback.matrix.include.find((r) => r.group === 'checks').taskAudits, undefined)
  // A pull request into develop never forces: its rows are the ones the cache does not answer.
  const routine = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: ['apps/tracy-web/src/x.js'],
    allFiles: files,
    turboDry: allTasks('MISS')
  })
  assert.ok(routine.matrix.include.filter((r) => r.turbo).every((r) => r.force === undefined))
  assert.equal(routine.fullTurbo, false)
})

test('the full row sets: the shards or the forced Turbo rows, each with checks and every conditional row', () => {
  const { legacy, turbo } = fullRowSets()
  const conditional = ['tests e2e', 'tests emdash-base', 'tests emdash-business', 'tests emdash-saas']
  assert.deepEqual([...legacy].sort(), ['checks', ...conditional, 'tests 1/2', 'tests 2/2'].sort())
  assert.deepEqual(
    [...turbo].sort(),
    [
      'checks',
      ...conditional,
      'tests packages',
      'tests scripts',
      'tests web 1/3',
      'tests web 2/3',
      'tests web 3/3'
    ].sort()
  )
})

test('the plan job asks the same Turbo version the rows run', async () => {
  const { readFileSync } = await import('node:fs')
  const workflow = readFileSync(new URL('../../.github/workflows/tracy-ci.yml', import.meta.url), 'utf8')
  const pinned = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'))
    .devDependencies.turbo
  const asked = [...workflow.matchAll(/npx -y turbo@([0-9.]+)/g)].map((m) => m[1])
  assert.ok(asked.length > 0, 'the plan job no longer asks Turbo')
  for (const version of asked) assert.equal(version, pinned, 'a different Turbo version hashes differently')
})

test('turbo-cached: a 200 is a hit, anything else or an error a miss, and scriptless entries are untouched', async () => {
  const { markCached, parseDry } = await import('../ci/turbo-cached.mjs')
  const dry = parseDry(
    ` WARNING  Circular package dependency detected: a, b\n${JSON.stringify({
      tasks: [
        { taskId: 'a#test:ci', hash: 'aaaa', command: 'node x', cache: { status: 'MISS' } },
        { taskId: 'b#test:ci', hash: 'bbbb', command: 'node x', cache: { status: 'MISS' } },
        { taskId: 'c#test:ci', hash: 'cccc', command: 'node x', cache: { status: 'HIT' } },
        { taskId: 'd#test:ci', hash: 'dddd', command: '<NONEXISTENT>', cache: { status: 'MISS' } }
      ]
    })}`
  )
  const marked = await markCached(dry, async (hash) => {
    if (hash === 'cccc') throw new Error('network')
    return hash === 'aaaa'
  })
  assert.deepEqual(
    marked.tasks.map((t) => t.cache.status),
    ['HIT', 'MISS', 'MISS', 'MISS']
  )
  assert.equal(marked.tasks[3], dry.tasks[3])
})

const workflow = load(readFileSync(new URL('../../.github/workflows/tracy-ci.yml', import.meta.url), 'utf8'))
const stepsOf = (job) => workflow.jobs[job].steps
const step = (job, name) => stepsOf(job).find((s) => s.name === name)
const indexOf = (job, name) => stepsOf(job).findIndex((s) => s.name === name)

test('plan hashes the tree the rows hash: the dsh submodule is fetched before the dry run, nothing is installed', () => {
  const fetch = step('plan', 'Fetch the dsh submodule the task hashes depend on')
  const ask = step('plan', 'Ask Turbo which test tasks the cache already holds')
  assert.ok(fetch && ask)
  assert.ok(indexOf('plan', fetch.name) < indexOf('plan', ask.name))
  assert.match(
    fetch.run,
    /git (\$\{DEPLOY_KEY:\+-c url\.git@github\.com:\.insteadOf=https:\/\/github\.com\/\} )?submodule update --init vendor\/tracy\/deepseek-harness/
  )
  // `GITHUB_TOKEN` cannot read the submodule's repository: the deploy key, as the rows.
  assert.equal(fetch.env.DEPLOY_KEY, '${{ secrets.TRACY_VENDOR_DEPLOY_KEY }}')
  assert.equal(step('plan', 'Check out Git repository').with.submodules, false)
  for (const s of stepsOf('plan'))
    assert.doesNotMatch(
      String(s.run ?? ''),
      /pnpm install|build-dsh|dsh:build/,
      `plan must not bootstrap (${s.name})`
    )
})

test('plan fails closed: every Turbo step may fail, and TURBO_DRY is published last, after the dry run was checked', () => {
  const fetch = step('plan', 'Fetch the dsh submodule the task hashes depend on')
  const ask = step('plan', 'Ask Turbo which test tasks the cache already holds')
  assert.equal(fetch['continue-on-error'], true)
  assert.equal(ask['continue-on-error'], true)
  // No dry run on a tree whose submodule could not be fetched: that hash is the defect.
  assert.match(ask.if, /steps\.turbo-dsh\.outcome == 'success'/)
  assert.equal(fetch.id, 'turbo-dsh')
  for (const s of [fetch, ask]) {
    // Every event asks Turbo since 17/10/2026: a full run's rows are forced Turbo rows.
    assert.doesNotMatch(s.if, /base_ref/)
    assert.match(s.run, /set -euo pipefail/)
  }
  const lines = ask.run
    .trim()
    .split('\n')
    .map((l) => l.trim())
  assert.match(lines.at(-1), /^echo "TURBO_DRY=.*>> "\$GITHUB_ENV"$/)
  const verify = lines.findIndex((l) => l.includes('turbo-verify.mjs --plan'))
  const cached = lines.findIndex((l) => l.includes('turbo-cached.mjs'))
  assert.ok(cached !== -1 && verify > cached, 'the dry run is checked after the cache was asked')
  for (const [i, line] of lines.entries())
    if (/GITHUB_ENV|GITHUB_OUTPUT/.test(line)) assert.ok(i > verify, `published before the check: ${line}`)
  assert.equal(workflow.jobs.plan.outputs.turbo_manifest, '${{ steps.turbo.outputs.manifest }}')
  assert.equal(ask.id, 'turbo')
})

test('plan keeps time for the fallback, and never leaves the deploy key behind', () => {
  const fetch = step('plan', 'Fetch the dsh submodule the task hashes depend on')
  const ask = step('plan', 'Ask Turbo which test tasks the cache already holds')
  const limit = (run) => [...run.matchAll(/\btimeout (\d+) /g)].reduce((sum, m) => sum + Number(m[1]), 0)
  assert.ok(limit(fetch.run) > 0, 'the fetch has no time limit')
  assert.ok(limit(ask.run) > 0, 'the dry run has no time limit')
  // The cache action's own wait, read from the action (50 tries of 0.2 s since the dependency-free
  // server); what is left of the job's minutes is the fallback's.
  const action = readFileSync(
    new URL('../../.github/actions/turbo-cache/action.yml', import.meta.url),
    'utf8'
  )
  const tries = /for _ in \$\(seq 1 (\d+)\)/.exec(action)
  const nap = /sleep ([0-9.]+)/.exec(action)
  assert.ok(tries && nap, 'the cache action no longer waits in a counted loop')
  const cacheWait = Math.ceil(Number(tries[1]) * Number(nap[1]))
  const budget = cacheWait + limit(fetch.run) + limit(ask.run)
  assert.ok(
    budget <= workflow.jobs.plan['timeout-minutes'] * 60 - 45,
    `${String(budget)} s of waiting leaves the fallback no time`
  )
  const remove = stepsOf('plan').filter((s) => s.name === 'Remove the deploy key')
  assert.equal(remove.length, 1)
  assert.equal(remove[0].if, 'always()')
  assert.ok(indexOf('plan', remove[0].name) > indexOf('plan', fetch.name))
  assert.ok(indexOf('plan', remove[0].name) < indexOf('plan', ask.name))
})

test('a forced row runs every task: --force from matrix.force, and nothing else asks the cache to be skipped', () => {
  const turbo = step('build-check', 'Turbo tests')
  assert.equal(turbo.env.FORCE, "${{ matrix.force && '--force' || '' }}")
  assert.match(turbo.run, /turbo run \$\{\{ matrix\.turbo \}\} .*--summarize \$FORCE$/m)
  assert.doesNotMatch(turbo.run, /--force/)
})

test('every run compares the hashes: checks recomputes all of them, each Turbo row its own', () => {
  const all = step('build-check', "Compare every Turbo task hash with the plan job's")
  const row = step('build-check', "Compare this row's task hashes with the plan job's")
  const turbo = step('build-check', 'Turbo tests')
  const gates = step('build-check', 'Build check')
  assert.ok(all && row && turbo && gates)
  assert.match(all.run, /turbo-verify\.mjs --compare/)
  assert.match(all.if, /matrix\.group == 'checks'/)
  // The row names itself and the tasks it was scheduled: its record must be whole, not just equal.
  assert.match(row.run, /turbo-verify\.mjs --row --group "\$ROW_GROUP" --tasks "\$ROW_TASKS"/)
  assert.equal(row.env.ROW_GROUP, '${{ matrix.group }}')
  assert.equal(row.env.ROW_TASKS, '${{ matrix.turbo }}')
  for (const s of [all, row])
    assert.equal(s.env.TRACY_TURBO_MANIFEST, '${{ needs.plan.outputs.turbo_manifest }}')
  // A different hash is red — for `checks` at the end of the job, so that every gate still runs.
  const fail = step('build-check', 'Fail the row when a Turbo task hash differed')
  assert.equal(all['continue-on-error'], true)
  assert.equal(all.id, 'turbo-hashes')
  assert.match(fail.if, /steps\.turbo-hashes\.outcome == 'failure'/)
  assert.match(fail.if, /!cancelled\(\)/)
  assert.match(fail.run, /exit 1/)
  assert.ok(indexOf('build-check', fail.name) > indexOf('build-check', gates.name))
  assert.equal(row['continue-on-error'], undefined)
  // After the bootstrap a row hashes on, before anything on the row runs a test.
  assert.ok(indexOf('build-check', all.name) > indexOf('build-check', 'Install dependencies'))
  assert.ok(indexOf('build-check', all.name) < indexOf('build-check', gates.name))
  // The summary is what the row comparison reads; a red hash must not hide the gates or the row's verdict.
  assert.match(turbo.run, /--summarize/)
  assert.ok(indexOf('build-check', row.name) > indexOf('build-check', turbo.name))
  assert.match(row.if, /!cancelled\(\)/)
  assert.match(gates.if, /!matrix\.turbo/)
})

test('workflow delegates the config audit only on the planner-marked checks row', () => {
  const workflow = load(
    readFileSync(new URL('../../.github/workflows/tracy-ci.yml', import.meta.url), 'utf8')
  )
  const step = workflow.jobs['build-check'].steps.find((s) => s.name === 'Build check')
  assert.equal(step.env.TRACY_TURBO_TASK_AUDITS, "${{ matrix.taskAudits && '1' || '' }}")
})
