import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyReads, covers, inputsFor, rootGlobs } from '../ci/turbo-inputs.mjs'

const dirs = new Set(['scripts', 'tasks'])
const isDir = (rel) => dirs.has(rel)

test('a read inside another package, app or vendor tree widens to that whole tree', () => {
  const { inputs } = inputsFor(
    'apps/tracy-web',
    [
      'packages/cms/tracy-seeder/src/plan-joomla-contract.mjs',
      'packages/cms/tracy-joomla-quickstart/contracts/ja-impact/j6/1.0.0/content-map.json',
      'apps/tracy-host/src/server.js',
      'vendor/tracy/od-brand-engine/dist/index.js'
    ],
    isDir
  )
  assert.deepEqual(inputs, [
    '$TURBO_ROOT$/apps/tracy-host/**',
    '$TURBO_ROOT$/packages/cms/tracy-joomla-quickstart/**',
    '$TURBO_ROOT$/packages/cms/tracy-seeder/**',
    '$TURBO_ROOT$/vendor/tracy/od-brand-engine/**'
  ])
})

test('a file at the root or directly under a top directory stays one file; a listed directory is its own entries', () => {
  const { inputs } = inputsFor(
    'scripts',
    ['pnpm-lock.yaml', 'config/mode-matrix.json', 'tasks', 'deploy/compose.yml'],
    isDir
  )
  assert.deepEqual(inputs, [
    '$TURBO_ROOT$/config/mode-matrix.json',
    '$TURBO_ROOT$/deploy/compose.yml',
    '$TURBO_ROOT$/pnpm-lock.yaml',
    '$TURBO_ROOT$/tasks/*'
  ])
})

test('anything deeper widens to its parent directory, and what a wider tree covers folds into it', () => {
  const { inputs } = inputsFor(
    'apps/tracy-web',
    [
      'tasks/evidence/spike/inputs/a.json',
      'tasks/evidence/spike/inputs/deep/b.json',
      'scripts/lib/x.mjs',
      'scripts/check-tests.ts'
    ],
    isDir
  )
  assert.deepEqual(inputs, [
    '$TURBO_ROOT$/scripts/check-tests.ts',
    '$TURBO_ROOT$/scripts/lib/**',
    '$TURBO_ROOT$/tasks/evidence/spike/inputs/**'
  ])
})

test('the owner itself and the tracer are not inputs', () => {
  const { inputs } = inputsFor(
    'packages/cms/tracy-seeder',
    ['packages/cms/tracy-seeder/src/a.mjs', 'scripts/ci/trace-reads.mjs', ''],
    isDir
  )
  assert.deepEqual(inputs, [])
})

test('a read of the dsh submodule becomes its commit id in env, never a glob into the submodule', () => {
  const read = inputsFor('apps/tracy-web', ['vendor/tracy/deepseek-harness/packages/x/lib/a.js'], isDir)
  assert.deepEqual(read.env, ['TRACY_DSH_COMMIT'])
  assert.deepEqual(read.inputs, [])
  assert.deepEqual(inputsFor('apps/tracy-web', ['apps/tracy-host/a.js'], isDir).env, [])
})

test('a workflow file and the env example become inputs: the directory of the first, the second alone', () => {
  // The two reads the tracer lost before it synchronised the named fs exports.
  const { inputs } = inputsFor('scripts', ['.github/workflows/tracy-ci.yml', 'deploy/.env.example'], isDir)
  assert.deepEqual(inputs, ['$TURBO_ROOT$/.github/workflows/**', '$TURBO_ROOT$/deploy/.env.example'])
})

test('a directory listed recursively is the whole directory, at any depth', () => {
  const { inputs } = inputsFor('scripts', ['docs/**', 'tasks', 'tests/regression/cases/**'], isDir)
  assert.deepEqual(inputs, [
    '$TURBO_ROOT$/docs/**',
    '$TURBO_ROOT$/tasks/*',
    '$TURBO_ROOT$/tests/regression/cases/**'
  ])
})

const generated = [
  {
    path: 'vendor/tracy/dsh-passwords/dist',
    sources: ['vendor/tracy/dsh-passwords/package.json', 'vendor/tracy/dsh-passwords/src/']
  },
  {
    path: 'packages/cms/tracy-seeder/dist',
    sources: ['packages/cms/tracy-seeder/scripts/build.mjs', 'vendor/tracy/od-design-system/catalog.json']
  },
  {
    path: 'apps/tracy-docs/src/content/docs/changelog.md',
    file: true,
    sources: ['docs/references/api-changelog.md']
  },
  {
    path: 'packages/fleet/tracy-fleet-operation/scripts/lib/__pycache__',
    sources: ['packages/fleet/tracy-fleet-operation/scripts/lib/']
  },
  { path: 'vendor/tracy/dsh-passwords/.env', file: true, localOnly: true }
]

