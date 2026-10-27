import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { parseDry } from '../ci/turbo-cached.mjs'
import { covers, rootGlobs } from '../ci/turbo-inputs.mjs'
import { turboRows } from '../ci/plan-ci.mjs'
import { EXCLUDE, excludeGlob, GENERATED, MACHINERY } from '../ci/turbo-setup.mjs'
import {
  buildManifest,
  compare,
  describe as describeResult,
  inventory,
  judgeRun,
  readManifest,
  rowTasks,
  summaryTasks
} from '../ci/turbo-verify.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const TURBO = path.join(ROOT, 'node_modules/.bin/turbo')
const VERIFY = path.join(ROOT, 'scripts/ci/turbo-verify.mjs')
const SHA = 'a'.repeat(40)
const DSH_SHA = 'b'.repeat(40)

/**
 * A git repository OUTSIDE this worktree that carries the real root `turbo.json` (the generated
 * task definitions under test) and stand-in files at the paths those definitions name. The real
 * Turbo binary hashes it, so the assertions below are about what Turbo does, not about a model of it.
 */
const fx = mkdtempSync(path.join(tmpdir(), 'tracy-turbo-hashes-'))
after(() => rmSync(fx, { recursive: true, force: true }))

const put = (rel, text = `${rel}\n`) => {
  mkdirSync(path.dirname(path.join(fx, rel)), { recursive: true })
  writeFileSync(path.join(fx, rel), text)
}
const realRootPkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const realTurbo = JSON.parse(readFileSync(path.join(ROOT, 'turbo.json'), 'utf8'))
const rootScripts = Object.fromEntries(
  Object.entries(realRootPkg.scripts).filter(([k]) => k.startsWith('test:ci'))
)
/** A workspace package configured the way `turbo-setup.mjs` configures one. */
const packageTurbo = {
  $schema: 'https://turborepo.com/schema.json',
  extends: ['//'],
  tasks: {
    'test:ci': {
      inputs: ['$TURBO_DEFAULT$', ...MACHINERY, '$TURBO_ROOT$/apps/tracy-web/**', ...EXCLUDE],
      env: ['TRACY_DSH_COMMIT']
    }
  }
}

function build() {
  put(
    'package.json',
    JSON.stringify({
      name: 'fixture',
      private: true,
      packageManager: realRootPkg.packageManager,
      scripts: rootScripts,
      devDependencies: { '@deepseek-ai/dsh': 'workspace:*' }
    })
  )
  put('turbo.json', JSON.stringify(realTurbo))
  put(
    'pnpm-workspace.yaml',
    'packages:\n  - packages/*/*\n  - vendor/tracy/dsh-passwords\n  - vendor/tracy/deepseek-harness/packages/*/*\n'
  )
  put('pnpm-lock.yaml', "lockfileVersion: '9.0'\nimporters:\n  .: {}\n")
  put('.node-version', '24\n')
  put('.gitignore', readFileSync(path.join(ROOT, '.gitignore'), 'utf8'))
  put('.github/workflows/tracy-ci.yml')
  put('deploy/.env.example')
  for (const file of MACHINERY) put(file.replace('$TURBO_ROOT$/', ''))
  put('scripts/test-timings.json', '{}\n')
  put('scripts/test/a.test.mjs')
  put('tests/regression/cases/a.json', '{}\n')
  put('apps/tracy-web/src/a.js')
  put('packages/cms/tracy-seeder/src/a.mjs')
  put('packages/cms/tracy-joomla-quickstart/contracts/a.json', '{}\n')
  put('packages/cms/tracy-wordpress-quickstart/profiles/a.json', '{}\n')
  put(
    'packages/fx/one/package.json',
    JSON.stringify({ name: '@fixture/one', scripts: { 'test:ci': 'node x' } })
  )
  put('packages/fx/one/turbo.json', JSON.stringify(packageTurbo))
  put('packages/fx/one/src/a.js')
  put(
    'vendor/tracy/dsh-passwords/.gitignore',
    readFileSync(path.join(ROOT, 'vendor/tracy/dsh-passwords/.gitignore'), 'utf8')
  )
  put('vendor/tracy/dsh-passwords/package.json', JSON.stringify({ name: 'dsh-passwords', dependencies: {} }))
  put('vendor/tracy/dsh-passwords/src/index.ts')
  put('vendor/tracy/dsh-passwords/scripts/build-client.mjs')
  put('vendor/tracy/dsh-passwords/tsconfig.json', '{}\n')
  // The dsh submodule as `plan` has it after the fetch: sources only, `lib/` ignored by its own rules.
  put('vendor/tracy/deepseek-harness/.gitignore', 'lib/\nnode_modules/\n')
  put(
    'vendor/tracy/deepseek-harness/packages/core/dsh/package.json',
    JSON.stringify({ name: '@deepseek-ai/dsh', version: '1.0.0' })
  )
  put('vendor/tracy/deepseek-harness/packages/core/dsh/src/index.ts')
  const git = (...args) => execFileSync('git', args, { cwd: fx, stdio: 'pipe' })
  git('init', '-q')
  git('add', '-A')
  git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-q', '-m', 'fixture')
}

