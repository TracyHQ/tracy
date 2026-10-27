// migrate-port.mjs: a dossier made by an older skill, held to this one's contract preflight — diagnosed by
// class, repaired only where the repair is provable, and left alone otherwise.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { bindingsFrom } from '../lib/canonical.mjs'
import { parseDecisions } from '../lib/parity-acceptance.mjs'
import { initContract } from '../visual/contract.mjs'
import { contractProblems } from '../quickstart/release.mjs'
import { CLASSES, deriveKey, diagnose, insertKeys, markdownOf, migrate, reportOf, tokensOf } from '../migrate-port.mjs'
import { designContract } from './quickstart-contracts.mjs'
import { testDir } from './lib/test-root.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(HERE, '..', 'migrate-port.mjs')
const hasUnzip = spawnSync('unzip', ['-v']).status === 0

// A stored (uncompressed) zip: the fixture theme the contract's templates are checked against.
function zipOf(files) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (b) => {
    let c = 0xffffffff
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8)
    return (c ^ 0xffffffff) >>> 0
  }
  const parts = []
  const central = []
  let offset = 0
  for (const [name, text] of Object.entries(files)) {
    const data = Buffer.from(text)
    const n = Buffer.from(name)
    const h = Buffer.alloc(30)
    h.writeUInt32LE(0x04034b50, 0)
    h.writeUInt16LE(20, 4)
    h.writeUInt32LE(crc(data), 14)
    h.writeUInt32LE(data.length, 18)
    h.writeUInt32LE(data.length, 22)
    h.writeUInt16LE(n.length, 26)
    parts.push(h, n, data)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt32LE(crc(data), 16)
    c.writeUInt32LE(data.length, 20)
    c.writeUInt32LE(data.length, 24)
    c.writeUInt16LE(n.length, 28)
    c.writeUInt32LE(offset, 42)
    central.push(c, n)
    offset += 30 + n.length + data.length
  }
  const size = central.reduce((s, b) => s + b.length, 0)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(central.length / 2, 8)
  end.writeUInt16LE(central.length / 2, 10)
  end.writeUInt32LE(size, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, ...central, end])
}

const DECISIONS = `# Decisions

| ID | Decision |
|---|---|
| D-01 | The card link a.hx-card keeps the source's font family; the port draws it in the body face. |
| D-02 | The footer wording is shortened; nothing else in the footer changes. |
| D-03 | The newsletter strip is not drawn. |
| D-03 | The newsletter strip is drawn after all, as a plain paragraph. |
| D-04 | The hero banner keeps its height at 390 px. |
`
const EXCEPTIONS = [
  { kind: 'parity-mismatch', match: '"element":"a\\.hx-card".*"property":"font-family"', reason: 'The port draws the card link in the body face.', decision: 'D-01' },
  { kind: 'parity-mismatch', match: '"element":"footer p"', reason: 'Shorter footer wording.', decision: 'D-02' },
  { kind: 'image-missing', match: '"page":"en-about"', reason: 'Both decisions touch the page.', decision: 'D-01 and D-02' },
  { kind: 'image-missing', match: '"page":"en-home","source":3', reason: 'No decision written for it.' },
  { kind: 'image-missing', match: '"page":"en-home","source":4', reason: 'A group label, not a decision.', decision: 'G67' },
  { kind: 'image-missing', match: '"page":"en-home","source":5', reason: 'A decision nobody wrote.', decision: 'D-99' },
  { kind: 'image-missing', match: '"element":"newsletter"', reason: 'Defined twice.', decision: 'D-03' },
  { kind: 'examined-too-few', match: '"page":"en-about","examined"', reason: 'Fine already.', decision: 'D-04', key: 'hero' }
]
const CONFIG = (exceptions) => `{
  "$comment": "fixture, hand formatted like the real ones",
  "expectedSelectors": [".hx-header", ".hx-footer", "main"],
  "mega": false,
  "containers": { "none": "the fixture has no container grid" },
  "templates": { "/": "front-page", "/about": "page" },
  "visual": {
    "exceptions": [
${exceptions.map((e) => '      ' + JSON.stringify(e, null, 2).replace(/\n/g, '\n      ')).join(',\n')}
    ]
  }
}
`
const PAGE_MAP = {
  locales: ['en'],
  defaultLocale: 'en',
  source: { kind: 'html' },
  pages: [
    { file: 'Home.html', view: 'front-page', title: 'Home', path: '/', locale: 'en' },
    { file: 'About.html', view: 'page', title: 'About', path: '/about', locale: 'en' }
  ]
}
const sha = (b) => createHash('sha256').update(b).digest('hex')

