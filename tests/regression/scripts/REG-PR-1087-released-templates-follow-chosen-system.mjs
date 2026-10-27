/**
 * REG-PR-1087: released templates follow a chosen design system, judged on their own releases.
 *   S1 the library's tests (tokenizer, emitters, probes);
 *   S2 the library audit — every invariant over all Refero + OpenDesign systems;
 *   S3 Joomla: the released quickstart/ja-voyara/j6 restored, its stylesheets tokenized, four
 *      systems worn through the slot module and cleared (pass-joomla.mjs);
 *   S4 WordPress: the released quickstart/ja-vega/wp7 restored, this tree's tokenized wp-ja-vega
 *      stylesheet on it, the same four systems through the theme's variation door (pass-wordpress.mjs);
 *   S5 the next Voyara version built locally from the release (release-joomla.mjs), restored from
 *      its own archive, and its default page compared with the released one: the same computed
 *      roles and the same pixels.
 * No model reads anything. Needs Docker, the fleet's two images, Chrome and read access to
 * JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cannotRun, checks, nodeTest, ROOT, run } from './lib.mjs'

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const IMAGES = [
  'tracy/web-wordpress:php8.3-apache-20260923-r1',
  'tracy/web-joomla:6-apache-20260923-r1',
  'mariadb:11'
]
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
try {
  docker('version', '--format', '{{.Server.Version}}')
} catch {
  cannotRun('Docker is not running')
}
for (const image of IMAGES)
  try {
    docker('image', 'inspect', image)
  } catch {
    cannotRun(`image ${image} is not on this machine`)
  }
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chrome)) cannotRun(`no Chrome at ${chrome} (set CHROME)`)
try {
  execFileSync(
    'gh',
    [
      'release',
      'view',
      'quickstart/ja-voyara/j6',
      '-R',
      'JoomlArt-Products/ja-products',
      '--json',
      'tagName'
    ],
    { stdio: 'ignore' }
  )
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}

const work = mkdtempSync(join(tmpdir(), 'reg-released-'))
const STAND = 'reg-voyara-next'
process.on('exit', () => {
  try {
    execFileSync(process.execPath, [join(LIB, 'scripts/stand.mjs'), 'down', '--name', STAND], {
      stdio: 'ignore'
    })
  } catch {}
  rmSync(work, { recursive: true, force: true })
})
const c = checks()
const last = (r) => {
  try {
    return JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {
    return null
  }
}

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)
// S2
const audit = run(process.execPath, [join(LIB, 'scripts/audit.mjs')], { timeoutS: 600 })
c.check(
  'S2 audit: invariants all hold',
  /invariants: all hold/.test(audit.stdout),
  audit.stdout.split('\n').slice(-3).join(' ')
)

// S3, S4: each release through its pass — every verdict, both controls at 0 differences
for (const [label, script, slug, port, cdp] of [
  ['S3 Joomla ja-voyara/j6', 'pass-joomla.mjs', 'ja-voyara', 52291, 9481],
  ['S4 WordPress ja-vega/wp7', 'pass-wordpress.mjs', 'ja-vega', 52292, 9491]
]) {
  const r = run(
    process.execPath,
    [join(LIB, 'scripts', script), slug, '--port', String(port), '--cdp', String(cdp), '--evidence', work],
    { timeoutS: 3600 }
  )
  const s = last(r)
  c.check(`${label}: ran`, !!s, r.stderr.slice(-400))
  if (!s) continue
  c.eq(`${label}: controls (differences against the release)`, s.controls.join(','), '0,0,0,0')
  c.eq(`${label}: verdicts`, s.pass, '12/12')
  c.check(`${label}: no text under 4.5:1`, s.lowContrast.length === 0, s.lowContrast)
  c.check(
    `${label}: the page follows each system (≥ 0.6)`,
    s.follows.every((x) => x >= 0.6),
    s.follows
  )
}

// S5: the next Voyara version, from its own archive, looks exactly like the released one
const rel = run(
  process.execPath,
  [
    join(LIB, 'scripts/release-joomla.mjs'),
    'quickstart/ja-voyara/j6',
    '--template',
    'joomla-ja-voyara',
    '--out',
    join(work, 'next')
  ],
  { timeoutS: 1800 }
)
const built = last(rel)
// the release may already be tokenized (ja-voyara 1.0.5 is): the build then changes nothing and is the
// same release under the next number — what S5 judges is that it builds and serves the same page
c.check('S5 the next version builds', !!built && built.to !== built.from, built ?? rel.stderr.slice(-400))
if (built) {
  const up = run(
    process.execPath,
    [
      join(LIB, 'scripts/stand.mjs'),
      'up',
      'quickstart/ja-voyara/j6',
      '--port',
      '52293',
      '--name',
      STAND,
      '--from-dir',
      join(work, 'next/release')
    ],
    { timeoutS: 1800 }
  )
  const stand = last(up)
  c.check(
    'S5 the next version serves from its own archive',
    stand?.version === built.to,
    up.stderr.slice(-400)
  )
  if (stand) {
    run(
      process.execPath,
      [
        join(LIB, 'scripts/flow.mjs'),
        '--cms',
        'joomla',
        '--template',
        'joomla-ja-voyara',
        '--site',
        stand.site,
        '--cdp',
        '9501',
        '--out',
        join(work, 'next-default'),
        '--snap'
      ],
      { timeoutS: 900 }
    )
    const { differences } = await import(join(LIB, 'src/probe.mjs'))
    const was = JSON.parse(readFileSync(join(work, 'ja-voyara-j6/baseline/default.json'), 'utf8'))
    const now = JSON.parse(readFileSync(join(work, 'next-default/default.json'), 'utf8'))
    for (const vw of ['desktop', 'phone']) {
      c.eq(`S5 ${vw}: computed differences against the release`, differences(was[vw], now[vw]).length, 0)
      c.check(
        `S5 ${vw}: the same pixels as the release`,
        readFileSync(join(work, `ja-voyara-j6/baseline/default-${vw}.png`)).equals(
          readFileSync(join(work, `next-default/default-${vw}.png`))
        )
      )
    }
  }
}
c.done()
