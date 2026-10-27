import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { freshness, plan, PHASES, preflight, routeProblems, runCycle } from '../quickstart/cycle.mjs'
import { CANONICAL } from '../lib/canonical.mjs'
import { designContract, writeContracts } from './quickstart-contracts.mjs'
import { spawnSync } from 'node:child_process'

/** A spec-pack and a run-root whose two canonical contracts are bound to it (fresh). */
function dossier({ pages = [{ path: '/' }] } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'cycle-dossier-'))
  const spec = path.join(root, 'spec')
  const runRoot = path.join(root, 'dossier')
  mkdirSync(spec)
  mkdirSync(runRoot)
  for (const f of ['sections.json', 'content.json']) writeFileSync(path.join(spec, f), '{}')
  writeFileSync(path.join(spec, 'page-map.json'), JSON.stringify({ pages }))
  writeContracts({ runRoot, specDir: spec })
  return { root, spec, runRoot }
}

const opts = (stand) => ({
  stand,
  id: 'x/wp7',
  version: '1.0.0',
  siteA: 'http://a',
  siteB: 'http://b',
  wpA: 'wpa',
  wpB: 'wpb',
  // restore and verify read the restore as the fleet does, through a root runner on its webroot
  rootB: 'rootb',
  routes: '/r.json',
  admin: 'tracyagent',
  darkHook: 'cookie:t=dark',
  dbHost: 'verify-db',
  dbPasswordEnv: 'PW',
  asset: ['/p.zip'],
  themeZip: '/t.zip',
  contract: 'x/wp7/1.0.0',
  visualLedger: '/evidence/rounds.jsonl',
  checkpoint: 'rolling/cp-1',
  behaviourSweep: '/evidence/site-sweep.json',
  title: 'T',
  // release.mjs requires it, and the cycle now refuses to start a plan whose release lacks it
  runRoot: '/dossier',
  spec: '/spec'
})
// the same, with a real dossier whose contracts are fresh
const live = (stand, d = dossier()) => ({ ...opts(stand), runRoot: d.runRoot, spec: d.spec, routes: path.join(d.spec, 'page-map.json'), themeZip: undefined })

test('cycle plan: --restore-smoke reaches release.mjs beside --checkpoint, and only when given', () => {
  const flags = (o) => plan(o).release[0].argv
  assert.ok(!flags(opts('/s')).includes('--restore-smoke'))
  const argv = flags({ ...opts('/s'), restoreSmoke: 'rolling/smoke-1' })
  assert.equal(argv[argv.indexOf('--restore-smoke') + 1], 'rolling/smoke-1')
  assert.equal(argv[argv.indexOf('--checkpoint') + 1], 'rolling/cp-1')
})

test('cycle plan: five phases, release carries the assets and title, prune re-audit must read 0 prune / 0 to decide', () => {
  const p = plan(opts('/s'))
  assert.deepEqual(Object.keys(p), PHASES)
  assert.ok(p.prune[0].argv.includes('--apply'))
  assert.ok(p.prune[1].mustMatch.test('155 checks — 5 keep, 0 prune, 150 removed, 0 to decide'))
  assert.ok(!p.prune[1].mustMatch.test('5 checks — 3 keep, 2 prune, 0 removed, 0 to decide'))
  assert.equal(p.release.length, 1, 'release/ is not removed before release.mjs accepts the new one')
  const flag = (f) => p.release[0].argv[p.release[0].argv.indexOf(f) + 1]
  assert.equal(flag('--theme-zip'), '/t.zip')
  assert.equal(flag('--asset'), '/p.zip')
  assert.equal(flag('--visual-ledger'), '/evidence/rounds.jsonl')
  assert.equal(flag('--checkpoint'), 'rolling/cp-1')
  assert.equal(flag('--behaviour-sweep'), '/evidence/site-sweep.json')
  assert.equal(flag('--spec'), '/spec')
  assert.equal(flag('--title'), 'T')
  assert.ok(p.verify[0].argv.includes('cookie:t=dark'))
  assert.equal(p.restore.length, 1, 'no down/up commands: restore only')
})

