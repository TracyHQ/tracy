// The live reporter (test/audit-live.mjs): inputs are refused before any site is read, unreachable sites are "not-measured" for every
// class, and the report carries raw detector output only — no judgement of a finding, no reconciliation against another audit.
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CLASSES, citationFindingRows, liveInternals, profileDossiers } from './audit-live.mjs'
import { testDir } from './lib/test-root.mjs'

const LIVE = fileURLToPath(new URL('./audit-live.mjs', import.meta.url))
const live = (args) => spawnSync(process.execPath, [LIVE, ...args], { encoding: 'utf8', timeout: 120000 })
const liveBase = (out) => ['--profile', 'impact', '--source', 'http://127.0.0.1:9', '--target', 'http://127.0.0.1:10', '--out', out, '--timeout-seconds', '60']

test('audit-live: missing, unknown, duplicate and invalid options are refused with exit 2 before any site is read', () => {
  const dir = testDir('audit-live-args')
  const out = join(dir, 'out')
  const ok = liveBase(out)
  assert.equal(live(['--nope', 'x']).status, 2)
  assert.equal(live([...ok, '--profile', 'essence']).status, 2, 'a repeated option')
  assert.equal(live([...ok, '--audit-report', 'x.md']).status, 2, 'the reconciliation input no longer exists')
  for (const need of ['--profile', '--source', '--target', '--out', '--timeout-seconds']) {
    const i = ok.indexOf(need)
    const r = live(ok.filter((_, j) => j !== i && j !== i + 1))
    assert.equal(r.status, 2, need)
    assert.match(r.stderr, new RegExp(`${need} is required`))
  }
  const swap = (flag, value) => ok.map((x, i) => (ok[i - 1] === flag ? value : x))
  assert.match(live(swap('--profile', 'kinetic')).stderr, /--profile must be one of/)
  assert.match(live(swap('--timeout-seconds', '5')).stderr, /between 30 and 7200/)
  assert.match(live(swap('--timeout-seconds', 'soon')).stderr, /between 30 and 7200/)
  assert.match(live(swap('--target', 'http://127.0.0.1:9')).stderr, /same origin/)
  assert.match(live(swap('--source', 'http://127.0.0.1:9/index.php')).stderr, /bare http/)
  assert.match(live([...ok, '--widths', '390,390']).stderr, /unique integers/)
  assert.match(live([...ok, '--widths', '100']).stderr, /unique integers/)
  assert.match(live([...ok, '--fallback', 'anything']).stderr, /local-fixtures/)
  mkdirSync(join(dir, 'adir'))
  writeFileSync(join(dir, 'afile'), 'x')
  symlinkSync(join(dir, 'adir'), join(dir, 'dirlink'))
  assert.match(live(swap('--out', join(dir, 'afile'))).stderr, /not a directory/)
  assert.match(live(swap('--out', join(dir, 'dirlink'))).stderr, /not a directory/)
  assert.match(live(swap('--out', join(dir, 'nodir', 'out'))).stderr, /does not exist/)
  assert.equal(existsSync(out), false, 'a refused run creates nothing')
})

test('audit-live: unreachable sites are "not-measured" for every class, exit 3; local fixtures only ever as a labelled fallback; nothing is labelled real or false', () => {
  const dir = testDir('audit-live-down')
  const out = join(dir, 'out')
  const r = live([...liveBase(out), '--fallback', 'local-fixtures'])
  assert.equal(r.status, 3, r.stderr)
  const report = JSON.parse(readFileSync(join(out, 'live-report.json'), 'utf8'))
  assert.equal(report.live, 'unavailable')
  assert.ok(report.classes.length >= 12 && report.classes.every((c) => c.status === 'not-measured'), 'no class is none-found without a live read')
  assert.match(report.fallback.note, /NOT evidence about the live sites/)
  assert.equal(report.fallback.drawerSubmenuDetectorFires, true, 'the fixture detector fires, and says nothing about the live site')
  const text = readFileSync(join(out, 'REPORT.md'), 'utf8')
  assert.match(text, /not-measured/)
  assert.doesNotMatch(`${text}${JSON.stringify(report)}`, /REAL|FALSE POSITIVE|UNRESOLVED/)
  assert.deepEqual(readdirSync(out).filter((f) => f.endsWith('.tmp')), [])
  assert.equal(existsSync(join(out, 'ledger.json')), false, 'no ledger: the reporter does not reconcile')
})

