import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'
import { classifyJourney, worstOf } from '../adapter/classify.mjs'
import { runLegacy } from '../adapter/legacy.mjs'
import { PATCHES, TransportPatchError, applyPatches } from '../adapter/transport.mjs'
import { REPO, readJson, safeJoin } from '../util.mjs'
import { tmpDir } from './helpers.mjs'
import { readTextSync } from '../../../lib/bounded-reader.mjs'

const rec = (over = {}) => ({
  id: 'J6',
  cms: null,
  verdict: 'PASS',
  reason: null,
  retries: 0,
  attempts: [{ attempt: 0, verdict: 'PASS', reason: null, notes: [] }],
  ...over
})
const want = { journey: 'J6', cms: null }

test('classify: a clean legacy PASS is only a candidate', () => {
  const r = classifyJourney(rec(), want)
  assert.equal(r.verdict, 'PASS')
  assert.equal(r.candidate, true)
})

test('classify: BLOCKED is never PASS — environment kinds are ENV, anything else PENDING', () => {
  const blocked = (reason) =>
    rec({ verdict: 'BLOCKED', reason, attempts: [{ attempt: 0, verdict: 'BLOCKED', reason }] })
  const env = classifyJourney(blocked('[model] no credentials'), want)
  assert.equal(env.verdict, 'ENV')
  assert.match(env.reason, /legacy probe/)
  assert.equal(classifyJourney(blocked('[weird] something'), want).verdict, 'PENDING')
  assert.equal(classifyJourney(blocked(''), want).verdict, 'PENDING')
})

test('classify: FAIL keeps the first failing attempt; a transport failure is TEST_INVALID, not a product FAIL', () => {
  const failing = rec({
    verdict: 'FAIL',
    reason: 'second',
    attempts: [
      { attempt: 0, verdict: 'FAIL', reason: 'first divergence' },
      { attempt: 1, verdict: 'FAIL', reason: 'second' }
    ]
  })
  const r = classifyJourney(failing, want)
  assert.equal(r.verdict, 'FAIL')
  assert.match(r.reason, /first divergence/)
  const t = classifyJourney(
    rec({
      verdict: 'FAIL',
      reason: 'no local equivalent of the dev health script',
      attempts: [{ attempt: 0, verdict: 'FAIL', reason: 'no local equivalent of the dev health script' }]
    }),
    want
  )
  assert.equal(t.verdict, 'PENDING')
  assert.match(t.reason, /TEST_INVALID: transport/)
})

test('classify: a missing browser or Docker binary named by the failure is ENV, not a product FAIL', () => {
  const reason = "browserType.launch: Executable doesn't exist at /x/chromium"
  const r = classifyJourney(
    rec({ verdict: 'FAIL', reason, attempts: [{ attempt: 0, verdict: 'FAIL', reason }] }),
    want
  )
  assert.equal(r.verdict, 'ENV')
  assert.match(r.reason, /legacy probe/)
})

test('classify: PASS after a retry, with a known-error note, J1, or --keep is not a candidate', () => {
  const retry = classifyJourney(
    rec({
      attempts: [
        { attempt: 0, verdict: 'FAIL', reason: 'flaked' },
        { attempt: 1, verdict: 'PASS' }
      ]
    }),
    want
  )
  assert.equal(retry.verdict, 'PENDING')
  assert.match(retry.reason, /retry/)
  const known = classifyJourney(
    rec({ attempts: [{ attempt: 0, verdict: 'PASS', notes: ['known error dsh-subscriptions-status-404'] }] }),
    want
  )
  assert.equal(known.verdict, 'PENDING')
  assert.equal(classifyJourney(rec({ id: 'J1' }), { journey: 'J1', cms: null }).verdict, 'PENDING')
  assert.equal(classifyJourney(rec(), { ...want, keep: true }).verdict, 'PENDING')
})

test('classify: malformed or inconsistent records are TEST_INVALID, never PASS', () => {
  for (const bad of [
    null,
    [],
    'x',
    {},
    rec({ id: 'J7' }),
    rec({ cms: 'wordpress' }),
    rec({ verdict: 'MAYBE' }),
    rec({ attempts: [] }),
    rec({ attempts: 'x' }),
    rec({ attempts: [{ verdict: 'FAIL' }] })
  ]) {
    const r = classifyJourney(bad, want)
    assert.equal(r.verdict, 'PENDING', JSON.stringify(bad))
    assert.match(r.reason, /TEST_INVALID/)
  }
  assert.equal(
    classifyJourney(
      rec({ verdict: 'NOT RUN', reason: 'no result recorded', attempts: [{ verdict: 'NOT RUN' }] }),
      want
    ).verdict,
    'PENDING'
  )
})