test('cycle plan: declared root entries and constants reach pack', () => {
  const argv = plan({ ...opts('/s'), keepRoot: ['ads.txt'], keepDefine: ['WP_CACHE', 'X'] }).pack[1].argv
  assert.deepEqual(argv.slice(argv.indexOf('--keep-root'), argv.indexOf('--keep-root') + 6), ['--keep-root', 'ads.txt', '--keep-define', 'WP_CACHE', '--keep-define', 'X'])
  assert.ok(!plan(opts('/s')).pack[1].argv.some((a) => a.startsWith('--keep-')))
})

test('cycle: a failing phase stops the run, records itself, and --from refuses to skip it', async () => {
  const stand = mkdtempSync(path.join(tmpdir(), 'cycle-'))
  // Stand-in phases: shell steps instead of the real tools, through the plan override.
  const o = live(stand)
  const original = plan(o)
  const fake = {
    prune: [{ sh: 'echo prune-ok' }],
    pack: [{ sh: 'echo pack-fails; exit 3' }],
    restore: original.restore,
    verify: original.verify,
    release: [{ sh: 'echo release-ran' }]
  }
  await assert.rejects(() => runCycle(o, { planOverride: fake }), /pack failed/)
  const state = JSON.parse(readFileSync(path.join(stand, 'pack', 'cycle.json'), 'utf8'))
  assert.equal(state.phases.prune.ok, true)
  assert.equal(state.phases.pack.ok, false)
  assert.equal(state.phases.restore, undefined, 'restore never ran')
  assert.match(readFileSync(path.join(stand, 'cycle.log'), 'utf8'), /prune-ok[\s\S]*pack-fails/)
  await assert.rejects(() => runCycle(o, { from: 'restore', planOverride: fake }), /phase pack is not green/)
})

test('cycle plan: the root runner, webroot and runtime uid reach restore and verify; verify checks the restore report of this pack', () => {
  const p = plan({ ...opts('/s'), webrootB: '/srv/www', runtimeUid: '1001' })
  const r = p.restore[0].argv
  const flag = (argv, f) => argv[argv.indexOf(f) + 1]
  assert.equal(flag(r, '--root-runner'), 'rootb')
  assert.equal(flag(r, '--container-webroot'), '/srv/www')
  assert.equal(flag(r, '--runtime-uid'), '1001')
  assert.ok(!r.includes('--into'), 'nothing is extracted on the host')
  const v = p.verify[0].argv
  assert.equal(flag(v, '--root-b'), 'rootb')
  assert.equal(flag(v, '--webroot-b'), '/srv/www')
  assert.equal(flag(v, '--runtime-uid'), '1001')
  assert.equal(flag(v, '--pack'), path.join('/s', 'pack'))
  assert.equal(flag(v, '--restore-report'), path.join('/s', 'pack', 'restore.json'))
  const d = plan(opts('/s'))
  assert.equal(flag(d.restore[0].argv, '--runtime-uid'), '33')
  assert.equal(flag(d.restore[0].argv, '--container-webroot'), '/var/www/html')
})

test('cycle refuses to start a restore or verify it cannot run as the fleet does — before anything is created, --from verify included', async () => {
  const stand = mkdtempSync(path.join(tmpdir(), 'cycle-root-'))
  const o = { ...live(stand), rootB: undefined }
  await assert.rejects(() => runCycle(o), /restore phase will run and restore\.mjs needs --root-runner[\s\S]*verify phase will run and verify-parity\.mjs needs --root-b/)
  await assert.rejects(() => runCycle(o, { from: 'verify' }), /verify phase will run and verify-parity\.mjs needs --root-b/)
  assert.ok(!existsSync(path.join(stand, 'pack')), 'nothing created')
  assert.deepEqual(preflight(plan({ ...opts(stand), rootB: undefined }), ['release']), [], 'a release-only resume does not need it')
})

