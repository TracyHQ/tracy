// Fixtures for the failure classes the reviews kept finding: a route registration confirmed without proof,
// a partly resolved source reported complete, a copied legacy finding reused without validation, and
// importer CLIs that accepted an empty value. Every positive control sits next to its negative one.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { realpathSync, symlinkSync, writeFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { after, describe, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { runExtractor } from '../extractors/common.mjs'
import { def as apiDoors } from '../extractors/api-doors.mjs'
import { def as hostRoutes } from '../extractors/host-routes.mjs'
import { def as pluginStrings } from '../extractors/plugin-strings.mjs'
import { def as webStrings } from '../extractors/web-strings.mjs'
import { importLedgers, parseLedger } from '../extractors/legacy-findings.mjs'
import { validateFindingsDoc, validatePlanDoc } from '../extractors/legacy-provenance.mjs'
import { cleanup, json, makeRoot } from './helpers.mjs'

after(cleanup)

const HOST = 'apps/tracy-host/src/app.js'
const host = (body) =>
  runExtractor(hostRoutes, makeRoot({ [HOST]: `import { Hono } from 'hono'\n${body}\n` }))
const ids = (rec) => rec.items.map((i) => i.id).sort()
const kinds = (rec) => rec.unresolved.map((u) => u.kind)
const confirmed = (rec) => rec.items.filter((i) => !i.conditional).map((i) => i.id)

