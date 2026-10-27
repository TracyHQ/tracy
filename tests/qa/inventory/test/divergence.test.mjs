// Regression fixtures for three extraction divergences: a dynamic GATES element, a valid GATES array
// next to a syntax error, and a GET param route that must not confirm a POST door.
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, readdirSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { readSource, runExtractor, SourceError, writeRepoFile } from '../extractors/common.mjs'
import { def as apiDoors } from '../extractors/api-doors.mjs'
import { def as e2e } from '../extractors/e2e-journeys.mjs'
import { def as fence } from '../extractors/fence.mjs'
import { def as gates } from '../extractors/gates.mjs'
import { def as languages } from '../extractors/languages.mjs'
import { def as legacyFindings, importLedgers } from '../extractors/legacy-findings.mjs'
import { def as legacyPlan, importPlan } from '../extractors/legacy-plan.mjs'
import { def as webStrings } from '../extractors/web-strings.mjs'
import { cleanup, json, makeRoot } from './helpers.mjs'
import { readTextSync } from '../../lib/bounded-reader.mjs'

after(cleanup)

test('a dynamic GATES element makes the source incomplete', () => {
  const root = makeRoot({
    'scripts/check-all.ts': `const GATES = [{ name: 'lint', script: 'a.ts' }, { name: nameOf(), script: 'b.ts' }]\n`
  })
  const rec = runExtractor(gates, root)
  assert.equal(rec.status, 'incomplete')
  assert.match(rec.incompleteReason, /hides items/)
})

test('valid GATES next to a syntax error is incomplete', () => {
  const root = makeRoot({
    'scripts/check-all.ts': `const GATES = [{ name: 'lint', script: 'a.ts' }]\nfunction broken( {\n`
  })
  const rec = runExtractor(gates, root)
  assert.equal(rec.status, 'incomplete')
  assert.match(rec.incompleteReason, /syntax errors/)
})

test('GET /x/:id does not confirm POST /x/concrete', () => {
  const root = makeRoot({
    'apps/tracy-web/api-reference.snapshot.json': json({
      public: { paths: { '/x/concrete': { post: {} }, '/x/other': { get: {} } } },
      internal: { paths: { '/i': { get: {} } } }
    }),
    'apps/tracy-web/src/app.js': `import { Hono } from 'hono'\nexport function buildApp() {\n  const app = new Hono()\n  app.get('/x/:id', h)\n  app.get('/i', h)\n  return app\n}\n`
  })
  const rec = runExtractor(apiDoors, root)
  const by = Object.fromEntries(rec.items.map((i) => [i.id, i]))
  assert.equal(by['api-door:public:POST /x/concrete'].inCode, false)
  assert.equal(by['api-door:public:GET /x/other'].inCode, true)
  assert.ok(
    rec.unresolved.some(
      (u) => u.kind === 'snapshot-door-without-code-route' && /POST \/x\/concrete/.test(u.detail)
    )
  )
})

