import assert from 'node:assert/strict'
import { test } from 'node:test'
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_FILE_TESTS, REVIEWED_SKILLS, relatedTests } from '../ci/related-tests.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const SKILL = REVIEWED_SKILLS[0].prefix
// A reviewed tree no test reads: changing it alone selects nothing.
const UNREAD = REVIEWED_SKILLS.find((skill) => !skill.readers.length).prefix
// Found by a fragment of the name: the guard below fails on a test that spells out a reviewed tree.
const T4 = REVIEWED_SKILLS.find((skill) => skill.prefix.includes('joomlart-t4'))
const EMDASH_SKILL = REVIEWED_SKILLS.find((skill) => skill.prefix.startsWith('vendor/emdash/')).prefix
const T4_READERS = T4.readers
const T4_TREE = T4.prefix.replace(/\/$/, '')
const [DATA, MAPPED] = [...DATA_FILE_TESTS.entries()][0]

const files = [
  'apps/tracy-web/test/seat.test.mjs',
  'apps/tracy-web/test/mail.test.mjs',
  'packages/core/tracy-core/test/seat.test.mjs',
  'packages/site/tracy-add-site/test/add.test.mjs',
  'packages/site/tracy-my-sites/test/list.test.mjs',
  'scripts/test/ci-plan.test.mjs',
  'scripts/test/seat-door-interop.test.ts',
  'packages/site/tracy-add-site/test/e2e/wizard.test.mjs'
]
const dependencies = {
  'packages/core/tracy-core': [],
  'packages/site/tracy-add-site': ['packages/core/tracy-core'],
  'packages/site/tracy-my-sites': ['packages/core/tracy-core']
}
const select = (changed) => relatedTests({ changed, allFiles: files, dependencies })

test('a changed test selects that exact file', () => {
  const result = select(['apps/tracy-web/test/seat.test.mjs'])
  assert.deepEqual(result.workers, ['apps/tracy-web/test/seat.test.mjs'])
  assert.equal(result.interop, false)
})

test('a source change selects its owner and transitive workspace dependents', () => {
  const result = select(['packages/core/tracy-core/src/seat/index.mjs'])
  assert.deepEqual(result.workers, [
    'packages/core/tracy-core/test/seat.test.mjs',
    'packages/site/tracy-add-site/test/add.test.mjs',
    'packages/site/tracy-my-sites/test/list.test.mjs',
    'scripts/test/ci-plan.test.mjs'
  ])
  assert.equal(result.interop, true)
})

test('deleting a test selects the remaining tests of its owner', () => {
  const result = select(['apps/tracy-web/test/deleted.test.mjs'])
  assert.deepEqual(result.workers, ['apps/tracy-web/test/seat.test.mjs', 'apps/tracy-web/test/mail.test.mjs'])
})

test('docs-only selects no test job; unknown and shared inputs fall back to full', () => {
  assert.deepEqual(select(['docs/references/example.md']).workers, [])
  assert.equal(select(['docs/references/example.md']).full, false)
  assert.equal(select(['tasks/evidence/check/screenshot.png']).full, false)
  for (const changed of [
    ['deploy/compose.yml'],
    ['config/mode-matrix.json'],
    ['scripts/check-tests.ts'],
    ['.github/workflows/tracy-ci.yml'],
    []
  ]) {
    assert.equal(select(changed).full, true, JSON.stringify(changed))
  }
})

const dataFiles = [...files, ...MAPPED, 'apps/tracy-web/test/other.test.mjs', DATA, `${SKILL}SKILL.md`]
const dataSelect = (changed, all = dataFiles) => relatedTests({ changed, allFiles: all, dependencies })

test('a mapped data file alone selects exactly its mapped tests and no interop', () => {
  const result = dataSelect([DATA])
  assert.equal(result.full, false)
  assert.deepEqual([...result.workers].sort(), [...MAPPED].sort())
  assert.equal(result.interop, false)
  assert.deepEqual(result.covered, [DATA])
})

test('a reviewed skill alone selects nothing; with docs and a duplicate data file it is a union', () => {
  const skill = dataSelect([`${UNREAD}SKILL.md`, `${UNREAD}references/x.md`])
  assert.deepEqual([skill.full, skill.workers, skill.interop], [false, [], false])
  const union = dataSelect([DATA, `${UNREAD}SKILL.md`, 'docs/references/x.md', DATA])
  assert.deepEqual([...union.workers].sort(), [...MAPPED].sort())
  assert.equal(new Set(union.workers).size, union.workers.length)
  assert.equal(dataSelect([`${UNREAD}SKILL.md`, DATA]).workers.length, MAPPED.length)
})