/** One declared ignored entry as a row may have it: the file itself, or a file inside the directory. */
const generatedFile = (g) => (g.file ? g.path : `${g.path}/client.js`)
const putGenerated = (g) => put(generatedFile(g))

/** What a row has that `plan` does not: the install, the builds, the logs of earlier runs. */
function bootstrapLikeARow() {
  put('node_modules/tsx/index.js')
  put('packages/fx/one/node_modules/dep/a.js')
  put('apps/tracy-web/node_modules/dep/a.js')
  put('apps/tracy-web/.turbo/turbo-test:ci:1.log')
  put('.turbo/runs/earlier.json', '{}\n')
  put('scripts/.DS_Store')
  // Every declared ignored entry, the generated docs pages and the bytecode caches included.
  for (const g of GENERATED) putGenerated(g)
  put('vendor/tracy/dsh-passwords/node_modules/dep/a.js')
  put('vendor/tracy/deepseek-harness/packages/core/dsh/lib/index.js')
  put('vendor/tracy/deepseek-harness/node_modules/dep/a.js')
}

const names = ['test:ci', ...Object.keys(rootScripts)]
function dry(env = {}) {
  const run = spawnSync(TURBO, ['run', ...names, '--dry=json'], {
    cwd: fx,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TURBO_TELEMETRY_DISABLED: '1',
      TRACY_DSH_COMMIT: DSH_SHA,
      ...env
    }
  })
  assert.equal(run.status, 0, `turbo --dry failed: ${run.stderr}`)
  const parsed = parseDry(run.stdout)
  const tasks = parsed.tasks.filter((t) => t.command !== '<NONEXISTENT>')
  return { parsed, hashes: Object.fromEntries(tasks.map((t) => [t.taskId, t.hash])) }
}
const changed = (a, b) =>
  Object.keys(a)
    .filter((id) => a[id] !== b[id])
    .sort()

/** The fixture's tasks whose configured inputs select a path, by the gate's own glob matcher. */
function tasksCovering(rel) {
  const ids = Object.entries(realTurbo.tasks)
    .filter(([id, def]) => id.startsWith('//#') && covers(rootGlobs(def.inputs ?? [], ''), rel))
    .map(([id]) => id)
  if (covers(rootGlobs(packageTurbo.tasks['test:ci'].inputs, 'packages/fx/one'), rel))
    ids.push('@fixture/one#test:ci')
  return ids.sort()
}

