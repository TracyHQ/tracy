// VERIFICATION.json and fix-measure.json go onto a release: they keep measurements and hashes, never a stand origin or a path of the build machine.
import test from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { portableFingerprint, portableMeasure, portableVerification, verificationRecord } from '../quickstart/release.mjs'
import { fingerprintOf, validateFingerprint } from '../lib/source-fingerprint.mjs'
import { validateFixMeasure, writeFixMeasure } from '../lib/fix-measure.mjs'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

const home = homedir()
const manifest = { id: 'quickstart/x/wp7', version: '1.0.0', platform: 'wordpress', prefix: 'tr_', theme: { name: 't' } }
const parity = { a: 'http://127.0.0.1:8782', b: 'http://127.0.0.1:8789', ok: true, routes: [{ path: '/menu', expected: 200, a: 200, b: 200 }], counts: [], styles: {}, summary: { routes: 1 }, generatedAt: 't' }
const acceptance = {
  visual: {
    ledger: `${home}/tracy-data/x/evidence/rounds.jsonl`,
    checkpoint: 'rc-1',
    tiers: [{ stage: 'light-desktop', dir: `${home}/tracy-data/x/evidence/rc-1/light-desktop`, site: 'http://127.0.0.1:8789', report: 'sha256:aa', status: 'pass', pages: 3 }]
  },
  behaviour: { site: 'http://localhost:8789', routes: 3 },
  runtime: { webroot: '/var/www/html', siteUrl: 'http://127.0.0.1:8789' }
}
const restoreReport = { steps: [{ name: 'home', value: 'http://127.0.0.1:8789' }, { name: 'wp-config', dbHost: 'verify-db' }], finishedAt: 't' }