/** A dossier as an older skill left it: spec-pack, config, DECISIONS.md, both contracts generated and bound, a theme zip. */
async function dossier(name, { exceptions = EXCEPTIONS, decisions = DECISIONS } = {}) {
  const root = testDir(name)
  const spec = path.join(root, 'spec')
  mkdirSync(spec)
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify(PAGE_MAP))
  writeFileSync(path.join(spec, 'sections.json'), JSON.stringify({ slotBlock: 'tracy-base/slot', acm: [], custom: [], other: [] }))
  writeFileSync(path.join(spec, 'content.json'), '{"v":1}')
  const zip = path.join(root, 'wp-fixture.zip')
  writeFileSync(zip, zipOf({ 'wp-fixture/templates/front-page.html': '<!-- home -->', 'wp-fixture/templates/page.html': '<!-- page -->', 'wp-fixture/style.css': '/* theme */' }))
  const theme = path.join(root, 'built', 'wp-fixture')
  mkdirSync(path.join(theme, 'templates'), { recursive: true })
  for (const t of ['front-page', 'page']) writeFileSync(path.join(theme, 'templates', `${t}.html`), '<!-- t -->')
  writeFileSync(path.join(root, 'review.config.json'), CONFIG(exceptions))
  writeFileSync(path.join(root, 'DECISIONS.md'), decisions)
  const visual = await initContract({ specDir: spec, configFile: path.join(root, 'review.config.json'), artifactPath: zip, id: 'fixture', builtTheme: theme, site: 'http://127.0.0.1:8081' })
  writeFileSync(path.join(root, 'visual.contract.json'), JSON.stringify(visual, null, 2) + '\n')
  const body = designContract({})
  delete body.bindings
  writeFileSync(path.join(spec, 'design-contract.json'), JSON.stringify(body, null, 2) + '\n')
  writeFileSync(path.join(root, 'design-contract.json'), JSON.stringify({ ...body, bindings: bindingsFrom({ specDir: spec, artifactPath: zip }) }, null, 2) + '\n')
  return { root, spec, zip }
}

const opts = (d, more = {}) => ({ runRoot: d.root, spec: d.spec, themeZip: d.zip, ...more })
const classesOf = (r) => Object.fromEntries(r.findings.reduce((m, f) => m.set(f.class, (m.get(f.class) ?? 0) + (f.count ?? 1)), new Map()))
/** Every file under `dir` (attempts/ left out) with its hash: what "nothing changed" means. */
function snapshot(dir) {
  const out = {}
  const walk = (d) => {
    for (const e of readdirSync(d).sort()) {
      const p = path.join(d, e)
      if (statSync(p).isDirectory()) {
        if (e !== 'attempts') walk(p)
      } else out[path.relative(dir, p)] = sha(readFileSync(p))
    }
  }
  walk(dir)
  return out
}