test('a skill with declared readers selects exactly those readers and nothing else', () => {
  const inventory = [...files, ...T4_READERS]
  const only = relatedTests({ changed: [`${T4.prefix}IMPORT-NOTE.md`], allFiles: inventory, dependencies })
  assert.deepEqual([only.full, only.workers, only.interop], [false, T4_READERS, false])
  const docs = relatedTests({
    changed: [`${T4.prefix}SKILL.md`, 'docs/references/x.md', `${UNREAD}SKILL.md`, `${EMDASH_SKILL}SKILL.md`],
    allFiles: inventory,
    dependencies
  })
  assert.deepEqual([docs.full, docs.workers, docs.interop], [false, T4_READERS, false])
  const emdash = relatedTests({ changed: [`${EMDASH_SKILL}SKILL.md`], allFiles: inventory, dependencies })
  assert.deepEqual([emdash.full, emdash.workers, emdash.interop], [false, [], false])
})

test('a skill reader is a union with data tests and with source, never duplicated', () => {
  const inventory = [...files, ...MAPPED, ...T4_READERS, DATA]
  const withData = relatedTests({
    changed: [DATA, `${T4.prefix}SKILL.md`],
    allFiles: inventory,
    dependencies
  })
  assert.deepEqual([...withData.workers].sort(), [...MAPPED, ...T4_READERS].sort())
  assert.equal(new Set(withData.workers).size, withData.workers.length)
  assert.equal(withData.interop, false)
  const withSource = relatedTests({
    changed: ['packages/core/tracy-core/src/a.mjs', `${T4.prefix}SKILL.md`],
    allFiles: inventory,
    dependencies
  })
  for (const reader of T4_READERS) assert.ok(withSource.workers.includes(reader), reader)
  assert.ok(withSource.workers.includes('packages/core/tracy-core/test/seat.test.mjs'))
  assert.equal(withSource.interop, true)
})

test('a declared reader missing from the inventory, or a look-alike prefix, runs the full suite', () => {
  const lost = relatedTests({ changed: [`${T4.prefix}SKILL.md`], allFiles: files, dependencies })
  assert.equal(lost.full, true)
  assert.match(lost.why, /reader .* is missing/)
  const lostWithData = relatedTests({
    changed: [DATA, `${T4.prefix}SKILL.md`],
    allFiles: [...files, ...MAPPED, DATA],
    dependencies
  })
  assert.equal(lostWithData.full, true)
  const lookAlike = relatedTests({
    changed: [`${T4.prefix.slice(0, -1)}-x/SKILL.md`],
    allFiles: [...files, ...T4_READERS],
    dependencies
  })
  assert.equal(lookAlike.full, true)
  assert.match(lookAlike.why, /unmapped input/)
})

test('the data exception is all-or-nothing: any other input keeps the owner selection', () => {
  for (const other of ['apps/tracy-web/src/lib/template-profiles.js', 'apps/tracy-web/test/other.test.mjs']) {
    const result = dataSelect([DATA, other])
    assert.equal(result.covered, undefined, other)
    assert.ok(result.workers.includes('apps/tracy-web/test/other.test.mjs'), other)
    assert.ok(result.workers.includes('apps/tracy-web/test/seat.test.mjs'), other)
  }
  const mixed = dataSelect([DATA, 'packages/core/tracy-core/src/a.mjs'])
  assert.equal(mixed.interop, true)
  assert.equal(dataSelect([DATA, 'deploy/compose.yml']).full, true)
  assert.equal(dataSelect([DATA, 'vendor/unmapped/example.md']).full, true)
  assert.equal(dataSelect([DATA, '.github/workflows/tracy-ci.yml']).full, true)
  assert.equal(dataSelect([DATA, 'package.json']).full, true)
})