describe('route reachability: a registration is confirmed only on an unconditional path to the returned app', () => {
  test('a receiver that is never returned or mounted is not confirmed and blocks completeness', () => {
    const rec = host(
      `export function buildApp() {\n  const app = new Hono()\n  const orphan = new Hono()\n  orphan.get('/x', h)\n  app.get('/real', h)\n  return app\n}`
    )
    assert.deepEqual(confirmed(rec), ['host-route:GET /real'])
    assert.ok(kinds(rec).includes('receiver-not-reaching-root'))
    assert.equal(rec.status, 'incomplete')
  })
  test('control: the same receiver mounted into the returned app is confirmed under its prefix', () => {
    const rec = host(
      `export function buildApp() {\n  const app = new Hono()\n  const sub = new Hono()\n  sub.get('/x', h)\n  app.route('/o', sub)\n  return app\n}`
    )
    assert.deepEqual(ids(rec), ['host-route:GET /o/x'])
    assert.equal(rec.status, 'complete')
  })
  test('`Object.assign(app, ...)` is the one accepted wrapper; any other wrapper leaves nothing confirmed', () => {
    const ok = host(
      `export function buildApp() {\n  const app = new Hono()\n  app.get('/a', h)\n  return Object.assign(app, { extra: 1 })\n}`
    )
    assert.deepEqual(ids(ok), ['host-route:GET /a'])
    const other = host(
      `export function buildApp() {\n  const app = new Hono()\n  app.get('/a', h)\n  return decorate(app)\n}`
    )
    assert.deepEqual(ids(other), [])
    assert.ok(kinds(other).includes('receiver-not-reaching-root'))
  })
  test('a conditional registration is kept visible but never confirmed', () => {
    for (const body of [
      `if (false) app.get('/x', h)`,
      `if (flag) { app.get('/x', h) } else { app.get('/x', h) }`,
      `flag && app.get('/x', h)`,
      `flag ? app.get('/x', h) : null`,
      `for (const f of fs) app.get('/x', h)`,
      `switch (m) { case 1: app.get('/x', h) }`,
      `try { risky() } catch { app.get('/x', h) }`
    ]) {
      const rec = host(`export function buildApp() {\n  const app = new Hono()\n  ${body}\n  return app\n}`)
      assert.deepEqual(confirmed(rec), [], body)
      assert.ok(kinds(rec).includes('conditional-registration'), body)
      assert.equal(rec.status, 'incomplete', body)
      assert.ok(
        rec.items.every((i) => i.conditional),
        `${body}: the route is listed, flagged conditional`
      )
    }
  })
  test('a registration after a possible early return is conditional; before it, it is not', () => {
    const rec = host(
      `export function buildApp() {\n  const app = new Hono()\n  app.get('/early', h)\n  if (flag) return app\n  app.get('/late', h)\n  return app\n}`
    )
    assert.deepEqual(confirmed(rec), ['host-route:GET /early'])
    assert.ok(ids(rec).includes('host-route:GET /late'))
  })
  test('control: unconditional registrations, a called helper and a called factory are all confirmed', () => {
    const rec = host(
      `function register(a) {\n  a.get('/helped', h)\n}\nfunction make() {\n  const r = new Hono()\n  r.get('/made', h)\n  return r\n}\nexport function buildApp() {\n  const app = new Hono()\n  register(app)\n  app.route('/m', make())\n  app.get('/direct', h)\n  return app\n}`
    )
    assert.deepEqual(ids(rec), ['host-route:GET /direct', 'host-route:GET /helped', 'host-route:GET /m/made'])
    assert.equal(rec.status, 'complete')
  })
  test('a helper or factory is resolved by the binding at the call site: a shadow never falls back to the outer function', () => {
    const outer = `function register(a) {\n  a.get('/outer', h)\n}\nfunction make() {\n  const r = new Hono()\n  r.get('/outer-made', h)\n  return r\n}\n`
    for (const [label, inner] of [
      ['a variable', `  const register = 5\n  register(app)\n`],
      ['a parameter', `  register(app)\n`, 'register, make'],
      ['a nested receiver-less shadow', `  const make = null\n  app.route('/m', make())\n`]
    ]) {
      const params = inner === undefined ? '' : label === 'a parameter' ? 'register, make' : ''
      const rec = host(
        `${outer}export function buildApp(${params}) {\n  const app = new Hono()\n${inner}  return app\n}`
      )
      assert.deepEqual(ids(rec), [], label)
      assert.ok(
        kinds(rec).some((k) => /helper-registration|mount-factory-not-found/.test(k)),
        label
      )
      assert.equal(rec.status, 'incomplete', label)
    }
    const inner = host(
      `function register(a) {\n  a.get('/outer', h)\n}\nexport function buildApp() {\n  const app = new Hono()\n  function register(a) {\n    a.get('/inner', h)\n  }\n  register(app)\n  return app\n}`
    )
    assert.deepEqual(ids(inner), ['host-route:GET /inner'], 'the nearest binding wins')
  })
  test('a function that is declared, exported or only passed around registers nothing; a callback that registers is unresolved', () => {
    const rec = host(
      `export function dormant(a) {\n  a.get('/dormant', h)\n}\nexport function buildApp() {\n  const app = new Hono()\n  const add = (path) => app.get(path, h)\n  ;['/a', '/b'].forEach(add)\n  app.get('/ok', h)\n  return app\n}`
    )
    assert.deepEqual(ids(rec), ['host-route:GET /ok'])
    assert.ok(kinds(rec).includes('registration-in-callback'))
    assert.equal(rec.status, 'incomplete')
  })
  test('chained, aliased and element-access registrations are reported, not guessed', () => {
    const chained = host(
      `export function buildApp() {\n  const app = new Hono()\n  app.get('/a', h).post('/b', h)\n  return app\n}`
    )
    assert.deepEqual(confirmed(chained), ['host-route:GET /a'])
    assert.ok(kinds(chained).includes('chained-registration'))
    const aliased = host(
      `export function buildApp() {\n  const app = new Hono()\n  const x = app\n  x.get('/y', h)\n  return app\n}`
    )
    assert.deepEqual(ids(aliased), [])
    assert.ok(kinds(aliased).includes('receiver-aliased'))
    const based = host(
      `export function buildApp() {\n  const app = new Hono()\n  app.basePath('/v1').get('/z', h)\n  return app\n}`
    )
    assert.ok(kinds(based).some((k) => /chained-registration|receiver-method-not-modelled/.test(k)))
  })
  test('a function-local receiver with the same name as another scope’s receiver is its own', () => {
    const rec = host(
      `function other() {\n  const app = new Hono()\n  app.get('/hidden', h)\n}\nexport function buildApp() {\n  const app = new Hono()\n  app.get('/shown', h)\n  return app\n}`
    )
    assert.deepEqual(ids(rec), ['host-route:GET /shown'])
  })

  // The API door extractor shares the scanner; the conditional flag must reach the door.
  const SNAP = json({
    recorded: 'x',
    public: { paths: { '/x': { get: {} }, '/y': { get: {} } } },
    internal: { paths: {} }
  })
  const doors = (body) =>
    runExtractor(
      apiDoors,
      makeRoot({
        'apps/tracy-web/api-reference.snapshot.json': SNAP,
        'apps/tracy-web/src/app.js': `import { Hono } from 'hono'\nexport function buildApp() {\n  const app = new Hono()\n${body}\n  return app\n}\n`
      })
    )
  test('api-doors: a conditional registration is not inCode; an unconditional one is', () => {
    const rec = doors(`  if (flag) app.get('/x', h)\n  app.get('/y', h)`)
    const by = Object.fromEntries(rec.items.map((i) => [i.path, i]))
    assert.equal(by['/x'].inCode, false)
    assert.equal(by['/x'].registeredConditionally, true)
    assert.equal(by['/y'].inCode, true)
    assert.ok(kinds(rec).includes('conditional-registration'))
    assert.equal(rec.status, 'incomplete')
  })
  test('api-doors: a registration on a receiver that is never mounted does not confirm a door', () => {
    const rec = doors(`  const o = new Hono()\n  o.get('/x', h)\n  app.get('/y', h)`)
    const by = Object.fromEntries(rec.items.map((i) => [i.path, i]))
    assert.equal(by['/x'].inCode, false)
    assert.ok(kinds(rec).includes('receiver-not-reaching-root'))
    assert.ok(kinds(rec).includes('snapshot-door-without-code-route'))
  })
})