test('migrate-port: diagnosis names every class once, with the reason it is mechanical or manual', async () => {
  const d = await dossier('mp-diagnose')
  const r = await diagnose(opts(d))
  assert.equal(r.before.ok, false)
  assert.deepEqual(classesOf(r), {
    'exception-key-derivable': 1,
    'exception-key-underivable': 1,
    'exception-decision-several': 1,
    'exception-decision-none': 1,
    'exception-decision-unknown': 1,
    'exception-decision-missing': 1,
    'exception-decision-duplicate': 1,
    'contract-invalid-other': 1
  })
  for (const f of r.findings) assert.ok(CLASSES[f.class]?.why, `${f.class} has a reason`)
  assert.deepEqual(r.findings.filter((f) => CLASSES[f.class].mechanical).map((f) => f.class), ['exception-key-derivable'])
  const several = r.findings.find((f) => f.class === 'exception-decision-several')
  assert.deepEqual(several.candidates.map((c) => c.id), ['D-01', 'D-02'])
  assert.equal(r.findings.find((f) => f.class === 'exception-decision-none').index, 3)
  assert.equal(r.findings.find((f) => f.class === 'exception-decision-unknown').detail, 'cites "G67"')
  // the row that stands (it carries its key) is not a finding at all
  assert.ok(!r.findings.some((f) => f.index === 7))
  const derivable = r.findings.find((f) => f.class === 'exception-key-derivable')
  assert.equal(derivable.key, 'a.hx-card')
  assert.equal(derivable.file, 'review.config.json')
})

test('migrate-port: the classes come from the same validators the preflight uses — a clean dossier has none', async () => {
  const d = await dossier('mp-clean', { exceptions: [EXCEPTIONS[7]] })
  const r = await diagnose(opts(d))
  assert.deepEqual(r.findings, [])
  assert.equal(r.before.ok, true)
  assert.deepEqual(contractProblems({ runRoot: d.root, specDir: d.spec, artifactPath: d.zip }).problems, [])
})

test('migrate-port: without --write nothing is modified, by the API or the command line', async () => {
  const d = await dossier('mp-readonly')
  const before = snapshot(d.root)
  await diagnose(opts(d))
  const run = spawnSync(process.execPath, [SCRIPT, '--run-root', d.root, '--spec', d.spec, '--theme-zip', d.zip], { encoding: 'utf8' })
  assert.equal(run.status, 1, run.stderr)
  assert.match(run.stdout, /MECHANICAL {2}exception-key-derivable × 1/)
  assert.match(run.stdout, /MANUAL {6}exception-decision-several × 1/)
  assert.match(run.stdout, /nothing was written/)
  assert.deepEqual(snapshot(d.root), before)
  assert.deepEqual(readdirSync(d.root).filter((f) => f === 'attempts'), [])
})

test('migrate-port: --write sets the key in the source, regenerates the contract, leaves the manual rows byte for byte', { skip: !hasUnzip }, async () => {
  const d = await dossier('mp-write')
  const configBefore = readFileSync(path.join(d.root, 'review.config.json'), 'utf8')
  const result = await migrate(opts(d))
  assert.deepEqual(result.changes.map((c) => c.file), ['review.config.json', 'visual.contract.json'])
  const configAfter = readFileSync(path.join(d.root, 'review.config.json'), 'utf8')
  // an insertion and nothing else: remove the inserted key and the file is the original
  assert.equal(configAfter.replace(/,\n\s+"key": "a\.hx-card"/, ''), configBefore)
  const json = JSON.parse(configAfter)
  assert.equal(json.visual.exceptions[0].key, 'a.hx-card')
  assert.deepEqual(json.visual.exceptions.slice(1), JSON.parse(configBefore).visual.exceptions.slice(1))
  // the generated contract carries the source's rows and is bound to it
  const contract = JSON.parse(readFileSync(path.join(d.root, 'visual.contract.json'), 'utf8'))
  assert.deepEqual(contract.design.exceptions, json.visual.exceptions)
  assert.equal(contract.bindings.configHash, `sha256:${sha(readFileSync(path.join(d.root, 'review.config.json')))}`)
  assert.equal(contract.revision, 2)
  // the old contract and the old config are kept, not deleted
  const attempts = readdirSync(path.join(d.root, 'attempts'))
  assert.ok(attempts.some((a) => a.startsWith('superseded-')) && attempts.some((a) => a.startsWith('migrate-')), attempts.join())
  assert.equal(readFileSync(path.join(d.root, 'attempts', attempts.find((a) => a.startsWith('migrate-')), 'review.config.json'), 'utf8'), configBefore)
  // re-validated: the derivable class is gone, the manual ones remain, listed
  assert.equal(classesOf(result.after)['exception-key-derivable'], undefined)
  assert.equal(classesOf(result.after)['exception-key-underivable'], 1)
  assert.equal(classesOf(result.after)['exception-decision-several'], 1)
})