test('worstOf ranks FAIL over PENDING over ENV over PASS', () => {
  const v = (verdict) => ({ verdict })
  assert.equal(worstOf([v('PASS'), v('ENV'), v('PENDING'), v('FAIL')]).verdict, 'FAIL')
  assert.equal(worstOf([v('PASS'), v('ENV')]).verdict, 'ENV')
})

test('transport patches apply exactly once to the current legacy suite and leave valid modules', () => {
  const seen = new Set()
  for (const rel of ['lib/dev.mjs', 'lib/browser.mjs', 'journeys/J11.test.mjs']) {
    const file = path.join(REPO, 'tests/e2e-dev', rel)
    const { source, applied } = applyPatches(file.split(path.sep).join('/'), readTextSync(file))
    assert.ok(applied.length > 0, rel)
    for (const a of applied) seen.add(a.id)
    const tmp = path.join(tmpDir('patched'), 'm.mjs')
    writeFileSync(tmp, source)
    execFileSync(process.execPath, ['--check', tmp])
  }
  assert.deepEqual([...seen].sort(), PATCHES.map((p) => p.id).sort(), 'every patch was exercised')
})

test('a patch that matches zero or two times refuses the branch', () => {
  const file = `${REPO}/tests/e2e-dev/lib/browser.mjs`
  const src = readTextSync(file)
  assert.throws(() => applyPatches(file, src.replace('secure: true', 'secure: false')), TransportPatchError)
  const twice = `${src}\n${src.match(/domain: ENV\.cookieDomain,\s*path: '\/',\s*secure: true,/)[0]}`
  assert.throws(() => applyPatches(file, twice), /matches 2/)
  assert.deepEqual(applyPatches('/elsewhere/other.mjs', 'x').applied, [])
})

test('safeJoin and readJson refuse traversal, absolute paths, symlinks and non-regular files', () => {
  const root = tmpDir('safe')
  mkdirSync(path.join(root, 'sub'))
  assert.equal(safeJoin(root, 'sub/a.json'), path.join(realpathSync(root), 'sub', 'a.json'))
  assert.throws(() => safeJoin(root, '../x'), /escapes/)
  assert.throws(() => safeJoin(root, '/etc/passwd'), /absolute/)
  assert.throws(() => safeJoin(root, 'sub/../../x'), /escapes/)
  symlinkSync('/etc', path.join(root, 'link'))
  assert.throws(() => safeJoin(root, 'link/passwd'), /symlink/)
  writeFileSync(path.join(root, 'real.json'), '{"a":1}')
  symlinkSync(path.join(root, 'real.json'), path.join(root, 'ln.json'))
  assert.throws(() => readJson(path.join(root, 'ln.json')), /not a regular file/)
  writeFileSync(path.join(root, 'empty.json'), '')
  assert.throws(() => readJson(path.join(root, 'empty.json')), /empty/)
  execFileSync('mkfifo', [path.join(root, 'pipe.json')])
  assert.throws(() => readJson(path.join(root, 'pipe.json')), /not a regular file/)
  assert.deepEqual(readJson(path.join(root, 'real.json')), { a: 1 })
})

// A stand-in runner: writes the files the real one writes, so runLegacy is exercised end to end.
const fakeRunner = (dir, body) => {
  const file = path.join(dir, 'fake-runner.mjs')
  writeFileSync(
    file,
    `import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
const cfg = JSON.parse((await import('node:fs')).readFileSync(process.env.QA_FLOWS_TRANSPORT, 'utf8'))
const id = process.argv[process.argv.indexOf('--runId') + 1]
const dir = join(cfg.resultsRoot, id, 'journeys')
mkdirSync(dir, { recursive: true })
const w = (name, v) => writeFileSync(join(dir, name), typeof v === 'string' ? v : JSON.stringify(v))
${body}
`
  )
  return file
}
const stand = {
  origin: 'http://localhost:1',
  siteDomain: 'localhost',
  containers: { web: 'w', host: 'h', postgres: 'p', dsh: 'd' }
}
const good = (id, cms = null) =>
  JSON.stringify({
    id,
    cms,
    verdict: 'PASS',
    reason: null,
    attempts: [{ attempt: 0, verdict: 'PASS', reason: null, notes: [] }]
  })

