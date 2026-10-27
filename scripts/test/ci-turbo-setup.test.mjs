import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  configProblems,
  coverageProblems,
  definitionProblem,
  EXCLUDE,
  failedTestFiles,
  excludeGlob,
  GENERATED,
  MACHINERY,
  parseSetupArgs,
  runTraced,
  tasksToAudit,
  turboTaskNames,
  taskSelection,
  command,
  EXTRA_ROOT_TASKS
} from '../ci/turbo-setup.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
const dir = mkdtempSync(path.join(tmpdir(), 'tracy-turbo-setup-test-'))
after(() => rmSync(dir, { recursive: true, force: true }))

const node = process.execPath
let n = 0
/** Runs commands under the tracer, each call with its own trace and log file. */
function traced(commands, extra = {}) {
  n += 1
  const env = { ...process.env }
  // This suite may itself run under the tracer or under `node --test`; the inner run starts clean.
  delete env.NODE_OPTIONS
  delete env.NODE_TEST_CONTEXT
  const log = path.join(dir, `${String(n)}.log`)
  return runTraced({
    commands,
    reads: path.join(dir, `${String(n)}.reads.txt`),
    log,
    env,
    ...extra
  }).then((result) => ({ ...result, log }))
}
const reading = (rel) => ({
  bin: node,
  args: ['-e', `require('node:fs').readFileSync(${JSON.stringify(path.join(ROOT, rel))})`],
  cwd: ROOT
})

test('runTraced: a green command returns what it read, one command after another', async () => {
  const result = await traced([reading('.node-version'), reading('turbo.json')], {
    expect: ['.node-version', 'turbo.json']
  })
  assert.equal(result.ok, true, result.why)
  assert.ok(result.reads.includes('.node-version') && result.reads.includes('turbo.json'))
})

test('runTraced: a command that exits non-zero is refused, and its stderr is in the log', async () => {
  const result = await traced([
    reading('.node-version'),
    { bin: node, args: ['-e', "console.error('boom-from-the-suite'); process.exit(3)"], cwd: ROOT },
    reading('turbo.json')
  ])
  assert.equal(result.ok, false)
  assert.match(result.why, /exited 3/)
  assert.match(readFileSync(result.log, 'utf8'), /boom-from-the-suite/)
})

test('runTraced: a red test file is run again alone; green then is a whole measurement, red three times is refused', async () => {
  // A test file that fails on its first run and passes on its second (a marker file remembers).
  const flaky = path.join(dir, 'flaky.test.mjs')
  const steady = path.join(dir, 'steady.test.mjs')
  const marker = path.join(dir, 'flaky.marker')
  writeFileSync(
    flaky,
    `import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
test('loses the race once', () => {
  readFileSync(${JSON.stringify(path.join(ROOT, '.node-version'))})
  const seen = existsSync(${JSON.stringify(marker)})
  writeFileSync(${JSON.stringify(marker)}, 'x')
  assert.ok(seen, 'first run')
  readFileSync(${JSON.stringify(path.join(ROOT, 'turbo.json'))})
})
`
  )
  writeFileSync(steady, `import { test } from 'node:test'\ntest('fine', () => {})\n`)
  const argv = (files) => ['--test', ...files]
  const command = {
    bin: node,
    args: argv([flaky, steady]),
    cwd: dir,
    files: ['flaky.test.mjs', 'steady.test.mjs'],
    again: (red) => argv(red.map((f) => path.join(dir, f)))
  }
  const result = await traced([command])
  assert.equal(result.ok, true, result.why)
  // What the green attempt read past the point the red one stopped at is in the trace.
  assert.ok(result.reads.includes('.node-version') && result.reads.includes('turbo.json'))
  assert.match(
    readFileSync(result.log, 'utf8'),
    /attempt 1 had 1 red test file\(s\); running them again: flaky\.test\.mjs/
  )

  const never = path.join(dir, 'never.test.mjs')
  writeFileSync(
    never,
    `import { test } from 'node:test'\nimport assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'\ntest('always red', () => assert.fail('no'))\n`
  )
  const red = await traced([
    {
      bin: node,
      args: argv([never]),
      cwd: dir,
      files: ['never.test.mjs'],
      again: (files) => argv(files.map((f) => path.join(dir, f)))
    }
  ])
  assert.equal(red.ok, false)
  assert.match(red.why, /exited 1/)
  assert.equal(readFileSync(red.log, 'utf8').match(/running them again/g).length, 2)
})

