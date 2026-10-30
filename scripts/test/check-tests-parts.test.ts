/**
 * `--part` — the flag that lets CI run `check-tests.ts`'s four suites on four machines.
 *
 * WHY THESE ARE PINNED. The gate's whole value is that a suite nobody ran cannot report green; the
 * moment the gate can be asked to run only part of itself, that property has a new way to break.
 * Two shapes matter and neither shows up as a failing test in CI — they show up as a GREEN tick:
 * a part name that matches nothing, and a shard that draws no files. Both are asserted below.
 *
 * The third property is arithmetic: every file lands in exactly one shard. A file that falls
 * between two shards is a test that stopped running while both shards stayed green.
 *
 *   node --import tsx --test scripts/test/check-tests-parts.test.ts
 */
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import * as gate from '../check-tests.ts'
import { HOSTED_COST, parsePart, parseParts, preloadFor, shardOf } from '../check-tests.ts'
import { planMatrix } from '../ci/plan-ci.mjs'

test('no --part means the whole gate, exactly as before', () => {
  assert.equal(parsePart([]), null)
  assert.equal(parsePart(['--only', 'tests']), null)
})

test('every workers row the planner makes is a part this gate takes, on our runners and on GitHub-hosted', () => {
  for (const hosted of [false, true]) {
    const rows = planMatrix({
      event: 'workflow_dispatch',
      changed: null,
      allFiles: [],
      readText: undefined,
      hosted
    }).matrix.include as { args: string }[]
    const shards = rows.map((r) => r.args).filter((args) => /workers:/.test(args))
    assert.equal(shards.length, hosted ? 3 : 2)
    for (const args of shards) {
      const spec = /--tests-part (\S+)/.exec(args)?.[1] ?? ''
      assert.ok(Array.isArray(parseParts(['--part', spec])), `${String(hosted)}: ${spec}`)
    }
    // The small suites ride the last shard only: `parseParts` refuses them anywhere else.
    assert.match(shards.at(-1) ?? '', /,rest$/)
  }
})

test('on GitHub-hosted the last shard carries the hosted cost of the small suites, and the shards come out even', () => {
  const table = { preloadLastShardSeconds: 100, wallPerSummedSecond: 0.5 }
  // What a shard costs on a hosted row, in wall seconds: its files at the hosted factor, and on the
  // last one the small suites at their hosted cost — the run the preload has to balance against.
  const fileSeconds = 20
  const oneFile = fileSeconds * table.wallPerSummedSecond * HOSTED_COST.workersFactor
  const files = Array.from({ length: 90 }, (_, i) => `t/${String(i)}.test.mjs`)
  const hostedWall = (preload: number): number[] =>
    [1, 2, 3].map(
      (index) =>
        shardOf(
          files,
          { index, of: 3 },
          { files: Object.fromEntries(files.map((f) => [f, fileSeconds])), preloadLastShardSeconds: preload }
        ).length *
          oneFile +
        (index === 3 ? HOSTED_COST.restWallSeconds : 0)
    )
  const spread = (walls: number[]) => Math.max(...walls) - Math.min(...walls)
  // With the hosted preload the three hosted rows end within one file of each other…
  const even = hostedWall(preloadFor(table, true))
  assert.ok(spread(even) <= oneFile + 1e-9, `hosted rows ${even.map(Math.round).join(' / ')} s`)
  // …with our runners' figure the last one runs long by the difference: what the change is for.
  const ours = hostedWall(preloadFor(table, false))
  assert.ok(spread(ours) > 10 * oneFile, `with our preload ${ours.map(Math.round).join(' / ')} s`)
  // Our runners keep the table's own figure; a table without a factor cannot be converted, so it
  // keeps its own figure rather than guess one.
  assert.equal(preloadFor(table, false), table.preloadLastShardSeconds)
  assert.equal(preloadFor({ preloadLastShardSeconds: 300 }, true), 300)
  assert.equal(preloadFor({}, false), 0)
  // Every file still lands once.
  const timings = { files: {}, preloadLastShardSeconds: preloadFor(table, true) }
  const all = [1, 2, 3].flatMap((index) => shardOf(files, { index, of: 3 }, timings))
  assert.deepEqual(all.sort(), [...files].sort())
})