const EXT = fileURLToPath(new URL('../extractors/', import.meta.url))
for (const [file, args] of [
  ['gates.mjs', ['--bogus']],
  ['gates.mjs', ['--root']],
  ['gates.mjs', ['--root', 'a', '--root', 'b']],
  ['legacy-plan.mjs', ['--import']],
  ['legacy-findings.mjs', ['--import', 'x', '--root']]
])
  test(`CLI ${file} ${args.join(' ')} exits 2 without output`, () => {
    const r = spawnSync(process.execPath, [`${EXT}${file}`, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 2)
    assert.match(r.stderr, /usage/)
    assert.equal(r.stdout, '')
  })

// Sibling class: a source whose literal is only partly resolvable keeps the part it knows but is never
// complete, because the lost element is a lost denominator item.
const LANG = 'packages/core/tracy-core/src/interface-languages/index.mjs'
const partial = [
  {
    name: 'languages: a dynamic spread next to a static entry',
    def: languages,
    files: { [LANG]: `export const INTERFACE_LANGUAGES = [{ id: 'en', label: 'English' }, ...more()]\n` },
    keeps: 'language:en'
  },
  {
    name: 'languages: an entry without a string id',
    def: languages,
    files: {
      [LANG]: `export const INTERFACE_LANGUAGES = [{ id: 'en', label: 'English' }, { id: code() }]\n`
    },
    keeps: 'language:en'
  },
  {
    name: 'fence: a computed key in FS_TOOL_ARGS',
    def: fence,
    files: {
      'packages/tools/tracy-subprocess-docker/src/route.mjs': `const FS_TOOL_ARGS = { read: { paths: ['p'] }, [name()]: { paths: ['q'] } }\nconst WORKDIR_ARG = { bash: 'cwd' }\n`
    },
    keeps: 'fence-fs:read'
  },
  {
    name: 'e2e journeys: a spread next to a static journey',
    def: e2e,
    files: {
      'tests/e2e-dev/run.mjs': `const JOURNEYS = [{ id: 'J1' }, ...more()]\n`,
      'tests/e2e-dev/journeys/J1.test.mjs': '\n'
    },
    keeps: 'journey:J1'
  },
  {
    name: 'e2e journeys: an entry without a string id',
    def: e2e,
    files: {
      'tests/e2e-dev/run.mjs': `const JOURNEYS = [{ id: 'J1' }, { id: idOf() }]\n`,
      'tests/e2e-dev/journeys/J1.test.mjs': '\n'
    },
    keeps: 'journey:J1'
  },
  {
    name: 'web strings: a spread in the English table',
    def: webStrings,
    files: {
      [LANG]: `export const INTERFACE_LANGUAGES = [{ id: 'en', label: 'English' }]\n`,
      'apps/tracy-web/src/lib/i18n/strings.js': `export const en = { hello: 'Hello', ...imported }\n`
    },
    keeps: 'web-string:hello@en'
  }
]
for (const c of partial)
  test(`partial literal is incomplete, known items kept: ${c.name}`, () => {
    const rec = runExtractor(c.def, makeRoot(c.files))
    assert.equal(rec.status, 'incomplete')
    assert.match(rec.incompleteReason, /hides items/)
    assert.ok(
      rec.items.some((i) => i.id === c.keeps),
      `${c.keeps} is still listed`
    )
    assert.ok(rec.unresolved.some((u) => u.blocksComplete))
  })

test('control: a fully static languages literal stays complete', () => {
  const rec = runExtractor(
    languages,
    makeRoot({ [LANG]: `export const INTERFACE_LANGUAGES = [{ id: 'en', label: 'English' }]\n` })
  )
  assert.equal(rec.status, 'complete')
})

// Reachability: a function the root only declares registers nothing until something calls it.
const ROUTE_SNAPSHOT = json({
  public: { paths: { '/x': { get: {} }, '/y': { get: {} } } },
  internal: { paths: { '/i': { get: {} } } }
})
test('a route inside an uncalled function does not confirm its snapshot door; a called one does', () => {
  const root = makeRoot({
    'apps/tracy-web/api-reference.snapshot.json': ROUTE_SNAPSHOT,
    'apps/tracy-web/src/app.js': `import { Hono } from 'hono'
export function buildApp() {
  const app = new Hono()
  app.get('/i', h)
  function dormant() { app.get('/x', h) }
  const dormantArrow = () => { app.get('/x', h) }
  function live() { app.get('/y', h) }
  live()
  return app
}
`
  })
  const rec = runExtractor(apiDoors, root)
  const by = Object.fromEntries(rec.items.map((i) => [i.id, i]))
  assert.equal(by['api-door:public:GET /x'].inCode, false)
  assert.equal(by['api-door:public:GET /y'].inCode, true)
  assert.equal(by['api-door:internal:GET /i'].inCode, true)
  assert.ok(
    rec.unresolved.some((u) => u.kind === 'snapshot-door-without-code-route' && /GET \/x/.test(u.detail))
  )
})

// Binding, not name: a shadowing binding never falls back to an outer function or receiver of the same name,
// and a named callback handed to forEach is unresolved instead of silently skipped.
const routeApp = (body) =>
  makeRoot({
    'apps/tracy-web/api-reference.snapshot.json': ROUTE_SNAPSHOT,
    'apps/tracy-web/src/app.js': `import { Hono } from 'hono'
export function buildApp() {
  const app = new Hono()
${body}
  return app
}
`
  })
const routeDoors = (body) => {
  const rec = runExtractor(apiDoors, routeApp(body))
  return { rec, by: Object.fromEntries(rec.items.map((i) => [i.id, i])) }
}

test('a non-function variable named like an outer helper shadows it', () => {
  const { by } = routeDoors(`  function reg() { app.get('/x', h) }
  function inner() { const reg = 1; reg() }
  inner()`)
  assert.equal(by['api-door:public:GET /x'].inCode, false)
})

test('a parameter named like an outer receiver is not that receiver', () => {
  const { by } = routeDoors(`  function add(app) { app.get('/x', h) }
  add({ get() {} })`)
  assert.equal(by['api-door:public:GET /x'].inCode, false)
})

test('a receiver of the same name inside a nested function is not the composition-root receiver', () => {
  const { by } = routeDoors(`  function other() { const app = { get() {} }; app.get('/x', h) }
  other()`)
  assert.equal(by['api-door:public:GET /x'].inCode, false)
})

test('a named callback passed to forEach is blocking-unresolved, not a confirmed route', () => {
  const { rec, by } = routeDoors(`  const register = (p) => app.get(p, h)
  const reg2 = () => { app.get('/x', h) }
  ;['/a'].forEach(reg2)`)
  assert.equal(by['api-door:public:GET /x'].inCode, false)
  assert.ok(rec.unresolved.some((u) => u.kind === 'registration-in-callback' && u.blocksComplete))
  assert.notEqual(rec.completeness ?? rec.status, 'complete')
})

test('control: a helper or receiver of the same name that IS bound is confirmed', () => {
  const { by } = routeDoors(`  function reg() { app.get('/y', h) }
  reg()`)
  assert.equal(by['api-door:public:GET /y'].inCode, true)
})

// CLI: an empty or blank value is a missing value.
for (const [file, args] of [
  ['gates.mjs', ['--root', '']],
  ['gates.mjs', ['--root', '   ']],
  ['legacy-plan.mjs', ['--import', '']],
  ['legacy-findings.mjs', ['--import', '  ']]
])
  test(`CLI ${file} ${JSON.stringify(args)} exits 2 without output`, () => {
    const r = spawnSync(process.execPath, [`${EXT}${file}`, ...args], { encoding: 'utf8' })
    assert.equal(r.status, 2)
    assert.equal(r.stdout, '')
  })

// Importers read outside the repo and write inside it: neither side may follow a link or block on a FIFO.
test('importers refuse a FIFO, a symlink, a directory and a relative path, and write nothing', () => {
  const external = realpathSync(makeRoot({ 'dir/keep.txt': 'x' }))
  const fifo = join(external, 'ledger-S1.md')
  execFileSync('mkfifo', [fifo])
  const real = join(external, 'plan.md')
  writeFileSync(real, '# nothing\n')
  const link = join(external, 'link.md')
  symlinkSync(real, link)
  const repo = realpathSync(makeRoot({ 'tests/qa/inventory/legacy/.keep': '' }))
  for (const [label, run] of [
    ['FIFO ledger', () => importLedgers(external, repo)],
    ['symlinked plan', () => importPlan(link, repo)],
    ['directory as plan', () => importPlan(join(external, 'dir'), repo)],
    ['relative plan path', () => importPlan('plan.md', repo)],
    ['relative ledger dir', () => importLedgers('qa-run', repo)]
  ])
    assert.throws(run, SourceError, label)
  assert.deepEqual(readdirSync(join(repo, 'tests/qa/inventory/legacy')), ['.keep'])
})

test('importers will not write through a symlinked destination directory or file', () => {
  const external = realpathSync(makeRoot({}))
  const plan = join(external, 'plan.md')
  writeFileSync(plan, '## A section\n#### QA-SSR-001 A title\n')
  const outside = realpathSync(makeRoot({}))
  const repo = realpathSync(makeRoot({ 'tests/qa/inventory/x': '' }))
  symlinkSync(outside, join(repo, 'tests/qa/inventory/legacy'))
  assert.throws(() => importPlan(plan, repo), SourceError)
  assert.deepEqual(readdirSync(outside), [])
  rmSync(join(repo, 'tests/qa/inventory/legacy'))
  mkdirSync(join(repo, 'tests/qa/inventory/legacy'))
  const target = join(outside, 'target.json')
  writeFileSync(target, 'original')
  symlinkSync(target, join(repo, 'tests/qa/inventory/legacy/audit-plan.json'))
  assert.throws(() => importPlan(plan, repo), SourceError)
  assert.equal(readTextSync(target), 'original')
})

test('a ledger missing at the source keeps its earlier copy and is recorded unverified with the ENOENT probe', () => {
  const external = realpathSync(makeRoot({}))
  const repo = realpathSync(makeRoot({}))
  const ledger = (n) => `- F-S${n}-001 | P1 | QA-SSR-00${n} | a finding | \`a/b.js:${n}\`\n`
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) writeFileSync(join(external, `ledger-S${n}.md`), ledger(n))
  const first = importLedgers(external, repo)
  assert.ok(first.source.files.every((f) => f.verification.status === 'verified'))
  rmSync(join(external, 'ledger-S2.md'))
  const second = importLedgers(external, repo)
  assert.equal(second.findings.length, first.findings.length)
  const s2 = second.source.files.find((f) => f.file === 'ledger-S2.md')
  assert.deepEqual(s2.verification, { status: 'unverified', probe: 'ENOENT' })
  const rec = runExtractor(legacyFindings, repo)
  assert.ok(rec.unresolved.some((u) => u.kind === 'legacy-ledger-unverified' && /ledger-S2/.test(u.detail)))
  // a ledger that never existed cannot be kept
  rmSync(join(repo, 'tests/qa/inventory/legacy/audit-findings.json'))
  assert.throws(() => importLedgers(external, repo), /never imported/)
})