test('failedTestFiles: only files of this command that the reporter names as failed', () => {
  const output =
    'noise\ntest at apps/tracy-web/test/a.test.mjs:808:1\n✖ x\ntest at apps/tracy-web/test/a.test.mjs:12:1\ntest at other/b.test.mjs:1:1\n  test at apps/tracy-web/test/c.test.mjs:1:1\n'
  assert.deepEqual(
    failedTestFiles(output, ['apps/tracy-web/test/a.test.mjs', 'apps/tracy-web/test/c.test.mjs']),
    ['apps/tracy-web/test/a.test.mjs']
  )
  assert.deepEqual(failedTestFiles('Segmentation fault', ['apps/tracy-web/test/a.test.mjs']), [])
})

test('runTraced: --accept-red keeps the trace of a red command and names it; a stop at the time limit is still refused', async () => {
  const red = {
    bin: node,
    args: [
      '-e',
      `require('node:fs').readFileSync(${JSON.stringify(path.join(ROOT, '.node-version'))}); process.exit(1)`
    ],
    cwd: ROOT
  }
  const result = await traced([red, reading('turbo.json')], { acceptRed: true })
  assert.equal(result.ok, true, result.why)
  assert.equal(result.red.length, 1)
  assert.match(result.red[0], /exited 1/)
  assert.ok(result.reads.includes('.node-version') && result.reads.includes('turbo.json'))
  assert.deepEqual((await traced([reading('turbo.json')], { acceptRed: true })).red, [])
  const late = await traced([{ bin: node, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: ROOT }], {
    acceptRed: true,
    timeoutMs: 300
  })
  assert.equal(late.ok, false)
})

test('runTraced: a program that cannot start is refused', async () => {
  const result = await traced([{ bin: path.join(dir, 'no-such-program'), args: [], cwd: ROOT }])
  assert.equal(result.ok, false)
  assert.match(result.why, /could not start/)
})

test('runTraced: a command past its time limit is stopped and refused', async () => {
  const result = await traced([{ bin: node, args: ['-e', 'setInterval(() => {}, 1000)'], cwd: ROOT }], {
    timeoutMs: 300
  })
  assert.equal(result.ok, false)
  assert.match(result.why, /ran past/)
})

test('runTraced: no trace, an empty trace and a trace without the test files are refused', async () => {
  // Not node: the tracer never loads, so nothing is written.
  const none = await traced([{ bin: '/bin/sh', args: ['-c', 'exit 0'], cwd: ROOT }])
  assert.equal(none.ok, false)
  assert.match(none.why, /left no trace/)
  const lost = await traced([reading('.node-version')], {
    expect: ['.node-version', 'scripts/test/x.test.mjs']
  })
  assert.equal(lost.ok, false)
  assert.match(lost.why, /without 1 of the 2 test files/)
})

test('runTraced: a log with megabytes of output does not stall the command', async () => {
  const result = await traced([
    {
      bin: node,
      args: [
        '-e',
        `require('node:fs').readFileSync(${JSON.stringify(path.join(ROOT, '.node-version'))}); process.stderr.write('x'.repeat(4 * 1024 * 1024))`
      ],
      cwd: ROOT
    }
  ])
  assert.equal(result.ok, true, result.why)
  assert.ok(readFileSync(result.log).length >= 4 * 1024 * 1024)
})