test('migrate-port: --write twice changes nothing the second time', { skip: !hasUnzip }, async () => {
  const d = await dossier('mp-idem')
  await migrate(opts(d))
  const once = snapshot(d.root)
  const attempts = readdirSync(path.join(d.root, 'attempts')).length
  const again = await migrate(opts(d))
  assert.deepEqual(again.changes, [])
  assert.deepEqual(snapshot(d.root), once)
  assert.equal(readdirSync(path.join(d.root, 'attempts')).length, attempts)
})

test('migrate-port: a dossier whose only problems are mechanical passes the preflight after --write', { skip: !hasUnzip }, async () => {
  const d = await dossier('mp-green', { exceptions: [EXCEPTIONS[0], EXCEPTIONS[7]] })
  // the spec-pack moved on after both contracts were generated (a rebuilt content.json): both are stale
  writeFileSync(path.join(d.spec, 'content.json'), '{"v":2}')
  const refused = contractProblems({ runRoot: d.root, specDir: d.spec, artifactPath: d.zip }).problems.map((p) => p.code).sort()
  // the visual contract is refused as invalid before its binding is looked at; the design contract is stale
  assert.deepEqual(refused, ['contract-invalid', 'contract-stale'])
  const r = await diagnose(opts(d))
  assert.deepEqual(classesOf(r), { 'exception-key-derivable': 1, 'visual-contract-stale-regenerable': 1, 'design-contract-stale-regenerable': 1 })
  const result = await migrate(opts(d))
  assert.deepEqual(result.changes.map((c) => c.file).sort(), ['design-contract.json', 'review.config.json', 'visual.contract.json'])
  assert.deepEqual(contractProblems({ runRoot: d.root, specDir: d.spec, artifactPath: d.zip }).problems, [])
  assert.equal(result.after.before.ok, true)
  assert.deepEqual(result.after.findings, [])
})

test('migrate-port: a stale zip hash alone is regenerated, a rebuilt zip with a missing template is not', { skip: !hasUnzip }, async () => {
  const d = await dossier('mp-zip', { exceptions: [EXCEPTIONS[7]] })
  const rebuilt = path.join(d.root, 'wp-fixture-2.zip')
  writeFileSync(rebuilt, zipOf({ 'wp-fixture/templates/front-page.html': '<!-- home v2 -->', 'wp-fixture/templates/page.html': '<!-- page v2 -->' }))
  const r = await diagnose({ ...opts(d), themeZip: rebuilt })
  assert.deepEqual(classesOf(r), { 'visual-contract-stale-regenerable': 1, 'design-contract-stale-regenerable': 1 })
  const result = await migrate({ ...opts(d), themeZip: rebuilt })
  assert.deepEqual(contractProblems({ runRoot: d.root, specDir: d.spec, artifactPath: rebuilt }).problems, [])
  assert.equal(JSON.parse(readFileSync(path.join(d.root, 'visual.contract.json'), 'utf8')).bindings.artifactHash, `sha256:${sha(readFileSync(rebuilt))}`)
  assert.deepEqual(result.after.findings, [])
  // a zip without the page template cannot back the contract: the rebuild fails, so nothing is refreshed
  const d2 = await dossier('mp-zip2', { exceptions: [EXCEPTIONS[7]] })
  const bare = path.join(d2.root, 'wp-bare.zip')
  writeFileSync(bare, zipOf({ 'wp-fixture/templates/front-page.html': '<!-- home -->' }))
  const r2 = await diagnose({ ...opts(d2), themeZip: bare })
  assert.equal(classesOf(r2)['visual-contract-stale-differs'], 1)
  assert.match(r2.findings.find((f) => f.class === 'visual-contract-stale-differs').detail, /templates\/page\.html|cannot be rebuilt|differs/)
})

