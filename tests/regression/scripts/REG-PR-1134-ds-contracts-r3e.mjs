/**
 * REG-PR-1134-ds-contracts-r3e: round 3 of the slot contracts (batch r3e, 11/10/2026) — four JA Joomla
 * j6 templates measured not ready in round 1 (batch 5) now wear a design system, from their 1.0.1
 * re-release:
 *   - JA Comics: its outline buttons write their text in the accent; under a light accent that text
 *     takes the accent made readable (followRules);
 *   - JA Educatsy: its course tabs' active pill and its section eyebrows, painted by T4's generated
 *     palette stylesheet, follow (followRules); its violet band keeps its own text (keepText);
 *   - JA Eventcamp: its section kickers take the readable accent; its hero slider and agenda day tiles
 *     keep their text and pink kicker (keepText, keepDefaults);
 *   - JA Fit (T3, dark): its photo bands keep their look (keepScopes, keepColors, keepGround); its menu
 *     bar's links take the accent's own text (onAccent); the button rules name buttons, not every link.
 * flow.mjs judges two more kinds of text as the template's own: a watermark (opacity under 0.2) is
 * not measured, and the same text on the same picture in both looks is the template's pair.
 *   S1 the library's tests; S2 the contracts and the module sheets they make; S3 tracy-web's door at
 *   1.0.1 and 1.0.0; S4 JA Eventcamp through pass-joomla.mjs (release restored, stylesheets tokenized,
 *   four systems worn, cleared). S4 needs Docker, the fleet's Joomla image, Chrome and read access to
 *   JoomlArt-Products/ja-products (gh).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cannotRun, checks, nodeTest, ROOT, run } from './lib.mjs'

const LIB = join(ROOT, 'packages/design/tracy-ds-slot')
const imp = (p) => import(pathToFileURL(join(LIB, p)).href)
const { contractBase, loadContract, loadProfile } = await imp('src/library.mjs')
const { joomlaSlot } = await imp('src/joomla.mjs')
const c = checks()

// S1
c.tapClean(
  'S1 library tests',
  nodeTest(['test/tokenize.test.mjs', 'test/slot.test.mjs', 'test/cms.test.mjs'], {
    cwd: 'packages/design/tracy-ds-slot'
  })
)

// S2
const SLUGS = ['ja-comics', 'ja-educatsy', 'ja-eventcamp', 'ja-fit']
const k = Object.fromEntries(SLUGS.map((s) => [s, loadContract(`joomla-${s}`)]))
for (const s of SLUGS) {
  c.eq(`S2 ${s} is ready`, k[s].ready, true)
  c.eq(`S2 ${s} wears from 1.0.1`, k[s].minVersion?.[`quickstart/${s}/j6`], '1.0.1')
  c.check(
    `S2 ${s} names its evidence`,
    String(k[s].readyNote).includes(`ds-contracts-r3e-2026-10-11/templates/${s}-j6`),
    k[s].readyNote
  )
  c.check(`S2 ${s} does not rely on the generated sheet`, !k[s].t4SiteCss, k[s].t4SiteCss)
}
const MOXIE = 'refero:7f70ee10-123b-43cc-bd04-498cfc5b5ac0'
const MOTHERDUCK = 'refero:2bd7363d-7aae-4b1f-9d5a-1edeb17ca567'
const sheet = (s, id = MOXIE) => joomlaSlot(loadProfile(ROOT, id), contractBase(ROOT, k[s]), k[s]).css ?? ''
const comics = sheet('ja-comics', MOTHERDUCK)
c.check(
  'S2 ja-comics outline button text reads the readable accent',
  comics.includes('.btn.btn-outline-primary:not(:hover):not(:active)') &&
    comics.includes('{color:var(--ds-c-accent-text)}'),
  ''
)
const edu = sheet('ja-educatsy')
c.check(
  'S2 ja-educatsy tab pill takes the accent and its text',
  edu.includes('.acm-container-tabs .nav-tabs .nav-link:is(.active, :hover, :focus)') &&
    edu.includes('{background-color:var(--ds-c-accent);color:var(--ds-c-accent-on)}'),
  ''
)
c.check(
  'S2 ja-educatsy violet band keeps its text',
  /\.bg-secondary\{color:#585858\}/.test(edu),
  edu.match(/[^}]*\.bg-secondary[^}]*\}/g)
)
const ev = sheet('ja-eventcamp')
c.check(
  'S2 ja-eventcamp hero keeps its pink kicker variable',
  ev.includes('--color-primary:#e812b8') && k['ja-eventcamp'].keepScopes.includes('.item'),
  ''
)
c.check(
  'S2 ja-eventcamp section kicker takes the readable accent',
  ev.includes('.section-title span') && ev.includes('{color:var(--ds-c-accent-text)}'),
  ''
)
const fit = sheet('ja-fit')
for (const band of ['.t3-slideshow', '#Section94', '#Section95', '#Section96', '#Section98'])
  c.check(`S2 ja-fit keeps ${band}`, fit.includes(`${band}{color:rgb(189, 189, 189)}`), '')
c.check('S2 ja-fit hero keeps its dark ground', fit.includes('.t3-slideshow{background-color:#111111}'), '')
c.check(
  'S2 ja-fit menu links take the accent text',
  fit.includes('#t3-mainnav .navbar-nav > li > a') && fit.includes('color:var(--ds-c-accent-on)'),
  ''
)
c.check(
  'S2 ja-fit button rules name buttons, not every link',
  !k['ja-fit'].selectors.button.includes('a') && !k['ja-fit'].selectors.buttonPrimary.includes('a'),
  k['ja-fit'].selectors
)
const flowSrc = readFileSync(join(LIB, 'scripts/flow.mjs'), 'utf8')
c.check('S2 flow.mjs leaves watermark text unmeasured', flowSrc.includes('return o < 0.2'), '')
c.check(
  'S2 flow.mjs holds the same text on the same picture as the template’s',
  flowSrc.includes('pictureOwn(i, x)'),
  ''
)

// S3
const { contractFor, templateKeyOf } = await import(
  pathToFileURL(join(ROOT, 'apps/tracy-web/src/lib/ds-slot.js')).href
)
for (const s of SLUGS) {
  const key = templateKeyOf({ platform: 'joomla', template: s.replace(/-/g, '_') })
  c.eq(
    `S3 ${s} at 1.0.1`,
    JSON.stringify(contractFor(key, { key: `quickstart/${s}/j6`, version: '1.0.1' })),
    JSON.stringify({ contract: `joomla-${s}` })
  )
  c.eq(
    `S3 ${s} at 1.0.0 needs the update`,
    contractFor(key, { key: `quickstart/${s}/j6`, version: '1.0.0' }).reason,
    'TEMPLATE_NEEDS_UPDATE'
  )
}

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
try {
  execFileSync(
    'gh',
    ['release', 'view', 'quickstart/ja-eventcamp/j6', '-R', 'JoomlArt-Products/ja-products'],
    {
      stdio: 'ignore'
    }
  )
} catch {
  cannotRun('gh cannot read JoomlArt-Products/ja-products releases')
}
const work = mkdtempSync(join(tmpdir(), 'reg-dsr3e-'))
try {
  const r = run(
    process.execPath,
    [
      join(LIB, 'scripts/pass-joomla.mjs'),
      'ja-eventcamp',
      '--port',
      '53817',
      '--cdp',
      '9917',
      '--evidence',
      work
    ],
    { timeoutS: 2400 }
  )
  let s = null
  try {
    s = JSON.parse(r.stdout.trim().split('\n').pop())
  } catch {}
  c.check('S4 ja-eventcamp: ran', !!s, r.stderr.slice(-400))
  if (s) {
    c.eq('S4 ja-eventcamp: verdicts', s.pass, '12/12')
    c.eq('S4 ja-eventcamp: controls (differences against the release)', s.controls.join(','), '0,0,0,0')
    c.check(
      'S4 ja-eventcamp: no text under 4.5:1 worse than its own',
      s.lowContrast.length === 0,
      s.lowContrast
    )
    c.check('S4 ja-eventcamp: at least half the page follows', Math.min(...s.follows) >= 0.5, s.follows)
  }
} finally {
  rmSync(work, { recursive: true, force: true })
}
c.done()