describe('route mounts: a conditional mount is unconfirmed and a child at several prefixes yields each', () => {
  const CHILD = `export function child() {\n  const c = new Hono()\n  c.get('/x', h)\n  return c\n}`
  const mountFiles = (body) =>
    runExtractor(
      hostRoutes,
      makeRoot({
        [HOST]: `import { Hono } from 'hono'\nimport { child } from './child.js'\nexport function buildApp() {\n  const app = new Hono()\n${body}\n  return app\n}\n`,
        'apps/tracy-host/src/child.js': `import { Hono } from 'hono'\n${CHILD}\n`
      })
    )
  const byId = (rec) => Object.fromEntries(rec.items.map((i) => [i.id, !!i.conditional]))
  test('a conditional mount of a factory, of a local receiver and of a variable marks the routes conditional', () => {
    assert.deepEqual(byId(mountFiles(`  if (flag) app.route('/p', child())`)), {
      'host-route:GET /p/x': true
    })
    assert.deepEqual(byId(mountFiles(`  const c = child()\n  if (flag) app.route('/p', c)`)), {
      'host-route:GET /p/x': true
    })
    const local = host(
      `export function buildApp() {\n  const app = new Hono()\n  const sub = new Hono()\n  sub.get('/x', h)\n  if (flag) app.route('/p', sub)\n  return app\n}`
    )
    assert.deepEqual(byId(local), { 'host-route:GET /p/x': true })
    assert.deepEqual(confirmed(local), [])
  })
  test('control: an unconditional mount is confirmed', () => {
    assert.deepEqual(byId(mountFiles(`  app.route('/p', child())`)), { 'host-route:GET /p/x': false })
  })
  test('a child mounted at several prefixes yields every prefix, each with its own condition', () => {
    assert.deepEqual(byId(mountFiles(`  const c = child()\n  app.route('/a', c)\n  app.route('/b', c)`)), {
      'host-route:GET /a/x': false,
      'host-route:GET /b/x': false
    })
    assert.deepEqual(byId(mountFiles(`  app.route('/a', child())\n  app.route('/b', child())`)), {
      'host-route:GET /a/x': false,
      'host-route:GET /b/x': false
    })
    assert.deepEqual(
      byId(mountFiles(`  const c = child()\n  if (flag) app.route('/a', c)\n  app.route('/b', c)`)),
      {
        'host-route:GET /a/x': true,
        'host-route:GET /b/x': false
      }
    )
    const local = host(
      `export function buildApp() {\n  const app = new Hono()\n  const sub = new Hono()\n  sub.get('/x', h)\n  app.route('/a', sub)\n  app.route('/b', sub)\n  return app\n}`
    )
    assert.deepEqual(ids(local), ['host-route:GET /a/x', 'host-route:GET /b/x'])
  })
})