test('migrate-port: a spec-pack change that alters the pages is manual — the contract would differ, so it is not refreshed', { skip: !hasUnzip }, async () => {
  const d = await dossier('mp-pages', { exceptions: [EXCEPTIONS[7]] })
  writeFileSync(path.join(d.spec, 'page-map.json'), JSON.stringify({ ...PAGE_MAP, pages: [...PAGE_MAP.pages, { file: 'Team.html', view: 'page', title: 'Team', path: '/team', locale: 'en' }] }))
  const r = await diagnose(opts(d))
  const stale = r.findings.find((f) => f.class === 'visual-contract-stale-differs')
  assert.ok(stale, JSON.stringify(classesOf(r)))
  const before = readFileSync(path.join(d.root, 'visual.contract.json'), 'utf8')
  const result = await migrate(opts(d))
  assert.equal(readFileSync(path.join(d.root, 'visual.contract.json'), 'utf8'), before)
  assert.ok(result.after.findings.some((f) => f.class === 'visual-contract-stale-differs'))
})

test('migrate-port: refuses to write when the generated contract holds exceptions its source does not', { skip: !hasUnzip }, async () => {
  const d = await dossier('mp-drift')
  const file = path.join(d.root, 'visual.contract.json')
  const c = JSON.parse(readFileSync(file, 'utf8'))
  c.design.exceptions.push({ kind: 'image-missing', match: '"page":"en-home"', reason: 'added by hand', decision: 'D-04', key: 'hero' })
  writeFileSync(file, JSON.stringify(c, null, 2) + '\n')
  const before = snapshot(d.root)
  assert.ok((await diagnose(opts(d))).findings.some((f) => f.class === 'exceptions-drift'))
  await assert.rejects(migrate(opts(d)), /not the ones in the review\.config\.json/)
  assert.deepEqual(snapshot(d.root), before)
  assert.deepEqual(readdirSync(d.root).filter((f) => f === 'attempts'), [])
})

test('migrate-port: a source edited since the contract was generated is not drift — the contract is behind it and is regenerated', { skip: !hasUnzip }, async () => {
  const d = await dossier('mp-behind', { exceptions: [EXCEPTIONS[0], EXCEPTIONS[7]] })
  const cfg = path.join(d.root, 'review.config.json')
  writeFileSync(cfg, readFileSync(cfg, 'utf8').replace('"decision": "D-01"', '"decision": "D-01",\n        "key": "a.hx-card"'))
  const r = await diagnose(opts(d))
  assert.deepEqual(classesOf(r), { 'visual-contract-stale-regenerable': 1 })
  assert.match(r.findings[0].detail, /review\.config\.json changed after the contract was generated/)
  await migrate(opts(d))
  assert.deepEqual(contractProblems({ runRoot: d.root, specDir: d.spec, artifactPath: d.zip }).problems, [])
})