test('a release record carries no stand origin and no machine path, and keeps what readers need', () => {
  const v = verificationRecord({ manifest, parity, restoreReport, acceptance, visual: { run: 'rc-1', at: 't', summary: { stages: { 'light-desktop': 'pass' }, findings: 0 } } }, { repoRoot: null })
  const text = JSON.stringify(v)
  assert.doesNotMatch(text, /127\.0\.0\.1|localhost|:87\d\d/)
  assert.ok(!text.includes(home), 'no home directory')
  assert.doesNotMatch(text, /~\/|\/Users\//)
  assert.equal(v.parity.source, 'source stand')
  assert.equal(v.parity.restored, 'restored stand')
  // measurements, hashes and the fields a --previous reader uses
  assert.deepEqual([v.release, v.version, v.gate], ['quickstart/x/wp7', '1.0.0', 'full'])
  assert.deepEqual(v.visual.stages, { 'light-desktop': 'pass' })
  assert.equal(v.parity.routes.table[0].path, '/menu')
  assert.equal(v.acceptance.visual.tiers[0].report, 'sha256:aa')
  assert.equal(v.acceptance.visual.tiers[0].status, 'pass')
  assert.equal('dir' in v.acceptance.visual.tiers[0], false)
  assert.equal(v.acceptance.runtime.webroot, '/var/www/html')
})

test('a machine path inside a longer message is cut, a repository-relative one stays', () => {
  const v = verificationRecord({ manifest, parity, restoreReport: { steps: [{ name: 'n', note: `Evidence in ~/tracy-data/site/evidence/rounds.jsonl and /Users/x/a/b.log, /tmp/q/r.txt. Kept: tasks/evidence/site/rounds.jsonl` }] } }, { repoRoot: null })
  const note = v.restoration.steps[0].note
  assert.equal(note, 'Evidence in rounds.jsonl and b.log, r.txt. Kept: tasks/evidence/site/rounds.jsonl')
})

test('IPv6 stand origins are replaced too', () => {
  const v = verificationRecord({ manifest, parity, restoreReport: { steps: [{ name: 'a', value: 'http://[::ffff:127.0.0.1]:8789/' }, { name: 'b', value: 'see http://[::1]:8789/x' }] } }, { repoRoot: null })
  assert.deepEqual(v.restoration.steps.map((s) => s.value), ['a stand/', 'see a stand/x'])
})

test('a file:// URL of a machine path is cut to the file name', () => {
  const v = verificationRecord({ manifest, parity, restoreReport: { steps: [{ name: 'n', note: 'Trace at file:///Users/x/secret/log.txt' }] } }, { repoRoot: null })
  assert.equal(v.restoration.steps[0].note, 'Trace at log.txt')
})

test('only loopback IPv6 is a stand origin; a documentation address stays', () => {
  const v = verificationRecord({ manifest, parity, restoreReport: { steps: [{ name: 'a', value: 'https://[2001:db8::1]/reference' }, { name: 'b', value: 'http://[::1]:80/' }] } }, { repoRoot: null })
  assert.deepEqual(v.restoration.steps.map((s) => s.value), ['https://[2001:db8::1]/reference', 'a stand/'])
})

const LOCAL = /127\.0\.0\.1|localhost|:87\d\d|\/Users\/|~\//
const sourceFp = fingerprintOf({ url: 'http://127.0.0.1:8791/', html: '<p>home</p>', template: { name: 'ja_example', version: '1.0.0' } })

test('a source fingerprint is published on the placeholder origin and still validates', () => {
  const f = portableFingerprint(sourceFp)
  assert.equal(f.url, 'https://quickstart.invalid/')
  assert.equal(f.htmlSha256, sourceFp.htmlSha256)
  assert.deepEqual(f.template, sourceFp.template)
  assert.deepEqual(validateFingerprint(f), [])
  assert.notEqual(f.id, sourceFp.id)
  // a fingerprint of a real host is not touched, nor one that did not validate as measured
  const real = fingerprintOf({ url: 'https://example.com/', html: '<p>x</p>' })
  assert.equal(portableFingerprint(real), real)
  const broken = { ...sourceFp, id: 'x' }
  assert.deepEqual(portableFingerprint(broken), { ...broken, url: 'https://quickstart.invalid/' })
})

test('VERIFICATION.json carries the measure and baseline fingerprints without the stand origin', () => {
  const v = portableVerification({ measure: { site: 'http://127.0.0.1:8792', sourceFingerprint: sourceFp }, baseline: { version: '1.0.3', sourceFingerprint: sourceFp } })
  assert.doesNotMatch(JSON.stringify(v), LOCAL)
  assert.equal(v.measure.site, 'a stand')
  assert.deepEqual(v.measure.sourceFingerprint, portableFingerprint(sourceFp))
  assert.deepEqual(v.baseline.sourceFingerprint, portableFingerprint(sourceFp))
  // the record and the published measure name the source by the same fingerprint
  assert.equal(v.measure.sourceFingerprint.id, portableMeasure({ sourceFingerprint: sourceFp }).sourceFingerprint.id)
})

test('fix-measure.json as published: stand origins on the placeholder origin, machine paths cut, still a valid measure', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'fix-measure-portable-'))
  try {
    const checks = [{ id: 'A1', title: 'hero height', pass: true, cases: 3, defects: 0, evidence: `${home}/tracy-data/diner/sweep/report.json` }]
    const m = writeFixMeasure(path.join(dir, 'fix-measure.json'), {
      tool: 'site-sweep.mjs', site: 'http://127.0.0.1:8792', source: 'http://127.0.0.1:8791', themeZipSha256: 'a'.repeat(64),
      ranAt: new Date().toISOString(), checks, sourceFingerprint: sourceFp
    })
    assert.deepEqual(validateFixMeasure(m), [])
    const p = portableMeasure(m)
    const text = JSON.stringify(p)
    assert.doesNotMatch(text, LOCAL)
    assert.ok(!text.includes(home), 'no home directory')
    assert.equal(p.site, 'https://quickstart.invalid')
    assert.equal(p.source, 'https://quickstart.invalid')
    assert.equal(p.checks[0].evidence, 'report.json')
    assert.deepEqual([p.passed, p.total, p.artifact, p.checks[0].pass], [m.passed, m.total, m.artifact, true])
    assert.deepEqual(validateFixMeasure(p), [])
    // a measure that names no stand and no machine path is left as it is
    const clean = { ...m, site: 'https://example.com', source: 'https://example.org', sourceFingerprint: undefined, checks: [{ ...checks[0], evidence: 'report.json' }] }
    assert.deepEqual(portableMeasure(clean), clean)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('a site route under /home is not a machine path: it stays whole in the record and in the published measure', () => {
  const text = 'scheme: footer-text-colour on 1 route(s) — e.g. /home/home-red @1440, evidence in /Users/x/sweep/report.json'
  const v = portableVerification({ parity: { routes: { table: [{ path: '/home/home-red' }] } }, notDefects: [{ what: text }] })
  assert.equal(v.parity.routes.table[0].path, '/home/home-red')
  assert.equal(v.notDefects[0].what, 'scheme: footer-text-colour on 1 route(s) — e.g. /home/home-red @1440, evidence in report.json')
  assert.equal(portableMeasure({ what: text }).what, v.notDefects[0].what)
})