describe('real Turbo on a fixture repository', () => {
  let base
  before(() => {
    build()
    base = dry()
  })

  test('the fixture runs every root task of the real configuration, and a package task', () => {
    const ids = Object.keys(base.hashes).sort()
    assert.deepEqual(ids, ['@fixture/one#test:ci', ...Object.keys(rootScripts).map((k) => `//#${k}`)].sort())
    assert.ok(ids.includes('//#test:ci:scripts') && ids.includes('//#test:ci:vendor'))
    assert.ok(base.parsed.globalCacheInputs.hashOfInternalDependencies)
  })

  test('a workflow or env-example edit changes exactly the tasks whose inputs name it — the scripts suite among them', () => {
    for (const rel of ['.github/workflows/tracy-ci.yml', 'deploy/.env.example']) {
      const before = readFileSync(path.join(fx, rel), 'utf8')
      appendFileSync(path.join(fx, rel), '# one more line\n')
      const now = changed(base.hashes, dry().hashes)
      writeFileSync(path.join(fx, rel), before)
      assert.ok(
        now.includes('//#test:ci:scripts'),
        `${rel} changed no hash of the suite that reads it: ${now.join(' ')}`
      )
      assert.deepEqual(now, tasksCovering(rel), rel)
    }
    assert.deepEqual(changed(base.hashes, dry().hashes), [], 'the fixture was not restored')
  })

  test('what only a bootstrapped row has changes no hash: plan and row agree on every task', () => {
    bootstrapLikeARow()
    const row = dry()
    assert.deepEqual(changed(base.hashes, row.hashes), [])
    // The same two trees through the comparison CI runs.
    const built = buildManifest({
      dry: { ...base.parsed, tasks: base.parsed.tasks.map((t) => ({ ...t, cache: { status: 'MISS' } })) },
      expected: Object.keys(base.hashes).sort(),
      commit: SHA,
      dshPinned: DSH_SHA,
      dshCheckedOut: DSH_SHA
    })
    assert.ok('manifest' in built, built.error)
    const verdict = compare({
      manifest: built.manifest,
      tasks: summaryTasks(row.parsed).map((t) => ({ ...t, cache: null })),
      commit: SHA,
      all: true
    })
    assert.equal(verdict.ok, true, JSON.stringify(verdict.different))
    assert.equal(verdict.equal, Object.keys(base.hashes).length)
  })

  test('each declared entry, present or absent, changes no hash — and without its exclusion it does', () => {
    // One entry at a time: the tree with it against the tree without it, under the real config.
    for (const g of GENERATED) {
      rmSync(path.join(fx, g.path), { recursive: true, force: true })
      const without = dry()
      putGenerated(g)
      assert.deepEqual(changed(without.hashes, dry().hashes), [], `${g.path} is in a hash`)
      assert.deepEqual(
        changed(base.hashes, without.hashes),
        [],
        `${g.path}: the tree without it is not the plan's`
      )
    }
    // The defect as it was: the same trees with ONE exclusion taken out of every task. Whichever
    // task takes that entry's tree by a written glob then hashes a row differently from plan.
    const hashedBySomeTask = []
    for (const g of GENERATED) {
      const loose = structuredClone(realTurbo)
      for (const def of Object.values(loose.tasks))
        if (def.inputs)
          def.inputs = def.inputs.filter(
            (i) => i !== excludeGlob(g) && i !== '!$TURBO_ROOT$/**/__pycache__/**'
          )
      writeFileSync(path.join(fx, 'turbo.json'), JSON.stringify(loose))
      const row = dry()
      rmSync(path.join(fx, g.path), { recursive: true, force: true })
      const plan = dry()
      putGenerated(g)
      writeFileSync(path.join(fx, 'turbo.json'), JSON.stringify(realTurbo))
      const differ = changed(plan.hashes, row.hashes)
      if (differ.length === 0) continue
      hashedBySomeTask.push(g.path)
      const built = buildManifest({
        dry: { ...plan.parsed, tasks: plan.parsed.tasks.map((t) => ({ ...t, cache: { status: 'HIT' } })) },
        expected: Object.keys(plan.hashes).sort(),
        commit: SHA,
        dshPinned: DSH_SHA,
        dshCheckedOut: DSH_SHA
      })
      const verdict = compare({
        manifest: built.manifest,
        tasks: summaryTasks(row.parsed),
        commit: SHA,
        all: true
      })
      assert.equal(verdict.ok, false, g.path)
      assert.deepEqual(verdict.different.map((d) => d.task).sort(), differ, g.path)
    }
    // The build outputs and the generated docs pages are inside trees the real root tasks take whole.
    for (const must of [
      'vendor/tracy/dsh-passwords/dist',
      'packages/cms/tracy-seeder/dist',
      'apps/tracy-docs/src/content/docs/changelog.md',
      'apps/tracy-docs/src/content/docs/reference/errors.md',
      'apps/tracy-docs/src/content/docs/reference/compatibility.md'
    ])
      assert.ok(
        hashedBySomeTask.includes(must),
        `${must} was expected to matter without its exclusion: ${hashedBySomeTask.join(' ')}`
      )
    assert.deepEqual(changed(base.hashes, dry().hashes), [], 'the fixture was not restored')
  })

  test('sources, build scripts and dependency pins of an excluded output still change the hash', () => {
    for (const rel of [
      'vendor/tracy/dsh-passwords/src/index.ts',
      'vendor/tracy/dsh-passwords/scripts/build-client.mjs',
      'vendor/tracy/dsh-passwords/package.json'
    ]) {
      const before = readFileSync(path.join(fx, rel), 'utf8')
      writeFileSync(
        path.join(fx, rel),
        rel.endsWith('.json')
          ? JSON.stringify({ name: 'dsh-passwords', dependencies: { a: '1.0.0' } })
          : `${before}// edit\n`
      )
      const now = changed(base.hashes, dry().hashes)
      writeFileSync(path.join(fx, rel), before)
      assert.ok(
        now.includes('//#test:ci:vendor') && now.includes('//#test:ci:scripts'),
        `${rel}: ${now.join(' ')}`
      )
    }
  })

  test('the submodule commit changes the tasks that declare it, and only those', () => {
    const now = changed(base.hashes, dry({ TRACY_DSH_COMMIT: 'c'.repeat(40) }).hashes)
    const declaring = [
      ...Object.entries(realTurbo.tasks)
        .filter(([id, def]) => id.startsWith('//#') && def.env?.includes('TRACY_DSH_COMMIT'))
        .map(([id]) => id),
      '@fixture/one#test:ci'
    ].sort()
    assert.deepEqual(now, declaring)
  })

  test('the database skip is in the hash of the tasks that hold database files, and of no other', () => {
    // A run that left the database files out must not be served as one that ran them, or the other
    // way round (16/10/2026): same files, same inputs, only this variable differs.
    const holding = Object.entries(realTurbo.tasks)
      .filter(([id, def]) => id.startsWith('//#') && def.env?.includes('TRACY_TESTS_SKIP_DB'))
      .map(([id]) => id)
      .sort()
    assert.ok(holding.includes('//#test:ci:scripts'), 'the scripts owner holds database files')
    assert.ok(!holding.includes('//#test:ci:interop') && !holding.includes('//#test:ci:vendor'))
    const skipping = dry({ TRACY_TESTS_SKIP_DB: '1' })
    assert.deepEqual(changed(base.hashes, skipping.hashes), holding)
    // The workflow always sets it, to 1 or 0: the two values are two different hashes for those tasks.
    const off = dry({ TRACY_TESTS_SKIP_DB: '0' })
    assert.deepEqual(changed(off.hashes, skipping.hashes), holding)
  })

  test('a checkout without the submodule hashes every task differently, and its dry run is refused', () => {
    rmSync(path.join(fx, 'vendor/tracy/deepseek-harness'), { recursive: true })
    const bare = dry()
    assert.deepEqual(changed(base.hashes, bare.hashes), Object.keys(base.hashes).sort())
    const built = buildManifest({
      dry: { ...bare.parsed, tasks: bare.parsed.tasks.map((t) => ({ ...t, cache: { status: 'MISS' } })) },
      expected: Object.keys(bare.hashes).sort(),
      commit: SHA,
      dshPinned: DSH_SHA,
      dshCheckedOut: DSH_SHA
    })
    assert.match(built.error, /internal dependencies/)
  })
})