test('each declared part parses to itself', () => {
  for (const name of [
    'workers',
    'related',
    'interop',
    'e2e',
    'standalone:base',
    'standalone:business',
    'standalone:saas',
    'vendor',
    'rest'
  ]) {
    assert.deepEqual(parsePart(['--part', name]), { part: name })
  }
})

test('a misspelt part is refused, never read as "run nothing"', () => {
  for (const bad of ['worker', 'Workers', 'standalone', 'emdash', '']) {
    const got = parsePart(['--part', bad])
    assert.equal(typeof got, 'string', `${bad} should be refused`)
    assert.match(got as string, /no such part|needs a name/)
  }
})

test('--part with nothing after it is refused', () => {
  assert.match(parsePart(['--part']) as string, /needs a name/)
  assert.match(parsePart(['--part', '--only']) as string, /needs a name/)
})

test('a shard parses only on the part that has files to split', () => {
  assert.deepEqual(parsePart(['--part', 'workers:2/3']), {
    part: 'workers',
    shard: { index: 2, of: 3 }
  })
  // The standalone suites are one `pnpm test` each; pretending to shard them would run them whole
  // in every shard, which is slower AND reports the same green.
  assert.match(parsePart(['--part', 'vendor:1/2']) as string, /cannot be sharded/)
  assert.match(parsePart(['--part', 'e2e:1/2']) as string, /cannot be sharded/)
  assert.match(parsePart(['--part', 'related:1/2']) as string, /cannot be sharded/)
  assert.match(parsePart(['--part', 'standalone:base:1/2']) as string, /no such part|cannot be sharded/)
})

test('related cannot be combined with a full part', () => {
  assert.deepEqual(parseParts(['--part', 'related']), [{ part: 'related' }])
  assert.match(parseParts(['--part', 'related,rest']) as string, /run alone/)
})

test('an out-of-range shard is refused', () => {
  for (const bad of ['workers:0/3', 'workers:4/3', 'workers:1/0']) {
    assert.match(parsePart(['--part', bad]) as string, /bad shard/, bad)
  }
})

test('every file lands in exactly one shard, and the shards rebuild the whole list', () => {
  const files = Array.from({ length: 269 }, (_, i) => `packages/a/b/test/f${String(i)}.test.mjs`)
  for (const of_ of [2, 3, 4, 7]) {
    const shards = Array.from({ length: of_ }, (_, i) => shardOf(files, { index: i + 1, of: of_ }))
    const union = shards.flat().sort()
    assert.equal(union.length, files.length, `${String(of_)} shards must not drop or duplicate`)
    assert.deepEqual(union, [...files].sort())
    // Balanced to within one file: a shard twice the size of its neighbour wastes a machine.
    const sizes = shards.map((s) => s.length)
    assert.ok(Math.max(...sizes) - Math.min(...sizes) <= 1, `sizes ${sizes.join(',')}`)
  }
})

test('sharding does not depend on the order the walker happened to return', () => {
  const files = ['c/test/x.test.mjs', 'a/test/y.test.mjs', 'b/test/z.test.mjs']
  const forward = shardOf(files, { index: 1, of: 2 })
  const backward = shardOf([...files].reverse(), { index: 1, of: 2 })
  assert.deepEqual(forward, backward)
})

// ── weighted shards and combined parts (fixture tables only, never the real timings) ───────────

const skewed = {
  files: {
    'a/test/huge.test.mjs': 100,
    'a/test/big.test.mjs': 60,
    'a/test/mid1.test.mjs': 30,
    'a/test/mid2.test.mjs': 30,
    'a/test/tiny1.test.mjs': 1,
    'a/test/tiny2.test.mjs': 1
  },
  preloadLastShardSeconds: 0
}
const skewedFiles = Object.keys(skewed.files)
const loadOf = (shard: string[], table: { files: Record<string, number> }) =>
  shard.reduce((sum, f) => sum + (table.files[f] ?? 0), 0)

