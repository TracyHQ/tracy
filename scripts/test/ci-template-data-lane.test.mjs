/**
 * The template-data lane of the Tracy CI planner (12/10/2026): a pull request into `develop` whose
 * every changed file is template data runs the gates and tests that read that data; anything else,
 * or a planner that cannot read the tree, runs the rows it ran before. Also guards the audit behind
 * the lane's gate lists: a gate that names a data kind must be in that kind's list.
 */
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'

import { planMatrix } from '../ci/plan-ci.mjs'
import {
  relatedTests,
  repoReader,
  TEMPLATE_DATA,
  TEMPLATE_DATA_ALWAYS,
  workspaceDependencies
} from '../ci/related-tests.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8', maxBuffer: 64 << 20 })
  .split('\0')
  .filter(Boolean)
// The public export has no journal: a journal entry stands in as a tracked file, as in the private repo.
const JOURNAL =
  tracked.find((f) => /^tasks\/nhat-ky\/\d{4}-.+\.md$/.test(f)) ?? 'tasks/nhat-ky/2026-10-09-x.md'
const allFiles = tracked.includes(JOURNAL) ? tracked : [...tracked, JOURNAL]
const dependencies = workspaceDependencies(root, allFiles)
const readText = repoReader(root)
const CONTRACT = allFiles.find((f) =>
  /^packages\/cms\/tracy-wordpress-quickstart\/contracts\/.+\/manifest\.json$/.test(f)
)
const PROFILES = 'apps/tracy-web/src/lib/template-profiles.json'
const CASE = allFiles.find((f) => /^tests\/regression\/cases\/.+\.json$/.test(f))

const plan = (changed, more = {}) =>
  planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed,
    allFiles,
    dependencies,
    readText,
    ...more
  })
const rows = (p) => p.matrix.include.map((r) => r.group)
const checksArgs = (p) => p.matrix.include.find((r) => r.group === 'checks').args
const FULL_ROWS = [
  'tests emdash-business',
  'tests emdash-saas',
  'tests emdash-base',
  'tests e2e',
  'tests 1/2',
  'tests 2/2',
  'checks'
]

test('a data-only diff runs the data gates and the tests that read the data, nothing else', () => {
  assert.ok(CONTRACT && JOURNAL && CASE)
  const p = plan([CONTRACT, PROFILES, JOURNAL, CASE])
  assert.equal(p.runsAll, false)
  assert.equal(p.related.lane, 'template-data')
  assert.deepEqual(rows(p), ['tests related', 'checks'])
  const gates = checksArgs(p)
    .split(' --only ')
    .map((g) => g.replace(/^--only /, ''))
  assert.ok(!checksArgs(p).includes('--skip'), checksArgs(p))
  for (const gate of [
    'lint',
    'contracts',
    'wordpress-superseded',
    'design-templates',
    'vocabulary',
    'api-spec'
  ])
    assert.ok(gates.includes(gate), gate)
  for (const gate of ['bundles', 'boot-graph', 'image-profile', 'dsh-locale', 'interface-languages'])
    assert.ok(!gates.includes(gate), gate)
  // The tests that read the data, and only those: the contract and profile tests, not the whole suite.
  const workers = p.related.workers
  for (const t of [
    'apps/tracy-web/test/contracts.test.mjs',
    'apps/tracy-web/test/template-profiles.test.mjs',
    'apps/tracy-web/test/readiness-fix-places.test.mjs',
    'scripts/test/build-wordpress-superseded.test.mjs',
    'scripts/test/check-changelog.test.mjs',
    'scripts/test/check-regression.test.mjs'
  ])
    assert.ok(workers.includes(t), t)
  const allWorkers = allFiles.filter((f) => /\/test\/[^/]+\.test\.mjs$/.test(f) && !f.includes('/e2e/'))
  assert.ok(workers.length < allWorkers.length / 5, `${workers.length} of ${allWorkers.length}`)
})

test('journal or regression-case only: no api-spec, no contract gates', () => {
  const p = plan([JOURNAL, CASE])
  assert.equal(p.related.lane, 'template-data')
  assert.equal(checksArgs(p), '--only lint --only doc-links --only turbo-config --only vocabulary')
})

test('a mixed diff (data plus any code, test, workflow or gate script) runs what it ran before', () => {
  for (const other of [
    'scripts/check-pack-modes.mjs',
    'apps/tracy-web/src/lib/contracts.js',
    'apps/tracy-web/test/contracts.test.mjs',
    '.github/workflows/tracy-ci.yml',
    'scripts/check-contracts.ts',
    'docs/references/gates-ci-runners.md'
  ]) {
    const mixed = plan([CONTRACT, other])
    assert.notEqual(mixed.related?.lane, 'template-data', other)
    assert.equal(checksArgs(mixed), '--skip tests', other)
    const before = plan([CONTRACT, other], { readText: undefined })
    assert.deepEqual(mixed.matrix, before.matrix, other)
  }
})