const cls = (id) => CLASSES.find((c) => c.id === id)
const okStep = (name) => liveInternals.steps.push({ name, ok: true, ms: 0 })
const outOf = (extra = {}, over = {}) => ({ findings: [], notMeasured: [], raw: {}, extra, ...over })


test('audit-live: citation output retains one portable row per duplicate, blocking substitution, and exception error', () => {
  const rows = citationFindingRows({
    duplicates: ['D-1'],
    substitutions: {
      substitutions: [{ id: 'D-2', feature: 'form', effect: 'absent', class: 'removed', status: 'open' }],
      unresolved: [{ id: 'D-3', reason: 'missing declaration' }],
      errors: ['D-4: invalid substitution'],
      blocking: 3
    },
    fileErrors: [{ file: 'review.config.json', detail: 'citation invalid' }]
  })
  assert.deepEqual(rows.map((row) => row.kind), ['decision-duplicate', 'substitution-open', 'substitution-unresolved', 'substitution-declaration-error', 'citation-error'])
  assert.equal(rows.length, 5)
  assert.doesNotMatch(JSON.stringify(rows), /\/Users\/|\/private\/tmp/)
})

test('class status: a class is none-found only when its detector examined something and left nothing unmeasured', () => {
  const { classStatus, steps } = liveInternals
  steps.length = 0
  for (const n of ['listings', 'citations', 'behavior-copy', 'cms-leftovers', 'carousel', 'contrast']) okStep(n)
  // a listing read that examined no title is not "none found"
  assert.equal(classStatus(cls('listings'), outOf({ listings: { routes: ['/'], examined: 0, findings: [] } })).status, 'not-measured')
  assert.equal(classStatus(cls('listings'), outOf({ listings: { routes: ['/'], examined: 3, findings: [] } })).status, 'none-found')
  // behaviour copy: a detector finding counts even when no claim is classified contradictory; an unmeasured route blocks none-found
  const bc = { routes: 1, examined: 4, claims: 1, unmeasured: [], inventory: [], findings: [], contradicting: 0 }
  assert.equal(classStatus(cls('behavior-copy'), outOf({ 'behavior-copy': bc })).status, 'none-found')
  assert.equal(classStatus(cls('behavior-copy'), outOf({ 'behavior-copy': { ...bc, findings: [{ route: '/', reason: 'unreviewed false promise' }] } })).status, 'found')
  assert.equal(classStatus(cls('behavior-copy'), outOf({ 'behavior-copy': { ...bc, unmeasured: [{ route: '/x' }] } })).status, 'not-measured')
  // citations: an unreadable or missing input is a gap, never zero errors; duplicates and blocking substitutions are findings
  const files = (over = {}) => ({ 'visual.contract.json': { errors: 0 }, 'review.config.json': { errors: 0 }, 'parity-accepted.json': { errors: 0 }, ...over })
  const dossier = (over = {}) => ({ dir: '/d', found: true, decisions: 5, duplicates: 0, substitutions: { declared: 0, unresolved: 0, errors: 0, blocking: 0 }, files: files(), ...over })
  const cit = (d) => classStatus(cls('citations'), outOf({ citations: { dossiers: [d] } }))
  assert.equal(cit(dossier()).status, 'none-found')
  assert.equal(cit(dossier({ files: files({ 'parity-accepted.json': { unavailable: 'no such file' } }) })).status, 'not-measured')
  assert.equal(cit(dossier({ files: files({ 'review.config.json': { unavailable: 'unreadable' } }) })).status, 'not-measured')
  assert.equal(cit(dossier({ unavailable: 'DECISIONS.md is empty' })).status, 'not-measured')
  assert.equal(cit(dossier({ duplicates: 2 })).status, 'found')
  assert.equal(cit(dossier({ substitutions: { declared: 1, unresolved: 1, errors: 0, blocking: 1 } })).status, 'found')
  assert.equal(classStatus(cls('citations'), outOf({ citations: { dossiers: [{ dir: '/d', found: false, files: {} }] } })).status, 'not-measured')
  // a corrected carousel or contrast probe that ran carries its own examined count: none-found, with the reading
  assert.equal(classStatus(cls('carousel'), outOf({ carousel: { examined: 2 } })).status, 'none-found')
  assert.equal(classStatus(cls('menu-contrast'), outOf({ contrast: { examined: 6 } })).status, 'none-found')
  assert.equal(classStatus(cls('carousel'), outOf({ carousel: { examined: 0 } })).status, 'not-measured')
  assert.equal(classStatus(cls('carousel'), outOf({ carousel: { examined: 2 } }, { notMeasured: [{ check: 'carousel', reason: 'autoplay' }] })).status, 'not-measured')
  steps.length = 0
})