test('an ignored read brings in the sources it is DECLARED to be built from, and nothing when undeclared', () => {
  const ignored = new Set([
    '.git/HEAD',
    'deploy/.env',
    '.cache/tsc/a.tsbuildinfo',
    'vendor/tracy/dsh-passwords/dist/client.js',
    'packages/cms/tracy-seeder/dist/data/catalog.json',
    'apps/tracy-docs/src/content/docs/changelog.md',
    'vendor/tracy/dsh-passwords/.env',
    'packages/ui/tracy-ui/storybook-static/a.js',
    'packages/fleet/tracy-fleet-operation/scripts/lib/__pycache__/a.pyc'
  ])
  const { inputs } = inputsFor('scripts', [...ignored], isDir, (rel) => ignored.has(rel), generated)
  assert.deepEqual(inputs, [
    // the docs page <- its source table; the seeder bundle <- its build script and the vendored data
    '$TURBO_ROOT$/docs/references/**',
    '$TURBO_ROOT$/packages/cms/tracy-seeder/**',
    // a declared bytecode cache <- the directory it is declared to be made from
    '$TURBO_ROOT$/packages/fleet/tracy-fleet-operation/**',
    '$TURBO_ROOT$/vendor/tracy/dsh-passwords/**',
    '$TURBO_ROOT$/vendor/tracy/od-design-system/**'
  ])
  // Not declared: the Storybook build of another tree, the machine's files — no input stands for them.
  assert.ok(!inputs.some((i) => /tracy-ui|deploy|\.cache|\.git/.test(i)))
  // The owner's own generated output still brings in the sources that lie outside the owner.
  assert.deepEqual(
    inputsFor(
      'packages/cms/tracy-seeder',
      ['packages/cms/tracy-seeder/dist/seed.mjs'],
      isDir,
      (rel) => rel.includes('/dist/'),
      generated
    ).inputs,
    ['$TURBO_ROOT$/vendor/tracy/od-design-system/**']
  )
})

test('covers: Turbo globs with ** at any depth, * within a segment, and negations that win', () => {
  const globs = [
    'apps/tracy-web/**',
    'tasks/*',
    'deploy/.env.example',
    '!**/.turbo/**',
    '!**/node_modules/**',
    '!vendor/x/dist/**'
  ]
  assert.equal(covers(globs, 'apps/tracy-web/src/a/b.js'), true)
  assert.equal(covers(globs, 'apps/tracy-web/.turbo/x.log'), false)
  assert.equal(covers(globs, 'apps/tracy-web/node_modules/a/b.js'), false)
  assert.equal(covers(globs, 'tasks/a.json'), true)
  assert.equal(covers(globs, 'tasks/deep/a.json'), false)
  assert.equal(covers(globs, 'deploy/.env.example'), true)
  assert.equal(covers(globs, 'deploy/.envXexample'), false)
  assert.equal(covers(['vendor/x/**', '!vendor/x/dist/**'], 'vendor/x/dist/client.js'), false)
  assert.equal(covers(['vendor/x/**', '!vendor/x/dist/**'], 'vendor/x/src/dist.ts'), true)
  assert.equal(covers(['!**/.DS_Store', 'scripts/**'], 'scripts/.DS_Store'), false)
})

test("rootGlobs: a package task's inputs relative to the repository root", () => {
  assert.deepEqual(
    rootGlobs(
      ['$TURBO_DEFAULT$', '$TURBO_ROOT$/scripts/check-tests.ts', '!$TURBO_ROOT$/**/.turbo/**', 'src/**'],
      'apps/tracy-web'
    ),
    ['apps/tracy-web/**', 'scripts/check-tests.ts', '!**/.turbo/**', 'apps/tracy-web/src/**']
  )
  assert.deepEqual(rootGlobs(['$TURBO_ROOT$/scripts/**'], ''), ['scripts/**'])
})

const classify = (reads, globs, extra = {}) =>
  classifyReads({
    reads,
    globs,
    env: [],
    hashed: null,
    kind: (rel) =>
      dirs.has(rel) || extra.dirs?.includes(rel) ? 'dir' : extra.absent?.includes(rel) ? 'absent' : 'file',
    isIgnored: (rel) => extra.ignored?.includes(rel) ?? false,
    ...extra.input
  })

