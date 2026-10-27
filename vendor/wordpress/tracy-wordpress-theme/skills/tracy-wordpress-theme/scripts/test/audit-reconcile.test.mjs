import test, { after, before } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, unlinkSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { testDir } from './lib/test-root.mjs'

const CLI = fileURLToPath(new URL('../audit-reconcile.mjs', import.meta.url))
const REPO = path.resolve(path.dirname(CLI), '../../..')
const root = testDir('audit-reconcile')
const run = (args) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8', timeout: 30000 })
const runAsync = (args) => new Promise((resolve) => {
  const child = spawn(process.execPath, [CLI, ...args], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stdout = ''; let stderr = ''
  child.stdout.setEncoding('utf8').on('data', (x) => { stdout += x })
  child.stderr.setEncoding('utf8').on('data', (x) => { stderr += x })
  child.on('close', (status) => resolve({ status, stdout, stderr }))
})
let server
let origin
before(async () => {
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(`<!doctype html><html><head><style>header{height:50px}button{width:80px;height:18px;color:black}button:hover{color:rgb(255, 0, 0)}</style><script>document.documentElement.dataset.auditClockAtLoad=String(Date.now())</script></head><body><header>Fixture</header><button id="join">Join</button></body></html>`)
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  origin = `http://127.0.0.1:${server.address().port}`
})
after(async () => { if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)) } })
const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const reportFor = (findings) => ({ profile: 'essence', pages: { fixture: { route: '/fixture', site: `${origin}/fixture`, source: `${origin}/fixture` } }, findings })
const identity = (raw) => ({ routePair: { site: `${origin}/fixture`, source: `${origin}/fixture` }, width: raw.width ?? null, theme: raw.theme ?? raw.mode ?? null, control: raw.control ?? (typeof raw.element === 'string' ? raw.element : null) ?? raw.label ?? null, state: raw.state ?? raw.action ?? null })
const rawFinding = { kind: 'header-height', route: '/fixture', width: 390, theme: 'light', control: 'header', state: 'initial', selector: 'header', source: 40, site: 50 }
function writeDetector(dir, report) {
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, 'findings.json')
  writeFileSync(file, JSON.stringify(report))
  return file
}
async function measure(report, { out = path.join(root, `ledger-${Math.random()}.json`), findings = path.join(root, `detector-${Math.random()}`) } = {}) {
  const source = writeDetector(findings, report)
  const result = await runAsync(['measure', '--findings', source, '--out', out])
  assert.equal(result.status, 0, result.stderr)
  return { ledger: JSON.parse(readFileSync(out, 'utf8')), source, out }
}
function matchingReaudit(file = path.join(root, 'REPORT.json')) {
  writeFileSync(file, JSON.stringify({ items: [{ id: 'R-1', kind: rawFinding.kind, control: rawFinding.control, width: rawFinding.width, state: rawFinding.state }] }))
  return file
}
function completeLedger(raws = [rawFinding]) {
  const report = reportFor(raws)
  const source = writeDetector(path.join(root, `ledger-source-${Math.random()}`), report)
  const entries = raws.map((raw, occurrenceIndex) => ({ origin: 'findings', occurrenceIndex, raw, identity: identity(raw) }))
  const counts = new Map()
  const rows = entries.map(({ origin, occurrenceIndex, raw, identity: ids }) => {
    const key = hash({ origin, ids, raw }); const ordinal = counts.get(key) ?? 0; counts.set(key, ordinal + 1)
    return { id: `AR-${hash({ routePair: ids.routePair, width: ids.width, theme: ids.theme, control: ids.control, state: ids.state, rawHash: hash(raw), origin, occurrenceIndex }).slice(0, 20)}`, origin, occurrenceIndex, ...ids, raw, remeasure: { method: 'targeted-dom-read/2', site: { measured: true }, source: { measured: true } }, basis: 'independent measurement: resolved target', verdict: { value: 'REAL', reAuditId: 'R-1' } }
  })
  const ledger = { schema: 'audit-reconcile/2', detector: path.basename(source), detectorScope: 'external', detectorHash: createHash('sha256').update(readFileSync(source)).digest('hex'), occurrences: rows.length, pagePairs: Object.values(report.pages), inventory: entries, rows }
  const file = path.join(path.dirname(source), 'ledger.json')
  writeFileSync(file, JSON.stringify(ledger))
  return { ledger, file, source }
}