const dryOf = (tasks, internal = 'abc') => ({
  turboVersion: '2.11.5',
  globalCacheInputs: { hashOfInternalDependencies: internal },
  tasks: [
    ...tasks.map(([taskId, hash, status]) => ({ taskId, hash, command: 'node x', cache: { status } })),
    {
      taskId: '@deepseek-ai/dsh#test:ci',
      hash: 'ffffffffffffffff',
      command: '<NONEXISTENT>',
      cache: { status: 'MISS' }
    }
  ]
})
const three = [
  ['//#test:ci:scripts', '1111111111111111', 'MISS'],
  ['@tracy/web#test:ci:1', '2222222222222222', 'HIT'],
  ['@tracy/seeder#test:ci', '3333333333333333', 'HIT']
]
const ids = three.map((t) => t[0]).sort()
const manifestOf = (tasks = three) =>
  buildManifest({
    dry: dryOf(tasks),
    expected: tasks.map((t) => t[0]).sort(),
    commit: SHA,
    dshPinned: DSH_SHA,
    dshCheckedOut: DSH_SHA
  })

test('inventory: the tasks are the test:ci scripts the tree declares, whatever their number', () => {
  assert.deepEqual(
    inventory([
      {
        dir: '',
        pkg: { scripts: { 'test:ci:scripts': 'x', 'test:ci:interop': 'x', test: 'y', 'test:workers': 'z' } }
      },
      { dir: 'apps/tracy-web', pkg: { name: '@tracy/web', scripts: { 'test:ci:1': 'x', 'test:ci:2': 'x' } } },
      {
        dir: 'packages/cms/tracy-seeder',
        pkg: { name: '@tracy/seeder', scripts: { 'test:ci': 'x', build: 'b' } }
      },
      { dir: 'packages/ui/tracy-ui', pkg: { name: '@tracy/ui' } }
    ]),
    [
      '//#test:ci:interop',
      '//#test:ci:scripts',
      '@tracy/seeder#test:ci',
      '@tracy/web#test:ci:1',
      '@tracy/web#test:ci:2'
    ]
  )
})

