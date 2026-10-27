#!/usr/bin/env node
/**
 * One JA Joomla release measured end to end in ONE command, on lane N of the Mac mini + iMac pair, so
 * several templates measure side by side without an agent driving each step (batch 2, 16/10/2026):
 *
 *   node packages/design/tracy-ds-slot/scripts/lane.mjs <slug> <x.y.z | template source folder>
 *        [--lane <1-15>] [--slots <n>] [--judge-only] [--preview-only] [--keep] [--max-load <n>] [--out <dir>]
 *        [--imac-tch <dir>]
 *   node packages/design/tracy-ds-slot/scripts/lane.mjs --release <N>
 *
 *   <x.y.z>          a published version: the stand is restored from the release (cached on the iMac)
 *   <source folder>  ja-products .../ja_x/source edited here: laid over the release and built into the next
 *                    version on the iMac (release-batch.mjs build --overlay), its default look checked
 *                    (release-batch.mjs verify), then that local build is restored
 *   --judge-only     measure nothing: judge the measurement file already in this tree (<x.y.z> needed)
 *   --preview-only   skip the built-site flow (only the preview block is re-measured)
 *   --from-dir <dir> with <x.y.z>: a version built but not yet published, restored from its local build on
 *                    the iMac (e.g. ~/tracy-data/local-releases/tracy-apple/j6) instead of the release; the
 *                    stand refuses a version it cannot find rather than restoring an older one
 *   --replace <file> with a source folder: demo-content edits made in the build (release-batch.mjs build --replace,
 *                    src/release-content-edits.mjs); the iMac tree takes this checkout's edits module with the file
 *   --parity-only    skip the built-site flow and the preview: only PREVIEW-PARITY (the Design system popup
 *                    against Try on, apps/tracy-web/scripts/preview-parity.mjs) on the stand
 *   --parity-popup <path,…>  the popup paths PREVIEW-PARITY reads: live,live/door (the default, both popups as
 *                    customers open them, written to the file: the running site's since c43fa34e56, the Add
 *                    site popup's live door since 18/10/2026), static/door (the Add site popup before that),
 *                    static/site (the running site's popup before 34df1669e8)
 *   --keep           leave the stand up AND keep holding slot N, so no other lane stands b2-l<N> over it;
 *                    `lane.mjs --release <N>` later takes the stand down and gives the slot back
 *   --release <N>    take a kept stand b2-l<N> down and release slot N (nothing measured)
 *
 * The steps are the ones /ops prints (rules/measure-command.js): stand.mjs up → flow.mjs --snap → flow.mjs
 * --measure-* with the 15 featured systems → preview-check.mjs --write, light then dark (one after the other:
 * both write the same file) → preview-parity.mjs --write (PREVIEW-PARITY, from probe v10; before it, run only
 * with PREVIEW_PROBE_NEXT=1, and then it writes nothing) → stand.mjs down. Docker runs on the iMac (`ssh imac`; the stand bind-mounts an
 * iMac folder), the browsers here; ~/bin/imac-tunnel mirrors the stand's port. Every lane has its own stand
 * name, ports and folders, so lanes never meet. The lane number N is the iMac slot it holds
 * (~/tracy-work/locks/slot-N, the first free of 1..--slots (5), or --lane N; it waits a minute while all are held).
 * Ports per lane (lane-ports.mjs, every step its own for N up to 15): stand b2-l<N> on 52980+N · build/verify
 * stands 52300+N*10..+2 · preview light/dark/parity 10000+3(N-1)+0..2 · flow/verify Chrome 10100+2(N-1)+0..1
 * Before each step that loads the iMac it waits while the iMac's 1-minute load is ≥ 12 (8 cores).
 * The file is written where /ops reads it (contracts/<slug>/j6/<version>/design-system-measurement.json of
 * THIS checkout) and judged with judgeMeasurement + preview-system-issues.json, as /ops judges it; the rules
 * still failing go to <out>/judged.json beside the same judgement of the committed file (git HEAD).
 * VARS-1 is not in the file: release-batch.mjs build refuses a template it would fail.
 * A lane that fails or is stopped (SIGTERM, SIGINT, SIGHUP) kills every step it started, here and on the
 * iMac, with their Chromes (lane-shell.mjs), takes its stand down and gives its slot back.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { baseContractOf, laneContract } from './lane-contract.mjs'
import { lanePorts, MAX_LANE } from './lane-ports.mjs'
import { laneShell } from './lane-shell.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../../..')
const SLOT_SCRIPTS = 'packages/design/tracy-ds-slot/scripts'
const CONTRACTS = 'packages/cms/tracy-joomla-quickstart/contracts'
const PREVIEW_SYSTEMS =
  'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0,refero:5fd3b3b4-02ab-456a-87aa-e4395636b671'
const args = process.argv.slice(2)
const opt = (n, d = null) => {
  const i = args.indexOf(n)
  return i === -1 ? d : args.splice(i, 2)[1]
}
const flag = (n) => (args.includes(n) ? (args.splice(args.indexOf(n), 1), true) : false)
const WANT_LANE = opt('--lane')
const OUT_OPT = opt('--out')
const IMAC_TCH = opt('--imac-tch', '~/TCH-worktrees/ds-batch2-measure')
const MAX_LOAD = Number(opt('--max-load', '12'))
const SLOTS = Number(opt('--slots', '5'))
const JUDGE_ONLY = flag('--judge-only')
const PREVIEW_ONLY = flag('--preview-only')
const PARITY_ONLY = flag('--parity-only')
const PARITY_POPUPS = (opt('--parity-popup') ?? 'live,live/door').split(',').filter(Boolean)
const KEEP = flag('--keep')
const RELEASE = opt('--release')
const FROM_DIR = opt('--from-dir')
const REPLACE = opt('--replace')
const LOCKS = '~/tracy-work/locks'
const STANDS = '~/tracy-work/b2/stands'
const standDown = (name) =>
  spawnSync(
    'ssh',
    [
      'imac',
      `export PATH=/opt/homebrew/bin:$PATH; cd ${IMAC_TCH} && node ${SLOT_SCRIPTS}/stand.mjs down --name ${name} --dir ${STANDS}`
    ],
    { encoding: 'utf8' }
  )
const isLane = (n) => Number.isInteger(+n) && +n >= 1 && +n <= MAX_LANE
// --release <N>: the end of a --keep lane, run by hand once the kept stand is no longer looked at
if (RELEASE !== null) {
  if (!isLane(RELEASE)) {
    console.error(`usage: lane.mjs --release <1-${MAX_LANE}>`)
    process.exit(2)
  }
  const r = standDown(`b2-l${RELEASE}`)
  if (r.status !== 0) {
    console.error(`stand b2-l${RELEASE} down failed, slot-${RELEASE} kept: ${(r.stderr ?? '').slice(-300)}`)
    process.exit(1)
  }
  spawnSync('ssh', ['imac', `rm -rf ${LOCKS}/slot-${RELEASE}`])
  console.log(`stand b2-l${RELEASE} down, slot-${RELEASE} released`)
  process.exit(0)
}
const [SLUG, WHAT] = args
if (
  !/^(ja|tracy)-[a-z0-9-]+$/.test(SLUG ?? '') ||
  !WHAT ||
  (WANT_LANE && !isLane(WANT_LANE)) ||
  !(SLOTS >= 1 && SLOTS <= MAX_LANE)
) {
  console.error(
    `usage: lane.mjs <ja-slug> <x.y.z | template source folder> [--lane <1-${MAX_LANE}>] [--slots <1-${MAX_LANE}>] [--judge-only] [--preview-only] [--keep]`
  )
  process.exit(2)
}
const pause = (s) => new Promise((r) => setTimeout(r, s * 1000))
const stamp = () => new Date().toTimeString().slice(0, 8)

// The lane is a slot held on the iMac (batch 2 rule: `mkdir ~/tracy-work/locks/slot-N`, removed when done):
// the first free of slot-1..slot-<--slots>, or the one --lane names; every minute until one is free.
// mkdir either creates the folder or fails, so two lanes never hold one slot.
const take = (n) =>
  spawnSync('ssh', [
    'imac',
    `mkdir -p ${LOCKS} && mkdir ${LOCKS}/slot-${n} 2>/dev/null && echo "${SLUG} $(date +%T)" > ${LOCKS}/slot-${n}/owner`
  ]).status === 0
let LANE = Number(WANT_LANE ?? 0)
if (JUDGE_ONLY) LANE ||= 1
else {
  const tries = WANT_LANE ? [LANE] : Array.from({ length: SLOTS }, (_, i) => i + 1)
  for (LANE = 0; !LANE; ) {
    LANE = tries.find(take) ?? 0
    if (!LANE) {
      console.log(`${stamp()} [${SLUG}] iMac slots ${tries.join(',')} busy: waiting 60 s`)
      await pause(60)
    }
  }
}
const TAG = SLUG.startsWith('tracy-') ? `${SLUG}/j6` : `quickstart/${SLUG}/j6`
// the line's base contract until the version is known; then the one whose range holds it (lane-contract.mjs)
const SLOT_BASE = baseContractOf(SLUG)
let SLOT = SLOT_BASE
const NAME = `b2-l${LANE}`
const P = lanePorts(LANE)
const PORT = P.stand
const SITE = `http://127.0.0.1:${PORT}`
const W = `~/tracy-work/b2/lane${LANE}`
const OUT = resolve(OUT_OPT ?? join(tmpdir(), `ds-lane-${SLUG}`))
mkdirSync(OUT, { recursive: true })
const LOG = join(OUT, 'lane.log')
const say = (s) => {
  const line = `${stamp()} [lane ${LANE} ${SLUG}] ${s}`
  console.log(line)
  appendFileSync(LOG, `${line}\n`)
}
const { run, imac, killAll, cleanProfiles } = laneShell({
  root: ROOT,
  log: LOG,
  imacTch: IMAC_TCH,
  work: W,
  profiles: join(tmpdir(), `ds-lane-chrome-${LANE}`)
})
const lastJson = (s) =>
  JSON.parse(
    s
      .trim()
      .split('\n')
      .filter((l) => l.startsWith('{'))
      .pop()
  )
const waitLoad = async () => {
  for (;;) {
    const l = Number((await run('ssh', ['imac', 'sysctl -n vm.loadavg'])).trim().split(/\s+/)[1])
    if (!(l >= MAX_LOAD)) return
    say(`iMac load ${l} >= ${MAX_LOAD}: waiting 30 s`)
    await pause(30)
  }
}

// the end of every lane, whatever ends it: children killed, stand down, slot given back. A --keep lane whose
// stand went up keeps the slot while the stand lives (`lane.mjs --release N`): giving it back let the next lane
// take slot N and stand b2-l<N> over the kept one (ja-phio over FIN-SENSEI-TOPBAR, 18/10/2026)
let standStarted = false
let ending = null
const end = (why) =>
  (ending ??= (async () => {
    if (JUDGE_ONLY) return
    if (why) say(`stopping (${why}): killing this lane's processes`)
    await killAll()
    const keep = KEEP && standStarted
    if (!keep) {
      const r = standDown(NAME)
      say(r.status === 0 ? `stand ${NAME} down` : `stand down failed: ${r.stderr.slice(-300)}`)
    }
    cleanProfiles()
    if (keep) {
      spawnSync('ssh', [
        'imac',
        `echo "${SLUG} $(date +%T) kept stand ${NAME}" > ${LOCKS}/slot-${LANE}/owner`
      ])
      say(
        `stand ${NAME} kept on ${SITE}; slot-${LANE} still held: node ${SLOT_SCRIPTS}/lane.mjs --release ${LANE} when done`
      )
      return
    }
    spawnSync('ssh', ['imac', `rm -rf ${LOCKS}/slot-${LANE}`])
    say(`slot-${LANE} released`)
  })())
for (const [sig, n] of [
  ['SIGINT', 2],
  ['SIGTERM', 15],
  ['SIGHUP', 1]
])
  process.on(sig, () => end(sig).then(() => process.exit(128 + n)))

const { judgeMeasurement, measurementPath } = await import('../src/measurement.mjs')
const systemIssues = JSON.parse(readFileSync(join(HERE, '../templates/preview-system-issues.json'), 'utf8'))
/** The rules /ops would not show as passed, for one measurement document. */
const failing = (doc) =>
  Object.entries(judgeMeasurement(doc, undefined, { systemIssues }))
    .filter(([, r]) => r.status !== 'pass' && r.status !== 'not-applicable')
    .map(([id, r]) => ({ id, status: r.status, note: String(r.note ?? '').slice(0, 240) }))