test('cycle refuses a stale, missing, ambiguous, unreadable or unbound contract, or a missing spec, by name — before any phase runs or anything is created, resumes included', async () => {
  const cases = [
    ['contract-stale', /design-contract\.json is stale — specHash/, (d) => writeFileSync(path.join(d.spec, 'content.json'), '{"moved":1}')],
    ['spec-unreadable', /has no sections\.json/, (d) => rmSync(path.join(d.spec, 'sections.json'))],
    ['contract-missing', /visual\.contract\.json is missing/, (d) => rmSync(path.join(d.runRoot, CANONICAL.visual))],
    ['contract-ambiguous', /more than one design/, (d) => writeFileSync(path.join(d.runRoot, 'design-contract-v2.json'), '{}')],
    ['contract-unreadable', /is not JSON/, (d) => writeFileSync(path.join(d.runRoot, CANONICAL.design), '{')],
    ['contract-unbound', /records no specHash binding/, (d) => writeFileSync(path.join(d.runRoot, CANONICAL.visual), '{"schemaVersion":1}')],
    ['contract-invalid', /design-contract\.json is not a valid design contract/, (d) => writeFileSync(path.join(d.runRoot, CANONICAL.design), JSON.stringify({ ...designContract(JSON.parse(readFileSync(path.join(d.runRoot, CANONICAL.design), 'utf8')).bindings), pages: [] }))],
    ['spec-unreadable', /content\.json is not a regular file/, (d) => rmSync(path.join(d.spec, 'content.json')) ?? assert.equal(spawnSync('mkfifo', [path.join(d.spec, 'content.json')]).status, 0)],
    ['spec-missing', /no --spec/, (d, o) => delete o.spec],
    ['run-root-missing', /no --run-root/, (d, o) => delete o.runRoot],
    ['theme-zip-invalid', /cannot be read/, (d, o) => (o.themeZip = path.join(d.root, 'none.zip'))]
  ]
  for (const [code, pattern, mutate] of cases)
    for (const from of [null, 'verify']) {
      const stand = mkdtempSync(path.join(tmpdir(), 'cycle-fresh-'))
      const d = dossier()
      const o = live(stand, d)
      await mutate(d, o)
      const marker = path.join(stand, 'ran')
      const shell = { prune: [{ sh: `touch ${marker}` }], pack: [{ sh: `touch ${marker}` }], restore: [{ sh: `touch ${marker}` }], verify: [{ sh: `touch ${marker}` }], release: [{ sh: `touch ${marker}` }] }
      await assert.rejects(() => runCycle(o, { from, to: 'verify', planOverride: shell }), (e) => e.message.includes(`[${code}]`) && pattern.test(e.message))
      assert.ok(!existsSync(marker), `${code}: no phase command ran (from ${from})`)
      assert.ok(!existsSync(path.join(stand, 'pack')), `${code}: nothing created (from ${from})`)
    }
  // fresh inputs proceed; --to stops after the named phase
  const stand = mkdtempSync(path.join(tmpdir(), 'cycle-fresh-'))
  const d = dossier()
  assert.deepEqual(freshness(live(stand, d)), [])
  const zip = path.join(d.root, 't.zip')
  writeFileSync(zip, 'zip')
  assert.deepEqual(freshness({ ...live(stand, d), themeZip: zip }), [], 'a contract without an artifact binding is not stale against a zip')
  const shell = { prune: [{ sh: 'echo prune-ran' }], pack: [{ sh: 'echo pack-ran' }], restore: [{ sh: 'echo restore-ran' }], verify: [{ sh: 'echo verify-ran' }], release: [{ sh: 'echo release-ran' }] }
  const state = await runCycle(live(stand, d), { to: 'verify', planOverride: shell })
  assert.deepEqual(Object.keys(state.phases), ['prune', 'pack', 'restore', 'verify'])
  await assert.rejects(() => runCycle(live(stand, d), { from: 'verify', to: 'restore', planOverride: shell }), /--to restore comes before --from verify/)
  // a contract bound to a theme zip is stale once the zip changes
  const bound = dossier()
  writeFileSync(zip, 'zip')
  writeContracts({ runRoot: bound.runRoot, specDir: bound.spec, artifactPath: zip })
  assert.deepEqual(freshness({ ...live(stand, bound), themeZip: zip }), [])
  writeFileSync(zip, 'rebuilt')
  assert.match(freshness({ ...live(stand, bound), themeZip: zip }).map((p) => `[${p.code}] ${p.message}`).join('\n'), /\[contract-stale\] design-contract\.json is stale — artifactHash/)
})

test('cycle: a first release without the behaviour pass is refused before any phase runs, with a named code; a patch is not', () => {
  const problems = preflight(plan({ ...opts('/s'), behaviourSweep: undefined }), ['release'])
  assert.equal(problems.length, 1)
  assert.match(problems[0], /^\[behaviour-pass-missing\] .*all eleven sweep checks.*--behaviour-sweep <site-sweep\.json>/)
  assert.ok(!plan({ ...opts('/s'), behaviourSweep: undefined }).release[0].argv.includes('--behaviour-sweep'))
  assert.deepEqual(preflight(plan(opts('/s')), ['release']), [])
  const patch = { ...opts('/s'), patch: true, previous: '/p', measure: '/m', behaviourSweep: undefined }
  assert.deepEqual(preflight(plan(patch), ['release']), [])
})

