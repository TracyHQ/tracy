// The finish audit is bound into every finish consumer (docs/follow-ups/audit-gates.md §1): the Fast Gate verdict, the group verdict and
// the release (full and --patch) each name their own dossier and refuse without a clean, current receipt of it (lib/audit-receipt.mjs).
// Section 2 on the same ground: an interaction record that does not attest every owed case as measured is never clean.
// The release's own refusals (both modes) are in quickstart-release.test.mjs; these are the reproduction cases of the helper and the
// two visual consumers.
import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, truncateSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { testDir } from './lib/test-root.mjs'
import { assessFastGate } from '../visual/fast-gate.mjs'
import { groupVerdict } from '../visual/group-verdict.mjs'
import { reportProblems } from '../visual/round.mjs'
import { contractHash } from '../lib/canonical.mjs'
import { AUDIT_FILE, MAX_BOUND_BYTES, RECEIPT_SCHEMA, auditReceiptProblems, issueReceipt } from '../lib/audit-receipt.mjs'
import { interactionAttestationProblems, validateInteractionRecord } from '../visual/interaction-report.mjs'
import { owedCases } from '../visual/interaction-page-contract.mjs'
import { writeRunDir } from './lib/visual-evidence-fixtures.mjs'
import { cleanAudit, interactionRecord, writeInteraction } from './lib/finish-audit.mjs'

const SITE = 'http://site.test'
const SRC = 'http://source.test'
const NOW = Date.now() + 60_000 // every receipt below is made by then
const dirs = []
const fresh = (name) => {
  const d = mkdtempSync(path.join(tmpdir(), `audit-gates-${name}-`))
  dirs.push(d)
  return d
}
test.after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })))

/** A dossier with a clean current receipt over the interaction record of `run`. */
function world(over = {}) {
  const dossier = fresh('dossier')
  const run = fresh('run')
  const report = cleanAudit({ dossier, site: SITE, source: SRC, routes: ['/', '/about'], runs: [run], pages: ['/', '/about'], ...over })
  const check = (extra = {}) => auditReceiptProblems({ dossier, site: SITE, routes: ['/', '/about'], interaction: [{ file: path.join(run, 'interaction.json'), routes: ['/', '/about'], source: SRC }], now: NOW, ...extra })
  return { dossier, run, report, check, codes: (extra) => check(extra).problems.map((p) => p.code) }
}
const touch = (file, ms = Date.now() + 5000) => utimesSync(file, new Date(ms), new Date(ms))
const later = new Date(Date.now() + 120_000)

test('helper: a clean current receipt of this dossier, site and routes is accepted', () => {
  const w = world()
  const r = w.check()
  assert.deepEqual(r.problems, [])
  assert.equal(r.audit.scope, 'visual')
  assert.match(r.audit.sha256, /^sha256:[0-9a-f]{64}$/)
})

test('case 1: no receipt, one that is not clean, another site, a missing route — each refuses with its own code', () => {
  const w = world()
  rmSync(path.join(w.dossier, AUDIT_FILE))
  assert.deepEqual(w.codes(), ['audit-missing'])
  assert.deepEqual(auditReceiptProblems({ dossier: null, site: SITE }).problems.map((p) => p.code), ['audit-missing'])
  // not clean: the report says so, or a check it owes is absent
  const dirty = world({ ok: false, checks: { 'cms-leftovers': { ok: false } } })
  assert.ok(dirty.codes().includes('audit-not-clean'))
  const gap = world({ mutate: (r) => delete r.checks.decisions })
  assert.match(gap.check().problems.find((p) => p.code === 'audit-not-clean').message, /no decisions check/)
  const noInteraction = world({ mutate: (r) => delete r.checks.interaction })
  assert.ok(noInteraction.codes().includes('audit-not-clean'), 'a visual audit owes the interaction check')
  // another site, a route the audit does not cover
  const w2 = world()
  assert.ok(w2.codes({ site: 'http://other.test' }).includes('audit-site'))
  assert.ok(w2.codes({ routes: ['/', '/about', '/contact'] }).includes('audit-routes'))
  assert.deepEqual(w2.codes({ routes: ['/about/'] }), [], 'a trailing slash is the same route')
  assert.deepEqual(w2.codes({ routes: [['/team', '/about']] }), [], 'any alternative form of a route counts')
  // a receipt-less report (written without --dossier) is a report to read, never a receipt
  const w3 = world({ mutate: (r) => delete r.receipt })
  assert.deepEqual(w3.codes(), ['audit-invalid'])
})

test('case 1: a receipt older than an acceptance file, DECISIONS.md, the CMS allowlist or a behaviour review refuses — whatever the bytes say', () => {
  for (const name of ['DECISIONS.md', 'cms-allow.json', 'behavior-copy.reviews.json', 'visual.contract.json', 'design-contract.json', 'review.config.json', 'parity-accepted.json']) {
    const dossier = fresh('stale')
    const run = fresh('run')
    for (const n of ['cms-allow.json', 'behavior-copy.reviews.json', 'visual.contract.json', 'design-contract.json', 'review.config.json', 'parity-accepted.json']) writeFileSync(path.join(dossier, n), '[]')
    cleanAudit({ dossier, routes: ['/'], runs: [run], pages: ['/'] })
    const check = () => auditReceiptProblems({ dossier, site: SITE, routes: ['/'], interaction: [{ file: path.join(run, 'interaction.json'), routes: ['/'], source: SRC }], now: NOW })
    assert.deepEqual(check().problems, [], name)
    touch(path.join(dossier, name))
    const r = check()
    assert.ok(r.problems.some((p) => p.code === 'audit-stale' && p.message.startsWith(name)), `${name}: ${JSON.stringify(r.problems)}`)
  }
  // a file that changed is refused by its hash, and one that appeared after the audit by the inventory
  const w = world()
  writeFileSync(path.join(w.dossier, 'DECISIONS.md'), '- D-2: something else\n')
  touch(path.join(w.dossier, 'DECISIONS.md'), Date.now() - 5000)
  assert.ok(w.check().problems.some((p) => p.code === 'audit-inputs' && /DECISIONS\.md/.test(p.message)))
  const w2 = world()
  writeFileSync(path.join(w2.dossier, 'cms-allow.json'), '[]')
  touch(path.join(w2.dossier, 'cms-allow.json'), Date.now() - 5000)
  assert.match(w2.check().problems.find((p) => p.code === 'audit-inputs').message, /cms-allow\.json is in this dossier and the audit was made without it/)
  // a file the audit bound and the dossier no longer has
  const w3 = world()
  rmSync(path.join(w3.dossier, 'DECISIONS.md'))
  assert.ok(w3.codes().includes('audit-input-missing'))
})

