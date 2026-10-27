/**
 * REG-PR-1134-ds-contracts-intranet: JA Intranet (quickstart/ja-intranet/j6), whose release 1.0.0
 * answers HTTP 500 on Joomla 6, gets a repaired re-release 1.0.1 and a ready slot contract:
 *   S1 the library's tests;
 *   S2 the contract: ready, wears from 1.0.1 (minVersion), the slot module in the footer position (the
 *      header's positions open a column of their own), the alert band kept, the blog category header
 *      read as text on the accent, T3 dev mode off in the release;
 *   S3 tracy-web's door: ja_intranet at 1.0.1 → the contract, at 1.0.0 → TEMPLATE_NEEDS_UPDATE;
 *   S4 the release: when quickstart/ja-intranet/j6 already serves 1.0.1 it is stood up as published;
 *      otherwise 1.0.1 is rebuilt the way it was built (release-joomla.mjs from the published 1.0.0,
 *      --overlay = plugins/system/t3 of the published ja-focus release, --sql = the repair in the
 *      evidence folder). Every linked page of the home page answers 200, and pass-joomla.mjs wears
 *      Moxie, MotherDuck, Toggl Track and Apple: controls 0, no text worse than the template's own
 *      under 4.5:1, at least 60% of the page follows.
 * No model reads anything. S4 needs Docker, the fleet's Joomla image, Chrome and read access to
 * JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, nodeTest, ROOT, run, needsTasks } from './lib.mjs'

needsTasks()

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const EVIDENCE = join(ROOT, 'tasks/evidence/ds-contracts-intranet-2026-10-11')
const { loadContract } = await import(pathToFileURL(join(LIB, 'src/library.mjs')).href)
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(
    ['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs', 'test/release-manifest.test.mjs'],
    { cwd: 'packages/design/tracy-ds-slot' }
  )
)

// S2
const k = loadContract('joomla-ja-intranet')
c.eq('S2 ready', k.ready, true)
c.eq('S2 wears from 1.0.1', k.minVersion?.['quickstart/ja-intranet/j6'], '1.0.1')
c.check('S2 names its evidence', /ds-contracts-intranet-2026-10-11/.test(k.readyNote ?? ''), k.readyNote)
c.eq('S2 slot module in the footer position', k.module?.position, 'footer')
c.check('S2 the alert band is kept', (k.keepScopes ?? []).includes('.alert'), k.keepScopes)
c.check(
  'S2 the blog category header is text on the accent',
  (k.selectors?.onAccent ?? []).includes('.blog .category-info .page-subheader'),
  k.selectors?.onAccent
)
c.eq('S2 T3 dev mode off in the release', k.t3DevmodeOff, true)
c.check('S2 no display size on the 12px page heading', !k.selectors?.displaySize, k.selectors?.displaySize)

// S3
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
const at = (version) =>
  contractFor(templateKeyOf({ platform: 'joomla', template: 'ja_intranet' }), {
    key: 'quickstart/ja-intranet/j6',
    version
  })
c.eq('S3 ja_intranet 1.0.1', JSON.stringify(at('1.0.1')), JSON.stringify({ contract: 'joomla-ja-intranet' }))
c.eq('S3 ja_intranet 1.0.0 needs the update', at('1.0.0').reason, 'TEMPLATE_NEEDS_UPDATE')

// S4
const docker = (...a) => execFileSync('docker', a, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
try {
  docker('image', 'inspect', 'tracy/web-joomla:6-apache-20260923-r1')
  docker('image', 'inspect', 'mariadb:11')
} catch {
  cannotRun('Docker, or the fleet Joomla image, is not on this machine')
}
const chrome = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
if (!existsSync(chrome)) cannotRun(`no Chrome at ${chrome} (set CHROME)`)
const REPO = 'JoomlArt-Products/ja-products'
let served
try {
  served = JSON.parse(
    execFileSync(
      'gh',
      ['release', 'download', 'quickstart/ja-intranet/j6', '-R', REPO, '-p', 'tracy_setting.json', '-O', '-'],
      {
        encoding: 'utf8'
      }
    )
  ).version
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-dsint-'))
try {
  let fromDir = null
  if (served !== '1.0.1') {
    // the T3 plugin ja-focus ships (3.3.2), as the overlay
    const focus = join(work, 'focus')
    mkdirSync(focus, { recursive: true })
    execFileSync('gh', [
      'release',
      'download',
      'quickstart/ja-focus/j6',
      '-R',
      REPO,
      '-D',
      focus,
      '-p',
      'ja-focus-j6-quickstart.zip'
    ])
    const overlay = join(work, 'overlay')
    mkdirSync(overlay, { recursive: true })
    execFileSync('unzip', [
      '-q',
      join(focus, 'ja-focus-j6-quickstart.zip'),
      'plugins/system/t3/*',
      '-d',
      overlay
    ])
    rmSync(focus, { recursive: true, force: true })
    const b = run(
      process.execPath,
      [
        join(LIB, 'scripts/release-joomla.mjs'),
        'quickstart/ja-intranet/j6',
        '--template',
        'joomla-ja-intranet',
        '--out',
        join(work, 'build'),
        '--overlay',
        overlay,
        '--sql',
        join(EVIDENCE, 'repair/custom-append.sql')
      ],
      { timeoutS: 1800 }
    )
    let s = null
    try {
      s = JSON.parse(b.stdout.trim().split('\n').pop())
    } catch {}
    c.check('S4 1.0.1 rebuilt from the published 1.0.0', s?.to === '1.0.1', b.stderr.slice(-400))
    c.eq('S4 the build turns T3 dev mode off in every style', s?.devmodeOff, 11)
    fromDir = join(work, 'build/release')
    rmSync(join(work, 'build/webroot'), { recursive: true, force: true })
  }
  // every linked page answers 200 (stand.mjs itself refuses a home page that does not)
  const name = 'reg-ja-intranet'
  const stand = (...a) => run(process.execPath, [join(LIB, 'scripts/stand.mjs'), ...a], { timeoutS: 1800 })
  try {
    const up = stand(
      'up',
      'quickstart/ja-intranet/j6',
      '--port',
      '52734',
      '--name',
      name,
      ...(fromDir ? ['--from-dir', fromDir] : [])
    )
    let st = null
    try {
      st = JSON.parse(up.stdout.trim().split('\n').pop())
    } catch {}
    c.check('S4 the home page answers 200 on Joomla 6', !!st, up.stderr.slice(-400))
    if (st) {
      const get = (h) =>
        execFileSync(
          'curl',
          ['-s', '--noproxy', '*', '-m', '300', '-o', '/dev/null', '-w', '%{http_code}', `${st.site}${h}`],
          {
            encoding: 'utf8'
          }
        )
      const home = execFileSync('curl', ['-s', '--noproxy', '*', '-m', '300', `${st.site}/`], {
        encoding: 'utf8',
        maxBuffer: 1 << 26
      })
      const links = [
        ...new Set(
          [...home.matchAll(/href="(\/[^"#?]*)"/g)]
            .map((x) => x[1])
            .filter((h) => !/\.(css|js|png|jpe?g|svg|webp|ico|woff2?|xml)$/.test(h))
        )
      ]
      const bad = links.map((h) => [h, get(h)]).filter(([, s]) => s !== '200')
      c.check(
        `S4 every linked page answers 200 (${links.length})`,
        links.length >= 20 && bad.length === 0,
        bad
      )
    }
  } finally {
    stand('down', '--name', name)
  }
  const r = run(
    process.execPath,
    [
      join(LIB, 'scripts/pass-joomla.mjs'),
      'ja-intranet',
      '--port',
      '52734',
      '--cdp',
      '9742',
      '--evidence',
      work,
      '--no-tokenize',
      ...(fromDir ? ['--from-dir', fromDir] : [])
    ],
    { timeoutS: 3000 }
  )
  let s = null
  try {
    s = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {}
  c.check('S4 pass-joomla ran', !!s, r.stderr.slice(-400))
  if (s) {
    c.eq('S4 controls (differences against the default)', s.controls.join(','), '0,0,0,0')
    c.check('S4 no text under 4.5:1 worse than the template’s own', s.lowContrast.length === 0, s.lowContrast)
    c.check(
      'S4 the page follows each system (≥ 0.6)',
      s.follows.every((x) => x >= 0.6),
      s.follows
    )
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
c.done()