test('weighted: union is every file, no overlap', () => {
  for (const of_ of [2, 3]) {
    const shards = Array.from({ length: of_ }, (_, i) =>
      shardOf(skewedFiles, { index: i + 1, of: of_ }, skewed)
    )
    const flat = shards.flat()
    assert.equal(flat.length, skewedFiles.length)
    assert.deepEqual([...flat].sort(), [...skewedFiles].sort())
  }
})

test('weighted: same inputs give the same shards whatever the input order', () => {
  const a = shardOf(skewedFiles, { index: 1, of: 2 }, skewed)
  const b = shardOf([...skewedFiles].reverse(), { index: 1, of: 2 }, skewed)
  assert.deepEqual(a, b)
})

test('weighted: a file missing from the table lands in exactly one shard', () => {
  const files = [...skewedFiles, 'z/test/new.test.mjs']
  const owners = [1, 2, 3].filter((i) =>
    shardOf(files, { index: i, of: 3 }, skewed).includes('z/test/new.test.mjs')
  )
  assert.equal(owners.length, 1)
})

test('weighted: LPT is closer to even than round-robin on a skewed table', () => {
  const spread = (shards: string[][]) => {
    const loads = shards.map((s) => loadOf(s, skewed))
    return Math.max(...loads) - Math.min(...loads)
  }
  const lpt = [1, 2].map((i) => shardOf(skewedFiles, { index: i, of: 2 }, skewed))
  const sorted = [...skewedFiles].sort()
  const roundRobin = [0, 1].map((r) => sorted.filter((_, i) => i % 2 === r))
  assert.ok(spread(lpt) < spread(roundRobin), `lpt ${spread(lpt)} vs round-robin ${spread(roundRobin)}`)
})

test('weighted: the last shard starts loaded, so it gets fewer files', () => {
  const table = { files: Object.fromEntries(skewedFiles.map((f) => [f, 10])), preloadLastShardSeconds: 30 }
  const first = shardOf(skewedFiles, { index: 1, of: 2 }, table)
  const last = shardOf(skewedFiles, { index: 2, of: 2 }, table)
  assert.ok(last.length < first.length, `${last.length} vs ${first.length}`)
})

test('parts: a comma list parses element by element', () => {
  assert.deepEqual(parseParts(['--part', 'workers:2/2,rest']), [
    { part: 'workers', shard: { index: 2, of: 2 } },
    { part: 'rest' }
  ])
  assert.equal(parseParts([]), null)
})

test('parts: ONE misspelt element makes the whole list red', () => {
  for (const bad of ['workers:1/2,rst', 'nope,rest', 'rest,', 'rest,rest', 'workers:1/2,workers:2/2']) {
    assert.equal(typeof parseParts(['--part', bad]), 'string', bad)
  }
})

test('parts: rest may only ride with the last workers shard', () => {
  assert.match(parseParts(['--part', 'workers:1/2,rest']) as string, /LAST workers shard/)
  assert.ok(Array.isArray(parseParts(['--part', 'workers:2/2,rest'])))
  assert.ok(Array.isArray(parseParts(['--part', 'rest'])))
})

// ── coverage: every test file has exactly ONE owner ──────────────────────────────────────────────
//
// The gate is run AS A COMMAND over a throwaway tree, not called as a function: `checkCoverage()`
// ends the process, and what has to hold is what CI sees — the exit code and the lines it prints.
// The tree gets a copy of the real `check-tests.ts` (and the two modules it imports), so `ROOT` is
// the fixture and no real suite, database or browser is touched: `--part e2e` over one trivial e2e
// file is the cheapest part that still proves "coverage ran, then the part ran".
//
// The real `GROUPS` cannot overlap by construction, so a second owner is added to the COPY, at the
// top of the array. That one line is the only difference from the script the gate runs.

const HERE = dirname(fileURLToPath(import.meta.url))
const E2E = 'apps/site/test/e2e/smoke.test.mjs'
const PASSING = "import { test } from 'node:test'\ntest('ok', () => {})\n"