test('case 2: a receipt of dossier A presented to a consumer reading dossier B with identically named files refuses', () => {
  const a = world()
  const b = world()
  // B has the same file names with other bytes, and the receipt of A is copied in as B's own
  writeFileSync(path.join(b.dossier, 'DECISIONS.md'), '- D-9: a decision of another port\n')
  writeFileSync(path.join(a.dossier, 'visual.contract.json'), '{"design":{}}')
  writeFileSync(path.join(b.dossier, 'visual.contract.json'), '{"design":{"x":1}}')
  cleanAudit({ dossier: a.dossier, routes: ['/', '/about'], runs: [a.run], pages: ['/', '/about'] })
  writeFileSync(path.join(b.dossier, AUDIT_FILE), readFileSync(path.join(a.dossier, AUDIT_FILE)))
  const r = b.check()
  assert.ok(r.problems.some((p) => p.code === 'audit-inputs' && /DECISIONS\.md is sha256:/.test(p.message)), JSON.stringify(r.problems))
  assert.ok(r.problems.some((p) => p.code === 'audit-inputs' && /visual\.contract\.json/.test(p.message)))
  // the same receipt in its own dossier is fine
  assert.deepEqual(a.check().problems, [])
})

test('case 3: the receipt supplies no path: an inventory of other files, extra entries or a path that is a FIFO change nothing the consumer opens', { timeout: 20000 }, () => {
  const w = world()
  const fifo = path.join(w.dossier, 'trap.fifo')
  execFileSync('mkfifo', [fifo])
  const doc = JSON.parse(readFileSync(path.join(w.dossier, AUDIT_FILE), 'utf8'))
  // paths in the receipt are data: a consumer that opened them would block here
  doc.receipt.files = { decisions: fifo }
  doc.receipt.inputs['../elsewhere/DECISIONS.md'] = doc.receipt.inputs['DECISIONS.md']
  doc.receipt.inputs[fifo] = null
  writeFileSync(path.join(w.dossier, AUDIT_FILE), JSON.stringify(doc))
  const r = w.check()
  assert.ok(r.problems.some((p) => p.code === 'audit-inputs' && /not one of the dossier's inputs/.test(p.message)))
  assert.equal(r.problems.filter((p) => p.code === 'audit-inputs').length, 2, 'one refusal per foreign entry, none for the real inputs')
  // an inventory that leaves out an acceptance file the dossier has
  const w2 = world()
  writeFileSync(path.join(w2.dossier, 'parity-accepted.json'), '[]')
  cleanAudit({ dossier: w2.dossier, routes: ['/', '/about'], runs: [w2.run], pages: ['/', '/about'] })
  const doc2 = JSON.parse(readFileSync(path.join(w2.dossier, AUDIT_FILE), 'utf8'))
  delete doc2.receipt.inputs['parity-accepted.json']
  writeFileSync(path.join(w2.dossier, AUDIT_FILE), JSON.stringify(doc2))
  assert.match(w2.check().problems.find((p) => p.code === 'audit-inputs').message, /no entry for parity-accepted\.json: the audit did not cover the dossier's acceptance files/)
})

test('case 3: a symlink, a FIFO, a directory or an oversize file as any bound input is refused without blocking or reading it', { timeout: 30000 }, () => {
  const inputs = ['DECISIONS.md', 'cms-allow.json', 'behavior-copy.reviews.json', 'design-contract.json', 'visual.contract.json', 'review.config.json', 'parity-accepted.json']
  for (const name of inputs) {
    for (const kind of ['symlink', 'fifo', 'directory', 'oversize']) {
      const w = world()
      const file = path.join(w.dossier, name)
      rmSync(file, { force: true })
      const target = path.join(w.run, 'target.txt')
      writeFileSync(target, '[]')
      if (kind === 'symlink') symlinkSync(target, file)
      else if (kind === 'fifo') execFileSync('mkfifo', [file])
      else if (kind === 'directory') mkdirSync(file)
      else {
        writeFileSync(file, '')
        truncateSync(file, MAX_BOUND_BYTES + 1)
      }
      const r = w.check()
      assert.ok(r.problems.some((p) => p.code === 'audit-input-unsafe' && p.message.startsWith(name)), `${name} as a ${kind}: ${JSON.stringify(r.problems)}`)
    }
  }
  // the receipt and the interaction record are held to the same rule
  for (const kind of ['symlink', 'fifo', 'directory']) {
    const w = world()
    const file = path.join(w.dossier, AUDIT_FILE)
    const copy = path.join(w.run, 'receipt-copy.json')
    writeFileSync(copy, readFileSync(file))
    rmSync(file)
    if (kind === 'symlink') symlinkSync(copy, file)
    else if (kind === 'fifo') execFileSync('mkfifo', [file])
    else mkdirSync(file)
    assert.ok(w.codes().some((c) => c === 'audit-unsafe' || c === 'audit-unreadable'), `receipt as a ${kind}`)
    const x = world()
    const rec = path.join(x.run, 'interaction.json')
    const keep = path.join(x.dossier, 'rec-copy.json')
    writeFileSync(keep, readFileSync(rec))
    rmSync(rec)
    if (kind === 'symlink') symlinkSync(keep, rec)
    else if (kind === 'fifo') execFileSync('mkfifo', [rec])
    else mkdirSync(rec)
    assert.ok(x.codes().includes('audit-input-unsafe'), `interaction.json as a ${kind}`)
  }
  const big = world()
  truncateSync(path.join(big.dossier, AUDIT_FILE), 17 * 1024 * 1024)
  assert.deepEqual(big.codes(), ['audit-oversize'])
})

test('case 4: interaction.json absent next to the run refuses; one that is not the record the audit covered does too', () => {
  const w = world()
  rmSync(path.join(w.run, 'interaction.json'))
  assert.ok(w.codes().includes('audit-interaction-missing'))
  assert.ok(world().codes({ interaction: [] }).includes('audit-interaction'), 'a consumer that names no record cannot skip the hash')
  // another record (same names, other bytes) than the one the audit hashed
  const x = world()
  writeInteraction(x.run, { pages: ['/', '/about'], site: SITE, source: SRC, mutate: (r) => (r.examined = 41) })
  touch(path.join(x.run, 'interaction.json'), Date.now() - 5000)
  assert.ok(x.check().problems.some((p) => p.code === 'audit-interaction' && /not the ones the audit covered/.test(p.message)))
  // a record written after the audit
  const y = world()
  touch(path.join(y.run, 'interaction.json'))
  assert.ok(y.check().problems.some((p) => p.code === 'audit-stale' && /interaction\.json was written/.test(p.message)))
})

test('currentness: an audit older than the run it must follow, or from the future, refuses', () => {
  const w = world()
  assert.ok(w.codes({ notBefore: Date.now() + 3_600_000 }).includes('audit-stale'))
  assert.deepEqual(w.codes({ notBefore: Date.now() - 3_600_000 }), [])
  assert.ok(w.codes({ now: Date.now() - 3_600_000 }).includes('audit-invalid'), 'later than now')
  const future = world({ at: new Date(Date.now() + 86_400_000).toISOString() })
  assert.ok(future.codes().includes('audit-invalid'))
})

test('patch scope: bound to the theme zip and the restore, with no interaction record; a visual receipt is not a patch receipt', () => {
  const dossier = fresh('patch')
  const zip = path.join(dossier, 'theme.zip')
  const sha = `sha256:${'a'.repeat(64)}`
  cleanAudit({ dossier, routes: ['/'], theme: sha })
  const check = (extra = {}) => auditReceiptProblems({ dossier, site: SITE, routes: ['/'], scope: 'patch', theme: 'a'.repeat(64), now: NOW, ...extra }).problems.map((p) => p.code)
  assert.deepEqual(check(), [])
  assert.ok(check({ theme: 'b'.repeat(64) }).includes('audit-theme'), 'another theme zip')
  assert.ok(check({ theme: null }).includes('audit-theme'))
  assert.ok(check({ notBefore: Date.now() + 60_000 }).includes('audit-stale'), 'made before the restore finished')
  writeFileSync(zip, 'zip')
  touch(zip)
  assert.deepEqual(check({ themeFile: zip }), [], 'a theme zip written after the audit is held by its hash, not its mtime')
  assert.ok(check({ scope: 'visual', interaction: [] }).includes('audit-scope'))
  assert.ok(auditReceiptProblems({ dossier, site: 'http://other.test', routes: ['/'], scope: 'patch', theme: 'a'.repeat(64), now: NOW }).problems.some((p) => p.code === 'audit-site'))
  const visual = world()
  assert.ok(auditReceiptProblems({ dossier: visual.dossier, site: SITE, routes: ['/'], scope: 'patch', theme: 'a'.repeat(64), now: NOW }).problems.some((p) => p.code === 'audit-scope'))
})

// ── the consumers ──────────────────────────────────────────────────────────────────────────────────────────────────────────────
test('fast gate: a complete run needs the finish audit — none, not clean, another site, stale, no interaction.json: no pass', () => {
  const dir = writeRunDir(testDir('scope-fastgate'))
  const base = { contractHash: 'sha256:c', expectedRoutes: ['/'] }
  const reasons = (audit) => assessFastGate(dir, { ...base, ...(audit === undefined ? {} : { audit }) }).reasons.filter((r) => /audit/.test(r))
  assert.match(reasons(undefined).join(), /the finish audit was not checked/)
  const dossier = fresh('fg')
  assert.match(reasons({ dossier, site: SITE, routes: ['/'] }).join(), /\[audit-missing\]/)
  cleanAudit({ dossier, routes: ['/'], runs: [dir], pages: ['/'] })
  const audit = { dossier, site: SITE, routes: ['/'] }
  assert.deepEqual(reasons(audit), [])
  assert.equal(assessFastGate(dir, { ...base, audit }).status, 'pass')
  assert.match(reasons({ ...audit, site: 'http://other.test' }).join(), /\[audit-site\]/)
  assert.match(reasons({ ...audit, routes: ['/', '/missing'] }).join(), /\[audit-routes\]/)
  touch(path.join(dossier, 'DECISIONS.md'))
  assert.match(reasons(audit).join(), /\[audit-stale\]: DECISIONS\.md/)
  rmSync(path.join(dir, 'interaction.json'))
  assert.match(reasons(audit).join(), /\[audit-interaction-missing\]/)
  assert.equal(assessFastGate(dir, { ...base, audit }).status, 'fail')
})

test('group verdict: no audit, a receipt of another dossier and one made before DECISIONS.md was touched are incomplete, never done', () => {
  const V = ['1440-light', '390-light', '1440-dark', '390-dark']
  const bindings = { specHash: 'sha256:spec', pageMapHash: 'sha256:pm', seedReportHash: 'sha256:s', artifactHash: 'sha256:a', configHash: 'sha256:cfg' }
  const contract = { id: 'site--g1', source: { site: SRC }, group: { id: 'g1', pages: ['/a'], dossier: '/dossier/g1' }, target: { site: SITE }, bindings }
  const cpath = '/dossier/g1/visual.contract.json'
  const identity = { stale: [], canonical: true, contractPath: cpath, group: 'g1', contractHash: contractHash(contract), sourceHash: 'sha256:spec', artifactHash: 'sha256:a', seedReportHash: 'sha256:s' }
  const stages = ['light-desktop', 'light-responsive', 'dark-desktop', 'dark-responsive'].map((id) => ({ id, status: 'pass' }))
  const visual = { at: '2030-01-01T00:00:00Z', site: SITE, scope: { kind: 'targeted-debug' }, identity, stages, summary: { intrinsic: { status: 'run', blocking: false } }, pages: [{ id: 'a', path: '/a', axes: V.map((variant) => ({ variant, findings: [], accepted: [] })) }] }
  const parity = { target: SITE, generatedAt: '2030-01-01T00:00:00Z', inputs: { acceptHash: 'sha256:acc' }, routes: [{ route: '/a', targetPath: '/a', sourceOrigin: SRC, ok: true, accepted: [] }] }
  const current = { bindings, site: SITE, contractPath: cpath, acceptHash: 'sha256:acc', newest: Date.parse('2029-12-31T00:00:00Z') }
  const plan = [{ id: 'a', path: '/a', pagemapPath: '/a', kind: 'url', sourceRoute: '/a' }]
  const verdict = (audit) => groupVerdict({ group: 'g1', pages: ['/a'], kinds: new Map([['/a', 'url']]), current, plan, contract, visual, parity, ...(audit ? { audit } : {}) })
  const why = (r) => r.incomplete.filter((m) => /audit/.test(m)).join(' | ')
  const after2030 = '2031-01-01T00:00:00Z'
  const make = () => {
    const dir = fresh('gv')
    cleanAudit({ dossier: dir, site: SITE, source: SRC, routes: ['/a'], runs: [dir], pages: ['/a'], at: after2030 })
    return { dossier: dir, interaction: path.join(dir, 'interaction.json'), now: Date.parse('2031-06-01T00:00:00Z') }
  }
  const none = verdict(null)
  assert.equal(none.verdict, 'incomplete')
  assert.match(why(none), /no --port-audit/)
  const a = make()
  assert.equal(verdict(a).verdict, 'done', JSON.stringify(verdict(a).incomplete))
  // a receipt made for the other port's dossier (its own bytes), copied in
  const b = make()
  writeFileSync(path.join(b.dossier, 'DECISIONS.md'), '- D-9: the other port\n')
  writeFileSync(path.join(b.dossier, AUDIT_FILE), readFileSync(path.join(a.dossier, AUDIT_FILE)))
  assert.equal(verdict(b).verdict, 'incomplete')
  assert.match(why(verdict(b)), /\[audit-inputs\]: DECISIONS\.md/)
  // a receipt made before DECISIONS.md was touched
  const c = make()
  touch(path.join(c.dossier, 'DECISIONS.md'), Date.parse('2031-03-01T00:00:00Z'))
  assert.equal(verdict(c).verdict, 'incomplete')
  assert.match(why(verdict(c)), /\[audit-stale\]: DECISIONS\.md/)
  // a run measured after the audit
  const d = make()
  assert.match(why(groupVerdict({ group: 'g1', pages: ['/a'], kinds: new Map([['/a', 'url']]), current, plan, contract, visual: { ...visual, at: '2031-02-01T00:00:00Z' }, parity, audit: d })), /\[audit-stale\]: the audit was made at/)
})

test('round: a report whose summary carries no interaction claim is not refused for it (the receipt is read by the finish consumers, not by a tier report)', () => {
  const contract = { visual: { stages: [{ id: 'dark-desktop' }] }, pages: [{ id: 'p', path: '/', variants: ['1440-dark'] }] }
  const report = { scope: { kind: 'full' }, summary: { findings: 0, unclassified: 0 }, stages: [{ id: 'dark-desktop', status: 'pass' }], pages: [{ id: 'p', axes: [{ variant: '1440-dark', measured: 'now', findings: [] }] }] }
  const problems = reportProblems({ contract, stage: 'dark-desktop', report, exit: 0, pages: [], full: true })
  assert.ok(!problems.some((p) => /interaction/.test(p)), problems.join('; '))
})

// ── port-audit --dossier --out writes the receipt the consumers read ──────────────────────────────────────────────────────────
test('port-audit CLI: --dossier writes a receipt over the dossier\'s own files and the run\'s interaction record; flags that name other files are refused', { timeout: 60000 }, async () => {
  const { createServer } = await import('node:http')
  const { once } = await import('node:events')
  const { footerPage } = await import('./audit-fixture.mjs')
  const html = footerPage('<p>© 2026 Acme</p>', '<p>Welcome to the demo.</p>')
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html' })
    res.end(html)
  })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${server.address().port}`
  try {
    const dossier = fresh('cli')
    const run = fresh('cli-run')
    writeFileSync(path.join(dossier, 'DECISIONS.md'), '| D-1 | mega panel corner | OPEN |\n')
    const map = path.join(dossier, 'page-map.json')
    writeFileSync(map, JSON.stringify({ pages: [{ file: 'home.html', path: '/' }] }))
    writeInteraction(run, { pages: ['/'], site: origin, source: origin })
    const CLI = fileURLToPath(new URL('../review/port-audit.mjs', import.meta.url))
    // async: the fixture server lives in this process
    const go = (args) =>
      new Promise((resolve) => {
        const child = spawn(process.execPath, [CLI, '--site', origin, '--routes', map, '--source', origin, ...args])
        let stdout = ''
        let stderr = ''
        child.stdout.on('data', (d) => (stdout += d))
        child.stderr.on('data', (d) => (stderr += d))
        child.on('close', (status) => resolve({ status, stdout, stderr }))
      })
    const out = path.join(dossier, AUDIT_FILE)
    const r = await go(['--dossier', dossier, '--interaction', path.join(run, 'interaction.json'), '--out', out])
    assert.equal(r.status, 0, r.stdout + r.stderr)
    const doc = JSON.parse(readFileSync(out, 'utf8'))
    assert.equal(doc.receipt.schema, RECEIPT_SCHEMA)
    assert.equal(doc.checks.interaction.ok, true)
    assert.deepEqual(auditReceiptProblems({ dossier, site: origin, routes: ['/'], interaction: [{ file: path.join(run, 'interaction.json'), routes: ['/'], source: origin }], now: NOW }).problems, [])
    // the DECISIONS.md the audit read is the one hashed: touching it afterwards is what a consumer refuses
    touch(path.join(dossier, 'DECISIONS.md'))
    assert.ok(auditReceiptProblems({ dossier, site: origin, routes: ['/'], interaction: [{ file: path.join(run, 'interaction.json'), routes: ['/'], source: origin }], now: NOW }).problems.some((p) => p.code === 'audit-stale'))
    // inputs of another place cannot be mixed with a dossier; --out without the run it covers is a usage error
    assert.equal((await go(['--dossier', dossier, '--decisions', path.join(dossier, 'DECISIONS.md'), '--interaction', path.join(run, 'interaction.json')])).status, 2)
    assert.equal((await go(['--dossier', dossier, '--out', out])).status, 2)
    assert.equal((await go(['--dossier', dossier, '--theme-zip', out, '--interaction', path.join(run, 'interaction.json'), '--out', out])).status, 2)
    // a record that left an owed state unmeasured makes the AUDIT unclean (exit 1) and no consumer accepts the receipt
    writeInteraction(run, { pages: ['/'], site: origin, source: origin, mutate: (rec) => { rec.coverage[0].measured = false } })
    const bad = await go(['--dossier', dossier, '--interaction', path.join(run, 'interaction.json'), '--out', out])
    assert.equal(bad.status, 1, bad.stdout)
    assert.match(bad.stdout, /FAIL interaction/)
    // without --dossier the report is written, but it is not a receipt
    const plain = await go(['--decisions', path.join(dossier, 'DECISIONS.md'), '--out', path.join(run, 'plain.json')])
    assert.equal(JSON.parse(readFileSync(path.join(run, 'plain.json'), 'utf8')).receipt, undefined)
    assert.match(plain.stderr, /not a receipt/)
  } finally {
    server.close()
  }
})

test('port-audit binds interaction N/A to the dossier spec and refuses a forged or mismatched kind', { timeout: 60000 }, async () => {
  const { createServer } = await import('node:http')
  const { once } = await import('node:events')
  const html = '<!doctype html><html><body><main><p>Welcome to the demo.</p></main></body></html>'
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(html) })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${String(server.address().port)}`
  try {
    const dossier = fresh('reference-binding')
    const run = fresh('reference-binding-run')
    const mapFile = path.join(dossier, 'page-map.json')
    writeFileSync(path.join(dossier, 'DECISIONS.md'), '| D-1 | mega panel corner | OPEN |\n')
    writeFileSync(mapFile, JSON.stringify({ pages: [{ file: 'home.html', path: '/' }] }))
    writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify({ pages: [{ id: 'home', path: '/', pagemapPath: '/', referenceKind: 'none' }] }))
    writeFileSync(path.join(dossier, 'reference.json'), JSON.stringify({ kind: 'none', pages: [] }))
    const noneRecord = interactionRecord({ pages: ['/'], site: origin, source: null, mutate: (record) => {
      record.coverage = record.coverage.map((row) => row.check === 'contrast' ? row : { ...row, status: 'not-applicable', reason: 'reference.kind=none' })
    } })
    writeFileSync(path.join(run, 'interaction.json'), JSON.stringify(noneRecord))
    const CLI = fileURLToPath(new URL('../review/port-audit.mjs', import.meta.url))
    const go = (out) => new Promise((resolve) => {
      const child = spawn(process.execPath, [CLI, '--site', origin, '--routes', mapFile, '--dossier', dossier, '--interaction', path.join(run, 'interaction.json'), '--out', out])
      let stdout = ''; let stderr = ''
      child.stdout.on('data', (d) => { stdout += d }); child.stderr.on('data', (d) => { stderr += d })
      child.on('close', (status) => resolve({ status, stdout, stderr }))
    })
    const out = path.join(dossier, 'port-audit.json')
    const valid = await go(out)
    assert.equal(valid.status, 0, valid.stdout + valid.stderr)
    assert.deepEqual(auditReceiptProblems({ dossier, site: origin, routes: ['/'], interaction: [{ file: path.join(run, 'interaction.json'), routes: ['/'] }], now: NOW }).problems, [])

    writeFileSync(path.join(dossier, 'reference.json'), JSON.stringify({ kind: 'html', pages: [] }))
    assert.ok(auditReceiptProblems({ dossier, site: origin, routes: ['/'], interaction: [{ file: path.join(run, 'interaction.json'), routes: ['/'] }], now: NOW }).problems.some((p) => p.code === 'audit-inputs' && /reference\.json/.test(p.message)), 'the receipt binds the reference used to authorize N/A')
    const mismatch = await go(path.join(dossier, 'mismatch.json'))
    assert.equal(mismatch.status, 2, mismatch.stdout + mismatch.stderr)
    assert.match(mismatch.stderr, /referenceKind none does not match reference.json kind html/)

    rmSync(path.join(dossier, 'reference.json'))
    const unbound = await go(path.join(dossier, 'unbound.json'))
    assert.equal(unbound.status, 2, unbound.stdout + unbound.stderr)
    assert.match(unbound.stderr, /page-map\.json and reference\.json to bind/)

    writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify({ pages: [{ id: 'home', path: '/', pagemapPath: '/', referenceKind: 'html' }] }))
    writeFileSync(path.join(dossier, 'reference.json'), JSON.stringify({ kind: 'html', pages: [] }))
    noneRecord.origins.source = origin
    writeFileSync(path.join(run, 'interaction.json'), JSON.stringify(noneRecord))
    const forged = await go(path.join(dossier, 'forged.json'))
    assert.equal(forged.status, 1, forged.stdout + forged.stderr)
    assert.match(forged.stdout, /not-applicable without a bound reference.kind=none/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

test('html interaction audit keeps working without dossier spec files; N/A claims still require a bound none reference', { timeout: 60000 }, async () => {
  const { createServer } = await import('node:http')
  const { once } = await import('node:events')
  const server = createServer((_req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end('<!doctype html><html><body><main><p>Welcome.</p></main></body></html>') })
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const origin = `http://127.0.0.1:${String(server.address().port)}`
  try {
    const dossier = fresh('html-without-spec')
    const run = fresh('html-without-spec-run')
    const routes = path.join(fresh('html-without-spec-routes'), 'page-map.json')
    writeFileSync(routes, JSON.stringify({ pages: [{ file: 'home.html', path: '/', status: 200 }] }))
    writeFileSync(path.join(dossier, 'DECISIONS.md'), '- D-1: decorative fixture element.\n')
    writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify({ pages: [{ id: 'home', path: '/', pagemapPath: '/', referenceKind: 'html' }] }))
    writeFileSync(path.join(run, 'interaction.json'), JSON.stringify(interactionRecord({ pages: ['/'], site: origin, source: origin })))
    const CLI = fileURLToPath(new URL('../review/port-audit.mjs', import.meta.url))
    const go = (out) => new Promise((resolve) => {
      const child = spawn(process.execPath, [CLI, '--site', origin, '--source', origin, '--routes', routes, '--dossier', dossier, '--interaction', path.join(run, 'interaction.json'), '--out', out])
      let stdout = ''; let stderr = ''
      child.stdout.on('data', (d) => { stdout += d }); child.stderr.on('data', (d) => { stderr += d })
      child.on('close', (status) => resolve({ status, stdout, stderr }))
    })
    const receiptFile = path.join(dossier, 'port-audit.json')
    const valid = await go(receiptFile)
    assert.equal(valid.status, 0, valid.stdout + valid.stderr)
    assert.deepEqual(auditReceiptProblems({ dossier, site: origin, routes: ['/'], interaction: [{ file: path.join(run, 'interaction.json'), routes: ['/'], source: origin }], now: NOW }).problems, [])

    const forged = interactionRecord({ pages: ['/'], site: origin, source: origin, mutate: (record) => {
      record.coverage = record.coverage.map((row) => row.check === 'contrast' ? row : { ...row, status: 'not-applicable', reason: 'reference.kind=none' })
    } })
    writeFileSync(path.join(run, 'interaction.json'), JSON.stringify(forged))
    const forgedAudit = await go(receiptFile)
    assert.notEqual(forgedAudit.status, 0, forgedAudit.stdout + forgedAudit.stderr)
    cleanAudit({ dossier, site: origin, source: origin, routes: ['/'], runs: [run], pages: ['/'] })
    const receipt = auditReceiptProblems({ dossier, site: origin, routes: ['/'], interaction: [{ file: path.join(run, 'interaction.json'), routes: ['/'], source: origin }], now: NOW })
    assert.ok(receipt.problems.some((p) => p.code === 'audit-reference-kind' || (p.code === 'audit-interaction' && /not-applicable without a bound reference.kind=none/.test(p.message))), JSON.stringify(receipt.problems))

    writeFileSync(path.join(dossier, 'visual.contract.json'), JSON.stringify({ pages: [{ id: 'home', path: '/', pagemapPath: '/', referenceKind: 'none' }] }))
    const unbound = await go(path.join(dossier, 'unbound.json'))
    assert.equal(unbound.status, 2, unbound.stdout + unbound.stderr)
    assert.match(unbound.stderr, /page-map\.json and reference\.json to bind/)
    cleanAudit({ dossier, site: origin, source: origin, routes: ['/'], runs: [run], pages: ['/'] })
    const noSpecReceipt = auditReceiptProblems({ dossier, site: origin, routes: ['/'], interaction: [{ file: path.join(run, 'interaction.json'), routes: ['/'], source: origin }], now: NOW })
    assert.ok(noSpecReceipt.problems.some((p) => p.code === 'audit-reference-kind'), JSON.stringify(noSpecReceipt.problems))
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})

// ── section 2: an interaction record that measured nothing owed is never clean ───────────────────────────────────────────────
test('attestation: a record that lists every check with examined 1 and no per-case coverage is refused', () => {
  const rec = interactionRecord({ pages: ['/'] })
  assert.deepEqual(validateInteractionRecord(rec, { owed: { routes: ['/'], site: SITE, source: SRC } }), [])
  const thin = { tool: rec.tool, status: 'run', thresholds: rec.thresholds, pages: ['/'], checks: rec.checks, examined: 1, findings: [], notMeasured: [], blocking: false }
  assert.match(validateInteractionRecord(thin, { owed: {} }).join(), /interaction\.coverage is missing or empty/)
  assert.match(interactionAttestationProblems({ ...rec, coverage: [] }).join(), /coverage is missing or empty/)
})

test('attestation: an owed case with no row, an unmeasured one, a duplicate and an invented one are each refused', () => {
  const rec = interactionRecord({ pages: ['/a', '/b'] })
  const p = (mutate, owed = {}) => interactionAttestationProblems((() => { const r = structuredClone(rec); mutate(r); return r })(), owed).join(' | ')
  assert.equal(p(() => {}), '')
  assert.match(p((r) => r.coverage.splice(0, 1)), /was owed and has no row in the record/)
  assert.match(p((r) => (r.coverage.find((c) => c.check === 'header' && c.route === '/b' && c.width === 1280).measured = false)), /header \/b 1280px was owed and NOT measured/)
  assert.match(p((r) => r.coverage.push({ ...r.coverage[0] })), /twice/)
  assert.match(p((r) => r.coverage.push({ check: 'form', route: '/zzz', width: 1440, theme: null, measured: true })), /outside the grid/)
  // a page the consumer measured that the record does not list
  assert.match(p(() => {}, { routes: ['/a', '/c'] }), /does not list the page \/c/)
  // a cut-short run: the owed cases past the budget are rows with measured false (the producer records them), never absent
  assert.match(p((r) => r.coverage.filter((c) => c.check === 'header').forEach((c) => (c.measured = false))), /NOT measured/)
})

test('attestation: another site or source origin, a narrowed tier list and a narrowed check list are refused', () => {
  const rec = interactionRecord({ pages: ['/'] })
  const p = (mutate, owed = {}) => interactionAttestationProblems((() => { const r = structuredClone(rec); mutate(r); return r })(), owed).join(' | ')
  assert.match(p(() => {}, { site: 'http://other.test' }), /measured at http:\/\/site\.test, this consumer's site is http:\/\/other\.test/)
  assert.match(p(() => {}, { source: 'http://other-source.test' }), /compared with http:\/\/source\.test, this consumer's source is/)
  assert.match(p((r) => (r.origins.source = null)), /origins\.source is null/)
  assert.match(p((r) => (r.tiers.drawerWidths = [390])), /tiers\.drawerWidths is \[390\]/)
  assert.match(p((r) => (r.tiers.drawerThemes = ['light'])), /tiers\.drawerThemes/)
  assert.match(p((r) => (r.tiers.headerWidths = [390, 1440])), /tiers\.headerWidths/)
  assert.match(p((r) => (r.checks = r.checks.filter((c) => c !== 'form'))), /interaction\.checks/)
  assert.match(p((r) => (r.chromePages = [])), /chromePages is empty/)
  assert.match(p((r) => (r.chromePages = ['/nowhere'])), /not a page of the record/)
  // a record that narrowed its own tiers cannot make the grid smaller: the grid is the tool's
  assert.equal(owedCases({ pages: ['/'] }).filter((c) => c.check === 'header').length, 7)
})

test('attestation: source obligations need one outcome and a complete discovery, including an empty discovery', () => {
  const rec = interactionRecord({ pages: ['/'] })
  const row = { check: 'drawer', route: '/', width: 390, theme: 'light' }
  rec.obligations = [{ ...row, id: 'drawer:/|390|light|0' }]
  rec.outcomes = []
  rec.discoveries.find((d) => d.check === row.check && d.route === row.route && d.width === row.width && d.theme === row.theme).count = 1
  const p = () => interactionAttestationProblems(rec).join(' | ')
  assert.match(p(), /has 0 outcomes/ , 'a source parent dropped after an error stays detectable')
  rec.outcomes = [{ id: rec.obligations[0].id, outcome: 'ok' }]
  assert.equal(p(), '')
  rec.outcomes.push({ ...rec.outcomes[0] })
  assert.match(p(), /more than one outcome/)
  rec.outcomes = []
  rec.obligations = []
  const discovery = rec.discoveries.find((d) => d.check === row.check && d.route === row.route && d.width === row.width && d.theme === row.theme)
  discovery.count = 0
  discovery.complete = false
  assert.match(p(), /incomplete discovery/)
  discovery.complete = true
  assert.equal(p(), '', 'an empty list passes only when a complete discovery found zero')
  discovery.count = 1
  assert.match(p(), /discovered 1, obligations recorded 0/)
})

test('attestation: a form obligation without an outcome and duplicate outcomes are refused', () => {
  const rec = interactionRecord({ pages: ['/'] })
  const obligation = { check: 'form', route: '/', width: 1440, theme: null, id: 'form:/|1440||form-0' }
  rec.obligations = [obligation]
  rec.outcomes = []
  rec.discoveries.find((d) => d.check === 'form').count = 1
  assert.match(interactionAttestationProblems(rec).join(), /has 0 outcomes/)
  rec.outcomes = [{ id: obligation.id, outcome: 'finding' }, { id: obligation.id, outcome: 'notMeasured' }]
  assert.match(interactionAttestationProblems(rec).join(), /more than one outcome/)
})

const obligationFixture = ({ check = 'drawer', complete = true, count = 1, measured = true, outcomes = [] } = {}) => {
  const rec = interactionRecord({ pages: ['/'] })
  const tier = check === 'drawer' ? { width: 390, theme: 'light' } : { width: 1440, theme: null }
  const row = { check, route: '/', ...tier }
  const obligation = { ...row, id: `${check}:/|${tier.width}|${tier.theme ?? ''}|source-0`, selector: 'source-0' }
  rec.coverage.find((c) => c.check === check && c.width === tier.width && c.theme === tier.theme).measured = measured
  rec.obligations = count ? [obligation] : []
  rec.outcomes = outcomes.map((outcome) => ({ id: obligation.id, outcome }))
  rec.discoveries = rec.discoveries.map((d) => d.check === check && d.width === tier.width && d.theme === tier.theme ? { ...d, complete, count } : d)
  return rec
}

test('attestation: a source drawer parent that failed to produce an outcome is detected', () => {
  assert.match(interactionAttestationProblems(obligationFixture()).join(), /has 0 outcomes/)
})

test('attestation: a source form that has no outcome is detected', () => {
  assert.match(interactionAttestationProblems(obligationFixture({ check: 'form' })).join(), /has 0 outcomes/)
})

test('attestation: a drawer discovery cut short by the state cap cannot pass as measured', () => {
  const rec = obligationFixture({ complete: false, count: 0, measured: false })
  assert.match(interactionAttestationProblems(rec).join(), /drawer \/ 390px light was owed and NOT measured/)
})

test('attestation: an empty list with incomplete discovery is refused', () => {
  assert.match(interactionAttestationProblems(obligationFixture({ count: 0, complete: false })).join(), /incomplete discovery/)
})

test('attestation: an empty list passes only after complete discovery of zero', () => {
  assert.deepEqual(interactionAttestationProblems(obligationFixture({ count: 0, complete: true })), [])
})

test('attestation: duplicate outcomes for one obligation are refused', () => {
  const rec = obligationFixture({ outcomes: ['ok', 'finding'] })
  assert.match(interactionAttestationProblems(rec).join(), /more than one outcome/)
  rec.outcomes = [{ id: 'orphan-id', outcome: 'ok' }]
  assert.match(interactionAttestationProblems(rec).join(), /has no obligation for orphan-id/)
})

test('attestation: the audit and the consumer both refuse a record with an owed state unmeasured — "clean" cannot be produced by measuring nothing', () => {
  const w = world({ record: { mutate: (r) => { r.coverage.find((c) => c.check === 'drawer').measured = false } } })
  const r = w.check()
  assert.ok(r.problems.some((p) => p.code === 'audit-interaction' && /drawer .* was owed and NOT measured/.test(p.message)), JSON.stringify(r.problems))
  const notMeasured = world({ record: { mutate: (rec) => { rec.notMeasured.push({ route: '/', check: 'form', reason: 'x' }) } } })
  assert.ok(notMeasured.check().problems.some((p) => p.code === 'audit-interaction' && /not measured — an interaction record with one is not clean/.test(p.message)))
})

test('advisory: interaction findings never make the receipt unclean; a state not measured still does', () => {
  const finding = { kind: 'nav-current-missing', route: '/', width: 390, theme: 'light', control: 'x' }
  const w = world({ record: { mutate: (rec) => { rec.findings.push(finding) } } })
  assert.deepEqual(w.check().problems, [], 'a record with findings is a clean receipt input')
  assert.deepEqual(validateInteractionRecord(interactionRecord({ pages: ['/'], mutate: (rec) => { rec.findings.push(finding) } }), { owed: {} }), [])
})

test('scope: a patch receipt is clean on site-facing checks; the bookkeeping classes are advisories and never make it unclean', () => {
  const dossier = fresh('patch-dossier')
  const zip = 'a'.repeat(64)
  const checks = { decisions: { ok: false, blocking: 13 }, exceptions: { ok: false, errors: new Array(9).fill('x') } }
  const report = cleanAudit({ dossier, site: SITE, routes: ['/'], theme: `sha256:${zip}`, checks })
  assert.equal(report.ok, true)
  assert.deepEqual(report.receipt.advisories, { decisions: 13, exceptions: 9 })
  const r = auditReceiptProblems({ dossier, site: SITE, routes: ['/'], scope: 'patch', theme: zip, now: NOW })
  assert.deepEqual(r.problems, [])
  assert.deepEqual(r.audit.advisories, { decisions: 13, exceptions: 9 })
  // a site-facing finding is unclean in the same scope
  const dirty = fresh('patch-dirty')
  cleanAudit({ dossier: dirty, site: SITE, routes: ['/'], theme: `sha256:${zip}`, ok: false, checks: { 'cms-leftovers': { ok: false } } })
  assert.ok(auditReceiptProblems({ dossier: dirty, site: SITE, routes: ['/'], scope: 'patch', theme: zip, now: NOW }).problems.some((p) => p.code === 'audit-not-clean'))
  // the same bookkeeping failures make a VISUAL receipt unclean
  const w = world({ ok: false, checks })
  assert.ok(w.codes().includes('audit-not-clean'))
  assert.match(w.check().problems.find((p) => p.code === 'audit-not-clean').message, /decisions/)
  // a malformed advisories block is a malformed receipt
  const bad = fresh('patch-bad')
  cleanAudit({ dossier: bad, site: SITE, routes: ['/'], theme: `sha256:${zip}`, mutate: (x) => { x.receipt.advisories = { decisions: 'many' } } })
  assert.ok(auditReceiptProblems({ dossier: bad, site: SITE, routes: ['/'], scope: 'patch', theme: zip, now: NOW }).problems.some((p) => p.code === 'audit-invalid'))
})