test('a code file inside a data folder, or a deleted data file, is not template data', () => {
  const script = allFiles.find((f) => /^tests\/regression\/scripts\/.+\.mjs$/.test(f))
  assert.ok(script)
  assert.notEqual(plan([script]).related?.lane, 'template-data')
  assert.notEqual(plan([CONTRACT.replace('manifest.json', 'gone.json')]).related?.lane, 'template-data')
  assert.equal(
    relatedTests({ changed: ['packages/cms/x/contracts/a.mjs'], allFiles, readText }).lane,
    undefined
  )
})

test('a planner that cannot read the tree, or has no file list, runs every row', () => {
  const broken = plan([CONTRACT], {
    readText: () => {
      throw new Error('EIO')
    }
  })
  assert.equal(broken.runsAll, true)
  assert.match(broken.why, /template-data lane could not read the tree \(EIO\)/)
  assert.deepEqual(rows(broken), FULL_ROWS)
  const nothing = plan([CONTRACT], { readText: () => undefined })
  assert.equal(nothing.runsAll, true)
  assert.deepEqual(rows(plan(null)), FULL_ROWS)
  assert.deepEqual(rows(plan([])), FULL_ROWS)
})

test('release pull requests, manual runs and the nightly still run every row on data-only diffs', () => {
  assert.deepEqual(rows(plan([CONTRACT], { baseRef: 'main' })), FULL_ROWS)
  assert.deepEqual(rows(plan([CONTRACT], { baseRef: 'staging' })), FULL_ROWS)
  assert.deepEqual(rows(plan([CONTRACT], { event: 'schedule', baseRef: '' })), FULL_ROWS)
  assert.deepEqual(rows(plan([CONTRACT], { event: 'workflow_dispatch', baseRef: '' })), FULL_ROWS)
})

test('an e2e test that reads the data brings the e2e row; an interop reader brings interop', () => {
  const data = 'apps/tracy-web/src/quickstarts.json'
  const e2e = 'apps/tracy-web/test/e2e/pins.test.mjs'
  const interop = 'scripts/test/pins.test.ts'
  const files = [data, e2e, interop, 'apps/tracy-web/test/other.test.mjs']
  const text = {
    [data]: '{}\n',
    [e2e]: "const pins = readFileSync('../../src/quickstarts.json')\n",
    [interop]: "import pins from '../../apps/tracy-web/src/quickstarts.json'\n",
    'apps/tracy-web/test/other.test.mjs': '// quickstarts.json is named only in a comment\n'
  }
  const p = planMatrix({
    event: 'pull_request',
    baseRef: 'develop',
    changed: [data],
    allFiles: files,
    readText: (f) => text[f]
  })
  assert.equal(p.related.lane, 'template-data')
  assert.equal(p.related.e2e, true)
  assert.equal(p.related.interop, true)
  assert.deepEqual(p.related.workers, [])
  assert.deepEqual(rows(p), ['tests e2e', 'tests related', 'checks'])
})

/** The gates of `check-all.ts`, as `[name, script]`. */
function gates() {
  const src = readFileSync(join(root, 'scripts', 'check-all.ts'), 'utf8')
  return [...src.matchAll(/\{ name: '([^']+)', script: '([^']+)'/g)].map((m) => [m[1], m[2]])
}

/** A gate script and every file it imports by a relative path, comments stripped. */
function closureText(file, seen = new Set()) {
  if (seen.has(file) || !existsSync(file) || !statSync(file).isFile()) return ''
  seen.add(file)
  const text = readFileSync(file, 'utf8')
  let out = text
    .split('\n')
    .filter((l) => !/^\s*(?:\/\/|\/\*|\*)/.test(l))
    .join('\n')
  for (const m of text.matchAll(/(?:from|import|require)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const base = resolve(dirname(file), m[1])
    const hit = ['', '.ts', '.mjs', '.js', '/index.js']
      .map((e) => base + e)
      .find((c) => existsSync(c) && statSync(c).isFile())
    if (hit) out += `\n${closureText(hit, seen)}`
  }
  return out
}

test("every lane gate exists, and every gate that names a data kind is in that kind's list", () => {
  const all = gates()
  const names = new Set(all.map(([n]) => n))
  assert.ok(names.size > 40)
  for (const g of TEMPLATE_DATA_ALWAYS) assert.ok(names.has(g), g)
  for (const kind of TEMPLATE_DATA) for (const g of kind.gates) assert.ok(names.has(g), `${kind.kind}: ${g}`)
  const missing = []
  for (const [name, script] of all) {
    if (name === 'tests') continue // the tests row, selected by readers instead
    const text = closureText(join(root, 'scripts', script))
    for (const kind of TEMPLATE_DATA)
      if (kind.reads.test(text) && !kind.gates.includes(name) && !TEMPLATE_DATA_ALWAYS.includes(name))
        missing.push(`${name} reads ${kind.kind}`)
  }
  assert.deepEqual(missing, [], 'add the gate to that kind in TEMPLATE_DATA (scripts/ci/related-tests.mjs)')
})

test('the gate and the planner select the same readers (check-tests passes the same tree reader)', () => {
  const gate = readFileSync(join(root, 'scripts', 'check-tests.ts'), 'utf8')
  assert.match(gate, /readText: repoReader\(ROOT\)/)
  const planner = readFileSync(join(root, 'scripts', 'ci', 'plan-ci.mjs'), 'utf8')
  assert.match(planner, /readText: repoReader\(\)/)
})
