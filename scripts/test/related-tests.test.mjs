import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DATA_FILE_TESTS, REVIEWED_SKILLS, relatedTests } from '../ci/related-tests.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const SKILL = REVIEWED_SKILLS[0].prefix
// A reviewed tree no test reads: changing it alone selects nothing.
const UNREAD = REVIEWED_SKILLS.find((skill) => !skill.readers.length && !skill.outsideCi?.length).prefix
// Found by a fragment of the name: the guard below fails on a test that spells out a reviewed tree.
const T4 = REVIEWED_SKILLS.find((skill) => skill.prefix.includes('joomlart-t4'))
const EMDASH_SKILL = REVIEWED_SKILLS.find((skill) => skill.prefix.startsWith('vendor/emdash/')).prefix
// A skill whose every reader is a worker test: its change stays narrow (T4 is no longer one: two
// Dockerfiles no pull request builds read it).
const NARROW = REVIEWED_SKILLS.find((skill) => skill.prefix.endsWith('/pr-merge/'))
const NARROW_READERS = NARROW.readers
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
  const inventory = [...files, ...NARROW_READERS]
  const only = relatedTests({
    changed: [`${NARROW.prefix}IMPORT-NOTE.md`],
    allFiles: inventory,
    dependencies
  })
  assert.deepEqual([only.full, only.workers, only.interop], [false, NARROW_READERS, false])
  const docs = relatedTests({
    changed: [`${NARROW.prefix}SKILL.md`, 'docs/references/x.md', `${UNREAD}SKILL.md`],
    allFiles: inventory,
    dependencies
  })
  assert.deepEqual([docs.full, docs.workers, docs.interop], [false, NARROW_READERS, false])
  const unread = relatedTests({ changed: [`${UNREAD}SKILL.md`], allFiles: inventory, dependencies })
  assert.deepEqual([unread.full, unread.workers, unread.interop], [false, [], false])
})

test('a skill reader is a union with data tests and with source, never duplicated', () => {
  const inventory = [...files, ...MAPPED, ...NARROW_READERS, DATA]
  const withData = relatedTests({
    changed: [DATA, `${NARROW.prefix}SKILL.md`],
    allFiles: inventory,
    dependencies
  })
  assert.deepEqual([...withData.workers].sort(), [...MAPPED, ...NARROW_READERS].sort())
  assert.equal(new Set(withData.workers).size, withData.workers.length)
  assert.equal(withData.interop, false)
  const withSource = relatedTests({
    changed: ['packages/core/tracy-core/src/a.mjs', `${NARROW.prefix}SKILL.md`],
    allFiles: inventory,
    dependencies
  })
  for (const reader of NARROW_READERS) assert.ok(withSource.workers.includes(reader), reader)
  assert.ok(withSource.workers.includes('packages/core/tracy-core/test/seat.test.mjs'))
  assert.equal(withSource.interop, true)
})

test('a declared reader missing from the inventory, or a look-alike prefix, runs the full suite', () => {
  const lost = relatedTests({ changed: [`${NARROW.prefix}SKILL.md`], allFiles: files, dependencies })
  assert.equal(lost.full, true)
  assert.match(lost.why, /reader .* is missing/)
  const lostWithData = relatedTests({
    changed: [DATA, `${NARROW.prefix}SKILL.md`],
    allFiles: [...files, ...MAPPED, DATA],
    dependencies
  })
  assert.equal(lostWithData.full, true)
  const lookAlike = relatedTests({
    changed: [`${NARROW.prefix.slice(0, -1)}-x/SKILL.md`],
    allFiles: [...files, ...NARROW_READERS],
    dependencies
  })
  assert.equal(lookAlike.full, true)
  assert.match(lookAlike.why, /unmapped input/)
})

// Tracy's own skills, found by name: spelling a skill path out here would make this file a reader.
const OWN = REVIEWED_SKILLS.filter((skill) => skill.prefix.startsWith('.agents/'))
const CONTRACT = OWN.find((skill) => skill.prefix.endsWith('/quickstart-contract/'))
const PR_MERGE = OWN.find((skill) => skill.prefix.endsWith('/pr-merge/'))

const TDSR = OWN.find((skill) => skill.prefix.endsWith('/tdsr/'))
const isRegressionScript = (file) => file.startsWith('tests/regression/scripts/')