test('a renamed or deleted mapped data file, and near-miss names, keep today behaviour', () => {
  const gone = dataFiles.filter((file) => file !== DATA)
  assert.equal(dataSelect([DATA], gone).covered, undefined)
  assert.ok(dataSelect([DATA], gone).workers.includes('apps/tracy-web/test/seat.test.mjs'))
  for (const near of [`${DATA}.bak`, DATA.replace('.json', '2.json'), `x/${DATA}`, DATA.toUpperCase()]) {
    assert.equal(dataSelect([near]).covered, undefined, near)
  }
  assert.equal(dataSelect([`${SKILL.slice(0, -1)}-extra/a.md`]).full, true)
  assert.equal(dataSelect([SKILL.slice(0, -1)]).full, true)
  assert.equal(dataSelect([SKILL.replace('vendor/', 'vendor2/') + 'a.md']).full, true)
})

test('a mapped test that disappeared runs the full suite; bad entries and a shared input stay full', () => {
  const without = dataFiles.filter((file) => file !== MAPPED[0])
  const result = dataSelect([DATA], without)
  assert.equal(result.full, true)
  assert.match(result.why, /missing/)
  for (const bad of [[null], [DATA, 7], [undefined], [{}]]) assert.equal(dataSelect(bad).full, true)
  assert.equal(dataSelect(null).full, true)
  assert.equal(dataSelect([`${SKILL}SKILL.md`, 'scripts/ci/plan-ci.mjs']).full, true)
})

test('every mapped test file exists and is a worker test', () => {
  for (const test of MAPPED) {
    assert.ok(lstatSync(join(root, test)).isFile(), test)
    assert.match(test, /^apps\/[^/]+\/test\/[^/]+\.test\.mjs$/)
  }
  for (const data of DATA_FILE_TESTS.keys()) assert.ok(lstatSync(join(root, data)).isFile(), data)
})

/** Reads one file as text only when it is a regular file; a symlink or FIFO is an error, not a read. */
function readRegular(path) {
  const stat = lstatSync(path)
  assert.ok(stat.isFile(), `${path} is not a regular file`)
  return readFileSync(path, 'utf8')
}

function testFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue
    const path = join(dir, entry.name)
    if (entry.isDirectory()) testFiles(path, out)
    else if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(entry.name) || /\.[cm]?[jt]sx?$/.test(entry.name))
      out.push(path)
  }
  return out
}

/** Test folders a TCH test can live in: the worker, interop and e2e ones, and the EmDash suites' `tests`. */
function allTestFiles() {
  const dirs = [join(root, 'scripts/test')]
  for (const base of ['apps'])
    for (const app of readdirSync(join(root, base))) dirs.push(join(root, base, app, 'test'))
  for (const group of readdirSync(join(root, 'packages'))) {
    for (const pkg of readdirSync(join(root, 'packages', group)))
      dirs.push(join(root, 'packages', group, pkg, 'test'), join(root, 'packages', group, pkg, 'tests'))
  }
  return dirs.flatMap((dir) => {
    try {
      return testFiles(dir)
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return []
      throw error
    }
  })
}