test('step: a probe over its budget is stopped and joined, its late writes never reach the report, and the step stays incomplete', async () => {
  const { step, steps } = liveInternals
  steps.length = 0
  const committed = []
  let closed = 0
  let release
  const gate = new Promise((r) => { release = r })
  let finished = false
  const handle = { close: async () => { closed++; release() } } // closing the browser makes the pending page call settle
  const rec = await step('slow', 50, async (sink) => {
    sink.findings.push({ kind: 'early' })
    await gate
    sink.findings.push({ kind: 'late' })
    finished = true
  }, { handle, commit: (sink) => committed.push(...sink.findings) })
  assert.equal(rec.ok, false)
  assert.match(rec.reason, /over its/)
  assert.equal(closed, 1)
  assert.equal(finished, true, 'the probe was joined before the step returned')
  assert.deepEqual(committed, [], 'nothing of a timed-out step is committed')
  const fine = await step('quick', 1000, async (sink) => { sink.findings.push({ kind: 'x' }) }, { commit: (sink) => committed.push(...sink.findings) })
  assert.equal(fine.ok, true)
  assert.deepEqual(committed, [{ kind: 'x' }])
  steps.length = 0
})

test('audit-live: an --out under a symbolic-link ancestor is refused; a complete generation replaces the earlier one', () => {
  const dir = testDir('audit-live-out')
  mkdirSync(join(dir, 'real'))
  symlinkSync(join(dir, 'real'), join(dir, 'link'))
  const r = live(liveBase(join(dir, 'link', 'out')))
  assert.equal(r.status, 2)
  assert.match(r.stderr, /symbolic link/)
  assert.equal(existsSync(join(dir, 'real', 'out')), false, 'nothing is published through the link')
  const out = join(dir, 'gen')
  liveInternals.publish(out, { profile: 'impact', live: 'ran', source: 's', target: 't', classes: [{ id: 'a', status: 'found', findings: 1 }] })
  liveInternals.publish(out, { profile: 'impact', live: 'ran', source: 's', target: 't', classes: [{ id: 'a', status: 'none-found' }] })
  assert.match(readFileSync(join(out, 'REPORT.md'), 'utf8'), /none-found/)
  assert.match(readFileSync(join(out, 'live-report.json'), 'utf8'), /none-found/)
  assert.deepEqual(readdirSync(out).sort(), ['REPORT.md', 'live-report.json'], 'no temporary or backup file stays')
})

test('audit-live: a profile\'s default dossier is the one in the checkout the script runs in, never a path of one machine', () => {
  const root = testDir('audit-live-dossier')
  assert.deepEqual(profileDossiers('impact', { repoRoot: root }), [join(root, 'tasks', 'ja-impact-wp7')])
  assert.deepEqual(profileDossiers('essence', { repoRoot: root }), [join(root, 'tasks', 'ja-essence-wp7')])
  // without a root given: the repository that holds the script, whatever the working directory is
  const here = fileURLToPath(new URL('.', import.meta.url))
  for (const d of profileDossiers('impact')) assert.ok(d.endsWith(join('tasks', 'ja-impact-wp7')) && !here.startsWith(d), d)
  const source = readFileSync(fileURLToPath(new URL('./audit-live.mjs', import.meta.url)), 'utf8')
  assert.doesNotMatch(source, /\/(Users|home)\/[^/\s'"]+\/(worktrees|tracy-data)\//, 'a home directory is written into the tool')
})