test('classifyReads: a read no glob selects is uncovered — the class the gate is red on', () => {
  const globs = ['scripts/**', 'deploy/.env.example', '!**/node_modules/**']
  const sorted = classify(['scripts/a.mjs', 'deploy/.env.example', '.github/workflows/tracy-ci.yml'], globs)
  assert.deepEqual(sorted.hashed, ['deploy/.env.example', 'scripts/a.mjs'])
  assert.deepEqual(sorted.uncovered, ['.github/workflows/tracy-ci.yml'])
  // Taking one input away is enough to uncover its reader.
  assert.deepEqual(classify(['deploy/.env.example'], ['scripts/**']).uncovered, ['deploy/.env.example'])
  assert.deepEqual(
    classify(['.github/workflows/tracy-ci.yml'], [...globs, '.github/workflows/**']).uncovered,
    []
  )
})

test("classifyReads: Turbo's own list of hashed files decides for a file; the globs for a directory or an absent path", () => {
  const globs = ['scripts/**', 'tasks/*', 'docs/**']
  const sorted = classifyReads({
    reads: [
      'scripts/a.mjs',
      'scripts/b.mjs',
      'tasks',
      'tasks/**',
      'docs/**',
      'scripts/not-yet.json',
      'deploy/not-yet.json'
    ],
    globs,
    env: [],
    hashed: new Set(['scripts/a.mjs']),
    kind: (rel) => (rel === 'tasks' || rel === 'docs' ? 'dir' : rel.includes('not-yet') ? 'absent' : 'file'),
    isIgnored: () => false
  })
  assert.deepEqual(sorted.hashed, ['docs/**', 'scripts/a.mjs', 'scripts/not-yet.json', 'tasks'])
  // b.mjs matches a glob but Turbo does not hash it; a recursive listing needs more than `tasks/*`.
  assert.deepEqual(sorted.uncovered, ['scripts/b.mjs', 'tasks/**'])
  // A path that does not exist and no input would cover: reported, not failed (it decided nothing).
  assert.deepEqual(sorted.absent, ['deploy/not-yet.json'])
})

test('classifyReads: a path that does not exist yet is covered as the file or the directory it may become', () => {
  const absent = (reads, globs) =>
    classifyReads({ reads, globs, env: [], hashed: new Set(), kind: () => 'absent', isIgnored: () => false })
  // What inputsFor writes for a probe of `apps/.webroot` (a tree of its own) covers the probe.
  assert.deepEqual(absent(['apps/.webroot'], ['apps/.webroot/**']).uncovered, [])
  assert.deepEqual(absent(['scratch/a', 'scratch/a/b'], ['scratch/a/**']).uncovered, [])
  assert.deepEqual(absent(['scratch/a'], ['other/**']).absent, ['scratch/a'])
  assert.deepEqual(absent(['scratch/a'], ['other/**']).uncovered, [])
})

test('classifyReads: dsh needs its commit in env', () => {
  const reads = ['vendor/tracy/deepseek-harness/packages/x/lib/a.js']
  assert.deepEqual(classify(reads, ['scripts/**']).uncovered, reads)
  assert.deepEqual(classify(reads, ['scripts/**'], { input: { env: ['TRACY_DSH_COMMIT'] } }).submodule, reads)
})

test('classifyReads: an ignored read passes only through a declared entry whose every source is an input', () => {
  const out = 'vendor/tracy/dsh-passwords/dist/client.js'
  const judge = (reads, globs, extra = {}) =>
    classify(reads, globs, { ignored: reads, input: { generated }, ...extra })
  const whole = ['vendor/tracy/dsh-passwords/**', '!vendor/tracy/dsh-passwords/dist/**']
  assert.deepEqual(judge([out], whole).outputs, [out])
  // One declared source that is not an input: the output could change without the hash changing.
  assert.deepEqual(judge([out], ['vendor/tracy/dsh-passwords/src/**']).uncovered, [out])
  const seeder = 'packages/cms/tracy-seeder/dist/data/catalog.json'
  assert.deepEqual(judge([seeder], ['packages/cms/tracy-seeder/**']).uncovered, [seeder])
  assert.deepEqual(
    judge([seeder], ['packages/cms/tracy-seeder/**', 'vendor/tracy/od-design-system/**']).outputs,
    [seeder]
  )
  // Turbo's own list of hashed files decides for a source that is a file.
  const page = 'apps/tracy-docs/src/content/docs/changelog.md'
  const hashedOnly = (hashed) =>
    classifyReads({
      reads: [page],
      globs: ['docs/references/**'],
      env: [],
      hashed,
      kind: () => 'file',
      isIgnored: () => true,
      generated
    })
  assert.deepEqual(hashedOnly(new Set(['docs/references/api-changelog.md'])).outputs, [page])
  assert.deepEqual(hashedOnly(new Set()).uncovered, [page])
})