/**
 * Run the gate's `--part e2e` over a fixture tree.
 *
 * @param files - repo-relative files to create (each a passing test).
 * @param extraGroups - `run` name to path regex source, prepended to the copy's `GROUPS`.
 */
function gateOver(files: readonly string[], extraGroups: Readonly<Record<string, string>> = {}) {
  // The real path: where the temporary directory is a symlink (macOS: /tmp, /var), the copy would
  // be started under one name and know itself under another, and never take itself for the command.
  const root = mkdtempSync(
    join(realpathSync(process.env.TCH_TEST_ARTIFACTS_DIR ?? tmpdir()), 'check-tests-coverage-')
  )
  try {
    const source = readFileSync(join(HERE, '../check-tests.ts'), 'utf8')
    const rows = Object.entries(extraGroups)
      .map(
        ([run, files_]) =>
          `  { run: ${JSON.stringify(run)}, files: new RegExp(${JSON.stringify(files_)}) },\n`
      )
      .join('')
    const patched = source.replace(/(const GROUPS\b[^=]*= \[\n)/, `$1${rows}`)
    assert.equal(
      patched.length,
      source.length + rows.length,
      'GROUPS moved: the fixture could not add a group'
    )
    mkdirSync(join(root, 'scripts'), { recursive: true })
    writeFileSync(join(root, 'scripts/check-tests.ts'), patched)
    for (const module of ['test-database.ts', 'test-timing-reporter.mjs']) {
      writeFileSync(join(root, 'scripts', module), readFileSync(join(HERE, '..', module), 'utf8'))
    }
    mkdirSync(join(root, 'scripts/ci'), { recursive: true })
    writeFileSync(
      join(root, 'scripts/ci/related-tests.mjs'),
      readFileSync(join(HERE, '../ci/related-tests.mjs'), 'utf8')
    )
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), PASSING)
    }
    // The part spawns `node --test`; inherited, this variable would make that child report to OUR
    // runner instead of printing and exiting on its own.
    const { NODE_TEST_CONTEXT: _context, ...env } = process.env
    // `--import tsx` is resolved from the working directory, so that stays the repository; the
    // script finds its tree from its own location, never from where it was started.
    const run = spawnSync(
      process.execPath,
      ['--import', 'tsx', join(root, 'scripts/check-tests.ts'), '--part', 'e2e'],
      { cwd: join(HERE, '../..'), encoding: 'utf8', timeout: 60000, env }
    )
    assert.equal(run.error, undefined, `the gate did not run: ${String(run.error)}`)
    return { status: run.status, stdout: run.stdout, stderr: run.stderr }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

const SAYS_ONE_OWNER = /each owned by exactly one declared group/

test('coverage: a test file two groups claim is refused, naming the file and both owners', () => {
  const twice = 'apps/site/test/twice.test.mjs'
  const got = gateOver([E2E, twice], { 'fixture:second': '^apps/site/test/twice\\.test\\.mjs$' })
  assert.equal(got.status, 1, `${got.stdout}${got.stderr}`)
  const line = got.stderr.split('\n').find((l) => l.includes(twice))
  assert.ok(line, `stderr must name the file: ${got.stderr}`)
  assert.ok(line.includes('test:workers') && line.includes('fixture:second'), line)
  // The file with one owner is not accused, the false claim is not printed, and no suite ran.
  assert.ok(!got.stderr.includes(E2E), got.stderr)
  assert.doesNotMatch(got.stdout, SAYS_ONE_OWNER)
  assert.doesNotMatch(got.stdout, /check-tests: e2e/)
})

test('coverage: three owners are all named', () => {
  const thrice = 'apps/site/test/thrice.test.mjs'
  const got = gateOver([E2E, thrice], {
    'fixture:second': '^apps/site/test/thrice',
    'fixture:third': 'thrice\\.test\\.mjs$'
  })
  assert.equal(got.status, 1, `${got.stdout}${got.stderr}`)
  const line = got.stderr.split('\n').find((l) => l.includes(thrice)) ?? ''
  for (const owner of ['test:workers', 'fixture:second', 'fixture:third'])
    assert.ok(line.includes(owner), line)
})