test('parseSetupArgs: the three options, and anything else is refused', () => {
  assert.deepEqual(parseSetupArgs([]), {
    check: false,
    structureOnly: false,
    taskPart: null,
    database: 'auto',
    artifacts: null,
    since: null,
    acceptRed: []
  })
  assert.deepEqual(parseSetupArgs(['--check', '--database', 'owned', '--artifacts', 'out']), {
    check: true,
    structureOnly: false,
    taskPart: null,
    database: 'owned',
    artifacts: 'out',
    since: null,
    acceptRed: []
  })
  assert.equal(parseSetupArgs(['--check', '--changed-since', 'HEAD^1']).since, 'HEAD^1')
  assert.deepEqual(
    parseSetupArgs(['--accept-red', '//#test:ci:vendor', '--accept-red', '@tracy/web#test:ci:1']).acceptRed,
    ['//#test:ci:vendor', '@tracy/web#test:ci:1']
  )
  for (const bad of [
    ['--chek'],
    ['--database'],
    ['--database', 'auto'],
    ['--database=owned'],
    ['--artifacts'],
    ['--artifacts', '--check'],
    ['--check', '--check'],
    ['--changed-since', 'HEAD^1'],
    ['--accept-red'],
    ['--accept-red', 'vendor'],
    ['--check', '--accept-red', '//#test:ci:vendor'],
    ['--check', '--changed-since'],
    ['--check', '--changed-since', '--artifacts']
  ])
    assert.ok('error' in parseSetupArgs(bad), bad.join(' '))
})

const sets = (obj) => new Map(Object.entries(obj).map(([k, v]) => [k, new Set(v)]))
const lists = (obj) => new Map(Object.entries(obj))
const kindOf = (files, dirs) => (rel) =>
  dirs.includes(rel) ? 'dir' : files.includes(rel) ? 'file' : 'absent'

test('coverage: a read outside the inputs is a problem for root, package and extra tasks alike', () => {
  const tasks = [
    { id: '//#test:ci:scripts', globs: ['scripts/**', 'deploy/.env.example'], env: [] },
    { id: '//#test:ci:interop', globs: ['scripts/**'], env: [] },
    { id: '//#test:ci:vendor', globs: ['vendor/tracy/dsh-passwords/**'], env: ['TRACY_DSH_COMMIT'] },
    { id: '@tracy/web#test:ci:1', globs: ['apps/tracy-web/**'], env: [] }
  ]
  const files = [
    'scripts/a.mjs',
    'deploy/.env.example',
    '.github/workflows/tracy-ci.yml',
    'packages/cms/tracy-seeder/src/a.mjs',
    'vendor/tracy/dsh-passwords/src/a.ts',
    'apps/tracy-web/src/a.js',
    'apps/tracy-host/src/b.js'
  ]
  const { problems, report } = coverageProblems({
    tasks,
    reads: lists({
      '//#test:ci:scripts': ['scripts/a.mjs', 'deploy/.env.example', '.github/workflows/tracy-ci.yml'],
      '//#test:ci:interop': ['scripts/a.mjs', 'packages/cms/tracy-seeder/src/a.mjs'],
      '//#test:ci:vendor': [
        'vendor/tracy/dsh-passwords/src/a.ts',
        'vendor/tracy/deepseek-harness/packages/x/lib/a.js'
      ],
      '@tracy/web#test:ci:1': ['apps/tracy-web/src/a.js', 'apps/tracy-host/src/b.js']
    }),
    hashed: sets({
      '//#test:ci:scripts': ['scripts/a.mjs', 'deploy/.env.example'],
      '//#test:ci:interop': ['scripts/a.mjs'],
      '//#test:ci:vendor': ['vendor/tracy/dsh-passwords/src/a.ts'],
      '@tracy/web#test:ci:1': ['apps/tracy-web/src/a.js']
    }),
    kind: kindOf(files, []),
    ignored: new Set()
  })
  assert.deepEqual(problems, [
    "//#test:ci:scripts: its suite reads .github/workflows/tracy-ci.yml, which is not among the task's inputs",
    "//#test:ci:interop: its suite reads packages/cms/tracy-seeder/src/a.mjs, which is not among the task's inputs",
    "@tracy/web#test:ci:1: its suite reads apps/tracy-host/src/b.js, which is not among the task's inputs"
  ])
  assert.equal(report['//#test:ci:vendor'].submodule, 1)
})