test("classifyReads: every other ignored read, and git's own directory, is uncovered — never dropped", () => {
  const reads = [
    'packages/ui/tracy-ui/storybook-static/a.js', // ignored inside a tree that IS an input, undeclared
    'packages/ui/tracy-ui/.env', // an unhashed configuration file in a hashed tree
    'deploy/.env', // ignored outside every tree
    '.cache/tsc/a.tsbuildinfo',
    '.git/HEAD'
  ]
  const sorted = classify(reads, ['packages/ui/tracy-ui/**', 'deploy/*'], {
    ignored: reads.slice(0, 4),
    input: { generated }
  })
  assert.deepEqual(sorted.uncovered, [...reads].sort())
  assert.deepEqual([sorted.outputs, sorted.local], [[], []])
})

test('classifyReads: a declared machine-only DIRECTORY: each probed path passes only while absent', () => {
  const gen = [{ path: 'packages/cms/tracy-seeder/src/data', localOnly: true }]
  const probe = 'packages/cms/tracy-seeder/src/data/quickstart-contracts/kinetic/v1/presentation-lock.json'
  const at = (file, kind) =>
    classifyReads({
      reads: [file],
      globs: ['packages/cms/tracy-seeder/**'],
      env: [],
      hashed: null,
      kind: () => kind,
      isIgnored: () => true,
      generated: gen
    })
  assert.deepEqual(at(probe, 'absent').local, [probe])
  assert.deepEqual(at(probe, 'file').uncovered, [probe])
  // A sibling with a shared prefix is not inside it.
  const sibling = 'packages/cms/tracy-seeder/src/data2/a.json'
  assert.deepEqual(at(sibling, 'absent').uncovered, [sibling])
  // And it brings no input.
  assert.deepEqual(inputsFor('scripts', [probe], isDir, () => true, gen).inputs, [])
})

test('classifyReads: a declared machine-only file passes while absent, and is uncovered the moment it exists', () => {
  const env = 'vendor/tracy/dsh-passwords/.env'
  const at = (kind) =>
    classifyReads({
      reads: [env],
      globs: ['vendor/tracy/dsh-passwords/**'],
      env: [],
      hashed: null,
      kind: () => kind,
      isIgnored: () => true,
      generated
    })
  assert.deepEqual(at('absent').local, [env])
  assert.deepEqual(at('file').uncovered, [env])
})

test('classifyReads: no directory is approved by its name — a cache passes only where it is declared', () => {
  const judge = (file, globs) => classify([file], globs, { ignored: [file], input: { generated } })
  const tree = ['packages/fleet/tracy-fleet-operation/**', 'apps/tracy-web/**', '!**/__pycache__/**']
  // Declared, and the directory it is made from is an input.
  const declared = 'packages/fleet/tracy-fleet-operation/scripts/lib/__pycache__/a.cpython-312.pyc'
  assert.deepEqual(judge(declared, tree).outputs, [declared])
  assert.deepEqual(judge(declared, ['scripts/**']).uncovered, [declared])
  // The same kind of directory elsewhere, an ignored configuration file inside a `node_modules`
  // or a `.turbo` whose parent IS an input: none is declared, so none passes.
  for (const file of [
    'packages/fleet/tracy-fleet-operation/scripts/other/__pycache__/a.pyc',
    'apps/tracy-web/node_modules/.config.json',
    'apps/tracy-web/.turbo/settings.json',
    'packages/fleet/tracy-fleet-operation/scripts/lib/__pycache__x/a.pyc'
  ])
    assert.deepEqual(judge(file, tree).uncovered, [file], file)
  // A declared FILE vouches for itself only, never for something below a path of the same name.
  const below = 'apps/tracy-docs/src/content/docs/changelog.md/extra'
  assert.deepEqual(judge(below, ['docs/references/**']).uncovered, [below])
  // And inputsFor gives an undeclared one nothing.
  assert.deepEqual(
    inputsFor('scripts', ['apps/tracy-web/node_modules/.config.json'], isDir, () => true, generated).inputs,
    []
  )
})

test('what inputsFor writes for a set of reads covers every one of them', () => {
  const reads = [
    '.github/workflows/tracy-ci.yml',
    'deploy/.env.example',
    'pnpm-lock.yaml',
    'tasks',
    'docs/**',
    'tasks/evidence/spike/inputs/a.json',
    'packages/cms/tracy-seeder/src/a.mjs',
    'apps/tracy-host',
    'vendor/tracy/od-brand-engine/dist/index.js',
    'deploy/not-yet.json'
  ]
  const { inputs } = inputsFor('scripts', reads, isDir)
  const sorted = classify(reads, rootGlobs(inputs, ''), {
    dirs: ['apps/tracy-host'],
    absent: ['deploy/not-yet.json']
  })
  assert.deepEqual(sorted.uncovered, [])
  assert.equal(sorted.hashed.length, reads.length)
})
