/**
 * REG-PR-1058: a RUNNING EmDash base site wears the design system it is given. Builds the template
 * from this tree, serves it on its own port with a throwaway data folder, seeds it, then:
 *   S1 the library's and the template's own tests (profile, gate, emitter, slot reader, fallbacks);
 *   S2 the library audit — every invariant over all Refero + OpenDesign systems;
 *   S3 the action flow: default → 11 systems (one refused by the gate) → clear, measured by role at
 *      1440 and 390 against each profile, with the no-system page as the control;
 *   S4 the edges: 11 pages × two systems × two widths, `?theme` × OS preference, the admin.
 * No model reads anything; Chrome is the only thing the machine must have.
 */
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cannotRun, checks, nodeTest, ROOT, run } from './lib.mjs'

const BASE = join(ROOT, 'packages/cms/tracy-emdash-theme-base')
const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const PORT = 4391
const SITE = `http://127.0.0.1:${PORT}`
const PILOT = [
  'refero:61f1902f-6da3-4af7-b046-3b08bc1377f6', // OpenSea
  'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0', // Moxie
  'refero:03b3d707-2a30-4f53-a524-347d1b70eb2c', // Voiceflow
  'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567', // MotherDuck
  'refero:5f446754-1fb7-4a99-8cee-7bd5de3bfd9e', // Eddie
  'refero:813be405-c2b9-41be-9864-7b53d66483dc', // Toggl Track
  'refero:2f94c1f0-cd23-4bf1-95f3-0e531174c4f4', // arte* — the gate refuses it
  'refero:1c2d4a33-7ee4-4b61-a77e-dab91631d19b', // 12th Berlin Biennale
  'od:apple',
  'od:linear-app',
  'od:elevenlabs'
]

if (!existsSync(join(ROOT, 'vendor/tracy/refero/systems')))
  cannotRun('vendor/tracy/refero is not in this checkout')
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chrome)) cannotRun(`no Chrome at ${chrome} (set CHROME)`)

const c = checks()

// S1 — the unit tests that hold every rule the flow measures
const lib = nodeTest(['test/slot.test.mjs'], { cwd: 'packages/design/tracy-ds-slot' })
c.tapClean('S1 @tracy/ds-slot tests', lib)
const tpl = nodeTest(['tests/ds-slot.test.mjs', 'tests/ds-slot-template.test.mjs'], {
  cwd: 'packages/cms/tracy-emdash-theme-base'
})
c.tapClean('S1 EmDash base slot reader + fallbacks', tpl)

// S2 — the invariants over the whole library
const audit = run(process.execPath, [join(LIB, 'scripts/audit.mjs')])
c.check(
  'S2 audit: every invariant holds over all systems',
  audit.status === 0 && /invariants: all hold/.test(audit.stdout),
  audit.stdout.trim().split('\n').slice(-4).join(' | ')
)

// S3/S4 need the site running
if (!existsSync(join(BASE, 'node_modules'))) {
  const i = run('pnpm', ['install', '--frozen-lockfile', '--config.minimumReleaseAge=0'], {
    cwd: BASE,
    timeoutS: 900
  })
  if (i.status !== 0)
    cannotRun(`pnpm install in the EmDash base template failed: ${(i.stderr || i.stdout).slice(-300)}`)
}
// The site's database path is fixed at BUILD time (astro.config.mjs reads SITE_DATA_DIR then), while
// the slot reader reads it at run time: build and serve with the same throwaway folder, so a clean
// machine seeds its own database and this run never touches the template's ./data.
const data = mkdtempSync(join(tmpdir(), 'reg-1058-'))
const b = run('pnpm', ['build'], { cwd: BASE, timeoutS: 900, env: { ...process.env, SITE_DATA_DIR: data } })
c.check(
  'S3 the EmDash base template builds from this tree',
  b.status === 0,
  (b.stderr || b.stdout).slice(-300)
)
if (b.status !== 0) c.done()

const server = spawn(process.execPath, ['dist/server/entry.mjs'], {
  cwd: BASE,
  env: { ...process.env, SITE_DATA_DIR: data, HOST: '127.0.0.1', PORT: String(PORT), NODE_ENV: 'production' },
  stdio: 'ignore',
  detached: true
})
const stop = () => {
  try {
    process.kill(-server.pid, 'SIGKILL')
  } catch {}
  rmSync(data, { recursive: true, force: true })
  // dist now points at the deleted folder: rebuild so the template's own dist serves ./data again
  run('pnpm', ['build'], { cwd: BASE, timeoutS: 900 })
}
process.on('exit', stop)
let up = false
for (let i = 0; i < 120 && !up; i++) {
  try {
    up = (await fetch(`${SITE}/_emdash/api/setup/status`)).status === 200
  } catch {}
  if (!up) await new Promise((r) => setTimeout(r, 500))
}
if (!up) cannotRun(`the built site did not answer on ${SITE}`)
const seed = run('bash', ['tools/bootstrap-site.sh', SITE, data], { cwd: BASE, timeoutS: 600 })
c.check(
  'S3 the site seeds (tools/bootstrap-site.sh)',
  seed.status === 0,
  (seed.stderr || seed.stdout).slice(-300)
)