test('a skill read only by worker tests selects exactly those readers, journal entry included', () => {
  const inventory = [...files, ...PR_MERGE.readers, ...TDSR.readers]
  const changed = [`${PR_MERGE.prefix}SKILL.md`, 'changes/2026-10-28-x.md']
  const result = relatedTests({ changed, allFiles: inventory, dependencies })
  assert.equal(result.full, false, result.why)
  assert.deepEqual(result.workers, ['scripts/test/check-pr-merge.test.mjs'])
  assert.equal(result.interop, false)
  const both = relatedTests({
    changed: [...changed, `${TDSR.prefix}SKILL.md`],
    allFiles: inventory,
    dependencies
  })
  assert.equal(both.full, false, both.why)
  assert.deepEqual([...both.workers].sort(), [...PR_MERGE.readers, ...TDSR.readers].sort())
  const lost = relatedTests({ changed, allFiles: files, dependencies })
  assert.equal(lost.full, true)
  assert.match(lost.why, /reader .* is missing/)
})

test('a skill with readers outside CI selects its CI readers only, names the others, and runs full when one is gone', () => {
  const wordpress = REVIEWED_SKILLS.find((one) => one.prefix.includes('tracy-wordpress-theme'))
  const emdash = REVIEWED_SKILLS.find((one) => one.prefix === EMDASH_SKILL)
  for (const skill of [wordpress, T4, emdash]) {
    assert.ok(skill.outsideCi.length > 0, `${skill.prefix} has readers no CI row runs`)
    const inventory = [...files, ...skill.readers, ...skill.outsideCi]
    const changed = [`${skill.prefix}SKILL.md`, 'changes/2026-10-29-x.md']
    const result = relatedTests({ changed, allFiles: inventory, dependencies })
    assert.equal(result.full, false, `${skill.prefix}: ${result.why}`)
    assert.deepEqual([...result.workers].sort(), [...skill.readers].sort(), skill.prefix)
    assert.deepEqual(result.outsideCi, skill.outsideCi, skill.prefix)
    assert.equal(result.interop, false)
    // Mixed with a narrow skill and data: the union of the CI readers, the outside ones still named.
    const mixed = relatedTests({
      changed: [...changed, `${PR_MERGE.prefix}SKILL.md`, DATA],
      allFiles: [...inventory, ...PR_MERGE.readers, ...MAPPED, DATA],
      dependencies
    })
    assert.equal(mixed.full, false, skill.prefix)
    assert.deepEqual(
      [...mixed.workers].sort(),
      [...new Set([...skill.readers, ...PR_MERGE.readers, ...MAPPED])].sort()
    )
    assert.deepEqual(mixed.outsideCi, skill.outsideCi)
    // A declared outside reader that is gone: the audit no longer holds, run everything.
    const gone = relatedTests({
      changed,
      allFiles: inventory.filter((f) => f !== skill.outsideCi[0]),
      dependencies
    })
    assert.equal(gone.full, true, skill.prefix)
    assert.match(gone.why, /skill reader .* is missing/)
  }
  // EmDash has no CI reader: the checks row only.
  assert.deepEqual(emdash.readers, [])
  // A skill without outside readers names none.
  const narrow = relatedTests({
    changed: [`${PR_MERGE.prefix}SKILL.md`],
    allFiles: [...files, ...PR_MERGE.readers],
    dependencies
  })
  assert.deepEqual(narrow.outsideCi, [])
})

test('a quickstart-contract edit with its journal entry selects exactly its worker readers, never the full suite', () => {
  // REG-PR-1228 step S3 moved into check-pack-modes.test.mjs: no regression script reads the skill.
  assert.ok(CONTRACT.readers.includes('scripts/test/check-pack-modes.test.mjs'))
  assert.ok(!CONTRACT.readers.some(isRegressionScript))
  assert.deepEqual(CONTRACT.outsideCi ?? [], [])
  const changed = [
    `${CONTRACT.prefix}SKILL.md`,
    `${CONTRACT.prefix}references/packing.md`,
    'changes/2026-10-28-x.md'
  ]
  const result = relatedTests({ changed, allFiles: [...files, ...CONTRACT.readers], dependencies })
  assert.equal(result.full, false, result.why)
  assert.deepEqual([...result.workers].sort(), [...CONTRACT.readers].sort())
  assert.equal(result.interop, false)
})