test('runLegacy reads the runner’s JSON: PASS candidate, missing file, malformed file, FAIL', async () => {
  const dir = tmpDir('legacy')
  const runner = fakeRunner(
    dir,
    `w('J6.json', ${JSON.stringify(good('J6'))})
w('J7.json', '{ broken')
w('J8.json', ${JSON.stringify(JSON.stringify({ id: 'J8', cms: null, verdict: 'FAIL', reason: 'boom', attempts: [{ attempt: 0, verdict: 'FAIL', reason: 'boom' }] }))})`
  )
  const r = await runLegacy({ journeys: ['J6', 'J7', 'J8', 'J9'], stand, outDir: dir, runner })
  assert.equal(r.byJourney.get('J6').candidate, true)
  assert.match(r.byJourney.get('J7').reason, /TEST_INVALID.*malformed/)
  assert.equal(r.byJourney.get('J8').verdict, 'FAIL')
  assert.match(r.byJourney.get('J9').reason, /TEST_INVALID: no usable result/)
  for (const j of r.byJourney.values())
    for (const e of j.evidence) assert.ok(!path.isAbsolute(e), 'evidence is relative to outDir')
})

test('runLegacy: per-CMS journeys need every CMS; a timeout leaves PENDING, never PASS', async () => {
  const dir = tmpDir('legacy-cms')
  const runner = fakeRunner(dir, `w('J2b-wordpress.json', ${JSON.stringify(good('J2b', 'wordpress'))})`)
  const r = await runLegacy({ journeys: ['J2b'], cms: ['wordpress', 'joomla'], stand, outDir: dir, runner })
  assert.equal(r.byJourney.get('J2b').candidate, false)
  assert.equal(r.byJourney.get('J2b').verdict, 'PENDING')
  const dir2 = tmpDir('legacy-timeout')
  const slow = fakeRunner(dir2, 'await new Promise((r) => setTimeout(r, 30000))')
  const t = await runLegacy({ journeys: ['J6'], stand, outDir: dir2, runner: slow, timeoutMs: 800 })
  assert.equal(t.timedOut, true)
  assert.match(t.problem, /timed out/)
  assert.equal(t.byJourney.get('J6').verdict, 'PENDING')
})

test('runLegacy refuses bad journey ids and unknown cms before running anything', async () => {
  const dir = tmpDir('legacy-bad')
  await assert.rejects(() => runLegacy({ journeys: ['J6; rm -rf /'], stand, outDir: dir }), /bad journey/)
  await assert.rejects(
    () => runLegacy({ journeys: ['J6'], cms: ['drupal'], stand, outDir: dir }),
    /unknown cms/
  )
})

test('the hooks resolve env.mjs to the local twin and refuse a label outside the pool', async () => {
  const dir = tmpDir('hooks')
  const cfg = path.join(dir, 't.json')
  writeFileSync(
    cfg,
    JSON.stringify({
      origin: 'http://localhost:4000',
      siteDomain: 'localhost',
      containers: { web: 'tchqa-tracy-web-1', host: 'h', postgres: 'p', dsh: 'd' },
      resultsRoot: dir
    })
  )
  const probe = path.join(dir, 'probe.mjs')
  writeFileSync(
    probe,
    `import { ENV, runLabel, siteOrigin } from '${REPO}/tests/e2e-dev/lib/env.mjs'
import * as twin from '${REPO}/tests/e2e-dev/lib/env.mjs'
const out = { origin: ENV.origin, site: siteOrigin('x'), label: runLabel('abcd', 'sw1') }
out.names = Object.keys(twin).sort()
out.envKeys = Object.keys(ENV).sort()
out.profileKeys = Object.keys(twin.PROFILES[ENV.name]).sort()
out.address = twin.addressLabel('tchqa-sw1')
try { runLabel('abcd', 'zz') } catch (e) { out.refused = e.message }
console.log(JSON.stringify(out))`
  )
  const register = path.join(REPO, 'tests/qa/layers/flows/adapter/register.mjs')
  const out = execFileSync(process.execPath, ['--import', `file://${register}`, probe], {
    env: { ...process.env, QA_FLOWS_TRANSPORT: cfg }
  })
  const got = JSON.parse(String(out))
  assert.equal(got.origin, 'http://localhost:4000')
  assert.equal(got.site, 'http://x.localhost:4000')
  assert.equal(got.label, 'tchqa-sw1')
  assert.match(got.refused, /outside the owned pool/)
  // The twin keeps every name the legacy module has today: a name develop adds there and the twin
  // lacks is an import error in the adapted suite, so it fails here first.
  const legacy = await import(pathToFileURL(path.join(REPO, 'tests/e2e-dev/lib/env.mjs')).href)
  assert.deepEqual(got.names, Object.keys(legacy).sort())
  assert.deepEqual(got.envKeys, Object.keys(legacy.ENV).sort())
  assert.deepEqual(got.profileKeys, Object.keys(legacy.PROFILES[legacy.ENV.name]).sort())
  assert.equal(got.address, 'tchqa-sw1')
})