let version = /^\d+\.\d+\.\d+$/.test(WHAT) ? WHAT : null
const t0 = Date.now()
try {
  if (!JUDGE_ONLY) {
    // a worktree without `pnpm install` has no workspace link, and the slot's emitter imports one
    // (src/wordpress.mjs → @tracy/wordpress-theme): the same symlink pnpm makes, here and on the iMac
    const L = 'packages/design/tracy-ds-slot/node_modules/@tracy'
    const link = `mkdir -p ${L} && { [ -e ${L}/wordpress-theme ] || ln -s ../../../../cms/tracy-wordpress-theme ${L}/wordpress-theme; }`
    await run('sh', ['-c', link])
    await imac(link)
  }
  let fromDir = version ? FROM_DIR : null
  if (!version && !JUDGE_ONLY) {
    // the edited template, laid over the release: <W>/overlay/templates/<ja_x>/
    const src = resolve(WHAT)
    const tpl = readFileSync(join(src, 'templateDetails.xml'), 'utf8')
      .match(/<name>\s*([^<]+?)\s*<\/name>/)[1]
      .toLowerCase()
    const home = (p) => p.replace('~/', '')
    await imac(`rm -rf ${W}/overlay ${W}/out && mkdir -p ${W}/overlay/templates/${tpl}`)
    await run('rsync', [
      '-a',
      '--delete',
      '--exclude',
      '.git',
      `${src}/`,
      `imac:${home(W)}/overlay/templates/${tpl}/`
    ])
    // the iMac builds from THIS checkout's slot contracts (every one of the line: a later release has its own
    // file extending the base) and quickstart contract of the line
    const slotDir = join(ROOT, 'packages/design/tracy-ds-slot/templates')
    await run('rsync', [
      '-a',
      ...readdirSync(slotDir)
        .filter((f) => f === `${SLOT_BASE}.json` || f.startsWith(`${SLOT_BASE}-`))
        .map((f) => join(slotDir, f)),
      `imac:${home(IMAC_TCH)}/packages/design/tracy-ds-slot/templates/`
    ])
    await run('rsync', [
      '-a',
      `${ROOT}/${CONTRACTS}/${SLUG}/`,
      `imac:${home(IMAC_TCH)}/${CONTRACTS}/${SLUG}/`
    ])
    // demo-content edits: the file next to the overlay, and the edits module of this checkout (the iMac tree
    // may predate the edit kinds the file uses)
    if (REPLACE) {
      await run('rsync', ['-a', resolve(REPLACE), `imac:${home(W)}/replace.json`])
      await run('rsync', [
        '-a',
        `${ROOT}/packages/design/tracy-ds-slot/src/release-content-edits.mjs`,
        `imac:${home(IMAC_TCH)}/packages/design/tracy-ds-slot/src/`
      ])
    }
    await waitLoad()
    say(`build from ${src}${REPLACE ? ` with the content edits of ${REPLACE}` : ''}`)
    const vp = P.build
    const b = lastJson(
      await imac(
        `node ${SLOT_SCRIPTS}/release-batch.mjs build --out ${W}/out --overlay ${W}/overlay${REPLACE ? ` --replace ${W}/replace.json` : ''} --port ${vp} ${SLUG}`
      )
    )
    say(`built ${b.from} -> ${b.to}; role scan ${JSON.stringify(b.roleScan ?? null).slice(0, 160)}`)
    const m = JSON.parse(await imac(`cat ${W}/out/${SLUG}/release/manifest.json`))
    version = m.version
    fromDir = `${W}/out/${SLUG}/release`
    // the new contract back into this checkout: flow and the preview read it, the PR carries it
    await run('rsync', [
      '-a',
      `imac:${home(W)}/out/${SLUG}/contract/${m.product ?? SLUG}/j6/`,
      `${ROOT}/${CONTRACTS}/${m.product ?? SLUG}/j6/`
    ])
    await waitLoad()
    say('verify: the default look against the released version')
    await imac(
      `node ${SLOT_SCRIPTS}/release-batch.mjs verify --out ${W}/out --port ${vp} --cdp ${P.verifyCdp} ${SLUG}`
    )
    const v = JSON.parse(await imac(`cat ${fromDir}/VERIFICATION.json`))
    writeFileSync(join(OUT, 'VERIFICATION.json'), `${JSON.stringify(v, null, 2)}\n`)
    say(
      `verify: verified=${v.verified} computed ${JSON.stringify(v.defaultLook?.computedDifferences)} pages differ ${v.pages?.differ?.length} fonts ok ${v.fonts?.ok}`
    )
  }
  if (!version) throw new Error('--judge-only with a source folder: name the version instead')
  // measured through the contract a site built from this release wears, as /ops and the product pick it
  const lc = laneContract(SLUG, TAG, version)
  SLOT = lc.contract
  say(
    `slot contract ${SLOT}${lc.reason ? ` (no contract's range holds ${version}: ${lc.reason}; the line's base)` : ''}`
  )

  if (!JUDGE_ONLY) {
    await waitLoad()
    say(`stand ${NAME} up on ${PORT} (${fromDir ? 'local build' : 'release'} ${version})`)
    standStarted = true
    const st = lastJson(
      await imac(
        `node ${SLOT_SCRIPTS}/stand.mjs up ${TAG} --version ${version} ${fromDir ? `--from-dir ${fromDir}` : ''} --port ${PORT} --name ${NAME} --dir ${STANDS}`
      )
    )
    say(`stand ${st.site} (${Math.round((Date.now() - t0) / 1000)} s)`)
    await run(join(process.env.HOME, 'bin/imac-tunnel'), [])
    let up = false
    for (let i = 0; i < 90 && !up; i++) {
      up =
        (await run('curl', [
          '-s',
          '-L',
          '--noproxy',
          '*',
          '-o',
          '/dev/null',
          '-w',
          '%{http_code}',
          '-m',
          '30',
          `${SITE}/`
        ]).catch(() => '')) === '200'
      if (!up) await pause(2)
    }
    if (!up) throw new Error(`${SITE}/ does not answer 200 here (tunnel?)`)
    // the table prefix: the restored manifest's, else the one table name that says it
    let prefix = null
    try {
      prefix = JSON.parse(await imac(`cat ${STANDS}/${NAME}/dl/manifest.json`)).prefix ?? null
    } catch {}
    prefix ??= (
      await run('docker', [
        'exec',
        `${NAME}-db`,
        'mariadb',
        '-usite',
        '-psite',
        'site',
        '-N',
        '-e',
        "show tables like '%\\_modules'"
      ])
    )
      .trim()
      .split('\n')[0]
      .replace(/modules$/, '')
    const flowDir = join(OUT, 'flow')
    if (!PREVIEW_ONLY && !PARITY_ONLY) {
      const { FEATURED_REFERO_SYSTEMS } = await import('../../../../apps/tracy-web/src/lib/ds-slot.js')
      const flow = [
        'node',
        join(HERE, 'flow.mjs'),
        '--cms',
        'joomla',
        '--template',
        SLOT,
        '--site',
        SITE,
        '--cdp',
        String(P.flowCdp)
      ]
      say('flow: baseline snap')
      await run(flow[0], [...flow.slice(1), '--out', join(flowDir, 'baseline'), '--snap'])
      say(`flow: 15 systems (prefix ${prefix})`)
      await run(
        flow[0],
        [
          ...flow.slice(1),
          '--joomla-db',
          `${NAME}-db`,
          '--joomla-prefix',
          prefix,
          '--joomla-login',
          'site',
          '--out',
          join(flowDir, 'final'),
          '--baseline',
          join(flowDir, 'baseline/default.json'),
          '--measure-version',
          version,
          '--measure-tag',
          TAG,
          '--measure-template',
          SLUG,
          ...FEATURED_REFERO_SYSTEMS.map((id) => `refero:${id}`)
        ],
        // a site that fails the flow's own checks exits 1 after writing the file: a result, not a crash
        { okIf: (out) => out.includes('measurement: ') }
      )
    }
    writeFileSync(
      join(OUT, 'demos.json'),
      JSON.stringify([{ tag: TAG, platform: 'joomla', version, address: `${SITE}/` }])
    )
    if (!PARITY_ONLY)
      for (const [i, sc] of ['light', 'dark'].entries()) {
        say(`preview ${sc}`)
        await run('node', [
          join(ROOT, 'apps/tracy-web/scripts/preview-check.mjs'),
          '--demos',
          join(OUT, 'demos.json'),
          '--out',
          join(OUT, `preview-${sc}`),
          '--only',
          TAG,
          '--systems',
          PREVIEW_SYSTEMS,
          '--scheme',
          sc,
          '--pages',
          'all',
          '--port',
          String(P.servers[i]),
          '--write'
        ])
      }
    // PREVIEW-PARITY (probe v10): the Design system popup against the same page after Try on, on this stand
    const parity = join(ROOT, 'apps/tracy-web/scripts/preview-parity.mjs')
    const { PREVIEW_PROBE_VERSION } = await import('../src/preview-probe-version.mjs')
    if (!existsSync(parity))
      say('preview parity: not in this checkout (feat/ds-role-vars-batch2 has it), skipped')
    else if (PREVIEW_PROBE_VERSION < 10 && process.env.PREVIEW_PROBE_NEXT !== '1')
      say(`preview parity: belongs to probe v10 (current v${PREVIEW_PROBE_VERSION}), skipped`)
    else {
      say(`preview parity (${PARITY_POPUPS.join(', ')})`)
      await run('node', [
        parity,
        '--site',
        SITE,
        '--tag',
        TAG,
        '--version',
        version,
        '--joomla-db',
        `${NAME}-db`,
        '--joomla-prefix',
        prefix,
        '--systems',
        PREVIEW_SYSTEMS,
        '--pages',
        'all',
        '--popup',
        PARITY_POPUPS.join(','),
        '--port',
        String(P.parity),
        '--out',
        join(OUT, 'parity'),
        // the live paths' rows only (what a customer opens in either popup), and only while the rule is current
        '--write'
      ])
    }
  }

  // the judgement, as /ops makes it, beside the committed file's
  const rel = measurementPath({ cms: 'joomla', template: SLUG, tag: TAG, version })
  const doc = JSON.parse(readFileSync(join(ROOT, rel), 'utf8'))
  let committed = null
  try {
    committed = failing(
      JSON.parse(
        execFileSync('git', ['show', `HEAD:${rel}`], {
          cwd: ROOT,
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore']
        })
      )
    )
  } catch {}
  const now = failing(doc)
  const ids = (xs) => xs.map((x) => `${x.id}:${x.status}`)
  const same = committed && JSON.stringify(ids(committed).sort()) === JSON.stringify(ids(now).sort())
  const result = {
    slug: SLUG,
    version,
    lane: LANE,
    file: rel,
    measuredAt: doc.measuredAt,
    previewMeasuredAt: doc.previewMeasuredAt,
    minutes: Math.round((Date.now() - t0) / 600) / 100,
    failing: now,
    committed: committed && { failing: ids(committed), sameAsNow: same }
  }
  writeFileSync(join(OUT, 'judged.json'), `${JSON.stringify(result, null, 2)}\n`)
  say(`${now.length} rules not passed: ${ids(now).join(' ')}`)
  if (committed) say(`committed file: ${committed.length} not passed; same set: ${same}`)
  say(`done in ${result.minutes} min → ${join(OUT, 'judged.json')}`)
} catch (e) {
  say(`FAILED: ${e.message}`)
  process.exitCode = 1
} finally {
  await end(null)
}