test('coverage: a file nobody runs and a file two groups claim are both reported in one run', () => {
  const lost = 'apps/site/tests/lost.test.mjs'
  const twice = 'apps/site/test/twice.test.mjs'
  const got = gateOver([E2E, lost, twice], { 'fixture:second': '^apps/site/test/twice\\.test\\.mjs$' })
  assert.equal(got.status, 1, `${got.stdout}${got.stderr}`)
  assert.ok(got.stderr.includes(lost), got.stderr)
  assert.ok(got.stderr.includes(twice) && got.stderr.includes('fixture:second'), got.stderr)
})

test('coverage: a test file no group claims is still refused by name', () => {
  // `tests/` (plural) is the directory no workspace group globs — the shape that hid 31 files.
  const lost = 'apps/site/tests/lost.test.mjs'
  const got = gateOver([E2E, lost])
  assert.equal(got.status, 1, `${got.stdout}${got.stderr}`)
  assert.ok(got.stderr.includes(lost), got.stderr)
  assert.doesNotMatch(got.stdout, SAYS_ONE_OWNER)
  assert.doesNotMatch(got.stdout, /check-tests: e2e/)
})

test('coverage: one owner per file is green, an unused extra group changes nothing, and the part runs', () => {
  const extras: Readonly<Record<string, string>>[] = [{}, { 'fixture:idle': '^nowhere/' }]
  for (const extra of extras) {
    const got = gateOver([E2E, 'apps/site/test/unit.test.mjs', 'scripts/test/interop.test.ts'], extra)
    assert.equal(got.status, 0, `${got.stdout}${got.stderr}`)
    assert.match(got.stdout, /check-tests: 3 test files/)
    assert.match(got.stdout, SAYS_ONE_OWNER)
    assert.match(got.stdout, /check-tests: e2e — 1 file/)
    assert.match(got.stdout, /part e2e done/)
  }
})

test('coverage: a tree with no test file passes the count, and the empty part is still red', () => {
  const got = gateOver([])
  assert.match(got.stdout, /check-tests: 0 test files/)
  assert.equal(got.status, 1, 'an empty e2e part must stay red')
  assert.match(got.stderr, /e2e has no files/)
})

test('coverage owners: coverageProblems counts every match — none, one, several', () => {
  const groups = [
    { run: 'a', files: /^a\// },
    { run: 'b', files: /\.test\.mjs$/ },
    { run: 'c', files: /^a\/deep\// }
  ]
  assert.deepEqual(gate.coverageProblems([], groups), { orphans: [], ambiguous: [] })
  assert.deepEqual(gate.coverageProblems(['a/x.test.ts', 'z/y.test.mjs'], groups), {
    orphans: [],
    ambiguous: []
  })
  assert.deepEqual(
    gate.coverageProblems(['z/y.test.ts', 'a/x.test.mjs', 'a/deep/w.test.mjs', 'a/ok.test.ts'], groups),
    {
      orphans: ['z/y.test.ts'],
      ambiguous: [
        { file: 'a/x.test.mjs', owners: ['a', 'b'] },
        { file: 'a/deep/w.test.mjs', owners: ['a', 'b', 'c'] }
      ]
    }
  )
  // The declared groups, on one path of each kind: exactly one owner, so nothing to report.
  const real = [
    'apps/tracy-web/test/a.test.mjs',
    'scripts/test/a.test.mjs',
    'scripts/test/a.test.ts',
    'packages/site/tracy-add-site/test/a.test.mjs',
    'packages/site/tracy-add-site/test/e2e/a.test.mjs',
    'vendor/tracy/dsh-passwords/test/deep/a.test.ts',
    'packages/cms/tracy-emdash-theme-saas/tests/a.test.mjs'
  ]
  assert.deepEqual(gate.coverageProblems(real), { orphans: [], ambiguous: [] })
  assert.deepEqual(gate.coverageProblems(['packages/cms/tracy-emdash-theme-saas/tests/deep/a.test.mjs']), {
    orphans: ['packages/cms/tracy-emdash-theme-saas/tests/deep/a.test.mjs'],
    ambiguous: []
  })
})