test('measure includes top-level and every occurrence array in audit-live extra', async () => {
  const cms = { kind: 'cms-leftover', route: '/fixture', token: 'legacy' }
  const copy = { kind: 'behavior-copy-unreviewed', route: '/fixture', claim: 'apply', control: 'Join' }
  const contradiction = { route: '/fixture', claim: 'contradiction', contradicts: true }
  const listing = { kind: 'listing-duplicate', route: '/fixture', title: 'Item', listing: 'Stories' }
  const report = reportFor([rawFinding])
  report.findings.push(structuredClone(rawFinding))
  report.extra = {
    'cms-leftovers': { findings: [cms] },
    'behavior-copy': { findings: [copy], inventory: [contradiction] },
    listings: { findings: [listing] },
    citations: { dossiers: [{ findings: [{ kind: 'citation-error', file: 'review.config.json', detail: 'bad citation' }] }] }
  }
  const { ledger, out: file, source } = await measure(report)
  const repeated = (await measure(report)).ledger
  assert.deepEqual(ledger.rows.map((row) => row.id), repeated.rows.map((row) => row.id), 'ids are stable across runs')
  assert.notEqual(ledger.rows[0].id, ledger.rows[1].id, 'identical raw occurrences remain distinct')
  assert.doesNotMatch(readFileSync(CLI, 'utf8'), /from ['"].*\/(visual\/interaction-parity|review\/content-audit|review\/behavior-copy|lib\/parity-acceptance)\.mjs/)
  assert.equal(ledger.rows.length, 7)
  assert.deepEqual(ledger.rows.map((row) => row.origin), ['findings', 'findings', 'extra.cms-leftovers.findings', 'extra.behavior-copy.findings', 'extra.behavior-copy.inventory', 'extra.listings.findings', 'extra.citations.dossiers[0].findings'])
  assert.deepEqual(ledger.rows.map((row) => row.raw), [rawFinding, rawFinding, cms, copy, contradiction, listing, { kind: 'citation-error', file: 'review.config.json', detail: 'bad citation' }])
  const incomplete = structuredClone(ledger)
  incomplete.rows.pop()
  incomplete.occurrences--
  writeFileSync(file, JSON.stringify(incomplete))
  const checked = run(['check', '--ledger', file])
  assert.equal(checked.status, 1)
  assert.match(checked.stderr, /rows do not equal detector occurrences/)
})

test('same evidence in different origin lists gets distinct ids and checks against detector', async () => {
  const report = reportFor([rawFinding])
  report.extra = { citations: { dossiers: [{ findings: [structuredClone(rawFinding)] }] } }
  const { ledger, out: file, source } = await measure(report)
  assert.notEqual(ledger.rows[0].id, ledger.rows[1].id)
  assert.deepEqual(ledger.rows.map((row) => row.origin), ['findings', 'extra.citations.dossiers[0].findings'])
  for (const row of ledger.rows) row.verdict = { value: 'REAL', reAuditId: 'R-1' }
  writeFileSync(file, JSON.stringify(ledger))
  const result = run(['check', '--ledger', file, '--findings', source, '--reaudit', matchingReaudit()])
  assert.equal(result.status, 0, result.stderr)
})

test('check uses detector output as source of truth, requires it, and verifies its hash', async (t) => {
  await t.test('trimmed rows and inventory with edited occurrence count still refuse', () => {
    const { ledger, file } = completeLedger([rawFinding, { ...rawFinding, state: 'hover' }])
    ledger.rows.pop(); ledger.inventory.pop(); ledger.occurrences = 1
    writeFileSync(file, JSON.stringify(ledger))
    const result = run(['check', '--ledger', file, '--reaudit', matchingReaudit()])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /does not equal detector occurrences/)
  })
  await t.test('missing detector output refuses', () => {
    const { file, source } = completeLedger()
    unlinkSync(source)
    const result = run(['check', '--ledger', file, '--reaudit', matchingReaudit()])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /detector occurrence source is unavailable/)
  })
  await t.test('detector hash mismatch refuses', () => {
    const { file, source } = completeLedger()
    writeFileSync(source, JSON.stringify(reportFor([{ ...rawFinding, state: 'hover' }])))
    const result = run(['check', '--ledger', file, '--findings', source, '--reaudit', matchingReaudit()])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /detector occurrence source hash changed/)
  })
})