// Legacy provenance: an unverified or empty original keeps the source incomplete; the importer refuses unsafe copies.
const copyRoot = (files) => makeRoot(files)
const ledgerText = (n) => `- F-S${n}-001 | P1 | QA-SSR-00${n} | a finding | \`a/b.js:${n}\`\n`
const importAll = (external, repo) => {
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) writeFileSync(join(external, `ledger-S${n}.md`), ledgerText(n))
  return importLedgers(external, repo)
}

test('a readable ledger that yields no finding is refused, not recorded verified', () => {
  const external = realpathSync(makeRoot({}))
  const repo = realpathSync(copyRoot({}))
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) writeFileSync(join(external, `ledger-S${n}.md`), ledgerText(n))
  writeFileSync(join(external, 'ledger-S3.md'), '# nothing declared here\n')
  assert.throws(() => importLedgers(external, repo), /ledger-S3.md yields no finding/)
  assert.throws(() => readdirSync(join(repo, 'tests')), /ENOENT/)
})

test('an empty plan is refused by the importer', () => {
  const external = realpathSync(makeRoot({}))
  writeFileSync(join(external, 'plan.md'), '# no item\n')
  assert.throws(() => importPlan(join(external, 'plan.md'), realpathSync(copyRoot({}))), /yields no item/)
})