test('cycle: a release needs every release.mjs input, and cannot run in the same invocation as pack', () => {
  const p = plan({ ...opts('/s'), themeZip: undefined, visualLedger: undefined, checkpoint: undefined, spec: undefined })
  const problems = preflight(p, ['release'])
  for (const flag of ['--spec', '--theme-zip', '--visual-ledger', '--checkpoint']) assert.ok(problems.some((x) => x.includes(`[release-input-missing]`) && x.includes(`requires ${flag}`)), flag)
  assert.deepEqual(preflight(plan(opts('/s')), ['release']), [])
  assert.deepEqual(preflight(plan(opts('/s')), PHASES.slice(0, 4)), [], 'a run that stops at verify needs no checkpoint')
  const both = preflight(plan(opts('/s')), PHASES)
  assert.equal(both.length, 1)
  assert.match(both[0], /^\[checkpoint-before-pack\] .*run --to verify/)
})

test('cycle (#60): the statuses --routes declares are the spec-pack\'s — verify and release hold each route to one status, checked before any phase', async () => {
  const errorPage = { path: '/404', view: '404', synthetic: true }
  const d = dossier({ pages: [{ path: '/' }, errorPage] })
  const stand = mkdtempSync(path.join(tmpdir(), 'cycle-routes-'))
  assert.deepEqual(routeProblems(live(stand, d)), [], 'the page map itself: the /404 page answers 404 on both sides of the cycle')
  const p = plan(live(stand, d))
  assert.equal(p.verify[0].argv[p.verify[0].argv.indexOf('--routes') + 1], path.join(d.spec, 'page-map.json'), 'verify reads the declarations from --routes')
  assert.equal(p.release[0].argv[p.release[0].argv.indexOf('--spec') + 1], d.spec, 'release reads them again from --spec')
  // a routes file that declares a status the spec-pack does not
  const other = path.join(d.root, 'routes.json')
  writeFileSync(other, JSON.stringify([{ path: '/' }, { path: '/404' }, { path: '/gone', status: 410 }]))
  const conflict = routeProblems({ ...live(stand, d), routes: other })
  assert.deepEqual(conflict.map((x) => x.code), ['parity-expectation', 'parity-expectation'])
  assert.match(conflict[0].message, /--routes declares \/404 answering 200, the spec-pack's page map 404/)
  assert.match(conflict[1].message, /--routes declares \/gone answering 410, the spec-pack's page map 200/)
  // a --routes that leaves out a route the spec-pack declares: release would refuse the parity.json
  writeFileSync(other, JSON.stringify([{ path: '/' }]))
  const partial = routeProblems({ ...live(stand, d), routes: other })
  assert.deepEqual(partial.map((x) => x.code), ['parity-incomplete'])
  assert.match(partial[0].message, /page map declares \/404, --routes does not name it/)
  // inputs that cannot be read are named here, before any phase — never compared as nothing
  const named = (o, code, pattern) => {
    const got = routeProblems(o)
    assert.ok(got.some((x) => x.code === code && pattern.test(x.message)), JSON.stringify(got))
  }
  named({ ...live(stand, d), routes: path.join(d.root, 'page-mpa.json') }, 'routes-invalid', /page-mpa\.json: no such file, and not a list of \/paths/)
  named({ ...live(stand, d), routes: undefined }, 'routes-invalid', /no --routes/)
  writeFileSync(other, JSON.stringify([{ path: '/' }, { path: '//evil.test/404' }]))
  named({ ...live(stand, d), routes: other }, 'routes-invalid', /is not a \/path on the stand/)
  named(live(stand, dossier({ pages: [{ path: '/' }, errorPage, { path: '/404' }] })), 'routes-invalid', /\/404 is declared twice/)
  const unreadableSpec = dossier({ pages: [{ path: '/' }] })
  writeFileSync(path.join(d.root, 'ok.json'), JSON.stringify([{ path: '/' }]))
  writeFileSync(path.join(unreadableSpec.spec, 'page-map.json'), '{}')
  named({ ...live(stand, unreadableSpec), routes: path.join(d.root, 'ok.json') }, 'parity-expectation', /route declarations cannot be read: .*no pages\[\] or routes\[\] list/)
  // an existing directory or FIFO named as --routes is not a route called by its file-system path
  const routesDir = path.join(d.root, 'routes-dir')
  mkdirSync(routesDir)
  named({ ...live(stand, d), routes: routesDir }, 'routes-invalid', /routes-dir: is a directory, not a routes file/)
  const routesFifo = path.join(d.root, 'routes-fifo')
  const fifo = spawnSync('mkfifo', [routesFifo]).status === 0
  if (fifo) named({ ...live(stand, d), routes: routesFifo }, 'routes-invalid', /routes-fifo: is not a regular file/)
  // a route recorded as one path while another is requested: a fragment, a dot segment
  for (const bad of ['/404#x', '/a/../404'])
    named({ ...live(stand, d), routes: `/,${bad}` }, 'routes-invalid', /is not a \/path on the stand/)
  for (const [what, routes] of [['unreadable', path.join(d.root, 'page-mpa.json')], ['incomplete', path.join(d.root, 'ok.json')], ['a directory', routesDir], ...(fifo ? [['a FIFO', routesFifo]] : [])]) {
    const marker = path.join(stand, `ran-${what}`)
    const shell = Object.fromEntries(PHASES.map((ph) => [ph, [{ sh: `touch ${marker}` }]]))
    await assert.rejects(() => runCycle({ ...live(stand, d), routes }, { to: 'verify', planOverride: shell }), /\[(routes-invalid|parity-incomplete)\]/, what)
    assert.ok(!existsSync(marker), `${what}: no phase ran`)
  }
  // refused before anything is created or run
  writeFileSync(other, JSON.stringify([{ path: '/' }, { path: '/404' }]))
  const marker = path.join(stand, 'ran')
  const shell = Object.fromEntries(PHASES.map((ph) => [ph, [{ sh: `touch ${marker}` }]]))
  await assert.rejects(() => runCycle({ ...live(stand, d), routes: other }, { to: 'verify', planOverride: shell }), /\[parity-expectation\] --routes declares \/404 answering 200/)
  assert.ok(!existsSync(marker) && !existsSync(path.join(stand, 'pack')), 'nothing ran, nothing created')
})

test('cycle plan: contract-bind runs between verify and release on the restore, bound to the pack and the theme zip; release reads its evidence', () => {
  const p = plan({ ...opts('/s'), plugin: '/cowork.zip', curl: 'docker exec -i web curl', bindSiteUrl: 'http://web' })
  assert.deepEqual(PHASES.slice(-3), ['verify', 'contract-bind', 'release'])
  const bind = p['contract-bind'][0].argv
  const flag = (argv, f) => argv[argv.indexOf(f) + 1]
  assert.equal(path.basename(bind[0]), 'contract-bind.mjs')
  assert.deepEqual([flag(bind, '--wp'), flag(bind, '--site-url'), flag(bind, '--contract'), flag(bind, '--plugin'), flag(bind, '--curl'), flag(bind, '--pack'), flag(bind, '--theme-zip')], ['wpb', 'http://web', 'x/wp7/1.0.0', '/cowork.zip', 'docker exec -i web curl', '/s/pack', '/t.zip'])
  assert.equal(flag(bind, '--out'), '/s/pack/contract-bind')
  assert.equal(flag(p.release[0].argv, '--contract-bind'), '/s/pack/contract-bind/contract-bind.json')
  const plain = plan(opts('/s'))['contract-bind'][0].argv
  assert.equal(flag(plain, '--site-url'), 'http://b', 'the restore site unless told otherwise')
  assert.ok(!plain.includes('--plugin') && !plain.includes('--curl'))
})

test('cycle preflight: a contract-bind phase without --contract or --theme-zip is refused before anything runs', () => {
  const steps = plan({ ...opts('/s'), contract: undefined, themeZip: undefined })
  const problems = preflight(steps, ['contract-bind', 'release'])
  assert.ok(problems.some((m) => /\[contract-bind-input-missing\].*--contract /.test(m)))
  assert.ok(problems.some((m) => /\[contract-bind-input-missing\].*--theme-zip /.test(m)))
  assert.deepEqual(preflight(plan(opts('/s')), ['contract-bind']), [])
  assert.deepEqual(preflight(steps, ['verify']), [])
})

test('cycle --patch: release.mjs --patch gets previous, measure, baseline, changed-from and the dossier (its finish audit), and neither the ledger nor a checkpoint', () => {
  const o = { ...opts('/s'), patch: true, previous: '/prev/VERIFICATION.json', measure: '/m.json', noBaseline: 'no stand for 1.0.4', changedFrom: '/prev.zip' }
  const argv = plan(o).release[0].argv
  const flag = (f) => argv[argv.indexOf(f) + 1]
  assert.ok(argv.includes('--patch'))
  assert.deepEqual([flag('--previous'), flag('--measure'), flag('--no-baseline'), flag('--changed-from'), flag('--spec'), flag('--theme-zip')], ['/prev/VERIFICATION.json', '/m.json', 'no stand for 1.0.4', '/prev.zip', '/spec', '/t.zip'])
  assert.ok(argv.includes('--run-root'), 'the dossier holds the finish audit')
  for (const f of ['--visual-ledger', '--checkpoint']) assert.ok(!argv.includes(f), f)
  assert.equal(flag('--contract-bind'), '/s/pack/contract-bind/contract-bind.json')
  assert.deepEqual(Object.keys(plan(o)), PHASES, 'prune → pack → restore → verify → contract-bind → release')
  assert.ok(!plan({ ...o, noBaseline: undefined, changedFrom: undefined }).release[0].argv.some((a) => a === '--no-baseline' || a === '--changed-from'))
})

test('cycle --patch: freshness does not read the contracts (a dossier is not needed) but still wants --spec; preflight names what the patch release lacks', () => {
  const d = dossier()
  const o = { ...live('/s', d), patch: true, runRoot: undefined }
  assert.deepEqual(freshness(o), [])
  assert.deepEqual(freshness({ ...o, spec: undefined }).map((p) => p.code), ['spec-missing'])
  // the full cycle still refuses the same input
  assert.ok(freshness({ ...live('/s', d), runRoot: undefined }).some((p) => p.code === 'run-root-missing'))
  const bare = plan({ ...opts('/s'), patch: true, runRoot: undefined })
  const problems = preflight(bare, ['release'])
  assert.ok(problems.some((m) => /\[release-input-missing\].*--patch requires --previous/.test(m)))
  assert.ok(problems.some((m) => /requires --measure/.test(m)))
  assert.ok(problems.some((m) => /requires --run-root/.test(m)), 'a patch names the dossier of its finish audit')
  assert.ok(!problems.some((m) => /--checkpoint/.test(m)))
  const full = plan({ ...opts('/s'), patch: true, previous: '/p', measure: '/m', runRoot: '/d' })
  assert.deepEqual(preflight(full, ['contract-bind', 'release']), [])
  const both = preflight(full, ['pack', 'release'])
  assert.match(both.find((m) => /measure-before-pack/.test(m)), /^\[measure-before-pack\] .*run --to verify.*--from contract-bind/)
})

test('cycle: the log is kept outside pack/, which the pack phase deletes — an earlier phase\'s output survives it', async () => {
  const stand = mkdtempSync(path.join(tmpdir(), 'cycle-log-'))
  const d = dossier()
  const o = live(stand, d)
  const real = plan(o)
  assert.deepEqual(real.pack[0], { rm: path.join(stand, 'pack') }, 'the pack phase removes pack/ whole')
  const fake = {
    prune: [{ sh: 'echo prune-output' }],
    pack: [real.pack[0], { sh: 'mkdir -p "$PACK" && echo pack-output'.replace('$PACK', path.join(stand, 'pack')) }],
    restore: [{ sh: 'echo restore-output' }],
    verify: [{ sh: 'echo verify-output' }],
    'contract-bind': [{ sh: 'echo bind-output' }],
    release: [{ sh: 'echo release-output' }]
  }
  await runCycle(o, { planOverride: fake })
  const log = readFileSync(path.join(stand, 'cycle.log'), 'utf8')
  assert.match(log, /prune-output[\s\S]*pack-output[\s\S]*restore-output[\s\S]*release-output/)
  assert.ok(!existsSync(path.join(stand, 'pack', 'cycle.log')))
  assert.ok(existsSync(path.join(stand, 'pack', 'cycle.json')), 'the state still sits with the pack it describes')
})

test('cycle --patch: --measure and --previous are required where the run reaches the release phase — a run that stops at verify needs neither', () => {
  const stand = mkdtempSync(path.join(tmpdir(), 'cycle-cli-'))
  const d = dossier()
  const zip = path.join(stand, 't.zip')
  writeFileSync(zip, 'zip')
  const run = (...extra) => spawnSync(process.execPath, [new URL('../quickstart/cycle.mjs', import.meta.url).pathname, '--stand', stand, '--id', 'x/wp7', '--version', '1.0.0', '--site-a', 'http://a', '--site-b', 'http://b', '--wp-a', 'wpa', '--wp-b', 'wpb', '--root-b', 'rootb', '--routes', path.join(d.spec, 'page-map.json'), '--run-root', d.runRoot, '--spec', d.spec, '--theme-zip', zip, '--contract', 'x/wp7/1.0.0', '--patch', ...extra], { encoding: 'utf8' })
  // --from verify --to verify: nothing runs (phase prune is not green in an empty stand), but the arguments are accepted
  const verify = run('--from', 'verify', '--to', 'verify')
  assert.doesNotMatch(verify.stderr, /--measure is required|--previous is required|release-input-missing/)
  assert.match(verify.stderr, /phase prune is not green/)
  // the release phase in the plan names what is missing before anything runs
  const release = run('--from', 'contract-bind')
  assert.match(release.stderr, /\[release-input-missing\].*requires --previous/)
  assert.match(release.stderr, /\[release-input-missing\].*requires --measure/)
  assert.doesNotMatch(release.stderr, /is not green/, 'refused before the state is read')
})

test('a --patch run that stops at verify needs neither --measure nor --previous', () => {
  const patch = { ...opts('/s'), patch: true, measure: undefined, previous: undefined, changedFrom: undefined }
  assert.deepEqual(preflight(plan(patch), ['prune', 'pack', 'restore', 'verify']), [])
  assert.ok(preflight(plan(patch), ['contract-bind', 'release']).some((p) => /--measure/.test(p)))
})

test('the contract-bind phase carries the root runner so the plugin install can own the webroot', () => {
  const argv = plan(opts('/s'))['contract-bind'][0].argv
  assert.equal(argv[argv.indexOf('--root-runner') + 1], opts('/s').rootB)
  assert.ok(argv.includes('--container-webroot') && argv.includes('--runtime-uid'))
  assert.ok(!plan({ ...opts('/s'), rootB: undefined })['contract-bind'][0].argv.includes('--root-runner'))
})

/** Run `fn` and return what it wrote to stdout. */
async function captured(fn) {
  const real = process.stdout.write.bind(process.stdout)
  let text = ''
  process.stdout.write = (s) => ((text += s), true)
  try {
    await fn()
  } catch (e) {
    text += `threw: ${e.message}\n`
  } finally {
    process.stdout.write = real
  }
  return text
}

test('cycle prints one line per phase by default, the whole output with --verbose, and the refusal lines and log path when a phase fails', async () => {
  const d = dossier()
  const stand = mkdtempSync(path.join(tmpdir(), 'cycle-quiet-'))
  const o = { ...opts(stand), themeZip: undefined, runRoot: d.runRoot, spec: d.spec, routes: path.join(d.spec, 'page-map.json') }
  const steps = (verifyStep) => ({ ...Object.fromEntries(PHASES.map((p) => [p, []])), prune: [{ sh: 'echo noisy-detail-line' }], verify: [verifyStep] })
  const quiet = await captured(() => runCycle(o, { to: 'verify', planOverride: steps({ sh: 'echo fine' }) }))
  assert.match(quiet, /== prune ok in \d+s/)
  assert.doesNotMatch(quiet, /noisy-detail-line/)
  assert.match(readFileSync(path.join(stand, 'cycle.log'), 'utf8'), /noisy-detail-line/)
  const loud = await captured(() => runCycle({ ...o, verbose: true }, { to: 'verify', planOverride: steps({ sh: 'echo fine' }) }))
  assert.match(loud, /noisy-detail-line/)
  const failed = await captured(() => runCycle(o, { to: 'verify', planOverride: steps({ sh: 'echo "chatter"; echo "[parity-status] / answers 500"; exit 1' }) }))
  assert.match(failed, /\[parity-status\] \/ answers 500/)
  assert.doesNotMatch(failed, /chatter/)
  assert.match(failed, /== verify FAILED[\s\S]*log: .*cycle\.log/)
  rmSync(d.root, { recursive: true, force: true })
  rmSync(stand, { recursive: true, force: true })
})