test('measurement clock is installed before navigation and page scripts see frozen Date and performance', async () => {
  const { ledger } = await measure(reportFor([rawFinding]))
  const measurement = ledger.rows[0].remeasure.site
  assert.equal(measurement.document.loadClock, '1700000000000')
  assert.equal(measurement.clock.dateNow, 1700000000000)
  assert.equal(measurement.clock.performanceNow, 0)
})

test('independent measurement resolves the named control, reads its box and reported style, and opens hover state', async () => {
  const finding = { kind: 'touch-target-small', route: '/fixture', width: 390, theme: 'light', control: 'Join', state: 'hover', properties: ['color'], w: 80, h: 18 }
  const { ledger } = await measure(reportFor([finding]))
  const row = ledger.rows[0]
  assert.ok(row.remeasure, row.remeasureReason)
  assert.equal(row.remeasure.site.target.tag, 'button')
  assert.equal(row.remeasure.site.state.action, 'hover')
  assert.equal(row.remeasure.site.box.height, 18)
  assert.equal(row.remeasure.site.styles.color, 'rgb(255, 0, 0)')
  assert.match(row.basis, /independent measurement/)
})

test('unsupported detector kinds stay unmeasured and basis cannot claim an independent measurement', async () => {
  const { ledger } = await measure(reportFor([{ kind: 'carousel-unreachable', route: '/fixture', width: 390, theme: 'light', state: 'slide 2' }]))
  assert.equal(ledger.rows[0].remeasure, null)
  assert.match(ledger.rows[0].remeasureReason, /not implemented/)
  assert.equal(ledger.rows[0].basis, '')
})

test('check refuses each raw identity-field mismatch and occurrence-count mismatch', async (t) => {
  for (const [field, mutate] of [
    ['route pair', (row) => { row.routePair.site = `${origin}/elsewhere` }],
    ['width', (row, ledger) => { row.width = 768; ledger.inventory[0].identity.width = 768 }],
    ['theme', (row) => { row.theme = 'dark' }],
    ['control', (row) => { row.control = 'other control' }],
    ['state', (row) => { row.state = 'hover' }]
  ]) await t.test(`${field} differs from the raw finding`, () => {
    const { ledger, file } = completeLedger()
    mutate(ledger.rows[0], ledger)
    writeFileSync(file, JSON.stringify(ledger))
    const result = run(['check', '--ledger', file, '--reaudit', matchingReaudit()])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /identity|route pair|id is inconsistent/i)
  })
  await t.test('declared count differs from rows', () => {
    const { ledger, file } = completeLedger()
    ledger.occurrences = 2
    writeFileSync(file, JSON.stringify(ledger))
    const result = run(['check', '--ledger', file, '--reaudit', matchingReaudit()])
    assert.equal(result.status, 1)
    assert.match(result.stderr, /declared occurrence count/)
  })
})