test('buildManifest: a whole dry run becomes commit + hash + cache answer per real task', () => {
  const built = manifestOf()
  assert.deepEqual(built.manifest, {
    v: 1,
    commit: SHA,
    dsh: DSH_SHA,
    turbo: '2.11.5',
    tasks: Object.fromEntries(three.map(([id, hash, status]) => [id, [hash, status]]))
  })
  assert.deepEqual(readManifest(JSON.stringify(built.manifest)), { manifest: built.manifest })
})

test('buildManifest: anything that cannot be trusted is refused, so plan falls back', () => {
  const ok = { dry: dryOf(three), expected: ids, commit: SHA, dshPinned: DSH_SHA, dshCheckedOut: DSH_SHA }
  const refused = (change) => buildManifest({ ...ok, ...change }).error ?? ''
  assert.match(refused({ expected: [...ids, '@tracy/host#test:ci'] }), /lacks 1 task/)
  assert.match(refused({ expected: ids.slice(1) }), /does not declare/)
  assert.match(refused({ dshCheckedOut: '' }), /not checked out/)
  assert.match(refused({ dshCheckedOut: 'c'.repeat(40) }), /the tree pins/)
  assert.match(refused({ commit: '' }), /no commit id/)
  assert.match(refused({ dry: dryOf(three, '') }), /internal dependencies/)
  assert.match(refused({ dry: dryOf([['//#test:ci:scripts', 'not-a-hash', 'MISS']]) }), /no usable hash/)
  assert.match(refused({ dry: dryOf([['//#test:ci:scripts', '1111111111111111', undefined]]) }), /not asked/)
  assert.match(refused({ dry: dryOf([three[0], three[0]]) }), /listed twice/)
  assert.match(refused({ dry: { tasks: [] }, expected: [] }), /internal dependencies/)
  assert.match(refused({ dry: dryOf([]), expected: [] }), /declares no Turbo test task/)
})

test('readManifest: empty means plan published none; anything else malformed is an error', () => {
  assert.deepEqual(readManifest(''), { none: true })
  assert.deepEqual(readManifest('  \n'), { none: true })
  for (const bad of [
    '{',
    '{}',
    JSON.stringify({ v: 1, commit: SHA, tasks: {} }),
    JSON.stringify({ v: 1, commit: SHA, tasks: { a: ['zz', 'HIT'] } })
  ])
    assert.ok('error' in readManifest(bad), bad)
})

test('compare: equal hashes pass; a different hash, a missing task, an unknown task or another commit fail', () => {
  const { manifest } = manifestOf()
  const here = three.map(([taskId, hash]) => ({ taskId, hash, cache: null }))
  assert.equal(compare({ manifest, tasks: here, commit: SHA, all: true }).ok, true)
  const moved = here.map((t, i) => (i === 0 ? { ...t, hash: '9999999999999999' } : t))
  const different = compare({ manifest, tasks: moved, commit: SHA, all: true })
  assert.equal(different.ok, false)
  assert.deepEqual(different.different, [
    { task: '//#test:ci:scripts', plan: '1111111111111111', here: '9999999999999999' }
  ])
  const missing = compare({ manifest, tasks: here.slice(1), commit: SHA, all: true })
  assert.deepEqual([missing.ok, missing.missing], [false, ['//#test:ci:scripts']])
  // A row runs only its own tasks: the others are not missing there.
  assert.equal(compare({ manifest, tasks: here.slice(1), commit: SHA, all: false }).ok, true)
  const unknown = compare({
    manifest,
    tasks: [...here, { taskId: '@tracy/new#test:ci', hash: '4444444444444444', cache: null }],
    commit: SHA,
    all: true
  })
  assert.deepEqual([unknown.ok, unknown.unknown], [false, ['@tracy/new#test:ci']])
  assert.equal(compare({ manifest, tasks: here, commit: 'd'.repeat(40), all: true }).ok, false)
  assert.equal(
    compare({ manifest, tasks: [], commit: SHA, all: false }).ok,
    false,
    'comparing nothing is not a pass'
  )
})