const out = mkdtempSync(join(tmpdir(), 'reg-1058-out-'))
run(process.execPath, [
  join(LIB, 'scripts/flow-emdash.mjs'),
  '--site',
  SITE,
  '--out',
  join(out, 'base'),
  '--snap'
])
const flow = run(
  process.execPath,
  [
    join(LIB, 'scripts/flow-emdash.mjs'),
    '--site',
    SITE,
    '--data',
    data,
    '--out',
    join(out, 'flow'),
    '--baseline',
    join(out, 'base/default.json'),
    ...PILOT
  ],
  { timeoutS: 900 }
)
const report = existsSync(join(out, 'flow/flow.json'))
  ? JSON.parse(readFileSync(join(out, 'flow/flow.json'), 'utf8'))
  : { verdicts: [], refused: [] }
const systems = report.verdicts.filter((v) => v.kind === 'system')
const controls = report.verdicts.filter((v) => v.kind === 'control')
c.eq('S3 systems worn and judged (10 × desktop + phone)', systems.length, 20)
c.check(
  'S3 every worn system matches its profile on every applicable measurement',
  systems.every((v) => v.match === 1),
  systems.filter((v) => v.match !== 1).map((v) => `${v.label}/${v.vw} ${v.checks} ${v.misses.join('; ')}`)
)
c.check(
  'S3 every worn page matches its own system at least 0.25 better than any other',
  systems.every((v) => v.margin >= 0.25),
  systems.filter((v) => v.margin < 0.25).map((v) => `${v.label}/${v.vw} ${v.margin}`)
)
c.check(
  'S3 every text kind on every worn page reads at 4.5:1 or better',
  systems.every((v) => v.contrast.every((x) => x.ratio >= 4.5)),
  systems.flatMap((v) =>
    v.contrast.filter((x) => x.ratio < 4.5).map((x) => `${v.label}/${v.vw} ${x.name} ${x.ratio}`)
  )
)
c.check(
  'S3 no worn page scrolls sideways',
  systems.every((v) => !v.horizontalScroll)
)
c.check(
  'S3 the page wears the new system within 5 s of the call, no rebuild',
  systems.every((v) => v.servedMs !== null && v.servedMs <= 5000),
  systems.map((v) => v.servedMs)
)
c.check(
  'S3 with no system, before and after clearing, the page computes exactly the same values',
  controls.length === 4 && controls.every((v) => v.differences === 0),
  controls.map((v) => `${v.label}/${v.vw} ${v.differences} ${v.sample.join('; ')}`)
)
c.check(
  'S3 arte* is refused by the gate for text contrast, never applied',
  report.refused.length === 1 &&
    report.refused[0].id === PILOT[6] &&
    /contrast-fg-bg/.test(report.refused[0].reasons.join()),
  report.refused
)
c.eq('S3 the flow script exits 0', flow.status, 0)

const edges = run(
  process.execPath,
  [join(LIB, 'scripts/edges-emdash.mjs'), SITE, data, join(out, 'edges'), join(LIB, 'scripts/ds-slot.mjs')],
  { timeoutS: 900 }
)
const e = existsSync(join(out, 'edges/edges.json'))
  ? JSON.parse(readFileSync(join(out, 'edges/edges.json'), 'utf8'))
  : { pages: [], dark: [], admin: {} }
c.check(
  'S4 44 page loads with a system worn: all 200, none scrolls sideways',
  e.pages.length === 44 && e.pages.every((p) => p.status === 200 && !p.hs),
  e.pages.filter((p) => p.status !== 200 || p.hs)
)
c.check(
  'S4 ?theme and the OS preference never flip a worn system, and its toggle is hidden',
  e.dark
    .filter((d) => d.key !== 'default')
    .every(
      (d) => !d.toggleShown && d.bg === (d.key === 'moxie-dark' ? 'rgb(0, 0, 0)' : 'rgb(255, 255, 255)')
    ),
  e.dark
)
c.check(
  'S4 with no system, ?theme=dark still darkens the page and the toggle shows',
  e.dark.some((d) => d.key === 'default' && d.q === '?theme=dark' && d.theme === 'dark') &&
    e.dark.filter((d) => d.key === 'default').every((d) => d.toggleShown)
)
c.check(
  'S4 the admin is untouched by a worn system',
  e.admin.slotInAdmin === false && e.admin.sameBytes === true,
  e.admin
)
c.eq('S4 the edges script exits 0', edges.status, 0)

rmSync(out, { recursive: true, force: true })
c.done()