test('detector paths outside the repository are reduced to basename and hash', async () => {
  const out = path.join(REPO, `.audit-reconcile-test-${process.pid}.json`)
  try {
    const { ledger } = await measure(reportFor([{ ...rawFinding, state: 'initial' }]), { out })
    assert.equal(ledger.detector, 'findings.json')
    assert.doesNotMatch(JSON.stringify(ledger), /\/private\/tmp|\/tmp\/|\/Users\//)
  } finally {
    try { unlinkSync(out) } catch {}
  }
})

test('detector paths inside the repository are repo-relative', async () => {
  const source = path.join(REPO, `.audit-reconcile-findings-${process.pid}.json`)
  try {
    writeFileSync(source, JSON.stringify(reportFor([rawFinding])))
    const out = path.join(root, 'repo-path-ledger.json')
    const result = await runAsync(['measure', '--findings', source, '--out', out])
    assert.equal(result.status, 0, result.stderr)
    const ledger = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(ledger.detector, path.relative(REPO, source))
    assert.equal(ledger.detectorScope, 'repo')
    assert.doesNotMatch(JSON.stringify(ledger), /\/Users\/|\/private\/tmp/)
  } finally {
    try { unlinkSync(source) } catch {}
  }
})

test('check refuses an invented independent measurement for an unsupported kind', async () => {
  const raw = { kind: 'carousel-unreachable', route: '/fixture', width: 390, theme: 'light', state: 'slide 2' }
  const { ledger, file } = completeLedger([raw])
  ledger.rows[0].remeasure = { site: { measured: true }, source: { measured: true } }
  ledger.rows[0].basis = 'independent measurement: fabricated'
  ledger.rows[0].verdict = { value: 'REAL', newDifference: true }
  writeFileSync(file, JSON.stringify(ledger))
  const result = run(['check', '--ledger', file])
  assert.equal(result.status, 1)
  assert.match(result.stderr, /cannot claim an independent measurement/)
})

test('check reads structured re-audit matches from a Markdown table', () => {
  const { file } = completeLedger()
  const report = path.join(root, 'REPORT.md')
  writeFileSync(report, '| id | kind | control | width | state |\n|---|---|---|---:|---|\n| R-1 | header-height | header | 390 | initial |\n')
  const result = run(['check', '--ledger', file, '--reaudit', report])
  assert.equal(result.status, 0, result.stderr)
})

test('check accepts a complete ledger with an explicitly matching re-audit id', () => {
  const { file } = completeLedger()
  const result = run(['check', '--ledger', file, '--reaudit', matchingReaudit()])
  assert.equal(result.status, 0, result.stderr)
})

test('check refuses each incomplete or inconsistent ledger condition', async (t) => {
  const checkRows = (mutate, extra = []) => {
    const { ledger, file } = completeLedger()
    mutate?.(ledger)
    writeFileSync(file, JSON.stringify(ledger))
    return run(['check', '--ledger', file, ...extra])
  }
  await t.test('row has no verdict', () => assert.match(checkRows((l) => { l.rows[0].verdict = null }).stderr, /no verdict/))
  await t.test('invalid verdict', () => assert.match(checkRows((l) => { l.rows[0].verdict.value = 'MAYBE' }).stderr, /invalid verdict/))
  await t.test('UNRESOLVED remains incomplete', () => assert.match(checkRows((l) => { l.rows[0].verdict.value = 'UNRESOLVED' }).stderr, /UNRESOLVED remains/))
  await t.test('FALSE_POSITIVE needs an existing fixture and remains incomplete', () => {
    const { file } = completeLedger(); const fixture = path.join(path.dirname(file), 'false-positive-fixture.html'); writeFileSync(fixture, '<main>fixture</main>')
    const ledger = JSON.parse(readFileSync(file, 'utf8')); ledger.rows[0].verdict = { value: 'FALSE_POSITIVE', fixture: path.basename(fixture) }; writeFileSync(file, JSON.stringify(ledger))
    const result = run(['check', '--ledger', file])
    assert.match(result.stderr, /FALSE_POSITIVE requires a fixture and remains incomplete until fixed/)
  })
  await t.test('REAL re-audit citation must match all dimensions by id', () => assert.match(checkRows((l) => { l.rows[0].verdict.reAuditId = 'phrase-only' }, ['--reaudit', matchingReaudit()]).stderr, /does not match/))
  await t.test('REAL citation requires re-audit input', () => assert.match(checkRows(null).stderr, /requires --reaudit/))
  await t.test('basis must name independent measurement', () => assert.match(checkRows((l) => { l.rows[0].basis = 'raw detector evidence' }).stderr, /basis does not name the independent measurement/))
  await t.test('duplicate ids refuse', () => assert.match(checkRows((l) => { l.rows.push(structuredClone(l.rows[0])); l.occurrences++ }).stderr, /duplicate id/))
  await t.test('unreadable re-audit refuses', () => assert.match(checkRows(null, ['--reaudit', path.join(root, 'missing.md')]).stderr, /re-audit file unreadable/))
  await t.test('unmeasured row refuses', () => assert.match(checkRows((l) => { l.rows[0].remeasure = null }).stderr, /independent measurement unavailable/))
})