test('the skills root, the mirror and an unlisted skill keep the full suite', () => {
  const root = CONTRACT.prefix.split('/').slice(0, 2).join('/')
  const mirror = CONTRACT.prefix.replace('.agents', '.claude')
  for (const file of [
    `${root}/public-skills.txt`,
    `${root}/README.md`,
    mirror.slice(0, -1),
    `${root}/new-skill/SKILL.md`
  ]) {
    const result = relatedTests({ changed: [file], allFiles: [...files, ...CONTRACT.readers], dependencies })
    assert.equal(result.full, true, file)
    assert.match(result.why, /unmapped input/, file)
  }
})

test('the reader guard catches a test reaching an own skill by its path, a join, its mirror or the root', () => {
  const [dot, skills, name] = CONTRACT.prefix.split('/')
  const samples = [
    `readFileSync(join(ROOT, '${CONTRACT.prefix}SKILL.md'))`,
    `join(ROOT, '${dot}', '${skills}', '${name}', 'SKILL.md')`,
    `readFileSync('${CONTRACT.prefix.replace('.agents', '.claude')}SKILL.md')`,
    `readdirSync(join(ROOT, '${dot}/${skills}'))`,
    `const dir = \`${dot}/${skills}/\${skill}/SKILL.md\``
  ]
  for (const sample of samples) assert.equal(treeReferences(sample, CONTRACT.prefix).length, 1, sample)
  // Another skill's path is not this skill's.
  assert.equal(treeReferences(`readFileSync('${PR_MERGE.prefix}SKILL.md')`, CONTRACT.prefix).length, 0)
  for (const skill of OWN) assert.ok(skill.reason && skill.gate, skill.prefix)
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
  'scripts/ci/related-tests.mjs': [/^\s*prefix: (?:'[^']+'|`[^`]+`),?$/],
  'scripts/ci/plan-ci.mjs': [/^const EMDASH_INPUTS = String\.raw`[^`]+`$/],
  'scripts/check-tests.ts': [/^\s*tree: '[^']+',?$/, /Its home is /],
  // The shard installer test only checks that the sparse-checkout path list names the tree.
  'scripts/test/install-shard.test.mjs': [/^\s*\/sparse-checkout set deploy /],
  // The language gate's list of Tracy-owned vendor trees names each tree by path; the module is pure
  // (no file system) and `check-language.ts` in the checks row is what scans the files.
  'scripts/lib/owned-vendor-trees.ts': [/^\s*path: '[^']+',?$/],
  // Its test passes repo paths as string fixtures to a pure path classifier and only probes that each
  // listed tree exists; it never opens a file inside one.
  // Paths `check-vocabulary.ts` scans; the push hook only compares changed paths with them.
  'scripts/check-push.mjs': [/^\s*'\.agents\/skills\/',$/],
  'scripts/test/check-push.test.mjs': [/vocabularyVerdict\(\['\.agents\/skills\/tch-dev\/SKILL\.md'\]\)/],
  // The skills folder of a CUSTOMER site (its own, and the retired one under `.claude`), built in a
  // temporary folder; never the repository's skills.
  'packages/fleet/tracy-fleet-operation/scripts/provision/siteFolder.mjs': [
    /^\s*'\.agents\/skills',$/,
    /^\s*'\| `AgentSetting\/` `\.agents\/skills\/` \|/
  ],
  'packages/fleet/tracy-fleet-operation/test/site-folder.test.mjs': [
    /'TracyWork', '\.agents\/skills'\]\) \{$/,
    /^\s*\* Until 17\/09 the folder shipped `\.claude\/skills`/,
    /^\s*\* `<projectRoot>\/\.agents\/skills` and no plugin/,
    /^\s*await mkdir\(path\.join\((?:untouched|edited), '\.claude\/skills'\), \{ recursive: true \}\)$/
  ],
  // The vocabulary gate's scan list: it reads the tree as its own process (checks row, pre-push
  // hook); vocabulary-copy.test.mjs runs it in a scratch tree, never on this repository.
  'scripts/check-vocabulary.ts': [/^\s*'\.agents\/skills',$/],
  // The gate reads modify-site only in `main()`, which runs as its own process in the checks row;
  // check-infra-contracts.test.ts imports the pure checkers and runs them on fixtures.
  'scripts/check-infra-contracts.ts': [
    /^\s*const skill = '\.agents\/skills\/modify-site'$/,
    /problem\('\.agents\/skills\/modify-site', 'names no path at all/
  ],
  // Vendored trees that name the skills folder of THEIR OWN root, never this repository's: the EmDash
  // CMS (not a workspace member, not in the image) scaffolds a plugin's or template's skills folder,
  // and the mattpocock skills link into `$HOME`.
  ...Object.fromEntries(
    [
      'vendor/emdash/emdash/infra/emdash-bot/tests/unit/untar.test.ts',
      'vendor/emdash/emdash/infra/flue-review/test/untar.test.ts',
      'vendor/emdash/emdash/packages/plugin-cli/src/init/scaffold.ts',
      'vendor/emdash/emdash/packages/plugin-cli/src/init/templates.ts',
      'vendor/emdash/emdash/packages/plugin-cli/tests/init-scaffold.test.ts',
      'vendor/emdash/emdash/packages/plugin-cli/tests/init-templates.test.ts',
      'vendor/emdash/emdash/scripts/sync-template-skills.sh',
      'vendor/tracy/mattpocock-skills/scripts/link-skills.sh'
    ].map((file) => [file, [/\.(?:agents|claude)\/skills(?!\/[\w.-])/]])
  ),
  'scripts/test/owned-vendor-trees.test.ts': [
    /^\s*\['vendor\/[^']+', (?:true|false)\],?$/,
    /^\s*assert\.deepEqual\(kinds\('vendor\/[^']+', md\), \[\[\d+, 'prose'\]\]\)$/
  ]
}

/**
 * A Tracy skill is reached three more ways than a vendored tree: through its mirror in the Claude
 * skills folder, through a `join` of the path segments, and through the skills root with a name
 * computed at run time (`AGENTS_SKILLS_DIR` and the like). A line naming the root reads every skill.
 */
const OWN_SKILL = /^\.agents\/skills\/([^/]+)$/
const SKILLS_ROOT_JOIN = /['"`]\.(?:agents|claude)['"`]\s*,\s*['"`]skills['"`]/
const SKILLS_ROOT = new RegExp(String.raw`\.(?:agents|claude)\/skills(?!\/[\w.-])|` + SKILLS_ROOT_JOIN.source)

function treeReferences(text, prefix) {
  const tree = prefix.replace(/\/$/, '')
  const segments = tree.split('/')
  const last = segments.at(-1)
  const own = OWN_SKILL.exec(tree)?.[1]
  const names = own
    ? (line) =>
        line.includes(tree) || line.includes(tree.replace('.agents', '.claude')) || SKILLS_ROOT.test(line)
    : (line) => line.includes(tree) || (line.includes(last) && /vendor/.test(line))
  // A path joined over several lines (`join(\n  'vendor',\n  'emdash',\n …)`) counts as one line.
  const quote = String.raw`['"\x60]`
  const joined = new RegExp(
    [
      quote +
        segments
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join(`${quote}\\s*,\\s*${quote}`) +
        quote
    ]
      .concat(own ? [SKILLS_ROOT_JOIN.source] : [])
      .join('|'),
    'g'
  )
  const multiLine = [...text.matchAll(joined)].map((m) => m[0]).filter((hit) => hit.includes('\n'))
  return [...text.split('\n').filter(names), ...multiLine.map((hit) => hit.replace(/\s+/g, ' '))]
}

/**
 * Every tracked file that runs — code, shell, Python, workflow and action YAML, regression cases,
 * Dockerfiles, Containerfiles and compose files — wherever it lives: apps, packages, scripts,
 * `tests/` (regression scripts and cases, e2e-dev, acceptance), `deploy/`, `.github/`, root scripts
 * and `vendor/` — tracked, or new and not ignored. Files a sparse checkout left out are skipped.
 */
const CASE = /^tests\/regression\/cases\/[^/]+\.json$/
const BUILD =
  /(?:^|\/)(?:Dockerfile(?:\.[\w.-]+)?|[^/]+\.Dockerfile|Containerfile(?:\.[\w.-]+)?|(?:docker-)?compose(?:\.[\w.-]+)?\.ya?ml)$/
/** Whether the guard scans a path of this kind at all. */
const isScanned = (rel) => EXECUTABLE.test(rel) || CASE.test(rel) || BUILD.test(rel)
const EXECUTABLE = /\.(?:[cm]?[jt]sx?|sh|py)$|^\.github\/.*\.ya?ml$/
let executables = null
function trackedExecutables() {
  executables ??= execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 1 << 28
  })
    .split('\0')
    .filter(
      (rel) => (EXECUTABLE.test(rel) || CASE.test(rel) || BUILD.test(rel)) && isRegularFile(join(root, rel))
    )
  return executables
}

/** A file in a test folder, or named as a test: its comments count too (a test's prose is its spec). */
const isTestPath = (rel) => /(?:^|\/)tests?\/|\.(?:test|spec)\.[cm]?[jt]sx?$/.test(rel)

/**
 * What a regression case runs or tells its runner to read: `run.cmd`, `run.cwd`, the `selectors`
 * (`tool`, `script`, `test`…) and the steps. Its evidence and fence are prose about the past. A case
 * that does not parse is read whole: fail closed.
 */
function caseText(text) {
  let entry
  try {
    entry = JSON.parse(text)
  } catch {
    return text
  }
  return [
    ...(Array.isArray(entry.run?.cmd) ? [entry.run.cmd.join(' ')] : []),
    ...(typeof entry.run?.cwd === 'string' ? [entry.run.cwd] : []),
    ...Object.values(entry.selectors ?? {}).map(String),
    ...(Array.isArray(entry.steps) ? entry.steps.map(String) : [])
  ].join('\n')
}

/** The text of a scanned file the guard reads for references, by kind. */
function scanText(rel, text) {
  if (CASE.test(rel)) return caseText(text)
  // A Tracy test's comments count (its prose is its spec); a vendored test runs in its home repo.
  if (isTestPath(rel) && !rel.startsWith('vendor/')) return text
  // `withoutComments` drops `#` lines: Dockerfile, compose and shell comments.
  return withoutComments(text)
}

/** Lines of one file that read `skill`'s tree and that no declaration or inventory line accounts for. */
function undeclaredLines(rel, text, { prefix, readers, outsideCi = [], modules = [] }) {
  if (rel.startsWith(prefix) || [...readers, ...outsideCi, ...modules].includes(rel)) return []
  const allowed = INVENTORY_LINE[rel] ?? []
  return treeReferences(scanText(rel, text), prefix).filter((line) => !allowed.some((re) => re.test(line)))
}

/** Where a declared reader lives: `readers` are worker tests (selected) … */
const READER = /^(?:apps\/[^/]+|scripts|packages\/[^/]+\/[^/]+)\/test\/[^/]+\.test\.mjs$/
/** … and `outsideCi` are what no CI row runs: regression scripts and cases, and container builds. */
const OUTSIDE_CI =
  /^(?:tests\/regression\/scripts\/[^/]+\.mjs|tests\/regression\/cases\/[^/]+\.json|.+\/(?:Dockerfile|[^/]+\.Dockerfile|Containerfile)|(?:.+\/)?(?:docker-)?compose(?:\.[\w.-]+)?\.ya?ml)$/

test('only declared readers and modules read a reviewed skill tree; inventory lines may name one', () => {
  const files = trackedExecutables()
  assert.ok(files.length > 1000)
  for (const probe of [
    'tests/regression/scripts/REG-PR-1228-wp-pack-modes.mjs',
    '.github/workflows/tracy-ci.yml',
    'deploy/scripts/install-shard-steps.sh',
    'tests/regression/cases/REG-PR-1559-wp-skill-road-gates-early.json',
    'packages/fleet/tracy-fleet-operation/dsh/Dockerfile',
    'deploy/compose.yml'
  ])
    assert.ok(files.includes(probe), probe)
  assert.ok(files.some((file) => file.includes('/tracy-emdash-theme-business/tests/')))
  const tests = scannedTests()
  for (const skill of REVIEWED_SKILLS) {
    const { prefix, readers, outsideCi = [], modules = [] } = skill
    const read = new Set()
    for (const rel of files) {
      if (rel.startsWith(prefix)) continue
      const text = textOf(join(root, rel))
      if ([...readers, ...outsideCi, ...modules].includes(rel)) {
        if (treeReferences(scanText(rel, text), prefix).length > 0) read.add(rel)
        continue
      }
      for (const line of undeclaredLines(rel, text, skill))
        assert.fail(
          `${rel} reads ${prefix} — declare it in REVIEWED_SKILLS readers (a worker test), outsideCi (a regression script or case, a Dockerfile) or modules (code no test loads), or remove the line: ${line.trim()}`
        )
    }
    const indirect = indirectReaders(prefix, tests)
    for (const reader of readers) {
      assert.ok(lstatSync(join(root, reader)).isFile(), `${reader} is a declared reader but is gone`)
      assert.match(reader, READER)
      assert.ok(
        read.has(reader) || indirect.has(join(root, reader)),
        `${reader} no longer reads ${prefix} — drop it from readers`
      )
    }
    for (const file of outsideCi) {
      assert.ok(lstatSync(join(root, file)).isFile(), `${file} is a declared reader but is gone`)
      assert.match(file, OUTSIDE_CI)
      assert.ok(read.has(file), `${file} no longer reads ${prefix} — drop it from outsideCi`)
    }
    for (const module of modules) {
      assert.ok(!isTestPath(module), `${module} is a test: declare it in readers`)
      assert.ok(read.has(module), `${module} no longer reads ${prefix} — drop it from modules`)
    }
  }
  const listed = REVIEWED_SKILLS.map((skill) => skill.prefix)
  assert.ok(listed.includes(T4.prefix) && listed.includes(EMDASH_SKILL))
  assert.ok(
    listed.every(
      (prefix) =>
        prefix.endsWith('/') && (prefix.startsWith('vendor/') || OWN_SKILL.test(prefix.slice(0, -1)))
    )
  )
  for (const skill of REVIEWED_SKILLS) assert.ok(skill.reason && skill.gate, skill.prefix)
})

const SOURCE_FILE = /\.[cm]?[jt]sx?$/
const SOURCE_EXTENSIONS = ['', '.mjs', '.js', '.ts', '.tsx', '.cjs', '/index.mjs', '/index.js', '/index.ts']

/**
 * Every Tracy code file a test can load: tracked code outside `vendor/` and the dot folders (the
 * skills' own scripts are imported by nothing; the guard above proves it).
 */
function allSourceFiles() {
  return trackedExecutables()
    .filter((rel) => SOURCE_FILE.test(rel) && !rel.startsWith('vendor/') && !rel.startsWith('.'))
    .map((rel) => join(root, rel))
}

/**
 * Tests the indirect guard walks: every test folder above, plus regression scripts and every other
 * test file under `tests/`. Tests inside `vendor/` run in their own home repo, never here.
 */
let scanned = null
function scannedTests() {
  scanned ??= [
    ...new Set([
      ...allTestFiles(),
      ...trackedExecutables()
        .filter((rel) => rel.startsWith('tests/') && SOURCE_FILE.test(rel))
        .map((rel) => join(root, rel))
    ])
  ]
  return scanned
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
  // A package test that bundles its source through esbuild `stdin` resolves `./x` from `<pkg>/src`.
  const bases = /\/test\/[^/]+$/.test(file)
    ? [dirname(file), join(dirname(file), '..', 'src')]
    : [dirname(file)]
  return specs
    .map((spec) =>
      bases.flatMap((base) => SOURCE_EXTENSIONS.map((ext) => join(base, spec + ext))).find(isRegularFile)
    )
    .filter(Boolean)
}

/** Comment-only lines (`//`, `/*`, `*`, `#`) load nothing: a module's prose naming a tree is not a read. */
function withoutComments(text) {
  return text
    .split('\n')
    .filter((line) => !/^\s*(?:\/\/|\/\*|\*|#)/.test(line))
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
 * Lines that name a module's path without loading it: the planner's `readers`/`modules` lists, the
 * audit record of who reads each tree.
 */
const NAMES_ONLY = {
  'scripts/ci/related-tests.mjs':
    /^\s*(?:(?:readers|modules): \[)?(?:\.\.\.modules,\s*)?(?:'[^']*',?\s*)*\]?,?$/
}

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
  const loadable = (file) => {
    const only = NAMES_ONLY[relative(root, file)]
    return only
      ? codeOf(file)
          .split('\n')
          .filter((line) => !only.test(line))
          .join('\n')
      : codeOf(file)
  }
  const out = new Map()
  for (const test of tests) {
    const seen = new Set([test])
    const parent = new Map()
    const stack = [test]
    while (stack.length > 0 && !out.has(test)) {
      const file = stack.pop()
      const code = loadable(file)
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
  const tests = scannedTests()
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

test('the guard reaches regression scripts and flags one that reads a skill without being declared', () => {
  const emdash = REVIEWED_SKILLS.find((one) => one.prefix === EMDASH_SKILL)
  const script = emdash.outsideCi.find(isRegressionScript)
  assert.ok(trackedExecutables().includes(script))
  const text = withoutComments(readRegular(join(root, script)))
  const lines = treeReferences(text, EMDASH_SKILL)
  assert.ok(lines.length > 0, 'the scan sees what the script reads')
  // Not an inventory line: undeclared, the guard above would fail on it.
  assert.ok(!lines.some((line) => (INVENTORY_LINE[script] ?? []).some((re) => re.test(line))))
  assert.match(script, OUTSIDE_CI)
  // REG-PR-1228 no longer reads the quickstart-contract skill (its S3 is a worker test now).
  const moved = 'tests/regression/scripts/REG-PR-1228-wp-pack-modes.mjs'
  assert.deepEqual(treeReferences(withoutComments(readRegular(join(root, moved))), CONTRACT.prefix), [])
  // The same holds for a script that joins the path over several lines.
  const [dot, skills, name] = CONTRACT.prefix.split('/')
  assert.equal(
    treeReferences(`join(\n  ROOT,\n  '${dot}',\n  '${skills}',\n  '${name}'\n)`, CONTRACT.prefix).length,
    1
  )
  const [v, cms, tree] = EMDASH_SKILL.split('/')
  assert.equal(treeReferences(`path.join(\n  '${v}',\n  '${cms}',\n  '${tree}'\n)`, EMDASH_SKILL).length, 1)
})

test('an undeclared regression case or Dockerfile that reads a skill fails the guard; prose and comments do not', () => {
  const wordpress = REVIEWED_SKILLS.find((skill) => skill.prefix.includes('tracy-wordpress-theme'))
  const skillDir = `${wordpress.prefix}skills/tracy-wordpress-theme`
  const kase = (fields) => JSON.stringify({ id: 'REG-NEW', steps: [], ...fields })
  const newCase = 'tests/regression/cases/REG-NEW-reads-skill.json'
  for (const fields of [
    { run: { cmd: ['node', '--test', 'scripts/test/x.test.mjs'], cwd: skillDir } },
    { run: { cmd: ['node', `${skillDir}/scripts/visual/site-sweep.mjs`] } },
    { selectors: { script: `${skillDir}/scripts/a.mjs` } },
    { steps: [`S1: run node ${skillDir}/scripts/b.mjs`] }
  ])
    assert.equal(undeclaredLines(newCase, kase(fields), wordpress).length, 1, JSON.stringify(fields))
  // A case that names the tree only in its evidence or fence reads nothing.
  assert.deepEqual(
    undeclaredLines(newCase, kase({ evidence: `seen in ${skillDir}`, fence: skillDir }), wordpress),
    []
  )
  // A case that does not parse is read whole.
  assert.equal(undeclaredLines(newCase, `{ "run": "${skillDir}"`, wordpress).length, 1)
  // Declared, the same case is accounted for.
  const declared = wordpress.outsideCi.find((file) => CASE.test(file))
  assert.deepEqual(undeclaredLines(declared, kase({ run: { cmd: ['node'], cwd: skillDir } }), wordpress), [])

  const dockerfile = `COPY ${T4.prefix.slice(0, -1)} /opt/tracy/t4\nRUN test -s /opt/tracy/t4/SKILL.md\n`
  for (const rel of [
    'packages/fleet/tracy-fleet-operation/new/Dockerfile',
    'deploy/new.Dockerfile',
    'deploy/Containerfile',
    'deploy/compose.new.yml'
  ]) {
    assert.ok(isScanned(rel), rel)
    assert.ok(undeclaredLines(rel, dockerfile, T4).length > 0, rel)
  }
  assert.deepEqual(undeclaredLines('deploy/new.Dockerfile', `# COPY ${T4.prefix} x\nFROM scratch\n`, T4), [])
  assert.deepEqual(undeclaredLines('packages/fleet/tracy-fleet-operation/dsh/Dockerfile', dockerfile, T4), [])
  for (const reader of [declared, 'packages/fleet/tracy-fleet-operation/dsh/Dockerfile']) {
    assert.match(reader, OUTSIDE_CI)
    assert.doesNotMatch(reader, READER)
  }
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