test('coverage: a hashed file git ignores is one problem per directory; an undeclared ignored read is a problem', () => {
  const ignored = new Set([
    'vendor/tracy/dsh-passwords/dist/client.js',
    'packages/ui/tracy-ui/storybook-static/a.js',
    'deploy/.env'
  ])
  const { problems, report } = coverageProblems({
    tasks: [
      {
        id: '//#test:ci:scripts',
        globs: ['scripts/**', 'vendor/tracy/dsh-passwords/**', 'packages/ui/tracy-ui/**'],
        env: []
      }
    ],
    reads: lists({
      '//#test:ci:scripts': [
        'vendor/tracy/dsh-passwords/dist/client.js',
        'packages/ui/tracy-ui/storybook-static/a.js',
        'deploy/.env',
        '.git/HEAD'
      ]
    }),
    hashed: sets({
      '//#test:ci:scripts': [
        'scripts/a.mjs',
        'vendor/tracy/dsh-passwords/dist/client.js',
        'vendor/tracy/dsh-passwords/package.json',
        'vendor/tracy/dsh-passwords/tsconfig.json',
        'vendor/tracy/dsh-passwords/scripts/build-client.mjs'
      ]
    }),
    kind: kindOf([...ignored], []),
    ignored
  })
  // Declared in GENERATED with every source hashed: the only ignored read that passes.
  assert.deepEqual(report['//#test:ci:scripts'].outputs, ['vendor/tracy/dsh-passwords/dist/client.js'])
  assert.deepEqual(report['//#test:ci:scripts'].uncovered, [
    '.git/HEAD',
    'deploy/.env',
    'packages/ui/tracy-ui/storybook-static/a.js'
  ])
  assert.equal(problems.length, 4)
  assert.match(problems[0], /reads \.git\/HEAD; git's own directory is in no hash/)
  assert.match(problems[1], /reads deploy\/\.env, which git ignores, so no hash can cover it/)
  assert.match(problems[2], /reads packages\/ui\/tracy-ui\/storybook-static\/a\.js, which git ignores/)
  assert.match(problems[3], /dist\/client\.js is hashed \(1 file\(s\)/)
  // One build output is one problem, however many files it holds.
  const many = coverageProblems({
    tasks: [{ id: '//#test:ci:scripts', globs: ['packages/cms/tracy-seeder/**'], env: [] }],
    reads: lists({ '//#test:ci:scripts': [] }),
    hashed: sets({
      '//#test:ci:scripts': ['packages/cms/tracy-seeder/dist/a.js', 'packages/cms/tracy-seeder/dist/b/c.js']
    }),
    kind: () => 'file',
    ignored: new Set(['packages/cms/tracy-seeder/dist/a.js', 'packages/cms/tracy-seeder/dist/b/c.js']),
    ignoredEntry: () => 'packages/cms/tracy-seeder/dist/'
  })
  assert.equal(many.problems.length, 1)
  assert.match(many.problems[0], /packages\/cms\/tracy-seeder\/dist\/ is hashed \(2 file\(s\)/)
})

test('coverage: a task Turbo does not list is a problem, never a pass', () => {
  const { problems } = coverageProblems({
    tasks: [{ id: '//#test:ci:gone', globs: ['scripts/**'], env: [] }],
    reads: lists({}),
    hashed: new Map(),
    kind: () => 'absent',
    ignored: new Set()
  })
  assert.match(problems[0], /Turbo lists no such task/)
})

test('the committed configuration is the generated one for every current owner', async () => {
  const { workersFiles } = await import('../check-tests.ts')
  assert.deepEqual(configProblems(workersFiles()), [])
})

test('a task without its own tree, the machinery or an exclusion is a configuration problem', () => {
  const whole = { inputs: ['$TURBO_DEFAULT$', ...MACHINERY, ...EXCLUDE] }
  assert.equal(definitionProblem('x', whole, '$TURBO_DEFAULT$'), null)
  assert.match(definitionProblem('x', undefined, '$TURBO_DEFAULT$'), /missing/)
  assert.match(definitionProblem('x', { inputs: [...MACHINERY, ...EXCLUDE] }, '$TURBO_DEFAULT$'), /missing/)
  for (const must of [...MACHINERY, ...EXCLUDE]) {
    const def = { inputs: whole.inputs.filter((i) => i !== must) }
    assert.ok(definitionProblem('x', def, '$TURBO_DEFAULT$').includes(must), must)
  }
})

test('MACHINERY names the wrapper and every file it imports, however deep', () => {
  const seen = new Set()
  const walk = (file) => {
    if (seen.has(file)) return
    seen.add(file)
    const source = readFileSync(path.join(ROOT, file), 'utf8')
    // Statements only: a path quoted in a comment is not an import.
    for (const m of source.matchAll(/^(?:import|export|\})[^\n]*\bfrom '(\.[^']+)'/gm))
      walk(path.posix.normalize(path.posix.join(path.posix.dirname(file), m[1])))
  }
  walk('scripts/check-tests.ts')
  assert.ok(seen.size >= 4, 'the wrapper no longer imports by relative path?')
  for (const file of seen)
    assert.ok(
      MACHINERY.includes(`$TURBO_ROOT$/${file}`),
      `${file} runs every test task but is not in MACHINERY`
    )
  assert.equal(MACHINERY.length, seen.size, 'MACHINERY names a file the wrapper does not load')
})

test('every declared ignored path is ignored by git, names sources git tracks, and is out of every hash', async () => {
  const { spawnSync } = await import('node:child_process')
  const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' })
  assert.ok(GENERATED.length > 0)
  for (const g of GENERATED) {
    const probe = g.file ? g.path : `${g.path}/probe.js`
    assert.equal(
      git('check-ignore', '-q', probe).status,
      0,
      `${g.path} is not ignored by git: a committed file must stay an input`
    )
    // Out of every hash, whatever it is: a row that has it must hash what the bare plan job hashes.
    assert.equal(excludeGlob(g), `!$TURBO_ROOT$/${g.path}${g.file ? '' : '/**'}`)
    assert.ok(EXCLUDE.includes(excludeGlob(g)), `${g.path} is not excluded from the hashes`)
    if (g.localOnly) {
      assert.equal(g.sources, undefined, `${g.path}: a machine's own file has no sources`)
      continue
    }
    assert.ok(g.sources?.length > 0, `${g.path} names no source: nothing would stand for it in the hash`)
    for (const src of g.sources) {
      // A source is something the plan job's checkout has: tracked, and not ignored.
      assert.ok(git('ls-files', '--', src).stdout.trim().length > 0, `${g.path}: source ${src} is not in git`)
      assert.equal(
        git('check-ignore', '-q', src.endsWith('/') ? `${src}a.py` : src).status,
        1,
        `${g.path}: source ${src} is ignored`
      )
    }
  }
  // The four patterns that only keep files out of a hash approve no read: nothing is declared by kind.
  for (const g of GENERATED) assert.ok(!/[*?]/.test(g.path), `${g.path}: an entry is one path, not a pattern`)
})

test('the task names asked of Turbo are the generic ones plus the root scripts', () => {
  assert.deepEqual(
    turboTaskNames({ 'test:ci:scripts': 'x', 'test:ci:interop': 'y', test: 'z', 'test:workers': 'w' }),
    ['test:ci', 'test:ci:1', 'test:ci:2', 'test:ci:3', 'test:ci:scripts', 'test:ci:interop']
  )
})

test('--changed-since: only the tasks whose inputs the diff touches are measured again', () => {
  const tasks = [
    {
      id: '//#test:ci:scripts',
      globs: ['scripts/**', '.github/workflows/**', 'apps/tracy-web/**', '!**/node_modules/**'],
      env: []
    },
    {
      id: '@tracy/web#test:ci:1',
      globs: ['apps/tracy-web/**', 'packages/cms/tracy-seeder/**'],
      env: ['TRACY_DSH_COMMIT']
    },
    { id: '@tracy/seeder#test:ci', globs: ['packages/cms/tracy-seeder/**'], env: [] }
  ]
  const ids = (changed) => [...tasksToAudit({ tasks, changed }).ids].sort()
  assert.deepEqual(ids(['docs/references/a.md', 'tasks/nhat-ky/2026-10-12-x.md']), [])
  assert.deepEqual(ids(['.github/workflows/tracy-ci.yml']), ['//#test:ci:scripts'])
  assert.deepEqual(ids(['packages/cms/tracy-seeder/src/a.mjs']), [
    '@tracy/seeder#test:ci',
    '@tracy/web#test:ci:1'
  ])
  // A deleted or new file counts by its path: the glob decides, not the disk.
  assert.deepEqual(ids(['apps/tracy-web/test/new.test.mjs']), ['//#test:ci:scripts', '@tracy/web#test:ci:1'])
  // The submodule pointer moves the tasks that carry its commit in their hash.
  assert.deepEqual(ids(['vendor/tracy/deepseek-harness']), ['@tracy/web#test:ci:1'])
})

test('--changed-since: an unknown diff, a root file or the measuring code measures every task', () => {
  const tasks = [
    { id: 'a#test:ci', globs: ['packages/a/**'], env: [] },
    { id: 'b#test:ci', globs: ['packages/b/**'], env: [] }
  ]
  for (const changed of [
    null,
    ['pnpm-lock.yaml'],
    ['turbo.json'],
    ['package.json', 'docs/a.md'],
    ['scripts/ci/trace-reads.mjs'],
    ['scripts/ci/turbo-inputs.mjs'],
    ['scripts/ci/turbo-setup.mjs']
  ])
    assert.equal(tasksToAudit({ tasks, changed }).ids.size, 2, JSON.stringify(changed))
  assert.match(tasksToAudit({ tasks, changed: null }).why, /could not be listed/)
})

test('coverage: a task that was not measured this time is still checked for ignored inputs', () => {
  const { problems, report } = coverageProblems({
    tasks: [{ id: '//#test:ci:vendor', globs: ['vendor/tracy/dsh-passwords/**'], env: [] }],
    reads: new Map(),
    hashed: sets({ '//#test:ci:vendor': ['vendor/tracy/dsh-passwords/dist/client.js'] }),
    kind: () => 'file',
    ignored: new Set(['vendor/tracy/dsh-passwords/dist/client.js'])
  })
  assert.equal(report['//#test:ci:vendor'].measured, false)
  assert.equal(problems.length, 1)
  assert.match(problems[0], /but git ignores it/)
})

test('task audits: select exactly one part and reject ambiguous or unknown parts', () => {
  const tasks = [
    { id: 'a', part: 'owner=apps/a' },
    { id: 'b', part: 'interop' }
  ]
  assert.deepEqual([...taskSelection(tasks, 'owner=apps/a')], ['a'])
  assert.throws(() => taskSelection(tasks, 'owner=apps/missing'), /matches 0 tasks/)
  assert.throws(() => taskSelection([...tasks, tasks[0]], 'owner=apps/a'), /matches 2 tasks/)
  assert.equal(parseSetupArgs(['--check', '--task-part', 'interop']).taskPart, 'interop')
  assert.equal(parseSetupArgs(['--check', '--structure-only']).structureOnly, true)
  for (const args of [
    ['--task-part', 'interop'],
    ['--structure-only'],
    ['--check', '--task-part'],
    ['--check', '--task-part', '--structure-only'],
    ['--check', '--task-part', 'interop', '--changed-since', 'HEAD'],
    ['--check', '--structure-only', '--changed-since', 'HEAD'],
    ['--check', '--structure-only', '--task-part', 'interop'],
    ['--check', '--task-part', 'interop', '--accept-red', '//#test:ci:interop']
  ])
    assert.ok('error' in parseSetupArgs(args), args.join(' '))
  assert.match(
    command('apps/example', false, 'owner=apps/example'),
    /turbo-setup.mjs --check --task-part owner=apps\/example$/
  )
})

test('cacheable task verdicts never retry a red test into a green cache entry', async () => {
  const file = path.join(dir, 'strict.test.mjs')
  const marker = path.join(dir, 'strict.marker')
  writeFileSync(
    file,
    `import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
test('transient failure', () => {
  const seen = existsSync(${JSON.stringify(marker)})
  writeFileSync(${JSON.stringify(marker)}, 'ran')
  assert.ok(seen)
})`
  )
  const args = ['--test', file]
  const result = await traced(
    [{ bin: node, args, cwd: dir, files: ['strict.test.mjs'], again: () => args }],
    { retryFailures: false }
  )
  assert.equal(result.ok, false)
  assert.match(result.why, /exited 1/)
  assert.doesNotMatch(readFileSync(result.log, 'utf8'), /running them again/)
})

test('real Turbo caches only the single test execution with a successful input audit', {
  timeout: 120000
}, () => {
  const fx = mkdtempSync(path.join(tmpdir(), 'tracy-task-audit-'))
  const counter = path.join(dir, 'task-executions.txt')
  const put = (rel, text) => {
    mkdirSync(path.dirname(path.join(fx, rel)), { recursive: true })
    writeFileSync(path.join(fx, rel), text)
  }
  const json = (rel, value) => put(rel, `${JSON.stringify(value)}\n`)
  const gateFiles = [
    'scripts/ci/turbo-setup.mjs',
    'scripts/ci/turbo-inputs.mjs',
    'scripts/ci/trace-reads.mjs'
  ]
  try {
    for (const file of gateFiles) put(file, readFileSync(path.join(ROOT, file), 'utf8'))
    // `turbo-setup.mjs` imports the database predicate and the skip variable's name from here (16/10/2026).
    put('scripts/ci/related-tests.mjs', readFileSync(path.join(ROOT, 'scripts/ci/related-tests.mjs'), 'utf8'))
    mkdirSync(path.join(fx, 'packages'))
    symlinkSync(path.join(ROOT, 'node_modules'), path.join(fx, 'node_modules'), 'dir')
    const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    json('package.json', {
      name: 'audit-fixture',
      private: true,
      packageManager: pkg.packageManager,
      scripts: Object.fromEntries(EXTRA_ROOT_TASKS.map((t) => [t.task, command(t.owner, true, t.part)]))
    })
    put('pnpm-workspace.yaml', 'packages:\n  - apps/*\nverifyDepsBeforeRun: false\n')
    put('pnpm-lock.yaml', "lockfileVersion: '9.0'\nimporters:\n  .: {}\n  apps/demo: {}\n")
    put('.gitignore', 'node_modules/\n.turbo/\n')
    json('turbo.json', {
      globalDependencies: gateFiles,
      envMode: 'loose',
      tasks: {
        'test:ci': { outputs: [] },
        ...Object.fromEntries(
          EXTRA_ROOT_TASKS.map((t) => [
            `//#${t.task}`,
            {
              inputs: [`$TURBO_ROOT$/${t.owner}/**`, '$TURBO_ROOT$/apps/demo/**', ...MACHINERY, ...EXCLUDE]
            }
          ])
        )
      }
    })
    json('apps/demo/package.json', {
      name: '@fixture/demo',
      scripts: { 'test:ci': command('apps/demo', false, 'owner=apps/demo') }
    })
    json('apps/demo/turbo.json', {
      extends: ['//'],
      tasks: {
        'test:ci': {
          inputs: ['$TURBO_DEFAULT$', ...MACHINERY, ...EXCLUDE]
        }
      }
    })
    put('apps/demo/value.txt', 'value')
    put('undeclared.txt', 'outside')
    put(
      'scripts/check-tests.ts',
      `
export const workersFiles = () => ['apps/demo/test/a.test.mjs']
export const ownerTaskFiles = (files) => files
export const ownerTaskSplit = (files) => ({ run: files, dropped: [] })
export const takeDatabaseSkip = () => false
export const databaseSkipOn = () => false
export const workersShardArgs = (files) => ['--test', ...files]
export const ensureDatabase = () => {}
export const ensureWorkersBrowser = () => {}
export const checkCoverage = () => {}
export const interopFiles = () => ['apps/demo/test/a.test.mjs']
export const interopArgs = workersShardArgs
export const ensureDeps = () => {}
export const vendorPlan = () => ({ cwd: process.cwd(), build: [], runs: [] })
`
    )
    const suite = (extra = '') => `import { test } from 'node:test'
import { appendFileSync, readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
test('observable execution', () => {
  process.stdout.write('large suite report '.repeat(16384) + '\\nREPORT_END\\n')
  appendFileSync(process.env.AUDIT_EXECUTIONS, 'run')
  assert.equal(readFileSync('apps/demo/value.txt', 'utf8'), 'value')
  ${extra}
})`
    put('apps/demo/test/a.test.mjs', suite())
    const git = (...args) => execFileSync('git', args, { cwd: fx, stdio: 'pipe' })
    git('init', '-q')
    git('add', '-A')
    git('-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '-qm', 'fixture')
    const env = { ...process.env, AUDIT_EXECUTIONS: counter, TURBO_TELEMETRY_DISABLED: '1' }
    for (const key of [
      'NODE_OPTIONS',
      'NODE_TEST_CONTEXT',
      'TURBO_API',
      'TURBO_TOKEN',
      'TURBO_TEAM',
      'TURBO_HASH'
    ])
      delete env[key]
    const run = () =>
      spawnSync(path.join(ROOT, 'node_modules/.bin/turbo'), ['run', 'test:ci', '--filter=@fixture/demo'], {
        cwd: fx,
        env,
        encoding: 'utf8',
        timeout: 20000,
        maxBuffer: 4 * 1024 * 1024
      })
    const count = () => readFileSync(counter, 'utf8').split('run').length - 1
    let result = run()
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(count(), 1, 'the cold task must execute its test exactly once')
    assert.match(result.stdout, /REPORT_END/, 'a large suite log must reach its end')
    assert.match(result.stdout, /turbo-config: 1 tasks, 1 measured now/, 'the audit verdict must be flushed')
    result = run()
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(count(), 1, 'a warm result must not rerun the test or its audit')
    put(gateFiles[0], readFileSync(path.join(fx, gateFiles[0]), 'utf8') + '\n// Auditor revision.\n')
    result = run()
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(count(), 2, 'an auditor edit must invalidate the cached result')
    put('apps/demo/test/a.test.mjs', suite("readFileSync('undeclared.txt', 'utf8')"))
    result = run()
    assert.notEqual(result.status, 0, 'a passing test with uncovered input must fail its task')
    assert.match(result.stdout + result.stderr, /undeclared.txt.*not among the task/)
    assert.equal(count(), 3)
    result = run()
    assert.notEqual(result.status, 0)
    assert.equal(count(), 4, 'a failed input audit must never be cached as green')
    put('apps/demo/test/a.test.mjs', suite("assert.fail('planted defect')"))
    result = run()
    assert.notEqual(result.status, 0)
    assert.equal(count(), 5, 'the task must not retry a red test')
    put('apps/demo/test/a.test.mjs', suite())
    result = spawnSync(
      path.join(ROOT, 'node_modules/.bin/turbo'),
      ['run', 'test:ci:interop', '--filter=//'],
      { cwd: fx, env, encoding: 'utf8', timeout: 20000, maxBuffer: 4 * 1024 * 1024 }
    )
    assert.equal(result.status, 0, result.stdout + result.stderr)
    assert.equal(count(), 6, 'a root task must run and audit its exact part')
  } finally {
    rmSync(fx, { recursive: true, force: true })
  }
})