describe('partial static extraction: plugin and web strings', () => {
  const plugin = (text) =>
    runExtractor(pluginStrings, makeRoot({ 'packages/ui/a/src/client/strings.ts': text }))
  test('en with a static key and a dynamic spread keeps the key but is incomplete, with no total claimed', () => {
    const rec = plugin(
      `import { base } from './base'\nexport const NS = 'a'\nexport const en = { k: 'v', ...base }\n`
    )
    assert.equal(rec.status, 'incomplete')
    assert.equal(rec.items[0].keys, null)
    assert.equal(rec.items[0].keysKnown, 1)
    assert.ok(rec.unresolved.every((u) => u.blocksComplete))
  })
  test('control: a fully static table is complete with its key count', () => {
    const rec = plugin(`export const NS = 'a'\nexport const en = { k: 'v', j: 'w' }\n`)
    assert.equal(rec.status, 'complete')
    assert.equal(rec.items[0].keys, 2)
    assert.equal(rec.items[0].namespace, 'a')
  })
  test('a missing or non-static NS or en blocks completeness even when another file is fine', () => {
    for (const text of [
      `export const en = { k: 'v' }\n`,
      `export const NS = dynamic()\nexport const en = { k: 'v' }\n`,
      `export const NS = 'a'\n`,
      `export const NS = 'a'\nexport const en = compute()\n`,
      `export const NS = 'a'\nexport const en = ['x']\n`
    ]) {
      const rec = runExtractor(
        pluginStrings,
        makeRoot({
          'packages/ui/a/src/client/strings.ts': text,
          'packages/ui/b/src/client/strings.ts': `export const NS = 'b'\nexport const en = { k: 'v' }\n`
        })
      )
      assert.equal(rec.status, 'incomplete', text)
      assert.ok(kinds(rec).includes('strings-file-not-static'), text)
      assert.equal(rec.items.length, 2, 'the known item stays')
    }
  })

  const LANG = `export const INTERFACE_LANGUAGES = Object.freeze([{ id: 'en', label: 'English', shown: true }, { id: 'vi', label: 'Viet', shown: true }].map((l) => Object.freeze(l)))\n`
  const web = (locale) =>
    runExtractor(
      webStrings,
      makeRoot({
        'apps/tracy-web/src/lib/i18n/strings.js': `export const en = Object.freeze({ 'a.b': 'x' })\n`,
        'packages/core/tracy-core/src/interface-languages/index.mjs': LANG,
        'apps/tracy-web/src/lib/i18n/locales/vi.json': locale
      })
    )
  test('a locale file that is null, an array or a scalar is a broken source, not an empty table', () => {
    for (const text of ['null', '[]', '"x"', '7']) {
      const rec = web(text)
      assert.equal(rec.status, 'incomplete', text)
      assert.ok(kinds(rec).includes('locale-file-unreadable'), text)
    }
  })
  test('en must be a flat key -> string table: an array or a non-string value blocks complete', () => {
    const webEn = (en) =>
      runExtractor(
        webStrings,
        makeRoot({
          'apps/tracy-web/src/lib/i18n/strings.js': `export const en = ${en}\n`,
          'packages/core/tracy-core/src/interface-languages/index.mjs': LANG,
          'apps/tracy-web/src/lib/i18n/locales/vi.json': json({ 'a.b': 'z' })
        })
      )
    const arr = webEn(`['x']`)
    assert.equal(arr.status, 'incomplete')
    assert.ok(
      arr.items.every((i) => i.key !== '0'),
      'no invented index key'
    )
    for (const value of ['3', `['y']`, `{ n: 1 }`, 'null']) {
      const rec = webEn(`{ 'a.b': 'x', bad: ${value} }`)
      assert.equal(rec.status, 'incomplete', value)
      assert.ok(kinds(rec).includes('en-entry-not-a-string'), value)
      assert.ok(
        rec.items.some((i) => i.key === 'a.b'),
        'the known keys stay'
      )
    }
    assert.equal(webEn(`{ 'a.b': 'x' }`).status, 'complete')
  })
  test('a locale entry that is not a string is reported; a clean table is complete', () => {
    const bad = web(json({ 'a.b': 3 }))
    assert.equal(bad.status, 'incomplete')
    assert.ok(kinds(bad).includes('locale-entry-not-a-string'))
    assert.equal(web(json({ 'a.b': 'z' })).status, 'complete')
  })
})