/** Lines naming a tree that are inventory only: they list or probe the tree, they do not read its content. */
const INVENTORY_LINE = {
  'scripts/test/check-tests-environment.test.ts': [
    new RegExp(`^\\s*'${SKILL.slice(0, -1)}',?$`),
    /check-tests: 4 trees hold tests this gate does NOT run/
  ],
  // The gate lists trees whose own tests it does not run; it never reads their content.
  // The planner declares the trees it scopes by path; it never opens them.
  'scripts/ci/related-tests.mjs': [/^\s*prefix: '[^']+',?$/],
  'scripts/ci/plan-ci.mjs': [/^const EMDASH_INPUTS = String\.raw`[^`]+`$/],
  'scripts/check-tests.ts': [/^\s*tree: '[^']+',?$/, /Its home is /],
  // The shard installer test only checks that the sparse-checkout path list names the tree.
  'scripts/test/install-shard.test.mjs': [/^\s*\/sparse-checkout set deploy /],
  // The tracy-host image carries the T4 skill whole, for a shard with no checkout. These two tests name
  // the tree as a path (what the Dockerfile copies, what sync-fleet-files.sh lifts); neither opens a file of it.
  'scripts/test/tracy-host-fleet-files-image.test.mjs': [
    new RegExp(`^\\s*\\['/opt/tracy-fleet/${T4_TREE}', '${T4_TREE}'\\]$`)
  ],
  'scripts/test/sync-fleet-files.test.mjs': [new RegExp(`^const SKILL = '${T4_TREE}'$`)]
}

function treeReferences(text, prefix) {
  const tree = prefix.replace(/\/$/, '')
  const segments = tree.split('/')
  const last = segments.at(-1)
  return text
    .split('\n')
    .filter((line) => line.includes(tree) || (line.includes(last) && /vendor/.test(line)))
}

test('only declared readers read a reviewed skill tree; inventory lines may name one', () => {
  const files = allTestFiles()
  assert.ok(files.length > 100)
  assert.ok(files.some((file) => file.includes('/tracy-emdash-theme-business/tests/')))
  for (const { prefix, readers } of REVIEWED_SKILLS) {
    const read = new Set()
    for (const file of files) {
      const rel = file.slice(root.length + 1)
      const lines = treeReferences(readRegular(file), prefix)
      if (readers.includes(rel)) {
        if (lines.length > 0) read.add(rel)
        continue
      }
      const allowed = INVENTORY_LINE[rel] ?? []
      for (const line of lines) {
        assert.ok(
          allowed.some((re) => re.test(line)),
          `${rel} reads ${prefix} — declare it in REVIEWED_SKILLS readers or remove the line: ${line.trim()}`
        )
      }
    }
    for (const reader of readers) {
      assert.ok(lstatSync(join(root, reader)).isFile(), `${reader} is a declared reader but is gone`)
      assert.match(reader, /^(?:apps\/[^/]+|scripts|packages\/[^/]+\/[^/]+)\/test\/[^/]+\.test\.mjs$/)
      assert.ok(read.has(reader), `${reader} no longer reads ${prefix} — drop it from readers`)
    }
  }
  const listed = REVIEWED_SKILLS.map((skill) => skill.prefix)
  assert.ok(listed.includes(T4.prefix) && listed.includes(EMDASH_SKILL))
  assert.ok(listed.every((prefix) => prefix.endsWith('/') && prefix.startsWith('vendor/')))
  for (const skill of REVIEWED_SKILLS) assert.ok(skill.reason && skill.gate, skill.prefix)
})

const SOURCE_FILE = /\.[cm]?[jt]sx?$/
const SOURCE_EXTENSIONS = ['', '.mjs', '.js', '.ts', '.tsx', '.cjs', '/index.mjs', '/index.js', '/index.ts']

/** Every code file under apps, packages and scripts, the CI planner included. */
function allSourceFiles(dir = root, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
      if (dir === root && !['apps', 'packages', 'scripts'].includes(entry.name)) continue
      allSourceFiles(path, out)
    } else if (SOURCE_FILE.test(entry.name) && dir !== root) out.push(path)
  }
  return out
}

/** Whether a candidate path is a regular file, asked of the disk once per path per process. */
const regularFiles = new Map()
function isRegularFile(path) {
  if (!regularFiles.has(path)) regularFiles.set(path, existsSync(path) && lstatSync(path).isFile())
  return regularFiles.get(path)
}

/** Relative specifiers a module loads: static, dynamic and `require` forms. */
function relativeImports(file, text) {
  const specs = [...text.matchAll(/(?:from|import|require)\s*\(?\s*['"](\.{1,2}\/[^'"]+)['"]/g)].map(
    (m) => m[1]
  )
  return specs
    .map((spec) => SOURCE_EXTENSIONS.map((ext) => join(dirname(file), spec + ext)).find(isRegularFile))
    .filter(Boolean)
}

/** Comment-only lines load nothing, so a module's prose naming a tree or a path is not a read. */
function withoutComments(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/\*|\*)/.test(line))
    .join('\n')
}

/** Lines of a source file that read the tree, minus the inventory lines that only list it. */
function readingLines(rel, text, prefix) {
  const allowed = INVENTORY_LINE[rel] ?? []
  return treeReferences(withoutComments(text), prefix).filter((line) => !allowed.some((re) => re.test(line)))
}

/**
 * Per-file facts the guard asks again and again: the text, the text without comments, and the
 * modules it imports. Each is a pure function of the file, so it is computed once per process —
 * the walk below visits the same shared modules from hundreds of tests, for every reviewed tree.
 */
const texts = new Map()
const textOf = (file) => {
  if (!texts.has(file)) texts.set(file, readRegular(file))
  return texts.get(file)
}
const codeTexts = new Map()
const codeOf = (file) => {
  if (!codeTexts.has(file)) codeTexts.set(file, withoutComments(textOf(file)))
  return codeTexts.get(file)
}
const importsByFile = new Map()
const importsOf = (file) => {
  if (!importsByFile.has(file)) importsByFile.set(file, relativeImports(file, textOf(file)))
  return importsByFile.get(file)
}
let sourceFiles = null

/**
 * Tests that load a reviewed tree through a module they import (transitively) or name by its repo
 * path (for example to spawn it). Maps test -> the non-test module that reads the tree.
 */
function indirectReaders(prefix, tests) {
  const testSet = new Set(tests)
  sourceFiles ??= allSourceFiles()
  const modules = sourceFiles
    .filter(
      (file) => !testSet.has(file) && readingLines(relative(root, file), textOf(file), prefix).length > 0
    )
    .map((mod) => ({
      mod,
      fromRoot: relative(root, mod),
      fromPackages: relative(join(root, 'packages'), mod)
    }))
  const named = (text, { fromRoot, fromPackages }) => text.includes(fromRoot) || text.includes(fromPackages)
  const out = new Map()
  for (const test of tests) {
    const seen = new Set([test])
    const parent = new Map()
    const stack = [test]
    while (stack.length > 0 && !out.has(test)) {
      const file = stack.pop()
      const code = codeOf(file)
      const hit = modules.find((m) => m.mod === file || named(code, m))?.mod
      if (hit) {
        const chain = [hit]
        for (let at = file; at !== test; at = parent.get(at)) chain.unshift(at)
        out.set(test, { module: hit, chain: [test, ...chain.filter((f) => f !== test)] })
      }
      for (const next of importsOf(file)) {
        if (!seen.has(next)) {
          seen.add(next)
          parent.set(next, file)
          stack.push(next)
        }
      }
    }
  }
  return out
}

test('no test reaches a reviewed skill tree through a module that reads it', () => {
  const tests = allTestFiles()
  for (const { prefix, readers } of REVIEWED_SKILLS) {
    for (const [test, { module, chain }] of indirectReaders(prefix, tests)) {
      const rel = relative(root, test)
      assert.ok(
        readers.includes(rel),
        `${rel} loads ${relative(root, module)} (${chain.map((f) => relative(root, f)).join(' → ')}), which reads ${prefix} — declare the test in readers or cut the import`
      )
    }
  }
})

test('the indirect guard sees the quickstart scripts that import the T4 skill, and no test loads them', () => {
  const tests = allTestFiles()
  const module = join(root, 'packages', 'cms', 'tracy-joomla-quickstart', 'studio-content.mjs')
  assert.ok(readingLines(relative(root, module), readRegular(module), T4.prefix).length > 0)
  const importer = join(root, 'packages', 'cms', 'tracy-joomla-quickstart', 'build-content-plan.mjs')
  assert.deepEqual(
    relativeImports(importer, readRegular(importer)).filter((file) => file === module),
    [module]
  )
  for (const { module: mod } of indirectReaders(T4.prefix, tests).values())
    assert.ok(!mod.includes('tracy-joomla-quickstart/'), mod)
})

test('the guard flags a reader that is not declared and accepts one that is', () => {
  const sample = `readFileSync(join(ROOT, '${T4.prefix}SKILL.md'))`
  assert.equal(treeReferences(sample, T4.prefix).length, 1)
  const undeclared = 'apps/tracy-web/test/new.test.mjs'
  assert.ok(!T4.readers.includes(undeclared))
  assert.ok(T4.readers.includes('scripts/test/skill-catalog.test.mjs'))
})

test('the reader guard catches a test that assembles the tree path with join or new URL', () => {
  const { prefix } = REVIEWED_SKILLS[0]
  const tree = prefix.replace(/\/$/, '')
  const sample = `const p = join(root, '${tree}', 'SKILL.md')\nconst u = new URL('../../${tree}/x', import.meta.url)\n`
  assert.equal(treeReferences(sample, prefix).length, 2)
  const last = tree.split('/').at(-1)
  assert.equal(treeReferences(`join('vendor', 'wordpress', '${last}')`, prefix).length, 1)
  assert.equal(treeReferences(`join('packages', 'cms', '${last}')`, prefix).length, 0)
})