test('legacy sources whose original was not compared are incomplete, verified ones complete', () => {
  const external = realpathSync(makeRoot({}))
  const repo = realpathSync(copyRoot({}))
  importAll(external, repo)
  assert.equal(runExtractor(legacyFindings, repo).status, 'complete')
  rmSync(join(external, 'ledger-S2.md'))
  importLedgers(external, repo)
  const rec = runExtractor(legacyFindings, repo)
  assert.equal(rec.status, 'incomplete')
  assert.match(rec.incompleteReason, /hides items/)
})

test('a plan copy whose verification is not "verified" is incomplete', () => {
  const external = realpathSync(makeRoot({}))
  writeFileSync(join(external, 'plan.md'), '## A section\n#### QA-SSR-001 A title\n')
  const repo = realpathSync(copyRoot({}))
  const doc = importPlan(join(external, 'plan.md'), repo)
  assert.equal(runExtractor(legacyPlan, repo).status, 'complete')
  doc.source.verification = { status: 'unverified', probe: 'ENOENT' }
  writeFileSync(join(repo, 'tests/qa/inventory/legacy/audit-plan.json'), JSON.stringify(doc))
  assert.equal(runExtractor(legacyPlan, repo).status, 'incomplete')
})

test('an earlier copy that is a FIFO or a symlink is refused before it is read', () => {
  const external = realpathSync(makeRoot({}))
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) writeFileSync(join(external, `ledger-S${n}.md`), ledgerText(n))
  writeFileSync(join(external, 'plan.md'), '## A section\n#### QA-SSR-001 A title\n')
  const outside = realpathSync(makeRoot({ 'x.json': '{}' }))
  const runs = {
    'audit-findings.json': (repo) => importLedgers(external, repo),
    'audit-plan.json': (repo) => importPlan(join(external, 'plan.md'), repo)
  }
  for (const [name, run] of Object.entries(runs))
    for (const kind of ['fifo', 'symlink']) {
      const repo = realpathSync(copyRoot({ 'tests/qa/inventory/legacy/.keep': '' }))
      const target = join(repo, 'tests/qa/inventory/legacy', name)
      if (kind === 'fifo') execFileSync('mkfifo', [target])
      else symlinkSync(join(outside, 'x.json'), target)
      assert.throws(() => run(repo), SourceError, `${name} ${kind}`)
    }
})

test('an unknown original revision stays null: it neither reuses an earlier one nor takes the repository head', () => {
  const external = realpathSync(makeRoot({}))
  const repo = realpathSync(copyRoot({}))
  const doc = importAll(external, repo)
  // the scratch ledger directory is not a git repository
  assert.equal(doc.source.revision, null)
  writeFileSync(join(external, 'plan.md'), '## A section\n#### QA-SSR-001 A title\n')
  assert.equal(importPlan(join(external, 'plan.md'), repo).source.revision, null)
})

