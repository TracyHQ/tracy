// VERIFICATION.json goes onto a public release: it keeps measurements and hashes, never a stand origin or a path of the build machine.
import test from 'node:test'
import assert from 'node:assert/strict'
import { homedir } from 'node:os'
import { verificationRecord } from '../quickstart/release.mjs'

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