test('compare: a different cache answer is reported with its reason, never as a hash failure', () => {
  const { manifest } = manifestOf()
  const row = compare({
    manifest,
    tasks: [
      { taskId: '//#test:ci:scripts', hash: '1111111111111111', cache: 'HIT' },
      { taskId: '@tracy/web#test:ci:1', hash: '2222222222222222', cache: 'MISS' },
      { taskId: '@tracy/seeder#test:ci', hash: '3333333333333333', cache: 'HIT' }
    ],
    commit: SHA,
    all: false
  })
  assert.equal(row.ok, true)
  assert.deepEqual(row.cache, {
    predictedHit: 2,
    actualHit: 2,
    storedSincePlan: ['//#test:ci:scripts'],
    lostSincePlan: ['@tracy/web#test:ci:1']
  })
  const text = describeResult('row', row).join('\n')
  assert.match(text, /stored by another run after plan asked/)
  assert.match(text, /::warning::.*were not served here/)
  assert.doesNotMatch(text, /::error::/)
  const red = describeResult(
    'checks',
    compare({
      manifest,
      tasks: [{ taskId: '//#test:ci:scripts', hash: '9999999999999999', cache: null }],
      commit: SHA,
      all: true
    })
  ).join('\n')
  assert.match(red, /::error::.*1 differ, 2 missing here/)
  assert.match(red, /DIFFERENT \/\/#test:ci:scripts: plan 1111111111111111, here 9999999999999999/)
})

test('summaryTasks: a run summary gives the real tasks with what the cache did', () => {
  assert.deepEqual(
    summaryTasks({
      tasks: [
        {
          taskId: 'a#test:ci',
          hash: '1111111111111111',
          command: 'node x',
          cache: { status: 'HIT', source: 'REMOTE' }
        },
        { taskId: 'b#test:ci', hash: '2222222222222222', command: 'node x', cache: { status: 'MISS' } },
        { taskId: 'c#test:ci', hash: '3333333333333333', command: '<NONEXISTENT>', cache: { status: 'MISS' } }
      ]
    }),
    [
      { taskId: 'a#test:ci', hash: '1111111111111111', cache: 'HIT' },
      { taskId: 'b#test:ci', hash: '2222222222222222', cache: 'MISS' }
    ]
  )
})

test('compare: a row record is whole or it is not evidence — scheduled tasks, each once, each with HIT or MISS', () => {
  const { manifest } = manifestOf()
  const expected = ['//#test:ci:scripts']
  const row = (tasks, extra = {}) =>
    compare({
      manifest,
      tasks,
      commit: SHA,
      all: false,
      expected,
      needCache: true,
      group: 'tests scripts',
      ...extra
    })
  const good = row([{ taskId: '//#test:ci:scripts', hash: '1111111111111111', cache: 'MISS' }])
  assert.equal(good.ok, true)
  assert.deepEqual([good.group, good.expected], ['tests scripts', expected])
  // A summary without a status says nothing about the cache: not a pass.
  const blank = row([{ taskId: '//#test:ci:scripts', hash: '1111111111111111', cache: null }])
  assert.deepEqual([blank.ok, blank.noStatus], [false, ['//#test:ci:scripts']])
  assert.match(describeResult('row', blank).join('\n'), /NO CACHE STATUS .*\/\/#test:ci:scripts/)
  // A scheduled task the summary lacks, one listed twice, one that is another row's.
  assert.deepEqual(row([]).missing, expected)
  assert.equal(row([]).ok, false)
  const twice = row([
    { taskId: '//#test:ci:scripts', hash: '1111111111111111', cache: 'MISS' },
    { taskId: '//#test:ci:scripts', hash: '1111111111111111', cache: 'HIT' }
  ])
  assert.deepEqual([twice.ok, twice.duplicate], [false, ['//#test:ci:scripts']])
  const foreign = row([
    { taskId: '//#test:ci:scripts', hash: '1111111111111111', cache: 'MISS' },
    { taskId: '@tracy/seeder#test:ci', hash: '3333333333333333', cache: 'HIT' }
  ])
  assert.deepEqual([foreign.ok, foreign.unknown], [false, ['@tracy/seeder#test:ci']])
})

test("rowTasks: the manifest tasks a row's Turbo words select, as the planner writes them", () => {
  const tasks = Object.fromEntries(
    [
      '@tracy/web#test:ci:1',
      '@tracy/web#test:ci:2',
      '@tracy/web#test:ci:3',
      '@tracy/seeder#test:ci',
      '@tracy/core#test:ci',
      '//#test:ci:scripts',
      '//#test:ci:interop'
    ].map((id) => [id, ['1111111111111111', 'MISS']])
  )
  const manifest = { tasks }
  const dry = {
    tasks: Object.keys(tasks).map((id) => ({
      package: id.split('#')[0],
      task: id.split('#')[1],
      cache: { status: 'MISS' }
    }))
  }
  // Every row the planner builds selects its own tasks, and together they are the whole manifest.
  const all = []
  for (const r of turboRows(dry).rows) {
    const mine = rowTasks(manifest, r.turbo)
    assert.ok(Array.isArray(mine), `${r.group}: ${JSON.stringify(mine)}`)
    all.push(...mine)
  }
  assert.deepEqual(all.sort(), Object.keys(tasks).sort())
  assert.deepEqual(rowTasks(manifest, 'test:ci:2 --filter=@tracy/web'), ['@tracy/web#test:ci:2'])
  assert.deepEqual(rowTasks(manifest, 'test:ci'), ['@tracy/core#test:ci', '@tracy/seeder#test:ci'])
  assert.ok('error' in rowTasks(manifest, ''))
  assert.ok('error' in rowTasks(manifest, 'test:ci --force'))
  assert.ok('error' in rowTasks(manifest, 'test:ci:9 --filter=@tracy/web'))
})

test('judgeRun: plan, checks and one whole record per row that ran — or the problem is named', () => {
  const { manifest } = manifestOf()
  const all = compare({
    manifest,
    tasks: three.map(([taskId, hash]) => ({ taskId, hash, cache: null })),
    commit: SHA,
    all: true
  })
  const rowOf = (tasks, extra = {}) =>
    compare({
      manifest,
      tasks,
      commit: SHA,
      all: false,
      expected: ['//#test:ci:scripts'],
      needCache: true,
      group: 'tests scripts',
      ...extra
    })
  const row = rowOf([{ taskId: '//#test:ci:scripts', hash: '1111111111111111', cache: 'MISS' }])
  const stamp = '2026-10-13T00:00:00.0000000Z '
  const P = `${stamp}TRACY_TURBO_PLAN ${JSON.stringify(manifest)}`
  const C = `${stamp}TRACY_TURBO_CHECK ${JSON.stringify(all)}`
  const R = (record) => `${stamp}TRACY_TURBO_ROW ${JSON.stringify(record)}`
  const judge = (lines, turboRows = ['tests scripts']) => judgeRun({ lines, turboRows })
  const good = judge([P, `${stamp}noise`, C, R(row)])
  assert.equal(good.ok, true, good.problems.join('; '))
  assert.deepEqual(
    [
      good.summary.tasks,
      good.summary.plannedHit,
      good.summary.checksEqual,
      good.summary.rows,
      good.summary.rowTasks
    ],
    [3, 2, 3, 1, 1]
  )
  assert.match(judge([C, R(row)]).problems[0], /published no manifest/)
  assert.match(judge([P, R(row)]).problems[0], /checks row left no comparison/)
  assert.match(judge([P, C]).problems[0], /"tests scripts" ran but left no comparison/)
  const badAll = { ...all, ok: false, different: [{ task: 'x' }] }
  assert.match(
    judge([P, `TRACY_TURBO_CHECK ${JSON.stringify(badAll)}`, R(row)]).problems[0],
    /1 task hash\(es\) differ/
  )
  // A row whose summary carried no cache status is not evidence, whatever its hashes say.
  const blank = rowOf([{ taskId: '//#test:ci:scripts', hash: '1111111111111111', cache: null }])
  assert.match(
    judge([P, C, R(blank)]).problems[0],
    /"tests scripts" is not evidence: .*1 without a cache status/
  )
  // Nor is a record of another row, or one that names no row.
  const { group: _dropped, ...nameless } = row
  assert.equal(judge([P, C, R(nameless)]).ok, false)
  assert.equal(judge([P, C, R({ ...row, group: 'tests packages' })]).ok, false)
  // A record without its scheduled list cannot show the row was whole.
  const { expected: _gone, ...listless } = row
  assert.match(judge([P, C, R(listless)]).problems.join('; '), /compared 1 task\(s\), it was scheduled 0/)
  // Plan saw the scripts task missing; if its row did not run, a test was dropped.
  assert.match(
    judge([P, C], []).problems[0],
    /plan saw 1 task\(s\) missing from the cache that no row ran: \/\/#test:ci:scripts/
  )
  // Every task cached: plan starts no Turbo row, and checks alone carries the proof.
  const cached = manifestOf(three.map(([id, hash]) => [id, hash, 'HIT'])).manifest
  assert.equal(judge([`TRACY_TURBO_PLAN ${JSON.stringify(cached)}`, C], []).ok, true)
})

describe('the command line the workflow runs', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'tracy-turbo-verify-'))
  after(() => rmSync(dir, { recursive: true, force: true }))
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim()
  const manifest = { ...manifestOf().manifest, commit: head }
  const run = (args, env = {}) => {
    const clean = { ...process.env, ...env }
    delete clean.NODE_TEST_CONTEXT
    if (!('TRACY_TURBO_MANIFEST' in env)) delete clean.TRACY_TURBO_MANIFEST
    return spawnSync(process.execPath, [VERIFY, ...args], { cwd: ROOT, encoding: 'utf8', env: clean })
  }
  const dryFile = (tasks, name) => {
    const file = path.join(dir, name)
    writeFileSync(file, ` WARNING  something\n${JSON.stringify(dryOf(tasks))}`)
    return file
  }

  test('--compare: green on equal hashes, red on one different, quiet when plan published no manifest', () => {
    const same = run(['--compare', '--dry', dryFile(three, 'same.json')], {
      TRACY_TURBO_MANIFEST: JSON.stringify(manifest)
    })
    assert.equal(same.status, 0, same.stdout + same.stderr)
    assert.match(same.stdout, /3 of 3 task hashes equal the plan job's/)
    assert.match(same.stdout, /^TRACY_TURBO_CHECK \{/m)
    const moved = [['//#test:ci:scripts', '9999999999999999', 'MISS'], ...three.slice(1)]
    const red = run(['--compare', '--dry', dryFile(moved, 'moved.json')], {
      TRACY_TURBO_MANIFEST: JSON.stringify(manifest)
    })
    assert.equal(red.status, 1)
    assert.match(red.stdout, /::error::.*2 of 3 task hashes equal/)
    const none = run(['--compare', '--dry', dryFile(three, 'none.json')], { TRACY_TURBO_MANIFEST: '' })
    assert.equal(none.status, 0)
    assert.match(none.stdout, /::notice::.*published no Turbo manifest/)
    const broken = run(['--compare', '--dry', dryFile(three, 'broken.json')], {
      TRACY_TURBO_MANIFEST: '{"v":2}'
    })
    assert.equal(broken.status, 1)
  })

  test('--row: the newest run summary against the plan; red on a different hash, a missing status or a missing task', () => {
    const runs = path.join(dir, 'runs')
    mkdirSync(runs)
    const file = path.join(dir, 'manifest.json')
    writeFileSync(file, JSON.stringify(manifest))
    const summary = (name, task) => {
      const at = path.join(dir, name)
      writeFileSync(at, JSON.stringify({ tasks: [{ command: 'node x', ...task }] }))
      return at
    }
    const scripts = ['--row', '--manifest', file, '--group', 'tests scripts', '--tasks', 'test:ci:scripts']
    writeFileSync(
      path.join(runs, 'a.json'),
      JSON.stringify(dryOf([['//#test:ci:scripts', '1111111111111111', 'HIT']]))
    )
    const good = run([...scripts, '--summary', runs])
    assert.equal(good.status, 0, good.stdout + good.stderr)
    assert.match(
      good.stdout,
      /\/\/#test:ci:scripts: 1111111111111111 cache HIT \(plan: 1111111111111111 MISS\)/
    )
    const record = JSON.parse(/^TRACY_TURBO_ROW (\{.*\})$/m.exec(good.stdout)[1])
    assert.deepEqual(
      [record.group, record.expected, record.ok],
      ['tests scripts', ['//#test:ci:scripts'], true]
    )
    const moved = summary('bad.json', {
      taskId: '//#test:ci:scripts',
      hash: '9999999999999999',
      cache: { status: 'MISS' }
    })
    assert.equal(run([...scripts, '--summary', moved]).status, 1)
    // Turbo's summary without a cache status: no evidence of what the cache did.
    const blank = run([
      ...scripts,
      '--summary',
      summary('blank.json', { taskId: '//#test:ci:scripts', hash: '1111111111111111' })
    ])
    assert.equal(blank.status, 1)
    assert.match(blank.stdout, /NO CACHE STATUS/)
    // The row was scheduled the web task; the summary holds another one.
    const other = run([
      '--row',
      '--manifest',
      file,
      '--group',
      'tests web 1/3',
      '--tasks',
      'test:ci:1 --filter=@tracy/web',
      '--summary',
      runs
    ])
    assert.equal(other.status, 1)
    assert.match(other.stdout, /MISSING HERE @tracy\/web#test:ci:1/)
    const absent = run([...scripts, '--summary', path.join(dir, 'no-such')])
    assert.equal(absent.status, 1)
    assert.match(absent.stdout, /left no run summary/)
    // Without the row's name and words there is nothing to hold the summary against.
    assert.equal(run(['--row', '--manifest', file, '--summary', runs]).status, 1)
  })

  test('a missing or doubled mode is a usage error, never a silent pass', () => {
    assert.equal(run([]).status, 2)
    assert.equal(run(['--row', '--compare']).status, 2)
    assert.equal(run(['--plan']).status, 2)
  })
})