// Provenance schema: a copy that keeps findings for S1..S8 but lacks (part of) the metadata is incomplete.
const LEGACY_DIR = 'tests/qa/inventory/legacy'
const goodFindings = () => {
  const external = realpathSync(makeRoot({}))
  const repo = realpathSync(copyRoot({}))
  importAll(external, repo)
  return { repo, doc: JSON.parse(readTextSync(join(repo, LEGACY_DIR, 'audit-findings.json'))) }
}
const goodPlan = () => {
  const external = realpathSync(makeRoot({}))
  writeFileSync(join(external, 'plan.md'), '## A section\n#### QA-SSR-001 A title\n')
  const repo = realpathSync(copyRoot({}))
  return { repo, doc: importPlan(join(external, 'plan.md'), repo) }
}
const FINDINGS_MUTATIONS = {
  'source.files removed': (d) => delete d.source.files,
  'one shard metadata removed': (d) => d.source.files.splice(2, 1),
  'sha256 blank': (d) => (d.source.files[0].sha256 = ''),
  'shard listed twice': (d) => d.source.files.push({ ...d.source.files[0] }),
  'verified with a wrong probe': (d) => (d.source.files[0].verification.probe = 'guess'),
  'unverified without a probe': (d) => (d.source.files[1].verification = { status: 'unverified' }),
  'finding filed under the wrong shard': (d) => (d.findings[0].shard = 'S2'),
  'a shard has no finding': (d) => (d.findings = d.findings.filter((f) => f.shard !== 'S4')),
  'source block removed': (d) => delete d.source
}
for (const [name, mutate] of Object.entries(FINDINGS_MUTATIONS))
  test(`findings copy with ${name} is incomplete`, () => {
    const { repo, doc } = goodFindings()
    assert.equal(
      runExtractor(legacyFindings, repo).status,
      'complete',
      'control: a well-formed verified copy'
    )
    mutate(doc)
    writeFileSync(join(repo, LEGACY_DIR, 'audit-findings.json'), JSON.stringify(doc))
    const rec = runExtractor(legacyFindings, repo)
    assert.equal(rec.status, 'incomplete')
    assert.ok(rec.unresolved.some((u) => u.kind === 'legacy-provenance-invalid' && u.blocksComplete))
  })
const PLAN_MUTATIONS = {
  'no sha256': (d) => delete d.source.sha256,
  'no source path': (d) => delete d.source.path,
  'a revision that is not a git hash': (d) => (d.source.revision = 'unknown'),
  'a duplicate item id': (d) => d.items.push({ ...d.items[0] }),
  'no items': (d) => (d.items = [])
}
for (const [name, mutate] of Object.entries(PLAN_MUTATIONS))
  test(`plan copy marked verified but with ${name} is incomplete`, () => {
    const { repo, doc } = goodPlan()
    assert.equal(runExtractor(legacyPlan, repo).status, 'complete')
    mutate(doc)
    writeFileSync(join(repo, LEGACY_DIR, 'audit-plan.json'), JSON.stringify(doc))
    const rec = runExtractor(legacyPlan, repo)
    assert.equal(rec.status, 'incomplete')
    assert.ok(rec.unresolved.some((u) => u.kind === 'legacy-provenance-invalid'))
  })

// A symlinked parent directory with a missing child is not a first import and creates nothing outside the root.
test('a symlinked parent of a missing copy is refused and nothing is created outside', () => {
  const external = realpathSync(makeRoot({}))
  for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) writeFileSync(join(external, `ledger-S${n}.md`), ledgerText(n))
  writeFileSync(join(external, 'plan.md'), '## A section\n#### QA-SSR-001 A title\n')
  const outside = realpathSync(makeRoot({}))
  const repo = realpathSync(copyRoot({}))
  mkdirSync(join(repo, 'tests/qa'), { recursive: true })
  symlinkSync(outside, join(repo, 'tests/qa/inventory'))
  assert.throws(() => importLedgers(external, repo), SourceError)
  assert.throws(() => importPlan(join(external, 'plan.md'), repo), SourceError)
  assert.throws(() => readSource(repo, `${LEGACY_DIR}/x.json`), SourceError)
  assert.deepEqual(readdirSync(outside), [], 'nothing was created through the link')
  assert.throws(() => writeRepoFile(repo, `${LEGACY_DIR}/new/x.json`, '{}'), SourceError)
  assert.deepEqual(readdirSync(outside), [])
})