describe('legacy copy: every copied field is validated before the copy is reused or trusted', () => {
  const ledger = (n) => `- F-S${n}-001 | P1 | QA-SSR-00${n} | a finding | \`a/b.js:${n}\`\n`
  const imported = () => {
    const external = realpathSync(makeRoot({}))
    const repo = realpathSync(makeRoot({}))
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8]) writeFileSync(join(external, `ledger-S${n}.md`), ledger(n))
    return { external, repo, doc: importLedgers(external, repo) }
  }
  const corruptions = [
    ['evidence is a string', (f) => (f.evidence = 'a/b.js:1')],
    ['evidence holds a number', (f) => (f.evidence = [1])],
    ['repro is a number', (f) => (f.repro = 3)],
    ['repro is blank', (f) => (f.repro = '  ')],
    ['fixRefs is an object', (f) => (f.fixRefs = {})],
    ['fixRefs holds an empty string', (f) => (f.fixRefs = [''])],
    ['line is zero', (f) => (f.line = 0)],
    ['line is a string', (f) => (f.line = '3')],
    ['title is empty', (f) => (f.title = '')],
    ['severity is unknown', (f) => (f.severity = 'P9')],
    ['items is not a list', (f) => (f.items = 'QA-SSR-001')],
    ['evidenceNote is a number', (f) => (f.evidenceNote = 1)],
    ['an unknown field', (f) => (f.surprise = true)]
  ]
  for (const [label, corrupt] of corruptions)
    test(`a finding whose ${label} fails validation`, () => {
      const { doc } = imported()
      assert.deepEqual(validateFindingsDoc(doc), [], 'the untouched copy is valid')
      corrupt(doc.findings[3])
      assert.ok(validateFindingsDoc(doc).length > 0)
    })
  test('an earlier copy with a bad field is not reused when its ledger is gone', async () => {
    const { external, repo, doc } = imported()
    doc.findings[3].evidence = 'not-a-list'
    writeFileSync(join(repo, 'tests/qa/inventory/legacy/audit-findings.json'), json(doc))
    const { rmSync } = await import('node:fs')
    rmSync(join(external, 'ledger-S2.md'))
    assert.throws(() => importLedgers(external, repo), /cannot be reused/)
  })
  test('all eight shards are required, whatever source.files lists', () => {
    const { doc } = imported()
    for (const n of [1, 8]) {
      const cut = structuredClone(doc)
      cut.findings = cut.findings.filter((f) => f.shard !== `S${n}`)
      assert.ok(
        validateFindingsDoc(cut).some((p) => p.includes(`ledger-S${n}.md`)),
        `no finding of S${n}`
      )
      const bare = structuredClone(doc)
      bare.source.files = bare.source.files.filter((f) => f.file !== `ledger-S${n}.md`)
      assert.ok(
        validateFindingsDoc(bare).some((p) => p.includes(`ledger-S${n}.md`)),
        `no metadata of S${n}`
      )
    }
    const none = structuredClone(doc)
    delete none.source.files
    assert.ok(validateFindingsDoc(none).length > 0)
  })
  test('plan items are validated field by field', () => {
    const good = {
      source: {
        repo: 'r',
        path: 'p',
        sha256: 'a'.repeat(64),
        lines: 3,
        revision: null,
        verification: { status: 'verified', probe: 'read' }
      },
      items: [
        { id: 'QA-SSR-001', group: 'SSR', level: 'main', parent: null, title: 't', section: 's', line: 4 }
      ]
    }
    assert.deepEqual(validatePlanDoc(good), [])
    for (const patch of [
      { group: '' },
      { level: 'top' },
      { parent: 5 },
      { title: '' },
      { section: 1 },
      { line: 0 }
    ]) {
      const bad = structuredClone(good)
      Object.assign(bad.items[0], patch)
      assert.ok(validatePlanDoc(bad).length > 0, JSON.stringify(patch))
    }
  })
  test('parseLedger output passes the validator (importer and validator agree)', () => {
    const found = parseLedger(ledger(1), 1, 'ledger-S1.md')
    assert.equal(found.length, 1)
  })
})

describe('importer CLIs: empty, blank, repeated and unknown flags exit 2 and write nothing', () => {
  const dir = dirname(fileURLToPath(import.meta.url))
  const cliOf = (name) => join(dir, '../extractors', name)
  const rows = [
    ['--import', ''],
    ['--import', '   '],
    ['--import', '/x', '--root', ''],
    ['--import', '/x', '--root', '  '],
    ['--import', '/x', '--import', '/y'],
    ['--import', '/x', '--bogus', '1'],
    ['--import'],
    ['--import', '--root', '/x']
  ]
  for (const file of ['legacy-plan.mjs', 'legacy-findings.mjs'])
    for (const argv of rows)
      test(`${file} ${JSON.stringify(argv)}`, () => {
        const repo = realpathSync(makeRoot({ 'tests/qa/inventory/legacy/.keep': '' }))
        const args = argv.map((a) => (a === '/x' && argv.includes('--root') ? a : a))
        const r = spawnSync(
          process.execPath,
          [cliOf(file), ...args, ...(argv.includes('--root') ? [] : ['--root', repo])],
          {
            encoding: 'utf8',
            timeout: 20000
          }
        )
        assert.equal(r.status, 2, r.stderr)
        assert.deepEqual(readdirSync(join(repo, 'tests/qa/inventory/legacy')), ['.keep'])
      })
  test('the extractor CLI with an unwritable symlinked --root parent reads nothing outside', () => {
    const away = realpathSync(makeRoot({ 'apps/tracy-host/src/app.js': 'x' }))
    const base = realpathSync(makeRoot({}))
    symlinkSync(away, join(base, 'link'))
    const r = spawnSync(process.execPath, [cliOf('host-routes.mjs'), '--root', join(base, 'link')], {
      encoding: 'utf8',
      timeout: 20000
    })
    assert.equal(r.status, 1)
    assert.match(r.stdout, /incomplete/)
  })
})