test('migrate-port: the manual rows are listed with their candidates and never given a decision', async () => {
  const d = await dossier('mp-manual')
  const r = await diagnose(opts(d))
  const rep = reportOf({ first: r }, { examples: 3 })
  const byClass = Object.fromEntries(rep.before.classes.map((c) => [c.class, c]))
  assert.equal(byClass['exception-decision-several'].mechanical, false)
  assert.deepEqual(byClass['exception-decision-several'].examples[0].candidates.map((c) => c.id), ['D-01', 'D-02'])
  assert.equal(byClass['exception-decision-missing'].examples[0].detail, 'D-99 is not in DECISIONS.md')
  assert.equal(byClass['exception-decision-duplicate'].examples[0].detail, 'D-03 is defined more than once')
  assert.equal(byClass['exception-decision-none'].examples[0].decision, null)
  // the first examples are capped
  assert.ok(Object.values(byClass).every((c) => c.examples.length <= 3))
  const md = markdownOf(rep)
  assert.match(md, /### exception-decision-several — 1 — MANUAL/)
  assert.match(md, /### exception-key-derivable — 1 — MECHANICAL/)
})

test('migrate-port: a missing DECISIONS.md is one manual finding, and no key is derived', async () => {
  const d = await dossier('mp-nodecisions')
  const { rmSync } = await import('node:fs')
  rmSync(path.join(d.root, 'DECISIONS.md'))
  const r = await diagnose(opts(d))
  assert.equal(classesOf(r)['decisions-unreadable'], 1)
  assert.equal(classesOf(r)['exception-key-derivable'], undefined)
})

test('migrate-port: a key is a specific token of the row that only the cited decision mentions', () => {
  const decisions = parseDecisions('| D-01 | The a.hx-card link and the footer; hx-card-wide too. |\n| D-02 | The footer is shortened. 1452 px. |\n| D-03 | Also the footer, and 1452. |\n')
  const row = (match, decision = 'D-01') => ({ kind: 'parity-mismatch', match, reason: 'r', decision })
  assert.equal(deriveKey(row('"element":"a\\.hx-card"'), 'D-01', decisions), 'a.hx-card')
  // a plain word is not specific, whatever the decision says
  assert.equal(deriveKey(row('"element":"footer"'), 'D-01', decisions), null)
  // a token two decisions mention does not point at one of them
  assert.equal(deriveKey(row('"scrollWidth":1452', 'D-02'), 'D-02', decisions), null)
  // the longest specific token wins, structural field names are never tokens
  assert.deepEqual(tokensOf(row('"page":"en-home","element":"a\\.hx-card","property":"color"')), ['en-home', 'a.hx-card', 'color'])
  assert.equal(deriveKey(row('"element":"a\\.hx-card"|hx-card-wide'), 'D-01', decisions), 'hx-card-wide')
  assert.equal(deriveKey(row('"element":"a\\.hx-card"'), 'D-77', decisions), null)
})

test('migrate-port: insertKeys inserts after match in an inline row and a spread one, and nothing else moves', () => {
  const text = `{
  "visual": {
    "exceptions": [
      { "kind": "k", "match": "a\\\\.b", "reason": "r", "decision": "D-1" },
      {
        "kind": "k",
        "match": "c",
        "reason": "r",
        "decision": "D-2"
      }
    ]
  }
}
`
  const out = insertKeys(text, [{ index: 0, key: 'a.b' }, { index: 1, key: 'cee' }])
  const json = JSON.parse(out)
  assert.deepEqual(json.visual.exceptions.map((e) => e.key), ['a.b', 'cee'])
  assert.match(out, /"match": "a\\\\\.b", "key": "a\.b", "reason"/)
  assert.match(out, /"match": "c",\n {8}"key": "cee",\n {8}"reason"/)
  assert.equal(out.replace(', "key": "a.b"', '').replace(',\n        "key": "cee"', ''), text)
  assert.equal(insertKeys('{"visual":{}}', [{ index: 0, key: 'x' }]), null)
})

test('migrate-port: usage errors exit 2; --report writes JSON and Markdown', async () => {
  const bad = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' })
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /--run-root <dossier> is required/)
  const unknown = spawnSync(process.execPath, [SCRIPT, '--run-root', '/nonexistent', '--frobnicate'], { encoding: 'utf8' })
  assert.equal(unknown.status, 2)
  const d = await dossier('mp-report')
  const report = path.join(d.root, '..', `${path.basename(d.root)}-out`, 'r.json')
  const run = spawnSync(process.execPath, [SCRIPT, '--run-root', d.root, '--spec', d.spec, '--theme-zip', d.zip, '--report', report, '--examples', '1'], { encoding: 'utf8' })
  assert.equal(run.status, 1, run.stderr)
  const json = JSON.parse(readFileSync(report, 'utf8'))
  assert.equal(json.mode, 'diagnose')
  assert.equal(json.before.preflightOk, false)
  assert.ok(json.before.classes.every((c) => c.examples.length <= 1))
  assert.match(readFileSync(report.replace(/\.json$/, '.md'), 'utf8'), /^# migrate-port/)
})
